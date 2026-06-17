---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# Клиент

`@defjs/core` использует дизайн **явного клиента**. Каждый запрос выполняется через экземпляр `Client`, созданный вами явно. Это делает тестирование, конфигурацию мультисреды и отслеживание зависимостей прямолинейными.

## Создание клиента

Используйте `createClient` с одной или несколькими конфигурационными функциями.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Конфигурационные функции композиционны. Поздние функции переопределяют ранние для одного и того же ключа.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### Параметры конфигурации

| Функция                             | Описание                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------- |
| `withEndpoint(url)`                 | Базовый адрес API.                                                           |
| `withHTTPHandle(fetch)`             | Пользовательская реализация `fetch` для HTTP.                                |
| `withSSEHandle(fetch)`              | Пользовательская реализация `fetch` для SSE.                                 |
| `withWebSocketHandle(WebSocket)`    | Пользовательский конструктор `WebSocket` (например, для Node).               |
| `withInterceptors(...interceptors)` | Регистрация транспортных перехватчиков. Автоматически диспатчится по `kind`. |
| `withQueryParamsSerializer(fn)`     | Пользовательская сериализация query-параметров.                              |
| `withCredentials(boolean)`          | Включить cross-origin credentials.                                           |
| `withXSRF(options)`                 | Поведение чтения и инъекции XSRF-токена.                                     |
| `withSSEOptions(options)`           | SSE-переподключение, очередь, обработка невалидных событий и т.д.            |
| `withWebSocketOptions(options)`     | WebSocket heartbeat, переподключение, очередь, субпротоколы и т.д.           |

Для специфичной конфигурации SSE и WebSocket см. [SSE](/core/sse) и [WebSocket](/core/web-socket).

## Выполнение команд

`Client.execute` — перегруженный метод, который диспатчит на правильный транспортный слой на основе типа `Command`.

### HTTP-запросы

Передайте команду, созданную с помощью `defineRequest`. Возвращает тройку:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

Тип возвращаемого значения:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE-потоки событий

Передайте команду, созданную с помощью `defineEventStream`. Возвращает хендл потока и информацию об открытии.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

Тип возвращаемого значения:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket-соединения

Передайте команду, созданную с помощью `defineWebSocket`. Возвращает объект сессии.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

Тип возвращаемого значения:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## Вспомогательные функции

### `isClient`

Проверяет, является ли значение валидным экземпляром `Client`.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

Извлекает внутренний конфигурационный объект для отладки или построения высокоуровневых абстракций.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

Если значение не является экземпляром `Client`, `getClientConfig` выбрасывает `TypeError`.

## Явное проектирование клиента

Каждый клиент в Defjs создаётся явно. Ты создаёшь `Client` с помощью `createClient` и передаёшь его туда, где он нужен.

Преимущества явного создания:

- **Дружелюбно к тестам**: Передавай разные экземпляры `Client` напрямую в тесты, не сбрасывая и не мокая никакое состояние.
- **Мультисреднее сосуществование**: Несколько клиентов могут работать параллельно в одном процессе (например, internal API + public API).
- **Прозрачность зависимостей**: Вызывающий должен явно держать `Client`, делая зависимости видимыми для статического анализа и code review.

Если нужен общий клиент в твоём приложении, экспортируй его из модуля:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Затем импортируйте и используйте в бизнес-коде:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## Что дальше

- [HTTP-запросы →](/core/http) — `defineRequest` и паттерны output
- [SSE →](/core/sse) — Определение SSE, переподключение и очереди событий
- [WebSocket →](/core/web-socket) — Определение WebSocket, heartbeat и стратегии переподключения
- [Перехватчики →](/core/interceptors) — Типы перехватчиков и механика луковичной цепочки
