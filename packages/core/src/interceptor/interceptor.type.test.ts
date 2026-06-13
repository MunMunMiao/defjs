import type { HttpInterceptor, SSEInterceptor } from './index'
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from './index'

type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
type Expect<T extends true> = T

const httpInterceptor = basicAuthHttpInterceptor(() => ({
  password: 'secret',
  username: 'miao',
}))

const sseInterceptor = basicAuthSSEInterceptor(() => ({
  password: 'secret',
  username: 'miao',
}))

type HttpInterceptorCase = Expect<Equal<typeof httpInterceptor, HttpInterceptor>>
type SSEInterceptorCase = Expect<Equal<typeof sseInterceptor, SSEInterceptor>>

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

export type Cases = HttpInterceptorCase | SSEInterceptorCase
