/**
 * How the HTTP response body should be parsed before struct validation.
 * Defaults to `'json'` when an output shape is declared.
 */
export type HttpResponseType = 'arraybuffer' | 'blob' | 'json' | 'text'

/**
 * Progress snapshot for upload or download callbacks.
 * Mirrors the familiar `ProgressEvent` shape (`loaded` / `total` / `lengthComputable`).
 */
export interface HttpProgressEvent {
  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}

/**
 * Callback invoked as request bytes are uploaded or response bytes are downloaded.
 */
export type HttpProgressFn = (event: HttpProgressEvent) => Promise<void> | void

/**
 * Normalized outgoing HTTP request used by handlers, interceptors, and `fetchHandler`.
 *
 * After `struct.json(...)` (or another body codec) runs during command build, `body` is
 * already the wire value — for JSON that means a **JSON text string**. Sign HMAC / digests
 * against that string (or other final bytes), not the original Struct input object.
 */
export interface HttpRequest {
  abort?: AbortSignal
  baseEndpoint?: string
  body?: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<Uint8Array> | object | string | number | boolean | null
  bodyContentType?: string | null
  /** @internal Tracks which body value produced bodyContentType so interceptors cannot leave stale metadata behind. */
  bodyContentTypeSource?: unknown
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
