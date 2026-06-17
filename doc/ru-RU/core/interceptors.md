---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# Перехватчики

Перехватчики `@defjs/core` делятся по транспортному слою: HTTP, SSE и WebSocket. Они разделяют одну и ту же модель луковичной цепочки, но работают с разными формами запроса/ответа: HTTP возвращает `Promise<HttpResponse>`, SSE — `Promise<EventStreamHandle>`, а WebSocket — `Promise<WebSocketSessionLike>`.

Перехватчики регистрируются на уровне `Client` через `withInterceptors(...)`. Клиент автоматически фильтрует и диспатчит на правильную цепочку перехватчиков на основе типа команды.

## Три типа перехватчиков

### HTTP-перехватчики

HTTP-перехватчики работают с `HttpRequest` и возвращают `Promise<HttpResponse>`. Типичное использование: инъекция auth-заголовков, логирование, retry, трансформация ошибок.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### SSE-перехватчики

SSE-перехватчики работают с `HttpRequest` (HTTP-запрос перед соединением) и возвращают `Promise<EventStreamHandle>`. Типичное использование: инъекция auth-заголовков перед SSE-соединением, мониторинг состояния соединения.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### WebSocket-перехватчики

WebSocket-перехватчики работают с `HttpRequest` (HTTP-запрос перед handshake) и возвращают `Promise<WebSocketSessionLike>`. Типичное использование: модификация URL или инъекция заголовков субпротокола перед WebSocket-handshake.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## Модель луковичной цепочки

Все три цепочки перехватчиков используют **луковичную модель**: фаза запроса входит в порядке регистрации, фаза ответа возвращается в обратном порядке.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // Фаза запроса: первый входит
  const res = await next(req)
  order.push(1.1) // Фаза ответа: последний выходит
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // Фаза запроса: последний входит
  const res = await next(req)
  order.push(3.1) // Фаза ответа: первый выходит
  return res
})

// Порядок регистрации: a -> b -> c
// Порядок выполнения: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### Модификация запросов и ответов

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### Оборачивание возвращаемых результатов

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## Примеры распространённых перехватчиков

### Auth-перехватчик

Инжектирует Bearer Token в заголовки. HTTP и SSE разделяют одну логику.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### Логирующий перехватчик

Записывает длительность запроса и код состояния.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### Retry-перехватчик

Повторяет запросы при определённых кодах состояния. Retry-перехватчик следует регистрировать ближе к низу цепочки, после логирования, но перед фактическим запросом.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic Auth-перехватчик (встроенный)

`@defjs/core` предоставляет встроенные Basic Auth-перехватчики для HTTP и SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

Кодировка по умолчанию использует `globalThis.btoa`. Для сред без `btoa` (например, Node) можно кастомизировать через `options.encode`:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## Регистрация и фильтрация

### Регистрация через `withInterceptors`

Перехватчики регистрируются при `createClient` через `withInterceptors(...)`. Один массив может смешивать все три типа перехватчиков; клиент фильтрует по типу команды автоматически.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### Правила фильтрации

Клиент фильтрует перехватчики по типу команды:

| Тип команды                   | Условие фильтрации      | Внутренняя функция             |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

Отфильтрованные перехватчики сохраняют свой исходный порядок регистрации, затем формируют луковичную цепочку.

```typescript
// Упрощённая внутренняя логика выполнения
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### Порядок перехватчиков и композиция

Несколько вызовов `withInterceptors` дописывают перехватчики по порядку.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // Первый
  withInterceptors(authInterceptor, retryInterceptor), // Второй
)
// Итоговый порядок: logging -> auth -> retry
```

## Примечания о метаданных тела

Когда перехватчик заменяет `body`, старые метаданные `bodyContentType` автоматически инвалидируются, чтобы предотвратить отправку некорректного `Content-Type` на сервер.

```typescript
// Сохранение оригинального тела: метаданные Content-Type остаются валидными
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// Замена тела: старый Content-Type очищается, новый тип тела определяет его
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## Справка по API

### Функции создания

| Функция                          | Описание                      |
| -------------------------------- | ----------------------------- |
| `createHttpInterceptor(fn)`      | Создать HTTP-перехватчик      |
| `createSSEInterceptor(fn)`       | Создать SSE-перехватчик       |
| `createWebSocketInterceptor(fn)` | Создать WebSocket-перехватчик |

### Типы

| Тип                    | Описание                                                                          |
| ---------------------- | --------------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP-перехватчик объект `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | SSE-перехватчик объект `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | WebSocket-перехватчик объект `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | Объединение всех трёх типов перехватчиков                                         |
| `HttpInterceptorNext`  | HTTP next handler `(req: HttpRequest) => Promise<HttpResponse>`                   |
| `SSEHandler`           | SSE next handler `(req: HttpRequest) => Promise<EventStreamHandle>`               |
| `WebSocketHandler`     | WebSocket next handler `(req: HttpRequest) => Promise<WebSocketSessionLike>`      |

### Встроенные перехватчики

| Функция                                          | Описание                    |
| ------------------------------------------------ | --------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth-перехватчик |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth-перехватчик  |

## Что дальше

- [Клиент →](/core/client) — Создание клиентов и конфигурация перехватчиков
- [HTTP-запросы →](/core/http) — `defineRequest` и паттерны output
- [SSE →](/core/sse) — Определение SSE и потоковая передача
- [WebSocket →](/core/web-socket) — Определение WebSocket и жизненный цикл
