import type { HttpRequest } from '../internal/http_request'
import type { Client, ClientConfig, ClientOptions, QueryParamsSerializer } from './index'

// @ts-expect-error withWebSocketQueue was removed; endpoint definitions own queue limits
import { withWebSocketQueue } from './index'

import {
  createClient,
  withCredentials,
  withEndpoint,
  withHTTPHandle,
  withQueryParamsSerializer,
  withSSEHandle,
  withSSEOnInvalidEvent,
  withWebSocketBeforeConnect,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketOptions,
  withWebSocketProtocols,
  withWebSocketReconnect,
  withXSRF,
} from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const serializer: QueryParamsSerializer = (params) => params.toString()
type SerializerCases = Expect<Equal<typeof serializer, (params: URLSearchParams, rawParams?: { [key: string]: unknown }) => string>>

type XSRFTokenProvider = (context: { request: HttpRequest }) => string | null | undefined
type XSRFTokenProviderContext = Parameters<XSRFTokenProvider>[0]

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

declare const NodeWebSocket: {
  readonly OPEN: 1
  new (address: string | URL, protocols?: string | string[]): Omit<WebSocket, 'dispatchEvent'>
}

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withHTTPHandle(customFetch),
  withSSEHandle(customFetch),
  withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
  withWebSocketBeforeConnect(async ({ attempt, signal }) => {
    void attempt
    void signal
  }),
  withWebSocketProtocols(['json']),
  withWebSocketHeartbeat({
    intervalMs: 1_000,
    timeoutMs: 5_000,
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

createClient(withWebSocketHandle(NodeWebSocket))

const invalidReasons: string[] = []
createClient(withSSEOnInvalidEvent(({ reason }) => invalidReasons.push(reason)))

const options = {
  endpoint: 'https://api.example.com',
  http: {
    handle: customFetch,
  },
  interceptors: [],
  queryParamsSerializer: serializer,
  sse: {
    handle: customFetch,
  },
  webSocket: {
    handle: MockWebSocket as unknown as typeof WebSocket,
    beforeConnect: async ({ attempt, signal }) => {
      void attempt
      void signal
    },
    heartbeat: {
      intervalMs: 1_000,
      timeoutMs: 5_000,
    },
    protocols: ['json'],
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

type XsrfOptionsCases = Expect<
  Equal<ClientOptions['xsrf'], { cookieName?: string; headerName?: string; tokenProvider?: XSRFTokenProvider } | undefined>
>
type XsrfConfigCases = Expect<
  Equal<ClientConfig['xsrf'], { cookieName: string; headerName: string; tokenProvider?: XSRFTokenProvider } | undefined>
>

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

void withWebSocketQueue

createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketOptions({
    // @ts-expect-error client-level WebSocket queue configuration was removed
    queue: { maxSize: 1 },
  }),
)

// @ts-expect-error withWebSocketReconnect attempts must be numeric
createClient(withEndpoint('https://api.example.com'), withWebSocketReconnect({ attempts: '3' }))

// @ts-expect-error withXSRF cookieName must be a string
createClient(withEndpoint('https://api.example.com'), withXSRF({ cookieName: 1 }))

// @ts-expect-error withXSRF tokenProvider must be synchronous and return a token or nullish value
createClient(withEndpoint('https://api.example.com'), withXSRF({ tokenProvider: async () => 'token' }))

export type Cases = ClientCases | OptionsCases | SerializerCases | XsrfTokenProviderCases | XsrfOptionsCases | XsrfConfigCases
