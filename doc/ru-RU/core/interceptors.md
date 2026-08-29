---
title: Interceptors
description: Слой политики HTTP, SSE и WebSocket на границе транспорта в onion order.
---

# Interceptors

Добавь auth headers, short-circuit окна обслуживания или ретрай безопасных reads — не трогая валидацию команды. У каждого транспорта своя цепочка. На вход — `HttpRequest`; на выход — результат этого транспорта (`HttpResponse`, event-stream handle или WebSocket session). Валидация input идёт до цепочки; status dispatch и декодированные результаты — после.

## Базовая настройка

```typescript twoslash
import { createClient, createHttpInterceptor, withEndpoint, withInterceptors } from '@defjs/core'

const audit = createHttpInterceptor(async (request, next) => {
  const started = performance.now()
  const response = await next(request)
  console.info(request.operation ?? request.method, response.status, Math.round(performance.now() - started))
  return response
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(audit))
void client
```

## Onion order

`withInterceptors(...items)` принимает смешанные interceptors. Клиент фильтрует по `kind` для выбранного транспорта и сохраняет относительный порядок регистрации. Каждый interceptor может бежать до и после `next`:

| Factory                      | Request       | Result from `next`                    |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'

const order: string[] = []
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// Request: first:before → second:before → transport
// Return: second:after → first:after
void [first, second, order]
```

Несколько вызовов `withInterceptors(...)` дописывают. Клади широкое observation снаружи более узкого mutation/retry, когда внешний слой должен видеть финальный результат.

## Клонируй и добавь request headers

Считай входящий `HttpRequest` принадлежащим цепочке. Клонируй `Headers` перед изменением; передай новый request в `next`:

```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'

function readAccessToken(): string | undefined {
  return undefined
}

