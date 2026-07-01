---
title: SSE
description: Используйте defineEventStream для определения типизированных SSE (Server-Sent Events) ендпоинтов и потребления потоковых событий через клиент.
---

# SSE

Defjs использует `defineEventStream` для определения типизированных SSE (Server-Sent Events) ендпоинтов. После выполнения возвращается тройка `[error, stream, openInfo]`, где `stream` — async iterable для потребления сервер-пуш-событий один за другим.

## Определение потока событий

При определении SSE-ендпоинта объявите поле `events`, отображающее имена событий на struct-схемы. SSE-транспорт доставляет каждый `data:` payload как raw-текст; Defjs выбирает подходящую схему и декодирует текст в соответствии с content kind этой схемы.

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### Схема события по умолчанию (запасной вариант)

Если сервер может отправлять типы событий, явно не объявленные в `events`, предоставьте схему `default` как запасной вариант. Без `default` неизвестные события молча отбрасываются.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### Декодирование содержимого данных события

SSE-транспорт доставляет каждый `data:` payload как текст. Defjs сначала выбирает схему события из `events[eventName] ?? events.default`, затем декодирует текст в соответствии с выбранной схемой.

Используйте `struct.json(inner)`, когда сервер отправляет JSON-текст для события. `struct.json(inner)` сначала выполняет `JSON.parse` над raw SSE-текстом, затем парсит полученное значение через `inner`:

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

Для примитивных текстовых payloads:

- `struct.string()` и `struct.text()` читают raw-текст события.
- `struct.number()` обрезает текст и принимает только конечные числовые значения.
- `struct.boolean()` обрезает текст и принимает только exact `true` или `false`.

Plain `struct.object(...)`, `struct.array(...)` и `struct.record(...)` сами по себе не парсят JSON-похожий текст. Оберните их в `struct.json(...)`, если данные события приходят в JSON.

### Потоки событий с input

Когда потоку нужны query-параметры или тело запроса, предоставьте `input` схему и `build` функцию. Сигнатура `build` такая же, как у `defineRequest`, с поддержкой params, query и headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## Результат выполнения

`client.execute()` возвращает тройку для SSE-команд:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — Не-null при ошибке соединения или валидации; `null` при успехе.
- **`stream`** — При успехе `EventStreamHandle`, потребляемый через `for await...of`; `undefined` при неудаче.
- **`open`** — Содержит информацию о первом соединении (`response` и `url`). Может быть `undefined` при ошибке соединения.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle и stream.closed

`EventStreamHandle` реализует `AsyncIterable`, поэтому может быть использован напрямую с `for await...of`. Также предоставляет следующие свойства:

| Свойство / Метод           | Описание                                                                           |
| -------------------------- | ---------------------------------------------------------------------------------- |
| `open`                     | Информация о первом соединении `EventStreamOpenInfo` (содержит `response` и `url`) |
| `closed`                   | `Promise<EventStreamCloseInfo>`, резолвится когда поток полностью закрыт           |
| `close(reason?)`           | Активно закрыть поток, опционально передавая причину                               |
| `[Symbol.asyncIterator]()` | Возвращает async iterator, потребляющий очередь событий                            |

`closed` резолвится когда:

- Сервер нормально завершил (`code: 'eof'`)
- Активное закрытие через `stream.close()` (`code: 'aborted'`)
- Ошибка соединения или исчерпание попыток переподключения (`code: 'error'`)

```typescript
// Активное закрытие
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## Обработка невалидных событий: onInvalidEvent

Когда сервер отправляет событие, которое не может соответствовать ни одной схеме в `events` (или `default`), или валидация схемы не проходит, срабатывает наблюдатель `onInvalidEvent`. Это клиент-уровневая конфигурация, передаваемая через `sse.onInvalidEvent` при `createClient`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Исходная ошибка при валидационном сбое
    },
  }),
)
```

`onInvalidEvent` — это **наблюдатель**:

Распространенная причина валидационного сбоя — объявление `struct.object(...)` для события, чье поле `data:` содержит JSON-текст. Используйте вместо этого `struct.json(struct.object(...))`. Невалидный JSON под `struct.json(...)` сообщается как `validation-failed` и не ретраится как raw-текст.

- Даже если он выбрасывает внутри, исключение молча игнорируется и поток продолжается.
- Он не блокирует потребление последующих событий.

## Конфигурация переподключения и очереди

SSE-транспорт имеет встроенное авто-переподключение, настраиваемое через `sse.reconnect` и `sse.queue` на уровне клиента.

### Конфигурация переподключения

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // Макс. попыток retry
      delayMs: 1000, // Начальный интервал retry
      factor: 2, // Множитель экспоненциального backoff
      maxDelayMs: 30000, // Макс. интервал retry
      jitter: 1000, // Диапазон случайного jitter (мс)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

Приоритет переподключения:

1. Если `onerror` возвращает `null`, прекратить переподключение.
2. Если `shouldReconnect` возвращает `false`, прекратить переподключение.
3. Если превышен лимит `attempts`, прекратить переподключение.
4. Иначе вычислить следующий интервал retry с помощью `delayMs` + экспоненциальный backoff `factor` + `jitter`.

> Переподключение автоматически переносит заголовок `Last-Event-ID`, чтобы сервер мог возобновить с точки прерывания.

### Конфигурация очереди

События попадают во внутреннюю async-очередь после прибытия, затем потребляются итератором. Можно ограничить размер очереди и поведение переполнения:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | Поведение                                                  |
| ------------- | ---------------------------------------------------------- |
| `drop-newest` | Отбрасывать новые события, сохранять старые в очереди      |
| `drop-oldest` | Отбрасывать старые события, освобождать место для новых    |
| `error`       | Полная очередь выбрасывает ошибку, вызывая закрытие потока |

## Полный пример

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## Что дальше

- [Клиент →](/core/client) — `createClient` и SSE-опции
- [Команды →](/core/commands) — Определение команд и правила input
- [WebSocket →](/core/web-socket) — WebSocket-соединение и управление состоянием
