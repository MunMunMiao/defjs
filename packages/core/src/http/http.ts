import { COMMAND_TYPE, HTTP_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { HttpClientConfig } from '../client/config'
import type { DefinitionError, HttpStatusError, RequestError, TransportError } from '../error'
import { createDefinitionError, createHttpStatusError, createTransportError } from '../error'
import { makeInterceptorChain, resolveHttpInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import {
  awaitWithSignal,
  createAbortTimeoutConflictError,
  hasAbortTimeoutConflict,
  mergeAbortSignals,
  resolveAbortedTransportError,
  resolveAbortTransportError,
  snapshotCancellationConfig,
  validateTransportTimeout,
} from '../internal/abort'
import type { HttpContext } from '../internal/context'
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpProgressFn, HttpResponseType } from '../internal/http_request'
import type { HttpResponse } from '../internal/http_response'
import { getHttpErrorMessage } from '../internal/http_response'
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

export type RequestCommandBuilder<
  TInput extends AnyStruct | undefined,
  TOutput extends RequestOutputShape | undefined,
> = EndpointCommandBuilder<TInput, HttpCommand<TInput, TOutput>>

type ResponsePairForStatus<TBody extends AnyStruct, TStatus> = TStatus extends readonly (infer U extends number)[]
  ? U extends number
    ? { body: TBody; status: U }
    : never
  : TStatus extends number
    ? { body: TBody; status: TStatus }
    : never

type ResponsePair<TOutput extends RequestOutputShape | undefined> =
  NonNullable<TOutput> extends readonly (infer TItem)[]
    ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
      ? ResponsePairForStatus<TBody, TStatus>
      : never
    : {
        [K in keyof NonNullable<TOutput>]: NonNullable<TOutput>[K] extends infer TBody extends AnyStruct
          ? K extends number
            ? { body: TBody; status: K }
            : K extends `${infer TStatus extends number}`
              ? { body: TBody; status: TStatus }
              : never
          : never
      }[keyof NonNullable<TOutput>]

type HttpStatusErrorByOutput<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? HttpStatusError<undefined>
  : ResponsePair<TOutput> extends infer TPair
    ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
      ? `${TStatus}` extends `2${string}`
        ? never
        : HttpStatusError<Infer<TBody>, TStatus>
      : never
    : never

type RequestErrorByOutput<TOutput extends RequestOutputShape | undefined> =
  | HttpStatusErrorByOutput<TOutput>
  | TransportError
  | DefinitionError

type ResponseBodyByStatus<TOutput extends RequestOutputShape | undefined, TOk extends boolean> =
  ResponsePair<TOutput> extends infer TPair
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

type ResponseDeclaration<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? { output?: never; responseType?: never }
  : { output: TOutput; responseType?: HttpResponseType }

export type RequestDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> = ResponseDeclaration<TOutput> & { operation?: string } & (
    | {
        method: string
        path: string
        build?: never
        input?: TInput
      }
    | (TInput extends AnyStruct
        ? {
            method: string
            path: string
            build: RequestBuildHandler<TInput>
            input: TInput
          }
        : never)
  )

export type HttpAwaitResult<TSuccess = unknown, TErrorData = unknown> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]

type HttpExecuteAwaitResult<TOutput extends RequestOutputShape | undefined> =
  | [error: null, result: RequestSuccessData<TOutput>, response: HttpResponse<RequestSuccessData<TOutput>>]
  | [error: RequestErrorByOutput<TOutput>, result: undefined, response: HttpResponse<unknown> | undefined]

export function defineRequest<TInput extends AnyStruct, const TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<
  TInput extends AnyStruct | undefined = undefined,
  const TOutput extends RequestOutputShape | undefined = undefined,
>(definition: RequestDefinition<TInput, TOutput>): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<
  TInput extends AnyStruct | undefined = undefined,
  const TOutput extends RequestOutputShape | undefined = undefined,
