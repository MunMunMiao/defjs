import { resolveClientConfig } from '../client/client'
import type { Client } from '../client/resolve'
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
  client?: Client
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}

export type UseRequestConfig = UseRequestBaseConfig & UseCancellationConfig

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

export interface HttpRequestRef<TSuccess = unknown, TErrorData = unknown> extends PromiseLike<HttpAwaitResult<TSuccess, TErrorData>> {
  readonly error?: RequestError<TErrorData>
  readonly status: 'aborted' | 'error' | 'idle' | 'pending' | 'success'
  cancel(reason?: unknown): void
  with(config: UseRequestConfig): HttpRequestRef<TSuccess, TErrorData>
}

type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<NonNullable<TInput>>
    ? true
    : false

export type UseRequestEndpointFn<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>
    : (input: EndpointInput<TInput>) => HttpRequestRef<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>

type HttpRefState<TSuccess, TErrorData> = {
  error?: RequestError<TErrorData>
  promise?: Promise<HttpAwaitResult<TSuccess, TErrorData>>
  status: HttpRequestRef<TSuccess, TErrorData>['status']
}

export function defineRequest<TInput extends AnyStruct, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithBuild<TInput, TOutput>,
): UseRequestEndpointFn<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithoutBuild<TInput, TOutput>,
): UseRequestEndpointFn<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): UseRequestEndpointFn<TInput, TOutput> {
  return ((input?: EndpointInput<TInput>) => createHttpRequestRef(definition, input, undefined)) as UseRequestEndpointFn<TInput, TOutput>
}

function createHttpRequestRef<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
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

async function executeHttpEndpoint<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  endpoint: RequestDefinition<TInput, TOutput>,
  input: EndpointInput<TInput> | undefined,
  config: UseRequestConfig,
  controller: AbortController,
  state: HttpRefState<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>,
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> {
  state.status = 'pending'

  const fail = (
    error: RequestError<RequestErrorData<TOutput>>,
    response?: SettledResponse<unknown>,
  ): HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> => {
    state.error = error
    state.status = error.kind === 'transport' && error.code === 'ABORTED' ? 'aborted' : 'error'
    return [error, undefined, response]
  }

  if (hasAbortTimeoutConflict(config)) {
    const definitionError = createAbortTimeoutConflictError()
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  }

  // Fast path: caller already aborted before we did any schema work — skip parseEndpointInput / resolveClientConfig.
  const requestAbort = config.abort
  if (requestAbort?.aborted) {
    const transportError = createTransportError(requestAbort.reason ?? ERR_ABORTED)
    return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  } catch (error) {
    const definitionError = createDefinitionError('REQUEST_VALIDATION_FAILED', error)
    return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  }

  let clientConfig
  try {
    clientConfig = resolveClientConfig(config.client)
  } catch (error) {
    const transportError = createTransportError(error)
    return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  }

  let request
  const responseType = resolveDefaultResponseType(endpoint.output, endpoint.responseType)
  try {
    request = createHttpRequest(endpoint.method, endpoint.path, parsedInput, endpoint.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
      input: endpoint.input,
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
    const errorMessage = getHttpErrorMessage(response)
    const httpError = createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestError<RequestErrorData<TOutput>>

    return fail(httpError, ignoredResponse)
  }

  const schema = resolveOutputSchema(endpoint.output, response.status)
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
    state.status = 'success'
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
