export type HttpResponseBody = string | ArrayBuffer | Blob | object | null

export type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: Error | string | unknown
}

export type MakeResponseOptions<R> = {
  status?: number
  statusText?: string
  url?: string
  headers?: Headers
  body?: R | null
  error?: Error | string | unknown
}

export type SettledResponse<TBody = unknown> = HttpResponse<TBody> & {
  readonly ok: boolean
}

export function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R> {
  const status = options?.status ?? 0
  const ok = status >= 200 && status < 300
  const statusText = options?.statusText ?? ''
  const url = options?.url ?? ''
  const headers = options?.headers ?? new Headers()
  const body = options?.body ?? null
  let error = options?.error

  if (!error && !ok) {
    let message = `Http failure response for ${url || '(unknown url)'}: ${status}`
    if (statusText) {
      message += ` - ${statusText}`
    }
    error = new Error(message)
  }

  return {
    status,
    statusText,
    url,
    headers,
    body,
    error,
  }
}

export function toSettledResponse<TBody>(response: HttpResponse<TBody>): SettledResponse<TBody> {
  return {
    ...response,
    ok: response.status >= 200 && response.status < 300,
  }
}
