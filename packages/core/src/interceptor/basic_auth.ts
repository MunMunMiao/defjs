import type { HttpRequest } from '../internal/http_request'
import type { HttpInterceptor, SSEInterceptor } from './interceptor'
import { createHttpInterceptor, createSSEInterceptor } from './interceptor'

export type BasicCredential = {
  username: string
  password: string
}

export type BasicAuthInterceptorOptions = {
  encode?: (credential: BasicCredential) => string
}

function createBasicAuthModifier(fn: () => BasicCredential, options?: BasicAuthInterceptorOptions): (req: HttpRequest) => HttpRequest {
  let encode = options?.encode

  if (!encode) {
    const btoa = globalThis.btoa
    if (typeof btoa !== 'function') {
      throw new Error('BasicAuthInterceptor is not supported in this environment')
    }
    encode = (data: BasicCredential) => btoa(`${data.username}:${data.password}`)
  }

  return (req: HttpRequest): HttpRequest => {
    const headers = req.headers || new Headers()
    headers.set('Authorization', `Basic ${encode(fn())}`)
    return { ...req, headers }
  }
}

export function basicAuthHttpInterceptor(fn: () => BasicCredential, options?: BasicAuthInterceptorOptions): HttpInterceptor {
  const modify = createBasicAuthModifier(fn, options)
  return createHttpInterceptor((req, next) => next(modify(req)))
}

export function basicAuthSSEInterceptor(fn: () => BasicCredential, options?: BasicAuthInterceptorOptions): SSEInterceptor {
  const modify = createBasicAuthModifier(fn, options)
  return createSSEInterceptor((req, next) => next(modify(req)))
}
