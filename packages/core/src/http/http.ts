import { COMMAND_TYPE, HTTP_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'
import type { RequestError } from '../error'
import { createDefinitionError, createHttpStatusError, createTransportError, ERR_ABORTED } from '../error'
import { makeInterceptorChain, resolveHttpInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from '../internal/abort'
import type { HttpContext } from '../internal/context'
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpProgressFn, HttpResponseType } from '../internal/http_request'
import type { HttpResponse, SettledResponse } from '../internal/http_response'
import { toSettledResponse } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { parseStructValue } from '../struct/introspection'
import type { RequestOutputShape } from './request'
import { createHttpRequest, resolveDefaultResponseType, resolveOutputStruct } from './request'
import { fetchHandler } from './transport/fetch'

export type UseRequestConfig = {
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
} & UseCancellationConfig

export interface HttpCommand<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> extends BaseCommand<
  typeof HTTP_COMMAND
> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

export type HttpExecuteOptions = UseRequestConfig & { signal?: AbortSignal }

export type RequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> = EndpointCommandBuilder<
  TInput,
  HttpCommand<TInput, TOutput>
>

type ResponsePair<TOutput extends RequestOutputShape | undefined> = NonNullable<TOutput> extends readonly (infer TItem)[]
  ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
    ? { body: TBody; status: TStatus extends readonly (infer U extends number)[] ? U : TStatus extends number ? TStatus : never }
    : never
  : {
      [K in keyof NonNullable<TOutput>]: K extends `${infer TStatus extends number}`
        ? NonNullable<TOutput>[K] extends AnyStruct
          ? { body: NonNullable<TOutput>[K]; status: TStatus }
          : never
        : never
    }[keyof NonNullable<TOutput>]

type ResponseBodyByStatus<TOutput extends RequestOutputShape | undefined, TOk extends boolean> = ResponsePair<TOutput> extends infer TPair
  ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
    ? `${TStatus}` extends `2${string}`
      ? TOk extends true
        ? TBody
        : never
      : TOk extends true
        ? never
        : TBody
    : never
  : never

type InferResponseBodyByStatus<TOutput extends RequestOutputShape | undefined, TOk extends boolean> = [TOutput] extends [undefined]
  ? undefined
  : [ResponseBodyByStatus<TOutput, TOk>] extends [never]
    ? unknown
    : Infer<ResponseBodyByStatus<TOutput, TOk>>

export type RequestSuccessData<TOutput extends RequestOutputShape | undefined> = InferResponseBodyByStatus<TOutput, true>

export type RequestErrorData<TOutput extends RequestOutputShape | undefined> = InferResponseBodyByStatus<TOutput, false>

export type RequestDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> =
  | {
      method: string
      output?: TOutput
      path: string
      responseType?: HttpResponseType
      build?: never
      input?: TInput
    }
  | (TInput extends AnyStruct
      ? {
          method: string
          output?: TOutput
          path: string
          responseType?: HttpResponseType
          build: RequestBuildHandler<TInput>
          input: TInput
        }
      : never)

export type HttpAwaitResult<TSuccess = unknown, TErrorData = unknown> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]

export function defineRequest<TInput extends AnyStruct, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput> {
  function create(input?: EndpointInput<TInput>): HttpCommand<TInput, TOutput> {
    const command: HttpCommand<TInput, TOutput> = {
      [COMMAND_TYPE]: HTTP_COMMAND,
      definition,
      input,
    }

    return command
  }

  return ((input?: EndpointInput<TInput>) => create(input)) as RequestCommandBuilder<TInput, TOutput>
}

export async function executeHttpCommand<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  clientConfig: ClientConfig,
  command: HttpCommand<TInput, TOutput>,
  options?: HttpExecuteOptions,
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> {
  const { definition, input } = command
  const config = options ?? {}

  const fail = (
    error: RequestError<RequestErrorData<TOutput>>,
    response?: SettledResponse<unknown>,
  ): HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> => {
    return [error, undefined, response]
  }

  if (hasAbortTimeoutConflict(config)) {
    const definitionError = createAbortTimeoutConflictError()
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  }

  const controller = new AbortController()

  // Fast path: caller already aborted before we did any struct work — skip parseEndpointInput.
  const requestAbort = config.abort
  if (requestAbort?.aborted) {
    const transportError = createTransportError(requestAbort.reason ?? ERR_ABORTED)
    return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  }

  let request
  const responseType = resolveDefaultResponseType(definition.output, definition.responseType)
  try {
    request = createHttpRequest(definition.method, definition.path, parsedInput, definition.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort, config.signal], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
      input: definition.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      responseType,
      timeout: config.timeout,
      uploadProgress: config.onUploadProgress,
      withCredentials: clientConfig.withCredentials,
      xsrf: clientConfig.xsrf,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  }

  let response: HttpResponse<unknown>
  try {
    const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
    const chain = makeInterceptorChain(httpInterceptors)
    response = await chain(request, (req) => fetchHandler(req, clientConfig.http.handle))
  } catch (error) {
    const transportError = createTransportError(error)
    return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  }

  const settledResponse = toSettledResponse(response)

  if (response.status === 0) {
    const transportError = createTransportError(response.error)
    return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  }

  if (!definition.output) {
    const ignoredResponse = {
      ...settledResponse,
      body: null,
    } as SettledResponse<undefined>

    if (ignoredResponse.ok) {
      return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
    }

    /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
    const errorMessage = getHttpErrorMessage(response)
    const httpError = createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestError<RequestErrorData<TOutput>>

    return fail(httpError, ignoredResponse)
  }

  const struct = resolveOutputStruct(definition.output, response.status)
  if (!struct) {
    const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>, settledResponse)
  }

  let parsedBody: unknown
  try {
    parsedBody = parseStructResponse(struct, response.body, responseType)
  } catch (error) {
    const definitionError = createDefinitionError('RESPONSE_VALIDATION_FAILED', error, settledResponse)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>, settledResponse)
  }

  if (settledResponse.ok) {
    const successResponse = {
      ...settledResponse,
      body: parsedBody as RequestSuccessData<TOutput>,
    }
    return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  }

  /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
  const errorMessage = getHttpErrorMessage(response)
  const httpError = createHttpStatusError(
    response.status,
    errorMessage,
    settledResponse,
    parsedBody as RequestErrorData<TOutput>,
  ) as RequestError<RequestErrorData<TOutput>>

  return fail(httpError, settledResponse)
}

function getHttpErrorMessage(response: HttpResponse<unknown>): string {
  if (response.error instanceof Error) {
    return response.error.message
  }
  /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
  return String(response.error ?? `HTTP ${response.status}`)
}

function parseStructResponse(struct: AnyStruct, body: unknown, responseType: HttpResponseType | undefined): unknown {
  if (responseType === 'json') {
    return decodeJson(struct, body)
  }
  return parseStructValue(struct, body)
}
