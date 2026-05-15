import { resolveClientConfig } from '../client/client'
import type { Client } from '../client/resolve'
import { createDefinitionError, createTransportError, ERR_ABORTED, type HttpStatusError, type RequestError } from '../error'
import { makeInterceptorChain, resolveHttpInterceptors } from '../interceptor/interceptor'
import { mergeAbortSignals } from '../internal/abort'
import type { HttpContext } from '../internal/context'
import { type EndpointInput, type ParsedInput, parseEndpointInput } from '../internal/endpoint_input'
import type { HttpProgressFn, HttpResponseType } from '../internal/http_request'
import type { HttpResponse, SettledResponse } from '../internal/http_response'
import { toSettledResponse } from '../internal/http_response'
import type { RequestBodyDefinition, RequestBuildHandler } from '../internal/request_builder'
import { type AnyCompatibleSchema, type CompatibleInput, type CompatibleOutput, parseCompatibleSchema } from '../struct/compatible'
import { createHttpRequest, normalizeOutputShape, type RequestOutputShape, resolveDefaultResponseType } from './request'
import type { HttpHandler } from './transport/handler'

export interface UseRequestConfig {
  abort?: AbortSignal
  client?: Client
  context?: HttpContext
  handler?: HttpHandler
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  timeout?: number
}

type ExpandStatus<T> = T extends readonly (infer U extends number)[] ? U : T extends number ? T : never

type OutputPairs<TOutput extends RequestOutputShape> = TOutput extends readonly (infer TItem)[]
  ? TItem extends { body: infer TBody extends AnyCompatibleSchema; status: infer TStatus }
    ? { body: TBody; status: ExpandStatus<TStatus> }
    : never
  : {
      [K in keyof TOutput]: K extends `${infer TStatus extends number}`
        ? TOutput[K] extends AnyCompatibleSchema
          ? { body: TOutput[K]; status: TStatus }
          : never
        : never
    }[keyof TOutput]

type SuccessSchemaOf<TOutput extends RequestOutputShape> =
  OutputPairs<TOutput> extends infer TPair
    ? TPair extends { body: infer TBody extends AnyCompatibleSchema; status: infer TStatus extends number }
      ? `${TStatus}` extends `2${string}`
        ? TBody
        : never
      : never
    : never

type ErrorSchemaOf<TOutput extends RequestOutputShape> =
  OutputPairs<TOutput> extends infer TPair
    ? TPair extends { body: infer TBody extends AnyCompatibleSchema; status: infer TStatus extends number }
      ? `${TStatus}` extends `2${string}`
        ? never
        : TBody
      : never
    : never

export type RequestSuccessData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [SuccessSchemaOf<NonNullable<TOutput>>] extends [never]
    ? unknown
    : CompatibleOutput<SuccessSchemaOf<NonNullable<TOutput>>>

export type RequestErrorData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [ErrorSchemaOf<NonNullable<TOutput>>] extends [never]
    ? unknown
    : CompatibleOutput<ErrorSchemaOf<NonNullable<TOutput>>>

export interface RequestDefinition<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> {
  body?: RequestBodyDefinition
  build?: RequestBuildHandler<ParsedInput<TInput>>
  input?: TInput
  method: string
  output?: TOutput
  path: string
  responseType?: HttpResponseType
}

export type HttpAwaitResult<TSuccess = unknown, TErrorData = unknown> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]

export interface HttpRequestRef<TSuccess = unknown, TErrorData = unknown> extends PromiseLike<HttpAwaitResult<TSuccess, TErrorData>> {
  readonly error?: RequestError<TErrorData>
  readonly status: 'aborted' | 'error' | 'idle' | 'pending' | 'success'
  cancel(reason?: unknown): void
  with(config: UseRequestConfig): HttpRequestRef<TSuccess, TErrorData>
}

type IsInputOptional<TInput extends AnyCompatibleSchema | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends CompatibleInput<NonNullable<TInput>>
    ? true
    : false

export type UseRequestEndpointFn<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>
    : (input: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>

type HttpRefState<TSuccess, TErrorData> = {
  error?: RequestError<TErrorData>
  promise?: Promise<HttpAwaitResult<TSuccess, TErrorData>>
  status: HttpRequestRef<TSuccess, TErrorData>['status']
}

export function defineRequest<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): UseRequestEndpointFn<TInput, TOutput> {
  return ((input?: EndpointInput<TInput>) => createHttpRequestRef(definition, input, undefined)) as UseRequestEndpointFn<TInput, TOutput>
}

function createHttpRequestRef<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestDefinition<TInput, TOutput>,
  input: EndpointInput<TInput> | undefined,
  config: UseRequestConfig | undefined,
): HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> {
  const controller = new AbortController()
  const state: HttpRefState<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> = {
    status: 'idle',
  }

  const getPromise = (): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> => {
    if (!state.promise) {
      state.promise = executeHttpEndpoint(endpoint, input, config ?? {}, controller, state)
    }

    return state.promise
  }

  return {
    get error() {
      return state.error
    },
    get status() {
      return state.status
    },
    cancel(reason?: unknown) {
      controller.abort(reason)
    },
    with(nextConfig: UseRequestConfig) {
      return createHttpRequestRef(endpoint, input, nextConfig)
    },
    then(onfulfilled, onrejected) {
      return getPromise().then(onfulfilled, onrejected)
    },
  }
}

