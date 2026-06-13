import type { Client, ClientOptions, QueryParamsSerializer } from './index'
import {
  cloneClient,
  createClient,
  setGlobalClient,
  withCredentials,
  withEndpoint,
  withQueryParamsSerializer,
  withWebSocketOptions,
} from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const serializer: QueryParamsSerializer = (params) => params.toString()
type SerializerCases = Expect<Equal<typeof serializer, (params: URLSearchParams) => string>>

const client = createClient(
  withEndpoint('https://api.example.com'),
  withQueryParamsSerializer(serializer),
  withWebSocketOptions({
    protocols: ['json'],
  }),
)

type ClientCases = Expect<Equal<typeof client, Client>>

const cloned = cloneClient(client, withCredentials(true))

type ClonedClientCases = Expect<Equal<typeof cloned, Client>>

const options = {
  endpoint: 'https://api.example.com',
  interceptors: [],
  queryParamsSerializer: serializer,
  sse: {},
  webSocket: {
    heartbeat: {
      intervalMs: 1000,
      timeoutMs: 500,
    },
  },
  withCredentials: true,
} satisfies ClientOptions

type OptionsCases = Expect<Equal<typeof options.endpoint, string>>

setGlobalClient(createClient(withEndpoint('https://global.example.com')))
setGlobalClient(client)

// @ts-expect-error withEndpoint expects a string
createClient(withEndpoint(1))

createClient(
  withEndpoint('https://api.example.com'),
  // @ts-expect-error serializer must return a string
  withQueryParamsSerializer(() => 1),
)

// http option is not part of ClientOption — cast through never to verify compile-time rejection
createClient(withEndpoint('https://api.example.com'), { http: {} } as never)

// http option is not part of ClientOption — cast through never to verify compile-time rejection
cloneClient(client, { http: {} } as never)

export type Cases = ClientCases | ClonedClientCases | OptionsCases | SerializerCases
