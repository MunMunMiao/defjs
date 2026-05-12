import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'

export type HttpHandler = (req: HttpRequest) => Promise<HttpResponse<unknown>>

let globalHttpHandler: HttpHandler | undefined = undefined

export const setGlobalHttpHandler = (handler: HttpHandler) => {
  globalHttpHandler = handler
}

export const getGlobalHttpHandler = () => globalHttpHandler
