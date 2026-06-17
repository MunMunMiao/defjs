---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Команды

Defjs построен вокруг «команд»: типобезопасных исполняемых объектов, создаваемых через `defineRequest`, `defineEventStream` и `defineWebSocket`. Каждая команда несёт `kind` (тип транспорта), `definition` (схему ендпоинта) и `input` (данные вызова). Клиент диспатчит на правильный транспортный слой на основе `kind`.

## defineRequest: Определение HTTP-ендпоинта

`defineRequest` определяет RESTful HTTP-ендпоинт. Принимает объект определения и возвращает командо-строитель.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### Поля объекта определения

| Поле           | Тип                               | Описание                                                              |
| -------------- | --------------------------------- | --------------------------------------------------------------------- |
| `method`       | `string`                          | HTTP-метод, например, `GET`, `POST`                                   |
| `path`         | `string`                          | Путь URL, поддерживает `:param` плейсхолдеры                          |
| `input`        | `AnyStruct \| undefined`          | Struct-валидатор входных данных                                       |
| `build`        | `RequestBuildHandler`             | Отображает распарсенный input в части HTTP-запроса                    |
| `output`       | `RequestOutputShape \| undefined` | Отображает коды состояния в ответные Structs                          |
| `responseType` | `HttpResponseType`                | Опционально, форсирует режим парсинга ответа (`json`, `text`, `blob`) |

### Связь input / output / build

1. **input**: Описывает данные, которые должен предоставить вызывающий. Во время выполнения клиент валидирует и парсит сырой input через `input` Struct.
2. **build**: Получает `RequestBuilder` и распарсенный input (`RequestBuildInput`), отображая данные в path params, query params, headers и body.
3. **output**: Описывает возможные ответы сервера. Клиент выбирает подходящий Struct по HTTP-коду состояния и выводит типы успеха (2xx) и ошибки (не-2xx).

Если `build` опущен, `input` также должен быть опущен. Команда тогда не принимает input и отправляет напрямую на `path`.

Если `build` указан, `input` тоже должен быть указан. Это строгое правило дизайна.

### Сокращение для отсутствия input

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // Аргументы не нужны
```

### Вывод типов output

`output` поддерживает как массивную, так и объектную форму с эквивалентным поведением:

```typescript
// Массивная форма (рекомендуется)
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// Объектная форма
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

Результаты выполнения типизируются автоматически: данные 2xx попадают в ветку успеха, всё остальное — в ветку ошибки.

---

## defineEventStream: Определение SSE-потока

`defineEventStream` определяет ендпоинт Server-Sent Events (SSE). Отображает имена событий на Structs для типобезопасности на уровне событий.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### Отображение events

Каждый ключ в `events` соответствует SSE-полю `event`. Клиент ищет подходящий Struct по имени `event` при получении сообщения.

### Запасной вариант default

Если сервер отправляет необъявленное имя события, можно предоставить схему `default`:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // Несопоставленные события парсятся как string
  },
})
```

Без `default` несопоставленные события отбрасываются. Если настроен `onInvalidEvent` interceptor, он получает уведомление.

### SSE с input

SSE по умолчанию использует `GET`. Если нужны query-параметры, предоставьте `input` и `build` как в `defineRequest`:

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE `build` не поддерживает тело запроса и `withCredentials`.

---

## defineWebSocket: Определение WebSocket-ендпоинта

`defineWebSocket` определяет WebSocket-ендпоинт, разделяя схемы сообщений **incoming** (сервер → клиент) и **outgoing** (клиент → сервер).

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### Схема входящих сообщений

`incoming` определяет типы сообщений, отправляемых сервером. Каждое сообщение должно содержать поле `type`, соответствующее ключу в `incoming`. Если payload — объект, его поля сливаются с `type`:

```typescript
// Сервер отправляет: { type: 'message', user: 'Alice', text: 'Hi' }
// Парсится как:    { type: 'message', user: 'Alice', text: 'Hi' }
```

Если payload — скаляр (string, number и т.д.), он оборачивается как `{ type: 'xxx', data: <value> }`.

### Схема исходящих сообщений

`outgoing` определяет типы сообщений, отправляемых клиентом. `type` автоматически заполняется из ключа. Вы предоставляете только payload:

```typescript
// Отправка: { type: 'sendMessage', text: 'Hello' }
// Или:      { type: 'sendMessage', data: { text: 'Hello' } }
```

Если payload исходящего сообщения — объект, поддерживаются обе формы. Если скаляр — нужно использовать `{ type: 'xxx', data: <value> }`.

### Только входящие (read-only) WebSocket

Если не нужно отправлять сообщения на сервер, опустите `outgoing`:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### Ограничения WebSocket build

WebSocket `build` поддерживает только `setPathParams` и `setQueryParams`. HTTP-специфичные операции (headers, body) не поддерживаются.

---

## Структура объекта команды

Независимо от типа определения, построенная команда следует единой структуре:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP-команда
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE-команда
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket-команда
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` — это тег типа транспорта. `Client.execute` диспатчит на соответствующий исполнитель (HTTP fetch, SSE-поток, WebSocket-соединение) на основе него.

---

## Правила необходимости input (IsInputOptional)

Необходимость аргумента командо-строителя выводится автоматически через `IsInputOptional`:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

Правила:

1. **Нет `input`**: `TInput` — `undefined`, параметр полностью опционален.
2. **Есть `input`, но все поля опциональны**: `{} extends EndpointInput<...>` — true, параметр всё равно опционален.
3. **Есть `input` с обязательными полями**: Параметр обязателен.

```typescript
// Нет input — опционально
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Input со всеми опциональными полями — опционально
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// Обязательные поля — обязателен
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript-ошибка: отсутствует аргумент
C({ body: { name: 'defjs' } }) // OK
```

## Что дальше

- [SSE →](/core/sse) — Выполнение SSE, переподключение и обработка событий
- [WebSocket →](/core/web-socket) — WebSocket-соединение, heartbeat и управление состоянием
- [Клиент →](/core/client) — Создание клиента и использование `execute`
