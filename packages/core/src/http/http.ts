import { COMMAND_TYPE, HTTP_COMMAND } from '../client/command'
import type { BaseCommand } from '../client/command'
import type { HttpClientConfig } from '../client/config'
import type { AnyFault, Fault, FaultOf } from '../error'
import {
  createDecodeFault,
  createHttpStatusFault,
  createNetworkFault,
  createPreflightFault,
  createUndecodedHttpStatusFault,
  ERR_TIMEOUT,
} from '../error'
import { makeChain, resolveHttpInterceptors } from '../interceptor/interceptor'
import type { UseCancellationConfig } from '../internal/abort'
import {
  awaitWithSignal,
  createAbortTimeoutConflictFault,
  hasAbortTimeoutConflict,
  mergeAbortSignals,
  resolveAbortedFault,
  resolveAbortFault,
  resolveAbortCause,
  snapshotCancellationConfig,
  validateTransportTimeout,
} from '../internal/abort'
import type { EndpointCommandBuilder } from '../internal/endpoint_command'
import { isTransportOrigin, markTransportOrigin } from '../internal/transport_origin'
import type { EndpointInput, ParsedInput } from '../internal/endpoint_input'
import { parseEndpointInput } from '../internal/endpoint_input'
import type { HttpProgressFn, HttpResponseType } from '../internal/http_request'
import type { DecodedResponse, HttpMeta, HttpResponse } from '../internal/http_response'
import type { RequestBuildHandler } from '../internal/request_builder'
import type { AnyStruct, Infer } from '../struct'
import { decodeJson } from '../struct/codec/json'
import { parseStructValue } from '../struct/introspection'
import { DEFINITION } from '../struct/symbols'
import type { RuntimeStruct } from '../struct/types'
import { createHttpRequest, resolveDefaultResponseType } from './request'
import type { BodyFailure } from './transport/body_failure'
import { isBodyFailure } from './transport/body_failure'
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
export interface HttpCommand<
  TInput extends AnyStruct | undefined,
  TOutput extends AnyStruct | undefined,
  TError extends AnyStruct | undefined = undefined,
