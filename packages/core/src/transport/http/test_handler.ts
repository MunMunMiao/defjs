import type { HttpRequest } from '../../http'
import { ERR_INVALID_CLIENT_ENDPOINT, type HttpResponse, makeResponse } from '../../response'
import type { HttpHandler } from './handler'

export function makeFakeHandler(init?: {
  onRequestBefore?: (req: HttpRequest) => void
  onRequestAfter?: (resp: HttpResponse<unknown>) => void
  response?: {
    timeout?: number
    status?: number
    statusText?: string
    headers?: Headers
    body?: unknown
  }
}): HttpHandler {
  const { onRequestBefore, onRequestAfter, response } = init ?? {}
  const { status, statusText, body, headers } = response ?? {}
  return (req: HttpRequest) => {
    return new Promise(resolve => {
      if (!req.baseEndpoint) {
        throw ERR_INVALID_CLIENT_ENDPOINT
      }

      let base: URL
      try {
        base = new URL(req.baseEndpoint)
      } catch {
        throw ERR_INVALID_CLIENT_ENDPOINT
      }

      if (!base.pathname.endsWith('/')) {
        base.pathname = `${base.pathname}/`
      }

      let url: URL
      try {
        url = new URL(req.endpoint.replace(/^\/+/, ''), base)
      } catch {
        throw ERR_INVALID_CLIENT_ENDPOINT
      }

      onRequestBefore?.(req)

      const resp = makeResponse({
        url: url.toString(),
        status: status || 0,
        statusText: statusText || '',
        headers: headers || new Headers(),
        body: body || undefined,
      })

      onRequestAfter?.(resp)

      return resolve(resp)
    })
  }
}
