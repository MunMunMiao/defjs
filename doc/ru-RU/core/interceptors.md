---
title: Перехватчики
description: Фильтруйте перехватчики по транспорту, выполняйте их в луковичном порядке, безопасно клонируйте запросы, прерывайте цепочку и реализуйте ограниченные политики аутентификации и повторов.
---

# Перехватчики

Перехватчики оборачивают границу транспорта. У HTTP, SSE и WebSocket разные виды перехватчиков и разные типы результата.

| Фабрика                      | Запрос        | Результат `next`                      |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

Регистрируйте смешанный набор через `withInterceptors(...)`. Клиент отбирает элементы по `kind` и сохраняет порядок регистрации внутри каждого транспорта.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## Луковичный порядок

Запрос проходит перехватчики в порядке регистрации. Результат возвращается в обратном порядке:

```typescript
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

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

Несколько вызовов `withInterceptors(...)` добавляют элементы в конец:

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

## Безопасное клонирование запросов

Считайте входящий запрос принадлежащим цепочке. Перед изменением заголовков создайте новый объект `Headers`:

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

Тот же приём подходит для заголовков SSE. Браузерный конструктор WebSocket не умеет отправлять произвольные заголовки handshake, поэтому изменение `request.headers` в WebSocket-перехватчике не аутентифицирует браузерное подключение.

При замене HTTP-тела скопируйте запрос через spread и замените `body`. Граница Fetch распознаёт, что метаданные Content-Type старого тела больше не относятся к новому. Не переиспользуйте уже прочитанный `ReadableStream`.

## Короткое замыкание

Перехватчик может не вызывать `next`, но обязан вернуть тип результата своего транспорта. Для HTTP обёртку Defjs можно создать через `makeResponse(...)`:

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

Обычный слой команд всё равно выберет Struct по статусу и `output`. Если статус является частью контракта эндпоинта, объявите его.

Для короткого замыкания SSE или WebSocket понадобится полностью совместимый хендл или сеанс, включая семантику закрытия. Обычно это сложнее, чем вернуть синтетический HTTP-ответ.

## Сохраняйте актуальные геттеры сеанса

Не оборачивайте сеанс WebSocket через `{ ...session }`. Spread прочитает `state` и `connection` один раз и превратит актуальные геттеры в устаревшие значения. Делегируйте каждый член явно:

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

Обёртка должна сохранять и владение ресурсом. Не заменяйте `closed`, не подавляйте `close` и не отсоединяйте входной iterable, если приложение не выбрало и не описало такое поведение намеренно.

## Ограниченное логирование

Предпочитайте фиксированные имена операций и небольшой проверенный набор полей:

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

По умолчанию не записывайте в журнал URL эндпоинтов, query-строки, заголовки, тела, исходные причины, идентификаторы SSE-событий и payload WebSocket.

## Осторожные повторы HTTP

Повторы меняют поведение приложения. Пример ниже ограничен методами `GET`, `HEAD` и `OPTIONS`; повторяет только статусы `0`, `502`, `503` и `504`; учитывает `Retry-After`; быстро останавливается при отмене и отказывается от потокового тела.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

Этот перехватчик не повторяет ошибки, выброшенные другими перехватчиками: надёжно классифицировать их нельзя. Статус `0` — обёртка транспортной ошибки на границе Defjs Fetch.

Не добавляйте записывающие методы по привычке. Для повторов `POST`, `PUT`, `PATCH` или `DELETE` нужны контракт идемпотентности на уровне приложения, повторно читаемые тела, поддержка сервера и проверенная политика статусов.

## Basic Authentication

Корневая точка входа экспортирует `basicAuthHttpInterceptor(...)` и `basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Учётные данные Basic только кодируются в base64, легко декодируются обратно и не шифруются. Используйте TLS. Стандартный кодировщик вызывает `globalThis.btoa`, который может отсутствовать и принимает ограниченный набор символов. Передайте `options.encode`, если в среде нет `btoa` или для учётных данных нужна проверенная реализация UTF-8/base64.

Провайдер учётных данных вызывается при прохождении запроса через перехватчик. На сервере держите учётные данные в области запроса и не записывайте итоговый заголовок в журнал.

## Безопасность наблюдателей и колбэков

Перехватчики SSE и WebSocket могут подключать наблюдателей жизненного цикла к возвращённым хендлам. Удаляйте слушатели WebSocket, когда завершается их владелец. Слушатели и предикаты не должны выбрасывать ошибки: текущие реализации транспорта реального времени изолируют не все сбои слушателей и предикатов переподключения.

Перехватчик может выбросить ошибку или отклонить Promise. Высокоуровневый транспорт нормализует часть сбоев в `RequestError`, но код перехватчика не должен рассчитывать на общее обещание «Promise никогда не отклоняется».

## Что дальше

- [Клиент](/ru-RU/core/client) — регистрация и композиция опций.
- [HTTP](/ru-RU/core/http) — обёртка Fetch и поведение статуса 0.
- [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket) — жизненный цикл соответствующих транспортов.
