import { COMMAND_TYPE, HTTP_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { HttpClientConfig } from '../client/config'
import type { DefinitionError, HttpStatusError, RequestError, TransportError } from '../error'
import { createDefinitionError, createHttpStatusError, createTransportError, ERR_TIMEOUT } from '../error'
import { makeChain, resolveHttpInterceptors } from '../interceptor/interceptor'
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
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpProgressFn, HttpResponseType } from '../internal/http_request'
import type { HttpResponse } from '../internal/http_response'
import { getHttpErrorMessage, makeResponse } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { parseStructValue } from '../struct/introspection'
import { DEFINITION } from '../struct/symbols'
import type { RuntimeStruct } from '../struct/types'
import type { RequestOutputShape } from './request'
import { createHttpRequest, resolveDefaultResponseType, resolveOutputStruct } from './request'
import { fetchHandler } from './transport/fetch'
import { parseJsonText } from './transport/utils'

/**
 * Per-request options for HTTP execution: progress callbacks and cancellation.
 * Cancellation is either `abort` or `timeout` (not both).
 */
export type UseRequestConfig = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
} & UseCancellationConfig

/**
 * Executable HTTP command produced by a `defineRequest` builder.
 * Carries the request definition and optional typed input for `client.execute`.
 */
export interface HttpCommand<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> extends BaseCommand<
  typeof HTTP_COMMAND
> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

/**
 * Options passed to `client.execute` / `executeHttpCommand` for a single HTTP call.
 * `signal` combines with `abort` or `timeout`; it is not an alias for `abort`.
 * `abort` and `timeout` are mutually exclusive (`abort` XOR `timeout`).
 */
export type HttpExecuteOptions = UseRequestConfig & { signal?: AbortSignal }

/**
 * Builder returned by `defineRequest`; call with input to create an `HttpCommand`.
 */
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

/** Inferred success body type for 2xx statuses declared in `TOutput`. */
export type RequestSuccessData<TOutput extends RequestOutputShape | undefined> = InferResponseBodyByStatus<TOutput, true>

/** Inferred error-body type for non-2xx statuses declared in `TOutput`. */
export type RequestErrorData<TOutput extends RequestOutputShape | undefined> = InferResponseBodyByStatus<TOutput, false>

type ResponseDeclaration<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? { output?: never; responseType?: never }
  : { output: TOutput; responseType?: HttpResponseType }

/**
 * Contract for an HTTP endpoint: method, path, optional input struct, and status-keyed outputs.
 * Pass to `defineRequest` to get a typed command builder.
 */
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

/**
 * Await-result tuple for an HTTP call: success `[null, body, response]` or failure `[error, undefined, response?]`.
 */
export type HttpAwaitResult<TSuccess = unknown, TErrorData = unknown> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]

type HttpExecuteAwaitResult<TOutput extends RequestOutputShape | undefined> =
  | [error: null, result: RequestSuccessData<TOutput>, response: HttpResponse<RequestSuccessData<TOutput>>]
  | [error: RequestErrorByOutput<TOutput>, result: undefined, response: HttpResponse<unknown> | undefined]

/**
 * Declare a typed HTTP request command builder.
 *
 * Pass method, path, optional input struct, and status-keyed output structs.
 * Call the returned builder with input to get an `HttpCommand` for `client.execute`.
 *
 * @param definition - Request contract (method, path, input, output).
 * @returns A builder that creates `HttpCommand` values from input.
 *
 * @example
 * ```ts
 * const getUser = defineRequest({
 *   method: 'GET',
 *   path: '/users/:id',
 *   input: struct.request({ path: struct.object({ id: struct.number() }) }),
 *   output: [{ status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) }],
 * })
 * ```
 */
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

