import type { FnReturn, FnParams } from '../internal/utility_types'
import type { HttpRequest } from '../internal/http_request'
import type { HttpResponse } from '../internal/http_response'
import type { EventStreamHandle } from '../sse/transport/event_stream'
import type {
  HttpInterceptorNext,
  InterceptorFn,
  SSEHandler,
  SSEInterceptorFn,
  WebSocketHandler,
  WebSocketInterceptorFn,
  WebSocketSessionLike,
  makeInterceptorChain,
  makeSSEInterceptorChain,
  makeWebSocketInterceptorChain,
} from './interceptor'
import type { HttpInterceptor, SSEInterceptor } from './index'
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from './index'

type IsAny<T> = 0 extends 1 & T ? true : false
type ContainsAny<T> =
  IsAny<T> extends true
    ? true
    : [T] extends [never]
      ? false
      : T extends (...args: infer Args) => infer Result
        ? ContainsAny<Args> extends true
          ? true
          : ContainsAny<Result>
        : T extends Promise<infer Value>
          ? ContainsAny<Value>
          : T extends HttpResponse<infer Body>
            ? ContainsAny<Body>
            : T extends EventStreamHandle<infer Event>
              ? ContainsAny<Event>
              : T extends readonly unknown[]
                ? number extends T['length']
                  ? ContainsAny<T[number]>
                  : ContainsAnyTuple<T>
                : false
type ContainsAnyTuple<T extends readonly unknown[]> = T extends readonly [infer Head, ...infer Tail]
  ? ContainsAny<Head> extends true
    ? true
    : ContainsAnyTuple<Tail>
  : false
type StrictEqual<A, B> =
  ContainsAny<A> extends true ? false : ContainsAny<B> extends true ? false : [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const httpInterceptor = basicAuthHttpInterceptor(() => ({
  password: 'secret',
  username: 'miao',
}))

const sseInterceptor = basicAuthSSEInterceptor(() => ({
  password: 'secret',
  username: 'miao',
}))

type HttpInterceptorCase = Expect<StrictEqual<typeof httpInterceptor, HttpInterceptor>>
type SSEInterceptorCase = Expect<StrictEqual<typeof sseInterceptor, SSEInterceptor>>

type MakeHttpChainCase = Expect<StrictEqual<FnReturn<typeof makeInterceptorChain>, InterceptorFn>>
type MakeSSEChainCase = Expect<StrictEqual<FnReturn<typeof makeSSEInterceptorChain>, SSEInterceptorFn>>
type MakeWebSocketChainCase = Expect<StrictEqual<FnReturn<typeof makeWebSocketInterceptorChain>, WebSocketInterceptorFn>>

type HttpChainParametersCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeInterceptorChain>>, [HttpRequest, HttpInterceptorNext]>>
type SSEChainParametersCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeSSEInterceptorChain>>, [HttpRequest, SSEHandler]>>
type WebSocketChainParametersCase = Expect<
  StrictEqual<FnParams<FnReturn<typeof makeWebSocketInterceptorChain>>, [HttpRequest, WebSocketHandler]>
>

type HttpChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeInterceptorChain>>[1], HttpInterceptorNext>>
type SSEChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeSSEInterceptorChain>>[1], SSEHandler>>
type WebSocketChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeWebSocketInterceptorChain>>[1], WebSocketHandler>>

type HttpChainResultCase = Expect<StrictEqual<FnReturn<FnReturn<typeof makeInterceptorChain>>, Promise<HttpResponse<unknown>>>>
type SSEChainResultCase = Expect<StrictEqual<FnReturn<FnReturn<typeof makeSSEInterceptorChain>>, Promise<EventStreamHandle<unknown>>>>
type WebSocketChainResultCase = Expect<StrictEqual<FnReturn<FnReturn<typeof makeWebSocketInterceptorChain>>, Promise<WebSocketSessionLike>>>

basicAuthHttpInterceptor(
  () => ({
    password: 'secret',
    username: 'miao',
  }),
  {
    encode: (credential) => `${credential.username}:${credential.password}`,
  },
)

// @ts-expect-error password is required
basicAuthHttpInterceptor(() => ({
  username: 'miao',
}))

// @ts-expect-error encode must return a string
basicAuthHttpInterceptor(() => ({ password: 'secret', username: 'miao' }), { encode: () => 1 })

// @ts-expect-error password is required
basicAuthSSEInterceptor(() => ({
  username: 'miao',
}))

export type Cases =
  | HttpChainNextCase
  | HttpChainParametersCase
  | HttpChainResultCase
  | HttpInterceptorCase
  | MakeHttpChainCase
  | MakeSSEChainCase
  | MakeWebSocketChainCase
  | SSEChainNextCase
  | SSEChainParametersCase
  | SSEChainResultCase
  | SSEInterceptorCase
  | WebSocketChainNextCase
  | WebSocketChainParametersCase
  | WebSocketChainResultCase
