import type { HttpContext } from './context'

export type HttpResponseType = 'arraybuffer' | 'blob' | 'json' | 'text'

export interface HttpProgressEvent {
  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}

export type HttpProgressFn = (event: HttpProgressEvent) => Promise<void> | void

export interface HttpRequest {
  abort?: AbortSignal
  baseEndpoint?: string
  body?: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<Uint8Array> | object | string | number | boolean | null
  bodyContentType?: string | null
  /** @internal Tracks which body value produced bodyContentType so interceptors cannot leave stale metadata behind. */
  bodyContentTypeSource?: unknown
  context?: HttpContext
  downloadProgress?: HttpProgressFn
  endpoint: string
  headers?: Headers
  method: string
  /** Static, low-cardinality endpoint identity for telemetry and diagnostics. */
  operation?: string
  queryParams?: URLSearchParams
  queryString?: string
  responseType?: HttpResponseType
  timeout?: number
  uploadProgress?: HttpProgressFn
  withCredentials?: boolean
  xsrf?: {
    cookieName: string
    headerName: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
}
