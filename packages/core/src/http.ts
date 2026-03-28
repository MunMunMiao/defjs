import type { Client } from './client'
import type { HttpContext } from './context'
import { makeInterceptorChain } from './interceptor/interceptor'
import type { HttpResponse } from './response'
import { type AnyCompatibleSchema, type CompatibleInputOf, type CompatibleOutputOf, parseCompatibleSchema } from './schema'
import {
  createDefinitionError,
  createHttpRequest,
  createTransportError,
  type EndpointInput,
  type HttpStatusError,
  mergeAbortSignals,
  type ParsedInput,
  parseEndpointInput,
  type RequestBuildHandler,
  type RequestError,
  resolveClientConfig,
  resolveDefaultResponseType,
  type SettledResponse,
  toSettledResponse,
} from './shared'
import type { HttpHandler } from './transport/http/handler'
import { xhrHandler } from './transport/http/xhr'

export type HttpResponseType = 'arraybuffer' | 'blob' | 'json' | 'text'

export interface HttpProgressEvent {
  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}

export type HttpProgressFn = (event: HttpProgressEvent) => void

export interface HttpRequest {
  abort?: AbortSignal
  baseEndpoint?: string
  body?: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<Uint8Array> | object | string | number | boolean | null
  context?: HttpContext
  downloadProgress?: HttpProgressFn
  endpoint: string
  headers?: Headers
  method: string
  queryParams?: URLSearchParams
  queryString?: string
  responseType?: HttpResponseType
  timeout?: number
  uploadProgress?: HttpProgressFn
  withCredentials?: boolean
}

export interface UseRequestConfig {
  abort?: AbortSignal
  client?: Client
  context?: HttpContext
  handler?: HttpHandler
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  timeout?: number
}

export type ResponseGroupItem<S extends number = number, B extends AnyCompatibleSchema = AnyCompatibleSchema> = {
  body: B
  status: S | readonly S[]
}

export type RequestOutputShape = Record<number, AnyCompatibleSchema> | readonly ResponseGroupItem[]

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
    : CompatibleOutputOf<SuccessSchemaOf<NonNullable<TOutput>>>

export type RequestErrorData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [ErrorSchemaOf<NonNullable<TOutput>>] extends [never]
    ? unknown
    : CompatibleOutputOf<ErrorSchemaOf<NonNullable<TOutput>>>

export interface RequestDefinition<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> {
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
  (config?: UseRequestConfig): HttpRequestRef<TSuccess, TErrorData>
  readonly data?: TSuccess
  readonly error?: RequestError<TErrorData>
  readonly response?: SettledResponse<unknown>
  readonly status: 'aborted' | 'error' | 'idle' | 'pending' | 'success'
  cancel(reason?: unknown): void
}

type IsInputOptional<TInput extends AnyCompatibleSchema | undefined> = [TInput] extends [undefined]
  ? true
  : undefined extends CompatibleInputOf<NonNullable<TInput>>
    ? true
    : false

export type UseRequestEndpointFn<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>
    : (input: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>

export interface RequestEndpoint<
  TInput extends AnyCompatibleSchema | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> extends RequestDefinition<TInput, TOutput> {
  readonly kind: 'request'
  readonly use: UseRequestEndpointFn<TInput, TOutput>
}

type HttpRefConfig = UseRequestConfig & {
  readonly applied: boolean
}

type HttpRefState<TSuccess, TErrorData> = {
  data?: TSuccess
  error?: RequestError<TErrorData>
  promise?: Promise<HttpAwaitResult<TSuccess, TErrorData>>
  response?: SettledResponse<unknown>
  status: HttpRequestRef<TSuccess, TErrorData>['status']
}

export function defineRequest<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestEndpoint<TInput, TOutput> {
  const endpoint = {
    ...definition,
    kind: 'request' as const,
  } as RequestEndpoint<TInput, TOutput>

  Object.defineProperty(endpoint, 'use', {
    enumerable: true,
    value: createUseRequest(endpoint),
  })

  return endpoint
}

export function createUseRequest<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestEndpoint<TInput, TOutput>,
): UseRequestEndpointFn<TInput, TOutput> {
  return ((input?: EndpointInput<TInput>) =>
    createHttpRequestRef(endpoint, input, {
      applied: false,
    })) as UseRequestEndpointFn<TInput, TOutput>
}