/**
 * Run an `HttpCommand` against client config: validate input, send the request, parse the response.
 * Prefer `client.execute(command)` in application code; this is the underlying implementation.
 *
 * @param clientConfig - Resolved HTTP client configuration (endpoint, interceptors, handler).
 * @param command - Command from a `defineRequest` builder.
 * @param options - Per-request progress and cancellation options.
 * @returns An await-result tuple of success body or typed request error.
 */
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
    // Client `withTimeout` fills HTTP execute only when the call omits `timeout`.
    // XOR still applies only to execute options that pass both `abort` and `timeout`.
    cancellation = snapshotCancellationConfig({
      abort: config.abort,
      signal: config.signal,
      timeout: config.timeout !== undefined ? config.timeout : clientConfig.timeout,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  if (hasAbortTimeoutConflict(config)) {
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
  let releaseRequestTimeout: () => void = () => undefined
  const responseType = resolveDefaultResponseType(definition.output, definition.responseType)
  try {
    let timeoutSignal: AbortSignal | undefined
    if (typeof cancellation.timeout === 'number') {
      const timeoutController = new AbortController()
      const timeoutTimer = setTimeout(() => {
        timeoutController.abort(ERR_TIMEOUT)
      }, cancellation.timeout)
      timeoutSignal = timeoutController.signal
      releaseRequestTimeout = () => {
        clearTimeout(timeoutTimer)
      }
    }

    requestSignal = mergeAbortSignals(controller.signal, [cancellation.abort, cancellation.signal, timeoutSignal])
    request = createHttpRequest(definition.method, definition.path, parsedInput, definition.build, {
      abort: requestSignal,
      baseEndpoint: clientConfig.endpoint,
      defaultHeaders: clientConfig.headers,
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
    releaseRequestTimeout()
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError)
  }

  const transportController = new AbortController()
  let chainSettled = false
  let inflightTransport: Promise<HttpResponse<unknown>> | undefined
  let response: HttpResponse<unknown>
  const handler = (nextRequest: typeof request): Promise<HttpResponse<unknown>> => {
    if (chainSettled) {
      const rejected = Promise.reject<HttpResponse<unknown>>(
        new Error('HTTP interceptor next() cannot be called after the chain has settled'),
      )
      void rejected.catch(() => undefined)
      return rejected
    }

    const transportAbort = mergeAbortSignals(transportController.signal, [requestSignal, nextRequest.abort])
    const pending = fetchHandler(
      {
        ...nextRequest,
        abort: transportAbort,
      },
      clientConfig.http.handle,
    ).then(
      (value) => value,
      (error) => makeResponse({ error: resolveAbortTransportError(transportAbort)?.cause ?? error }),
    )
    inflightTransport = pending
    return pending
  }

  const abortTransport = () => {
    if (!transportController.signal.aborted) {
      transportController.abort(requestSignal.reason)
    }
  }
  try {
    try {
      const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
      const chain = makeChain(httpInterceptors)
      if (requestSignal.aborted) {
        abortTransport()
      } else {
        requestSignal.addEventListener('abort', abortTransport, { once: true })
      }

      const chainPromise = chain(request, handler)
      void chainPromise.catch(() => undefined)
      response = await awaitWithSignal(() => chainPromise, requestSignal)
    } catch (error) {
      const aborted = resolveAbortTransportError(requestSignal)
      if (aborted) {
        abortTransport()
        if (inflightTransport) {
          await Promise.allSettled([inflightTransport])
        }
        return fail(aborted)
      }
      const transportError = createTransportError(error)
      if (transportError.code !== 'NETWORK_ERROR') {
        return fail(transportError)
      }
      return fail(createDefinitionError('INTERCEPTOR_FAILED', error))
    }
  } finally {
    requestSignal.removeEventListener('abort', abortTransport)
    chainSettled = true
    if (!transportController.signal.aborted) {
      transportController.abort(new Error('HTTP interceptor chain settled'))
    }
    releaseRequestTimeout()
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
    parsedBody = await parseStructResponse(struct, response.body, resolveParseResponseType(struct, responseType, response.ok))
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

function resolveParseResponseType(
  struct: AnyStruct,
  responseType: HttpResponseType | undefined,
  ok: boolean,
): HttpResponseType | undefined {
  if (ok) {
    return responseType
  }

  const kind = (struct as RuntimeStruct)[DEFINITION].kind
  if (kind === 'arrayBuffer') {
    return 'arraybuffer'
  }
  if (kind === 'blob' || kind === 'file') {
    return 'blob'
  }
  if (kind === 'string') {
    return 'text'
  }
  return 'json'
}

async function bytesToText(body: unknown): Promise<string | undefined> {
  if (typeof body === 'string') {
    return body
  }
  if (body instanceof ArrayBuffer) {
    return new TextDecoder().decode(body)
  }
  if (ArrayBuffer.isView(body)) {
    return new TextDecoder().decode(body)
  }
  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return await body.text()
  }
  return undefined
}

async function parseStructResponse(struct: AnyStruct, body: unknown, responseType: HttpResponseType | undefined): Promise<unknown> {
  if (responseType === 'json') {
    const text = await bytesToText(body)
    return decodeJson(struct, text === undefined ? body : parseJsonText(text))
  }
  if (responseType === 'text') {
    const text = await bytesToText(body)
    return parseStructValue(struct, text ?? body)
  }
  return parseStructValue(struct, body)
}
