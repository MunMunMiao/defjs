import type { HttpContext } from './context'

export type HttpResponseType = 'arraybuffer' | 'blob' | 'json' | 'text'

export interface HttpProgressEvent {
  readonly lengthComputable: boolean
  readonly loaded: number
  readonly total: number
}

export type HttpProgressFn = (event: HttpProgressEvent) => void

export interface HttpRequest {
  abort?: AbortSignal
  baseEndpoint?: string
  body?: Blob | ArrayBuffer | FormData | URLSearchParams | ReadableStream<Uint8Array> | object | string | number | boolean | null
  context?: HttpContext
  downloadProgress?: HttpProgressFn
  endpoint: string
  headers?: Headers
  method: string
  queryParams?: URLSearchParams
  queryString?: string
  responseType?: HttpResponseType
  timeout?: number
  uploadProgress?: HttpProgressFn
  withCredentials?: boolean
}
