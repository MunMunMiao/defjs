import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'
import type { RequestError } from '../error'
import { createDefinitionError, createHttpStatusError, createTransportError, ERR_ABORTED } from '../error'
import { makeInterceptorChain, resolveHttpInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from '../internal/abort'
import type { HttpContext } from '../internal/context'
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
import { createHttpRequest, normalizeOutputShape, resolveDefaultResponseType } from './request'
import { fetchHandler } from './transport/fetch'

interface UseRequestBaseConfig {
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}

export type UseRequestConfig = UseRequestBaseConfig & UseCancellationConfig

export interface HttpCommand<
  TInput extends AnyStruct | undefined,
  TOutput extends RequestOutputShape | undefined,
> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

export type HttpExecuteOptions = UseRequestConfig & { signal?: AbortSignal }

export type RequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
    : (input: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>

type ExpandStatus<T> = T extends readonly (infer U extends number)[] ? U : T extends number ? T : never

type OutputPairs<TOutput extends RequestOutputShape> = TOutput extends readonly (infer TItem)[]
  ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
    ? { body: TBody; status: ExpandStatus<TStatus> }
    : never
  : {
      [K in keyof TOutput]: K extends `${infer TStatus extends number}`
        ? TOutput[K] extends AnyStruct
          ? { body: TOutput[K]; status: TStatus }
          : never
        : never
    }[keyof TOutput]

type SuccessSchemaOf<TOutput extends RequestOutputShape> =
  OutputPairs<TOutput> extends infer TPair
    ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
      ? `${TStatus}` extends `2${string}`
        ? TBody
        : never
      : never
    : never

type ErrorSchemaOf<TOutput extends RequestOutputShape> =
  OutputPairs<TOutput> extends infer TPair
    ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
      ? `${TStatus}` extends `2${string}`
        ? never
        : TBody
      : never
    : never

export type RequestSuccessData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [SuccessSchemaOf<NonNullable<TOutput>>] extends [never]
    ? unknown
    : Infer<SuccessSchemaOf<NonNullable<TOutput>>>

export type RequestErrorData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [ErrorSchemaOf<NonNullable<TOutput>>] extends [never]
    ? unknown
    : Infer<ErrorSchemaOf<NonNullable<TOutput>>>

interface RequestDefinitionBase<TOutput extends RequestOutputShape | undefined = undefined> {
  method: string
  output?: TOutput
  path: string
  responseType?: HttpResponseType
}

type RequestDefinitionWithoutBuild<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> = RequestDefinitionBase<TOutput> & {
  build?: never
  input?: TInput
}

type RequestDefinitionWithBuild<
  TInput extends AnyStruct,
  TOutput extends RequestOutputShape | undefined = undefined,
> = RequestDefinitionBase<TOutput> & {
  build: RequestBuildHandler<TInput>
  input: TInput
}

export type RequestDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> = RequestDefinitionWithoutBuild<TInput, TOutput> | (TInput extends AnyStruct ? RequestDefinitionWithBuild<TInput, TOutput> : never)

export type HttpAwaitResult<TSuccess = unknown, TErrorData = unknown> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]

type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<NonNullable<TInput>>
    ? true
    : false

export function defineRequest<TInput extends AnyStruct, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithBuild<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithoutBuild<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput> {
  function create(input?: EndpointInput<TInput>): HttpCommand<TInput, TOutput> {
    return {
      kind: 'http',
      definition,
      input,
    } as HttpCommand<TInput, TOutput>
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

  // Fast path: caller already aborted before we did any schema work — skip parseEndpointInput.
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
    response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
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

  const schema = resolveOutputSchema(definition.output, response.status)
  if (!schema) {
    const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>, settledResponse)
  }

  let parsedBody: unknown
  try {
    parsedBody = parseStructResponse(schema, response.body, responseType)
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

function resolveOutputSchema(output: RequestOutputShape, status: number): AnyStruct | undefined {
  const map = normalizeOutputShape(output)
  return map.get(status)
}

function parseStructResponse(schema: AnyStruct, body: unknown, responseType: HttpResponseType | undefined): unknown {
  if (responseType === 'json') {
    return decodeJson(schema, body)
  }
  return parseStructValue(schema, body)
}