const bearer = createHttpInterceptor((request, next) => {
  const token = readAccessToken()
  if (!token) return next(request)

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

Тот же паттерн для SSE. Браузерный WebSocket не может добавить произвольные handshake headers — смена `request.headers` не аутентифицирует browser socket. Используй protocol, URL/query policy или server-supported handshake.

Заменяя HTTP body, заменяй `body` на скопированном request. Fetch игнорирует stale content-type metadata, когда значение body изменилось. Не переиспользуй consumed `ReadableStream` body.

## Short-circuit запроса

Можно пропустить `next`, но обязан вернуть ожидаемый тип результата. Для HTTP `makeResponse(...)` собирает совместимую обёртку:

```typescript twoslash
import { createHttpInterceptor, makeResponse } from '@defjs/core'

function isMaintenanceWindow(): boolean {
  return false
}

const maintenanceGate = createHttpInterceptor(async (_request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(_request)
})
```

Слой команды всё равно диспатчит по статусу. Объяви `503` в `output`, когда вызывающим нужен типизированный `error.data`. Short-circuit SSE или WebSocket нуждается в полном совместимом handle/session (closure promises, live state, ownership и `[Symbol.asyncDispose]`). Partial objects — невалидная политика. Структурные реализации `EventStreamHandle` и `WebSocketSessionLike` теперь требуют стандартный disposer при компиляции; consumers, которые только получают Defjs handles, не обязаны делать новый runtime-вызов.

## Ретрай безопасных reads

Ретраи меняют поведение. Держи политику узкой — этот пример ретраит replayable `GET` / `HEAD` / `OPTIONS` для статусов `0`, `502`, `503`, `504`, ограничивает `Retry-After` 30s и останавливается после двух ретраев или на abort:

```typescript twoslash
import { createHttpInterceptor, type HttpRequest, type HttpResponse } from '@defjs/core'

const retryableMethods = new Set(['GET', 'HEAD', 'OPTIONS'])
const retryableStatuses = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return typeof ReadableStream === 'undefined' || !(request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number {
  const value = response.headers.get('retry-after')
  if (!value) return 250

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, 30_000)

  const date = Date.parse(value)
  return Number.isNaN(date) ? 250 : Math.min(Math.max(0, date - Date.now()), 30_000)
}

function waitForRetryAfter(response: HttpResponse<unknown>, signal?: AbortSignal): Promise<void> {
  const delay = retryAfterMs(response)
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason)
      return
    }

    const timer = setTimeout(done, delay)
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(signal?.reason)
    }

    function done() {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }

    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) onAbort()
  })
}

const retrySafeReads = createHttpInterceptor(async (request, next) => {
  if (!retryableMethods.has(request.method.toUpperCase()) || !isReplayable(request)) return next(request)

  for (let attempt = 0; ; attempt += 1) {
    const response = await next(request)
    if (!retryableStatuses.has(response.status) || attempt >= 2) return response
    await waitForRetryAfter(response, request.abort)
  }
})
```

Thrown interceptor/Fetch errors этот loop не ретраит. Status `0` — Fetch-boundary transport-failure response. Ретрай `POST` / `PUT` / `PATCH` / `DELETE` нуждается в replayable bytes, поддержке сервера, контракте идемпотентности и проверенной status policy.

Если interceptor бросает или rejects вне этого примера, вызывающий получает `kind: 'definition'` / `INTERCEPTOR_FAILED` — см. [Ошибки](./errors.md).

## Оберни WebSocket-сессии

WebSocket interceptor может вызвать `next` максимум один раз. Если оборачиваешь session, явно делегируй live getters и lifecycle members:

```typescript twoslash
import { createWebSocketInterceptor } from '@defjs/core'

const preserveSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get bufferedAmount() {
      return session.bufferedAmount
    },
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code?: number, reason?: string) {
      session.close(code, reason)
    },
    [Symbol.asyncDispose]() {
      return session[Symbol.asyncDispose]()
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message: unknown) {
      session.send(message)
    },
  }
})
```

Spread session снимает snapshot `state` / `connection` / `bufferedAmount` один раз. Сохраняй `closed`, `receive`, `close`, точное делегирование `[Symbol.asyncDispose]()` и listener cleanup, если намеренно не меняешь ownership. Wrapper должен вернуть teardown promise внутренней session, а не отдельный resolved promise. Если цепочка создала session, который не доставлен, Core settles и закрывает его; если успешный interceptor вернул другую session, Core отбрасывает созданную.

## Справка

Factories возвращают tagged transport values:

- `createHttpInterceptor(fn)` → `{ kind: 'http', fn }`
- `createSSEInterceptor(fn)` → `{ kind: 'sse', fn }`
- `createWebSocketInterceptor(fn)` → `{ kind: 'web-socket', fn }`
- `basicAuthHttpInterceptor(provider, options?)` — Basic credentials на HTTP
- `basicAuthSSEInterceptor(provider, options?)` — Basic credentials на SSE

`HttpRequest` может включать `endpoint`, `baseEndpoint`, `method`, `headers`, `body`, `queryParams`, `queryString`, `abort`, `timeout` и статический `operation`. Это значение transport integration — не распарсенный input вызывающего. Держи валидацию команды, валидацию output и mapping доменных ошибок в своих слоях.

SSE/WebSocket observers — lifecycle hooks, не control flow. Unsubscribe WebSocket listeners, когда владелец заканчивается. Сбои observer следуют контракту транспорта; сам interceptor может throw или reject.

Логируй проверенный allowlist: статический `operation`, method, status, duration, стабильный error code. Не логируй по умолчанию resolved URL, query strings, auth headers, bodies, raw causes, SSE event IDs или WebSocket payloads.

Basic credentials — base64, не encrypted. Используй TLS, держи credential providers request-scoped на сервере, никогда не логируй сгенерированный header. Default encoder — `globalThis.btoa`; передай `BasicAuthInterceptorOptions.encode`, когда runtime без `btoa` или нужен проверенный encoder.

Interceptor может enforce transport policy. Он не input validation, не authorization и не resource ownership. Код, который запускает long-lived work, использует `await using` либо вручную закрывает ресурс и ждёт terminal promise. Обычный HTTP request-scoped и управляется timeout / `AbortSignal`, поэтому `Client` не является `AsyncDisposable`.

## Связанные рецепты

- [Тест с локальным Fetch handle](../recipes/test-with-handle.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
