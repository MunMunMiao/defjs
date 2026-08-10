const HTTP_RESPONSE: unique symbol = Symbol('HttpResponse')

export type HttpResponse<R> = {
  readonly [HTTP_RESPONSE]: true
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}

export type MakeResponseOptions<R> = {
  status?: number
  statusText?: string
  url?: string
  headers?: Headers
  body?: R | null
  error?: unknown
}

export function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R> {
  const status = options?.status ?? 0
  const ok = status >= 200 && status < 300
  const statusText = options?.statusText ?? ''
  const url = options?.url ?? ''
  const headers = options?.headers ?? new Headers()
  const body = options?.body ?? null
  let error = options?.error

  if (error === undefined && status === 0) {
    error = new Error(getHttpErrorMessage({ status, statusText, url }))
  }

  return {
    [HTTP_RESPONSE]: true,
    status,
    statusText,
    url,
    headers,
    body,
    error,
    ok,
  }
}

export function getHttpErrorMessage(response: { readonly status: number; readonly statusText: string; readonly url: string }): string {
  let message = `Http failure response for ${response.url || '(unknown url)'}: ${response.status}`
  if (response.statusText) {
    message += ` - ${response.statusText}`
  }
  return message
}