>(definition: RequestDefinition<TInput, TOutput>): RequestCommandBuilder<TInput, TOutput> {
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
  clientConfig: HttpClientConfig,
  command: HttpCommand<TInput, TOutput>,
  options?: HttpExecuteOptions,
): Promise<HttpExecuteAwaitResult<TOutput>> {
  const { definition, input } = command
  const config = options ?? {}

  const fail = (error: RequestErrorByOutput<TOutput>, response?: HttpResponse<unknown>): HttpExecuteAwaitResult<TOutput> => {
    return [error, undefined, response]
  }

  let cancellation
  try {
    cancellation = snapshotCancellationConfig(config)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  if (hasAbortTimeoutConflict(cancellation)) {
    const definitionError = createAbortTimeoutConflictError()
    return fail(definitionError)
  }

  try {
    validateTransportTimeout(cancellation.timeout)
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  const controller = new AbortController()

  // Fast path: caller already aborted before we did any struct work — skip parseEndpointInput.
  const preAbortedSignal = [cancellation.abort, cancellation.signal].find((signal) => signal?.aborted)
  if (preAbortedSignal) {
    const transportError = resolveAbortedTransportError(preAbortedSignal)
    return fail(transportError)
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  let requestSignal: AbortSignal
  let request
  const responseType = resolveDefaultResponseType(definition.output, definition.responseType)
  try {
    requestSignal = mergeAbortSignals(controller.signal, [cancellation.abort, cancellation.signal], cancellation.timeout)
    request = createHttpRequest(definition.method, definition.path, parsedInput, definition.build, {
      abort: requestSignal,
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
      input: definition.input,
      operation: definition.operation,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      responseType,
      timeout: cancellation.timeout,
      uploadProgress: config.onUploadProgress,
      withCredentials: clientConfig.withCredentials,
      xsrf: clientConfig.xsrf,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  const transportController = new AbortController()
  let chainSettled = false
  let response: HttpResponse<unknown>
  try {
    const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
    const chain = makeInterceptorChain(httpInterceptors)
    const handler = (nextRequest: typeof request): Promise<HttpResponse<unknown>> => {
      if (chainSettled) {
        const rejected = Promise.reject<HttpResponse<unknown>>(
          new Error('HTTP interceptor next() cannot be called after the chain has settled'),
        )
        void rejected.catch(() => undefined)
        return rejected
      }

      const pending = fetchHandler(
        {
          ...nextRequest,
          abort: mergeAbortSignals(transportController.signal, [requestSignal, nextRequest.abort]),
        },
        clientConfig.http.handle,
      )
      void pending.catch(() => undefined)
      return pending
    }
    response = await awaitWithSignal(() => chain(request, handler), requestSignal)
  } catch (error) {
    const transportError = resolveAbortTransportError(requestSignal) ?? createTransportError(error)
    return fail(transportError)
  } finally {
    chainSettled = true
    transportController.abort(new Error('HTTP interceptor chain settled'))
  }

  if (response.status === 0) {
    const transportError = createTransportError(response.error)
    return fail(transportError)
  }

  if (!definition.output) {
    const ignoredResponse = {
      ...response,
      body: null,
    } as HttpResponse<undefined>

    if (ignoredResponse.ok) {
      return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
    }

    const errorMessage = getHttpErrorMessage(ignoredResponse)
    const httpError = createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestErrorByOutput<TOutput>

    return fail(httpError, ignoredResponse)
  }

  const struct = resolveOutputStruct(definition.output, response.status)
  if (!struct) {
    const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), response)
    return fail(definitionError, response)
  }

  if (response.error !== undefined) {
    const definitionError = createDefinitionError('RESPONSE_VALIDATION_FAILED', response.error, response)
    return fail(definitionError, response)
  }

  let parsedBody: unknown
  try {
    parsedBody = parseStructResponse(struct, response.body, responseType)
  } catch (error) {
    const definitionError = createDefinitionError('RESPONSE_VALIDATION_FAILED', error, response)
    return fail(definitionError, response)
  }

  if (response.ok) {
    const successResponse = {
      ...response,
      body: parsedBody as RequestSuccessData<TOutput>,
    }
    return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  }

  const errorMessage = getHttpErrorMessage(response)
  const httpError = createHttpStatusError(
    response.status,
    errorMessage,
    response,
    parsedBody as RequestErrorData<TOutput>,
  ) as RequestErrorByOutput<TOutput>

  return fail(httpError, response)
}

function parseStructResponse(struct: AnyStruct, body: unknown, responseType: HttpResponseType | undefined): unknown {
  if (responseType === 'json') {
    return decodeJson(struct, body)
  }
  return parseStructValue(struct, body)
}