async function executeHttpEndpoint<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestDefinition<TInput, TOutput>,
  input: EndpointInput<TInput> | undefined,
  config: UseRequestConfig,
  controller: AbortController,
  state: HttpRefState<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>,
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> {
  state.status = 'pending'

  // Fast path: caller already aborted before we did any schema work — skip parseEndpointInput / resolveClientConfig.
  const requestAbort = config.abort
  if (requestAbort?.aborted) {
    const transportError = createTransportError(requestAbort.reason ?? ERR_ABORTED)
    state.error = transportError as RequestError<RequestErrorData<TOutput>>
    state.status = 'aborted'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError as RequestError<RequestErrorData<TOutput>>
    state.status = 'error'
    return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  let clientConfig
  try {
    clientConfig = resolveClientConfig(config.client)
  } catch (error) {
    const transportError = createTransportError(error)
    state.error = transportError as RequestError<RequestErrorData<TOutput>>
    /* istanbul ignore next -- unreachable: resolveClientConfig never throws ERR_ABORTED */
    state.status = transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  let request
  try {
    const resolvedHandler = config.handler ?? clientConfig.http.handler
    request = createHttpRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort], resolvedHandler.supportsNativeTimeout ? undefined : config.timeout),
      baseEndpoint: clientConfig.endpoint,
      body: endpoint.body,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
      input: endpoint.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      responseType: resolveDefaultResponseType(endpoint.output, endpoint.responseType),
      timeout: config.timeout,
      uploadProgress: config.onUploadProgress,
      withCredentials: clientConfig.withCredentials,
    })
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    state.error = definitionError as RequestError<RequestErrorData<TOutput>>
    state.status = 'error'
    return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  let response: HttpResponse<unknown>
  try {
    const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
    const chain = makeInterceptorChain(httpInterceptors)
    response = await chain(request, config.handler ?? clientConfig.http.handler)
  } catch (error) {
    const transportError = createTransportError(error)
    state.error = transportError as RequestError<RequestErrorData<TOutput>>
    state.status = transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  const settledResponse = toSettledResponse(response)

  if (response.status === 0) {
    const transportError = createTransportError(response.error)
    state.error = transportError as RequestError<RequestErrorData<TOutput>>
    state.status = transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  if (!endpoint.output) {
    const ignoredResponse = {
      ...settledResponse,
      body: null,
    } as SettledResponse<undefined>

    if (ignoredResponse.ok) {
      state.status = 'success'
      return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
    }

    /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
    const errorMessage = response.error instanceof Error ? response.error.message : String(response.error ?? `HTTP ${response.status}`)
    const httpError: HttpStatusError<RequestErrorData<TOutput>> = {
      code: 'HTTP_STATUS',
      data: undefined as RequestErrorData<TOutput>,
      kind: 'http',
      message: errorMessage,
      response: ignoredResponse,
      status: response.status,
    }

    state.error = httpError as RequestError<RequestErrorData<TOutput>>
    state.status = 'error'
    return [httpError as RequestError<RequestErrorData<TOutput>>, undefined, ignoredResponse]
  }

  const schema = resolveOutputSchema(endpoint.output, response.status)
  if (!schema) {
    const definitionError = createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse)
    state.error = definitionError as RequestError<RequestErrorData<TOutput>>
    state.status = 'error'
    return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, settledResponse]
  }

  let parsedBody: unknown
  try {
    parsedBody = await parseCompatibleSchema(schema, response.body)
  } catch (error) {
    const definitionError = createDefinitionError('RESPONSE_VALIDATION_FAILED', error, settledResponse)
    state.error = definitionError as RequestError<RequestErrorData<TOutput>>
    state.status = 'error'
    return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, settledResponse]
  }

  if (settledResponse.ok) {
    const successResponse = {
      ...settledResponse,
      body: parsedBody as RequestSuccessData<TOutput>,
    }
    state.status = 'success'
    return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  }

  /* istanbul ignore next -- unreachable: fetchHandler always sets response.error to an Error */
  const errorMessage = response.error instanceof Error ? response.error.message : String(response.error ?? `HTTP ${response.status}`)
  const httpError: HttpStatusError<RequestErrorData<TOutput>> = {
    code: 'HTTP_STATUS',
    data: parsedBody as RequestErrorData<TOutput>,
    kind: 'http',
    message: errorMessage,
    response: settledResponse,
    status: response.status,
  }

  state.error = httpError as RequestError<RequestErrorData<TOutput>>
  state.status = 'error'
  return [httpError as RequestError<RequestErrorData<TOutput>>, undefined, settledResponse]
}

function resolveOutputSchema(output: RequestOutputShape, status: number): AnyCompatibleSchema | undefined {
  const map = normalizeOutputShape(output)
  return map.get(status)
}