function createHttpRequestRef<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestEndpoint<TInput, TOutput>,
  input: EndpointInput<TInput> | undefined,
  config: HttpRefConfig,
): HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> {
  const controller = new AbortController()
  const state: HttpRefState<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> = {
    status: 'idle',
  }

  const getPromise = (): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> => {
    if (!state.promise) {
      state.promise = executeHttpEndpoint(endpoint, input, config, controller, state)
    }

    return state.promise
  }

  const applyConfig = ((nextConfig?: UseRequestConfig) => {
    if (config.applied) {
      throw new Error('Request config can only be applied once')
    }

    return createHttpRequestRef(endpoint, input, {
      ...nextConfig,
      applied: true,
    })
  }) as HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>

  Object.defineProperties(applyConfig, {
    data: {
      enumerable: true,
      get() {
        return state.data
      },
    },
    error: {
      enumerable: true,
      get() {
        return state.error
      },
    },
    response: {
      enumerable: true,
      get() {
        return state.response
      },
    },
    status: {
      enumerable: true,
      get() {
        return state.status
      },
    },
  })

  applyConfig.cancel = (reason?: unknown) => {
    controller.abort(reason)
  }

  applyConfig.then = (onfulfilled, onrejected) => getPromise().then(onfulfilled, onrejected)

  return applyConfig
}

async function executeHttpEndpoint<TInput extends AnyCompatibleSchema | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestEndpoint<TInput, TOutput>,
  input: EndpointInput<TInput> | undefined,
  config: HttpRefConfig,
  controller: AbortController,
  state: HttpRefState<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>,
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> {
  state.status = 'pending'

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
    state.status = transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  let request
  try {
    const resolvedHandler = config.handler ?? clientConfig.http.handler
    request = createHttpRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort], resolvedHandler === xhrHandler ? undefined : config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
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
    const chain = makeInterceptorChain(clientConfig.interceptors)
    response = await chain(request, config.handler ?? clientConfig.http.handler)
  } catch (error) {
    const transportError = createTransportError(error)
    state.error = transportError as RequestError<RequestErrorData<TOutput>>
    state.status = transportError.code === 'ABORTED' ? 'aborted' : 'error'
    return [transportError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  }

  const settledResponse = toSettledResponse(response)
  state.response = settledResponse as SettledResponse<unknown>

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
    state.response = ignoredResponse

    if (ignoredResponse.ok) {
      state.data = undefined as RequestSuccessData<TOutput>
      state.status = 'success'
      return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
    }

    const httpError: HttpStatusError<RequestErrorData<TOutput>> = {
      data: undefined as RequestErrorData<TOutput>,
      kind: 'http',
      message: response.error instanceof Error ? response.error.message : String(response.error ?? `HTTP ${response.status}`),
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
    state.data = parsedBody as RequestSuccessData<TOutput>
    state.response = successResponse
    state.status = 'success'
    return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  }

  const httpError: HttpStatusError<RequestErrorData<TOutput>> = {
    data: parsedBody as RequestErrorData<TOutput>,
    kind: 'http',
    message: response.error instanceof Error ? response.error.message : String(response.error ?? `HTTP ${response.status}`),
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

function normalizeOutputShape(output: RequestOutputShape): Map<number, AnyCompatibleSchema> {
  const map = new Map<number, AnyCompatibleSchema>()

  if (Array.isArray(output)) {
    for (const item of output) {
      const statuses = Array.isArray(item.status) ? item.status : [item.status]
      for (const status of statuses) {
        map.set(status, item.body)
      }
    }
    return map
  }

  for (const [status, schema] of Object.entries(output)) {
    map.set(Number(status), schema)
  }

  return map
}
