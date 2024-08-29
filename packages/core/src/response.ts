export type HttpResponseBody = string | ArrayBuffer | Blob | object | null

export type HttpResponse<R> =
  | {
      readonly ok: true
      readonly url: string
      readonly status: number
      readonly statusText: string
      readonly headers: Headers
      readonly error: null
      readonly body: R | null
    }
  | {
      readonly ok: false
      readonly url: string
      readonly status: number
      readonly statusText: string
      readonly headers: Headers
      readonly error: Error
      readonly body: null
    }

export type MakeResponseOptions<R> = {
  status?: number
  statusText?: string
  url?: string
  headers?: Headers
  body?: R | null
}

export function __makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R> {
  const status = options?.status ?? 0
  const ok = status >= 200 && status < 300
  const statusText = options?.statusText ?? ''
  const url = options?.url ?? ''
  const headers = options?.headers ?? new Headers()
  const body = options?.body ?? null
  const error = new Error(`Http failure response for ${url || '(unknown url)'}: ${status} - ${statusText}`)

  if (!ok) {
    return {
      ok: false,
      status,
      statusText,
      url,
      headers,
      body: null,
      error,
    }
  }

  return {
    ok: true,
    status,
    statusText,
    url,
    headers,
    body,
    error: null,
  }
}
