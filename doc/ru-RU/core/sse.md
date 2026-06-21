---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs использует `defineEventStream` для определения типизированных SSE (Server-Sent Events) ендпоинтов. После выполнения возвращается тройка `[error, stream, openInfo]`, где `stream` — async iterable для потребления сервер-пуш-событий один за другим.

## Определение потока событий

При определении SSE-ендпоинта объявите поле `events`, отображающее имена событий на struct-схемы. Поле `data` каждого типа события автоматически парсится по подходящей схеме.

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({
      id: struct.number(),
      text: struct.string(),
    }),
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
    userconnect: struct.object({ uid: struct.number() }),
    default: struct.object({ note: struct.string() }),
  },
})
```

### Потоки событий с input

Когда потоку нужны query-параметры или тело запроса, предоставьте `input` схему и `build` функцию как в `defineRequest`:

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: {
    chat: struct.object({ user: struct.string(), text: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ roomId: '42' }))
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
  if (event.event === 'message') {
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
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Исходная ошибка при валидационном сбое
    },
  },
})
```

`onInvalidEvent` — это **наблюдатель**:

- Даже если он выбрасывает внутри, исключение молча игнорируется и поток продолжается.
- Он не блокирует потребление последующих событий.

## Конфигурация переподключения и очереди

SSE-транспорт имеет встроенное авто-переподключение, настраиваемое через `sse.reconnect` и `sse.queue` на уровне клиента.

### Конфигурация переподключения

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
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
  },
})
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
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  },
})
```

| `overflow`    | Поведение                                                  |
| ------------- | ---------------------------------------------------------- |
| `drop-newest` | Отбрасывать новые события, сохранять старые в очереди      |
| `drop-oldest` | Отбрасывать старые события, освобождать место для новых    |
| `error`       | Полная очередь выбрасывает ошибку, вызывая закрытие потока |

## Полный пример

```typescript
import { createClient, defineEventStream, struct } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  },
})

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.object({ level: struct.string(), msg: struct.string() }),
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
    console.log(`[${event.data.level}] ${event.data.msg}`)
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
