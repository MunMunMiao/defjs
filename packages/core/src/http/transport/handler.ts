import type { HttpRequest } from '../../internal/http_request'
import type { HttpResponse } from '../../internal/http_response'

export interface HttpHandler {
  (req: HttpRequest): Promise<HttpResponse<unknown>>
  /** Set to true when the handler implements its own timeout(e.g. XHR's `xhr.timeout`).
   * Lets the outer http executor skip wiring a duplicate `AbortSignal.timeout`. */
  supportsNativeTimeout?: boolean
}
