import { type Client, type ClientOptions, cloneClient, createClient, type QueryParamsSerializer, setGlobalClient } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const serializer: QueryParamsSerializer = params => params.toString()
type SerializerCases = Expect<Equal<typeof serializer, (params: URLSearchParams) => string>>

const client = createClient({
  endpoint: 'https://api.example.com',
  queryParamsSerializer: serializer,
  webSocket: {
    protocols: ['json'],
  },
})

type ClientCases = Expect<Equal<typeof client, Client>>

const cloned = cloneClient(client, {
  withCredentials: true,
})

type ClonedClientCases = Expect<Equal<typeof cloned, Client>>

const options = {
  endpoint: 'https://api.example.com',
  http: {},
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

setGlobalClient(
  createClient({
    endpoint: 'https://global.example.com',
  }),
)
setGlobalClient(client)

// @ts-expect-error endpoint must be a string
createClient({ endpoint: 1 })

// @ts-expect-error serializer must return a string
createClient({ endpoint: 'https://api.example.com', queryParamsSerializer: () => 1 })

export type Cases = ClientCases | ClonedClientCases | OptionsCases | SerializerCases
