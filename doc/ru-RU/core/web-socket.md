---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` предоставляет типизированные WebSocket-ендпоинты через `defineWebSocket`. Каждый ендпоинт объявляет:

- схемы `incoming` — сообщения, которые сервер отправляет клиенту.
- схемы `outgoing` — сообщения, которые клиент отправляет серверу.
- схему `input` + `build` handler — параметры запроса и построение query/path (опционально).

Сообщения кодируются в JSON и валидируются рантаймом против объявленных схем.

## Определение WebSocket-ендпоинта

Используйте `defineWebSocket` для создания типизированного командо-строителя. Строитель затем выполняется через `client.execute()`.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // Опционально: построить URL соединения из input
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // Сообщения от сервера → клиент
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // Сообщения от клиента → сервер
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### Формы схем

**Входящие сообщения** ключируются по `type`. Когда сообщение приходит, его JSON-поле `type` сопоставляется с ключами схемы. Если payload — plain object, его поля сливаются с `type`:

```typescript
// Сервер отправляет: { "type": "message", "text": "hi", "userId": 1 }
// Клиент получает:  { type: 'message', text: 'hi', userId: 1 }
```

Если payload — скаляр или массив, он оборачивается под `data`:

```typescript
// Сервер отправляет: { "type": "notification", "data": [1, 2, 3] }
// Клиент получает:  { type: 'notification', data: [1, 2, 3] }
```

**Исходящие сообщения** следуют тому же соглашению. Метод `send()` принимает сообщение с `type`, соответствующим одному из ключей `outgoing`:

```typescript
socket.send({ type: 'message', text: 'hello' })
```

Специальный ключ `default` может быть использован в `incoming` для перехвата необъявленных типов сообщений с общей схемой.

## Выполнение и потребление сообщений

`client.execute()` возвращает кортеж `[error, socket, connection]`:

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // обработать ошибку старта (валидация, транспорт, abort и т.д.)
  return
}

// Итерировать входящие сообщения
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// Или использовать async iterator напрямую
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## API `WebSocketSession`

| Член                       | Тип                                        | Описание                                                                  |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` из нижележащего сокета.                |
| `state`                    | `WebSocketState`                           | Текущее состояние жизненного цикла (см. ниже).                            |
| `receive`                  | `AsyncIterable<TIncoming>`                 | Async iterator валидированных входящих сообщений.                         |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | Резолвится при закрытии сокета с `{ code?, reason?, wasClean?, cause? }`. |
| `send(message)`            | `(message: TOutgoing) => void`             | Отправляет исходящее сообщение. Ставит в очередь, если ещё не открыт.     |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | Закрывает соединение gracefully.                                          |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | Возвращает функцию отписки.                                               |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | Возвращает функцию отписки.                                               |

```typescript
// Мониторинг состояния
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// Рантайм-ошибки (валидационные сбои, таймаут heartbeat и т.д.)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// Graceful закрытие
socket.close(1000, 'done')
await socket.closed
```

## Машина состояний жизненного цикла соединения

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| Состояние      | Значение                                                                                  |
| -------------- | ----------------------------------------------------------------------------------------- |
| `idle`         | До вызова `execute()`.                                                                    |
| `connecting`   | Открытие первой попытки соединения.                                                       |
| `open`         | Соединение установлено, сообщения могут передаваться.                                     |
| `closing`      | `close()` или `abort` сработал, ожидание события close.                                   |
| `closed`       | Чистое закрытие (без ошибки, или ручное закрытие).                                        |
| `reconnecting` | Соединение прервано, ожидание перед retry.                                                |
| `error`        | Терминальный сбой (валидационная ошибка, транспортная ошибка, не-abort закрытие с cause). |
| `aborted`      | Явно прервано через `AbortSignal` или `close()`.                                          |

Переходы состояний эмитятся через `onStateChange`. Итератор `receive` завершается, когда сокет достигает терминального состояния (`closed`, `error` или `aborted`).

## Heartbeat

Настройте периодический ping/ack, чтобы поддерживать соединение живым или обнаруживать мёртвые пиры.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // отправлять каждые 30с
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // ожидать ack в течение 10с
    isAck: (message) => message.type === 'pong',
  },
})
```

| Опция        | Описание                                                                     |
| ------------ | ---------------------------------------------------------------------------- |
| `intervalMs` | Интервал между heartbeat-отправками (обязательно).                           |
| `message`    | Фабрика, возвращающая heartbeat-сообщение. Типизируется против `TOutgoing`.  |
| `timeoutMs`  | Если задан, сокет закрывается с кодом `4000`, когда ack не приходит вовремя. |
| `isAck`      | Предикат, распознающий входящее сообщение как heartbeat ack.                 |

Heartbeat можно конфигурировать на уровне клиента (через `createClient({ webSocket: { heartbeat: ... } })`) или на уровне запроса (через опции `execute()`). Конфигурация уровня запроса побеждает.

## Переподключение

Автоматическое переподключение срабатывает, когда соединение неожиданно прерывается.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| Опция             | По умолчанию | Описание                                                  |
| ----------------- | ------------ | --------------------------------------------------------- |
| `attempts`        | `3`          | Макс. попыток retry. `<= 0` отключает переподключение.    |
| `delayMs`         | `1000`       | Базовая задержка перед первым retry.                      |
| `factor`          | `2`          | Множитель экспоненциального backoff.                      |
| `maxDelayMs`      | `30000`      | Потолок вычисленной задержки.                             |
| `jitter`          | `0`          | Фактор рандомизации (`0`–`1`).                            |
| `shouldReconnect` | `() => true` | Предикат, решающий, должен ли данный close вызвать retry. |

Формула задержки: `min(delayMs * factor^(attempt - 1), maxDelayMs)`, затем с jitter.

Переподключение также конфигурируется на уровне клиента через `createClient({ webSocket: { reconnect: ... } })`.

## Очередь отправки

Сообщения, отправленные до открытия сокета (или во время транзиентного разрыва), ставятся в очередь и сбрасываются, когда соединение готово.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| Опция      | Описание                                               |
| ---------- | ------------------------------------------------------ |
| `maxSize`  | Макс. сообщений в очереди. По умолчанию неограниченно. |
| `overflow` | Поведение при превышении `maxSize`.                    |

Очередь очищается при терминальном закрытии (`error`, `aborted`, `closed`).

## Ручное закрытие и поведение abort

### `socket.close(code?, reason?)`

Выполняет graceful закрытие:

1. Вызывает нативный `WebSocket.close(code, reason)`.
2. Прерывает внутренний `AbortController` с причиной `manual-web-socket-close`.
3. Сокет переходит через `closing` → `closed`.
4. `socket.closed` резолвится с предоставленными `code` и `reason`.

### `AbortSignal` (внешний)

Передайте внешний `AbortSignal` через опции `execute()`:

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// Позже:
controller.abort() // немедленно закрывает сокет и переходит в 'aborted'
```

При abort **до** открытия сокета `execute()` резолвится с транспортной ошибкой и `socket` — `undefined`. При abort **после** открытия сокет переходит в `aborted` и `receive` завершается.

### `timeout`

Таймаут уровня запроса поддерживается, но не может комбинироваться с `abort` в одном запросе (возвращается definition error):

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// Ошибка — нельзя смешивать abort и timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## Полный пример

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## Что дальше

- [SSE →](/core/sse) — Server-Sent Events с типизированными схемами и переподключением.
- [Клиент →](/core/client) — Создание клиента и конфигурация WebSocket.
- [Команды →](/core/commands) — Правила input и build для `defineWebSocket`.
