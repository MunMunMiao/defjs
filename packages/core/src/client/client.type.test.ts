import type {
  Client,
  ClientConfig,
  ClientOptions,
  ClientXSRFConfig,
  ClientXSRFOptions,
  QueryParamsSerializer,
  XSRFTokenProvider,
  XSRFTokenProviderContext,
} from './index'
import {
  createClient,
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withQueryParamsSerializer,
  withSSEHandle,
  withWebSocketBeforeConnect,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketProtocols,
  withWebSocketQueue,
  withWebSocketReconnect,
  withXSRF,
} from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const serializer: QueryParamsSerializer = (params) => params.toString()
type SerializerCases = Expect<Equal<typeof serializer, (params: URLSearchParams, rawParams?: { [key: string]: unknown }) => string>>

const xsrfTokenProvider: XSRFTokenProvider = ({ request }: XSRFTokenProviderContext) => {
  void request
  return 'token'
}
type XsrfTokenProviderCases = Expect<Equal<typeof xsrfTokenProvider, (context: XSRFTokenProviderContext) => string | null | undefined>>

const customFetch = Object.assign(
  async (_input: RequestInfo | URL, _init?: RequestInit) =>
    new Response(JSON.stringify({ ok: true }), {
      headers: {
        'content-type': 'application/json',
      },
      status: 200,
    }),
  {
    preconnect: async () => undefined,
  },
) as typeof fetch

class MockWebSocket extends EventTarget {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3
}

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withHTTPHandle(customFetch),
  withSSEHandle(customFetch),
  withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
  withWebSocketBeforeConnect(async () => undefined),
  withWebSocketProtocols(['json']),
  withWebSocketHeartbeat({
    intervalMs: 1_000,
    timeoutMs: 5_000,
  }),
  withWebSocketQueue({
    maxSize: 128,
    overflow: 'drop-oldest',
  }),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 1_000,
  }),
  withQueryParamsSerializer(serializer),
  withXSRF({
    cookieName: 'CUSTOM-XSRF-TOKEN',
    headerName: 'X-CUSTOM-XSRF-TOKEN',
    tokenProvider: xsrfTokenProvider,
  }),
)

type ClientCases = Expect<Equal<typeof client, Client>>

const options = {
  endpoint: 'https://api.example.com',
  http: {
    fetch: customFetch,
  },
  interceptors: [],
  queryParamsSerializer: serializer,
  sse: {
    fetch: customFetch,
  },
  webSocket: {
    WebSocket: MockWebSocket as unknown as typeof WebSocket,
    beforeConnect: async () => undefined,
    heartbeat: {
      intervalMs: 1_000,
      timeoutMs: 5_000,
    },
    protocols: ['json'],
    queue: {
      maxSize: 128,
      overflow: 'drop-oldest',
    },
    reconnect: {
      attempts: 3,
      delayMs: 1_000,
    },
  },
  xsrf: {
    cookieName: 'CUSTOM-XSRF-TOKEN',
    headerName: 'X-CUSTOM-XSRF-TOKEN',
    tokenProvider: xsrfTokenProvider,
  },
  withCredentials: true,
} satisfies ClientOptions

type OptionsCases = Expect<Equal<typeof options.endpoint, string>>

type XsrfOptionsCases = Expect<Equal<ClientXSRFOptions, { cookieName?: string; headerName?: string; tokenProvider?: XSRFTokenProvider }>>
type XsrfConfigCases = Expect<Equal<ClientXSRFConfig, { cookieName: string; headerName: string; tokenProvider?: XSRFTokenProvider }>>
type ClientConfigXsrfCases = Expect<Equal<ClientConfig['xsrf'], ClientXSRFConfig | undefined>>

// @ts-expect-error withEndpoint expects a string
createClient(withEndpoint(1))

createClient(
  withEndpoint('https://api.example.com'),
  // @ts-expect-error serializer must return a string
  withQueryParamsSerializer(() => 1),
)

// @ts-expect-error withHTTPHandle expects a fetch implementation
createClient(withEndpoint('https://api.example.com'), withHTTPHandle(1))

// @ts-expect-error withSSEHandle expects a fetch implementation
createClient(withEndpoint('https://api.example.com'), withSSEHandle(1))

// @ts-expect-error withWebSocketHandle expects a WebSocket constructor
createClient(withEndpoint('https://api.example.com'), withWebSocketHandle(1))

// @ts-expect-error withWebSocketProtocols expects a string array
createClient(withEndpoint('https://api.example.com'), withWebSocketProtocols([1]))

// @ts-expect-error withWebSocketHeartbeat requires an interval
createClient(withEndpoint('https://api.example.com'), withWebSocketHeartbeat({ timeoutMs: 1 }))

// @ts-expect-error withWebSocketBeforeConnect expects a function
createClient(withEndpoint('https://api.example.com'), withWebSocketBeforeConnect('not-a-function'))

// @ts-expect-error withWebSocketQueue overflow must be a known strategy
createClient(withEndpoint('https://api.example.com'), withWebSocketQueue({ overflow: 'invalid' }))

// @ts-expect-error withWebSocketReconnect attempts must be numeric
createClient(withEndpoint('https://api.example.com'), withWebSocketReconnect({ attempts: '3' }))

// @ts-expect-error withXSRF cookieName must be a string
createClient(withEndpoint('https://api.example.com'), withXSRF({ cookieName: 1 }))

// @ts-expect-error withXSRF tokenProvider must be synchronous and return a token or nullish value
createClient(withEndpoint('https://api.example.com'), withXSRF({ tokenProvider: async () => 'token' }))

export type Cases =
  | ClientCases
  | OptionsCases
  | SerializerCases
  | XsrfTokenProviderCases
  | XsrfOptionsCases
  | XsrfConfigCases
  | ClientConfigXsrfCases