> extends BaseCommand<typeof HTTP_COMMAND> {
  readonly definition: RequestDefinition<TInput, TOutput, TError>
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
  TOutput extends AnyStruct | undefined,
  TError extends AnyStruct | undefined = undefined,
> = EndpointCommandBuilder<TInput, HttpCommand<TInput, TOutput, TError>>

type DeclaredBody<TStruct> = [TStruct] extends [undefined] ? undefined : Infer<TStruct>

type DeclaredResponse<TStruct> = [TStruct] extends [undefined] ? HttpMeta : DecodedResponse<Infer<TStruct>>

/** Inferred success body for the declared `output` struct, or `undefined` when none is declared. */
export type RequestSuccessData<TOutput extends AnyStruct | undefined> = DeclaredBody<TOutput>

/** Inferred error body for the declared `error` struct, or `undefined` when none is declared. */
export type RequestErrorData<TError extends AnyStruct | undefined> = DeclaredBody<TError>

type HasDeclaration<TOutput, TError> = [TOutput] extends [undefined] ? ([TError] extends [undefined] ? false : true) : true

type ResponseDeclaration<TOutput extends AnyStruct | undefined, TError extends AnyStruct | undefined> = ([TOutput] extends [undefined]
  ? { output?: never }
  : { output: TOutput }) &
  ([TError] extends [undefined] ? { error?: never } : { error: TError }) &
  (HasDeclaration<TOutput, TError> extends true ? { responseType?: HttpResponseType } : { responseType?: never })

/**
 * Contract for an HTTP endpoint: method, path, optional input struct, and the structs that
 * decode its bodies.
 *
 * `output` declares the body for a 2xx response, `error` the body for anything else. Only one
 * of the two ever runs, and omitting one means that body is never read. Pass to `defineRequest`
 * to get a typed command builder.
 */
export type RequestDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends AnyStruct | undefined = undefined,
  TError extends AnyStruct | undefined = undefined,
> = ResponseDeclaration<TOutput, TError> & { operation?: string } & (
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
 * Await-result tuple for an HTTP call.
 *
 * Success is `[null, data, response]`; failure is `[fault, undefined, undefined]` because the
 * fault carries whatever response metadata existed.
 */
export type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]

type HttpExecuteAwaitResult<TOutput extends AnyStruct | undefined, TError extends AnyStruct | undefined> =
  | [error: null, result: RequestSuccessData<TOutput>, response: DeclaredResponse<TOutput>]
  | [error: Fault<TError>, result: undefined, response: undefined]

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
 *   output: struct.object({ id: struct.number(), name: struct.string() }),
 *   error: struct.object({ message: struct.string() }),
 * })
 * ```
 */
export function defineRequest<
  TInput extends AnyStruct,
  TOutput extends AnyStruct | undefined = undefined,
  TError extends AnyStruct | undefined = undefined,
>(definition: RequestDefinition<TInput, TOutput, TError>): RequestCommandBuilder<TInput, TOutput, TError>
export function defineRequest<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends AnyStruct | undefined = undefined,
  TError extends AnyStruct | undefined = undefined,
>(definition: RequestDefinition<TInput, TOutput, TError>): RequestCommandBuilder<TInput, TOutput, TError>
export function defineRequest<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends AnyStruct | undefined = undefined,
  TError extends AnyStruct | undefined = undefined,
>(definition: RequestDefinition<TInput, TOutput, TError>): RequestCommandBuilder<TInput, TOutput, TError> {
  function create(input?: EndpointInput<TInput>): HttpCommand<TInput, TOutput, TError> {
    const command: HttpCommand<TInput, TOutput, TError> = {
      [COMMAND_TYPE]: HTTP_COMMAND,
      definition,
      input,
    }

    return command
  }

  return ((input?: EndpointInput<TInput>) => create(input)) as RequestCommandBuilder<TInput, TOutput, TError>
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
export async function executeHttpCommand<
  TInput extends AnyStruct | undefined,
  TOutput extends AnyStruct | undefined,
  TError extends AnyStruct | undefined,
>(
  clientConfig: HttpClientConfig,
  command: HttpCommand<TInput, TOutput, TError>,
  options?: HttpExecuteOptions,
): Promise<HttpExecuteAwaitResult<TOutput, TError>> {
  const { definition, input } = command
  const config = options ?? {}

  // Faults carry their own response metadata, so the tuple's third slot belongs to success only.
  const fail = (fault: AnyFault): HttpExecuteAwaitResult<TOutput, TError> => {
    return [fault as Fault<TError>, undefined, undefined]
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
    return fail(createPreflightFault('REQ_OPTIONS_INVALID', error))
  }

  if (hasAbortTimeoutConflict(config)) {
    return fail(createAbortTimeoutConflictFault())
  }

  try {
    validateTransportTimeout(cancellation.timeout)
  } catch (error) {
    return fail(createPreflightFault('REQ_OPTIONS_INVALID', error))
  }

  const controller = new AbortController()

  // Fast path: caller already aborted before we did any struct work — skip parseEndpointInput.
  const preAbortedSignal = [cancellation.abort, cancellation.signal].find((signal) => signal?.aborted)
  if (preAbortedSignal) {
    return fail(resolveAbortedFault(preAbortedSignal))
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  } catch (error) {
    return fail(createPreflightFault('REQ_INPUT_INVALID', error))
  }

  let requestSignal: AbortSignal
  let request
  let releaseRequestTimeout: () => void = () => undefined
  const hasDeclaration = definition.output !== undefined || definition.error !== undefined
  const responseType = resolveDefaultResponseType(hasDeclaration, definition.responseType)
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
    return fail(createPreflightFault('REQ_BUILD_FAILED', error))
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
    ).catch((error: unknown) => {
      // Cancellation outranks whatever the transport was doing when it noticed. Tagging here is
      // the only way to tell a dead server from an interceptor that threw the same value: both
      // reach the chain's catch as one bare cause.
      throw markTransportOrigin(resolveAbortCause(transportAbort) ?? error)
    })
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
      const fromTransport = isTransportOrigin(error)
      const aborted = resolveAbortFault(requestSignal)
      if (aborted) {
        abortTransport()
        if (inflightTransport) {
          await Promise.allSettled([inflightTransport])
        }
        return fail(aborted)
      }
      // The transport tags what it knows; a representation failure only matters when the
      // relevant side declared a struct, so it is resolved against the declaration below.
      if (isBodyFailure(error)) {
        if (!isRepresentationFailure(error)) {
          return fail(fromBodyFailure(error))
        }
        const struct = error.meta.ok ? definition.output : definition.error
        // Philosophy 5: an unreadable body on the side you opted out of is none of your business.
        if (!struct) {
          if (error.meta.ok) {
            return [null, undefined as RequestSuccessData<TOutput>, error.meta as DeclaredResponse<TOutput>]
          }
          return fail(createUndecodedHttpStatusFault(error.meta))
        }
        return fail(fromBodyFailure(error))
      }
      // Recognized cancellation shapes stay cancellation wherever they came from; anything else
      // belongs to whoever produced it.
      const networkFault = createNetworkFault(error)
      if (networkFault.code !== 'NET_UNREACHABLE') {
        return fail(networkFault)
      }
      return fail(fromTransport ? networkFault : createPreflightFault('EXT_INTERCEPTOR_FAILED', error))
    }
  } finally {
    requestSignal.removeEventListener('abort', abortTransport)
    chainSettled = true
    if (!transportController.signal.aborted) {
      transportController.abort(new Error('HTTP interceptor chain settled'))
    }
    releaseRequestTimeout()
  }

  const meta = toHttpMeta(response)

  // Philosophy 2: `ok` is the only fork, and only one side ever decodes.
  const struct = response.ok ? definition.output : definition.error

  // Philosophy 5: with nothing declared for this side, that body is never read — not even to
  // fail on. An unreadable representation on the side you opted out of is none of your business.
  if (!struct) {
    if (response.ok) {
      return [null, undefined as RequestSuccessData<TOutput>, meta as DeclaredResponse<TOutput>]
    }
    return fail(createUndecodedHttpStatusFault(meta))
  }

  let decoded: unknown
  try {
    decoded = await parseStructResponse(struct, response.body, resolveParseResponseType(struct, responseType, response.ok))
  } catch (error) {
    // Philosophy 3 + 4: the declaration did not hold, and a failed decode has no body.
    return fail(createDecodeFault('RES_STRUCT_MISMATCH', error, meta))
  }

  const decodedResponse: DecodedResponse<unknown> = { ...meta, body: decoded }
  if (response.ok) {
    return [null, decoded as RequestSuccessData<TOutput>, decodedResponse as DeclaredResponse<TOutput>]
  }

  return fail(createHttpStatusFault(decodedResponse))
}

function toHttpMeta(response: HttpResponse<unknown>): HttpMeta {
  return {
    headers: response.headers,
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    url: response.url,
  }
}

/** Whether a tagged body failure is about interpreting a body rather than obtaining one. */
function isRepresentationFailure(failure: BodyFailure): boolean {
  return failure.code === 'RES_DECODE_FAILED' || failure.code === 'RES_MEDIA_TYPE_INVALID'
}

/** Map a transport-tagged body failure onto the fault it was classified as. */
function fromBodyFailure(failure: BodyFailure): AnyFault {
  const { cause, code, meta } = failure

  if (code === 'RES_DECODE_FAILED' || code === 'RES_MEDIA_TYPE_INVALID') {
    return createDecodeFault(code, cause, meta)
  }

  return createPreflightFault(code, cause, meta)
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
