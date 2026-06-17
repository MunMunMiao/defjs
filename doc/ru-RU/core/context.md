---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# Контекст

Поток выполнения Defjs: конфигурация клиента предоставляет глобальные дефолты; определения команд описывают структуру ендпоинта; `build` отображает распарсенный input в части HTTP-запроса; а `HttpContext` выступает как невидимый багаж, передаваемый между перехватчиками в течение одного жизненного цикла выполнения.

## Передача HttpContext

`HttpContext` — это контейнер ключ-значение на основе Token для метаданных в рамках одного жизненного цикла запроса/соединения. Он не участвует в сериализации URL, заголовков или тела. Читается и записывается перехватчиками.

### Создание и использование

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Определить Token (со значением по умолчанию)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. Создать контекст и задать значения
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. Передать во время выполнения
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### Чтение в перехватчиках

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### Слияние контекстов

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged содержит и requestId, и auth
```

### Ключевое API

| Экспорт                                          | Описание                                                               |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | Создать Token со значением по умолчанию                                |
| `makeHttpContext()`                              | Создать пустой контекст                                                |
| `makeHttpContext(entries)`                       | Создать из массива `[token, value]`                                    |
| `makeHttpContext(otherContext)`                  | Скопировать другой контекст                                            |
| `mergeHttpContexts(primary, secondary)`          | Слить два контекста; secondary переопределяет primary для одного Token |
| `ctx.set(token, value)`                          | Записать значение; возвращает self (чейнинг)                           |
| `ctx.get(token)`                                 | Прочитать значение; возвращает дефолт Token, если не установлено       |
| `ctx.has(token) / ctx.del(token)`                | Проверить / удалить                                                    |
| `ctx.keys() / ctx.length`                        | Итерировать / считать                                                  |

---

## Request Builder и парсинг input

### Поток парсинга input

При выполнении команды клиент обрабатывает input в таком порядке:

1. **Валидация**: Валидирует и парсит сырые данные вызывающего через `input` Struct.
2. **Build**: Вызывает `build(request, parsedInput)` для отображения распарсенных данных в части запроса.
3. **Транспорт**: Диспатчит на HTTP fetch, SSE-поток или WebSocket-соединение на основе `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Матрица возможностей Build Handler

Разные транспорты поддерживают разные операции `build`:

| Метод build                               | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

Использование метода, неподдерживаемого транспортом, выбрасывает `REQUEST_VALIDATION_FAILED` во время выполнения.

### Автоматический build

Если `build` опущен, `input` тоже должен быть опущен. Однако можно использовать `request`-форму Struct для автоматического вывода build-логики:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // Build не нужен; фреймворк автоматически маппит path/query
})
```

Если `build` указан, `input` тоже должен быть указан. Это строгое правило дизайна.

---

## Конфигурация клиента

Создайте клиент с помощью `createClient` и одной или нескольких конфигурационных функций. Поздние функции переопределяют ранние для одного и того же ключа.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### Основные опции

#### `withEndpoint(url)`

Задаёт базовый адрес API. Все значения `path` запросов присоединяются после этого URL.

```typescript
withEndpoint('https://api.example.com/v1')
// Запрос /users формирует https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

Включить ли cross-origin credentials (cookies, заголовки HTTP-аутентификации, TLS-клиентские сертификаты). Соответствует опции `credentials` в `fetch`.

```typescript
withCredentials(true) // Включить cookies в cross-origin запросах
withCredentials(false) // По умолчанию
```

#### `withXSRF(options)`

Настраивает поведение чтения и инъекции XSRF-токена. По умолчанию читает `XSRF-TOKEN` из `document.cookie` и инжектирует в заголовок `X-XSRF-TOKEN`.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // Пользовательская логика чтения, например, из localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| Поле            | Тип                                    | По умолчанию                |
| --------------- | -------------------------------------- | --------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`              |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`            |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | Читает из `document.cookie` |

#### `withQueryParamsSerializer(fn)`

Пользовательская сериализация query-параметров. По умолчанию `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

При наличии пользовательского сериализатора HTTP- и SSE-запросы допускают сложные query-параметры.

---

## Транспорт-специфичная конфигурация

### SSE-опции

Настройка через `withSSEOptions` или отдельные конфигурационные функции.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| Опция                | Описание                                                                                                               |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `sse.fetch`          | SSE-специфичная реализация `fetch`                                                                                     |
| `sse.reconnect`      | Стратегия переподключения: попытки, задержка, backoff-фактор, jitter, макс. задержка, пользовательская функция решения |
| `sse.queue`          | Очередь событий: макс. ёмкость, стратегия переполнения                                                                 |
| `sse.onInvalidEvent` | Наблюдатель невалидных событий (отсутствие схемы или валидационная ошибка)                                             |
| `sse.maxBufferSize`  | Лимит размера нижележащего буфера (байты)                                                                              |

### WebSocket-опции

Настройка через `withWebSocketOptions` или отдельные конфигурационные функции.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| Опция                     | Описание                                                                                                               |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `webSocket.WebSocket`     | Пользовательский конструктор `WebSocket`                                                                               |
| `webSocket.protocols`     | Массив субпротоколов RFC 6455                                                                                          |
| `webSocket.beforeConnect` | Хук перед соединением (например, получить динамический токен)                                                          |
| `webSocket.heartbeat`     | Heartbeat: интервал, таймаут, фабрика сообщений, ACK-предикат                                                          |
| `webSocket.reconnect`     | Стратегия переподключения: попытки, задержка, backoff-фактор, jitter, макс. задержка, пользовательская функция решения |
| `webSocket.queue`         | Очередь отправки: макс. ёмкость, стратегия переполнения                                                                |

### Детали heartbeat

WebSocket heartbeat обнаруживает живость соединения. Если настроен, фреймворк отправляет heartbeat-сообщения каждые `intervalMs` и ждёт ACK в течение `timeoutMs`. Если ACK не приходит вовремя, срабатывает переподключение.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // Отправлять heartbeat каждые 30с
  timeoutMs: 10000, // Должен получить ACK в течение 10с
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- Тип heartbeat-сообщения должен быть совместим с `outgoing` определениями.
- `isAck` определяет, является ли входящее сообщение heartbeat-ответом. Когда возвращает `true`, сообщение не попадает в итератор `receive`.

---

## Композиция конфигурации и приоритет

Конфигурационные функции применяются по порядку; поздние переопределяют ранние. Опции уровня выполнения (`client.execute(cmd, { timeout: 5000 })`) имеют наивысший приоритет, за ними следует клиент-уровневая конфигурация.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// Переопределить SSE-переподключение на уровне выполнения
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## Что дальше

- [Клиент →](/core/client) — Создание клиента и использование `execute`
- [Команды →](/core/commands) — Определение команд и правила необходимости input
- [SSE →](/core/sse) — Выполнение SSE, переподключение и обработка событий
- [WebSocket →](/core/web-socket) — WebSocket-соединение, heartbeat и управление состоянием
- [Перехватчики →](/core/interceptors) — Типы перехватчиков и механика луковичной цепочки
