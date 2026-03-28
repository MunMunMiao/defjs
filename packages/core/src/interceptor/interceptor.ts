import type { HttpRequest } from '../http'
import type { HttpResponse } from '../response'
import type { HttpHandler } from '../transport/http/handler'

export type InterceptorFn = (req: HttpRequest, next: HttpHandler) => Promise<HttpResponse<unknown>>

export function makeInterceptorChain(interceptors: InterceptorFn[]): InterceptorFn {
  return interceptors.reduceRight(
    (fn, interceptor) => {
      return (initReq, finalHandlerFn) => interceptor(initReq, req => fn(req, finalHandlerFn))
    },
    (req, fn) => fn(req),
  )
}
