---
title: WebSocket
description: Запусти типизированную JSON-сессию, получай и шли envelope’ы, потом close и await closed.
---

# WebSocket

Start → receive → send → release через `await using`. Unsubscribe и disposal на тебе. Ручные `close()` / `closed` остаются доступны; клиенты, providers и interceptors не auto-close’ят сессии.

## Базовая настройка

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, session, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using ownedSession = session
  const unsubscribe = ownedSession.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    ownedSession.send({ type: 'send', text: 'Hello' })
    for await (const message of ownedSession.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## JSON envelope

`defineWebSocket(...)` описывает JSON-message эндпоинт. Required `incoming` map выбирает Struct по типу сообщения; optional `outgoing` делает то же для `session.send(...)`. Каждое wire-сообщение — объект с непустым строковым `type`.

Поля object payload сидят рядом с `type`. Scalar и array payloads используют поле envelope `data`:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

Message map контролирует payload, не envelope discriminator. `incoming.default` принимает иначе необъявленные имена типов; без него unknown types дропаются. Incoming text, `ArrayBuffer`, typed-array и `Blob` frames декодируются как UTF-8 JSON. Malformed JSON и Struct failures идут в runtime-error observers — не в `receive`.

Если у object payload есть поле с именем `data`, оно остаётся рядом с `type` после encoding (не nested envelope). Пример: `write` с `{ data: string, source: string }` уходит как `{ type: 'write', data: string, source: string }`. Caller-side value всё ещё `{ type: 'write', data: { data, source } }`, потому что `data` несёт object payload до serialization. Алиасы применяются к полям payload. Discriminator `type` принадлежит envelope, не Struct.

`session.send(...)` валидирует и сериализует синхронно. Шлёт сразу, когда open, ставит в очередь во время `reconnecting`, когда outgoing queue включена, бросает `InvalidStateError`, когда не writable. Также throw, когда нет outgoing map, необъявленный type, сбой валидации payload, disabled/full outgoing queue или native send failure.

`receive` — one-consumer. Второй iterator reject’ится.

## Снимки state

| Member                     | Смысл                                                                                              |
| -------------------------- | -------------------------------------------------------------------------------------------------- |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted` или `error`           |
| `connection`               | Последнее физическое соединение: `generation`, URL, negotiated protocol, extensions когда доступны |
| `bufferedAmount`           | Native unsent byte count, или `0` без физического сокета                                           |
| `receive`                  | One-consumer async iterable валидированных incoming messages                                       |
| `onStateChange(listener)`  | Подписка на логические state transitions; возвращает unsubscribe                                   |
| `onRuntimeError(listener)` | Подписка на non-startup runtime errors; возвращает unsubscribe                                     |
| `closed`                   | Promise логического terminal close outcome                                                         |

`open` = физический сокет open. `reconnecting` включает preparation + delay до replacement. `connection.generation` растёт с каждым физическим сокетом, дошедшим до `open`. Кортеж `startupConnection` остаётся первым успешным снимком; `session.connection` двигается вперёд.

Ошибка старта → `[error, undefined, connection?]`. Pre-open сбой конструктора может быть без connection; timeout/close во время startup всё ещё может дать снимок. После возврата session runtime errors идут через observers, `receive` и `closed` — не через второй execute кортеж.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## Reconnect

Reconnect — opt-in. Нет объекта `reconnect` → физический close заканчивает логическую сессию. Когда настроен, defaults: `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`. `attempts` считает ретраи после initial attempt; `attempts: 0` отключает. Default predicate принимает каждый close outcome.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` получает next retry attempt, close cause, code, reason и `wasClean`. Manual `session.close(...)` не входит в predicate. Throw preparation/policy заканчивает логическую сессию с error.

WebSocket backoff jitter — **multiplicative** (`jitter: 0.2` → delay между `0.8x` и `1.2x`). SSE jitter — 0–1 multiplicative factor, same as WebSocket. Значения delay/factor/jitter/attempt валидируются до конструктора; timer delays не могут превысить `2_147_483_647` ms.

`beforeConnect({ attempt, signal })` бежит до initial конструктора и каждого reconnect. Передай его signal в token refresh, чтобы cancel остановил и prep, и connect.

## Heartbeat

Opt-in на execute или client scope. Interval шлёт `message()` через outgoing Struct map. Опциональный `isAck(message)` узнаёт ack — это сообщение чистит timeout и **не** доставляется в `receive`.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` и `timeoutMs` должны быть положительными finite timers ≤ `2_147_483_647`. Heartbeat message должен быть валиден для outgoing map. Сбои serialization, native send, ack classification и timeout fatal для логической сессии — они не становятся ordinary reconnects.

## Очереди

| Setting                | Required value                                  | Behavior                                                                                              |
| ---------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Positive safe integer                           | Bounds parsed messages, ждущие `receive`, и raw frames, ждущие transform. Overflow → `state: 'error'` |
| `maxOutgoingQueueSize` | Optional non-negative safe integer; default `0` | FIFO только пока `state === 'reconnecting'`. Full/disabled → `send(...)` throws                       |

Queued outgoing frames flush до того, как replacement socket опубликует `open`. Frames, уже отправленные на более раннем сокете, никогда не auto-replay’ятся. Reconnect queues — для сообщений, которые ты шлёшь во время reconnecting — не для реконструкции app state.

Incoming overflow чистит pending sequence, fails `receive`, останавливает сессию, resolves `session.closed` с `kind: 'error'`. Держи consumer достаточно быстрым или подними bound по измеренному size/memory.

## Protocols и authentication

Definition `protocols`, client `withWebSocketProtocols(...)` и execute `protocols` задают constructor subprotocol list. Precedence: execution → client → definition. Первый определённый list копируется для логической сессии и переиспользуется на reconnect.

Браузерные WebSocket constructors не принимают произвольные handshake headers. Defjs конвертирует `http:` → `ws:` и `https:` → `wss:`, кодирует path placeholders один раз, использует настроенный query serializer. WebSocket query building также сериализует complex query values как JSON (в отличие от default HTTP scalar-only query).

`withCredentials(true)` — Fetch credentials для HTTP/SSE — не WebSocket auth. Используй проверенную cookie/session policy, subprotocol или short-lived connection ticket. Не клади общие credentials или long-lived secrets в query string.

## Closure и ownership

`session.close(code?, reason?)` запрашивает terminal closure и останавливает heartbeat. Code должен быть `1000` или `3000..4999`; reason ≤ 123 UTF-8 bytes. Invalid close args throw до смены state. Используй его с `await session.closed`, когда нужен manual close reason или логический terminal result.

```typescript twoslash
import type { WebSocketSession } from '@defjs/core'

async function observeSession(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  console.log(ownedSession.state)
}

void observeSession
```

`session.closed` — логический terminal snapshot: `'closed'`, `'aborted'` или `'error'`, с опциональными native `code` / `reason` / `wasClean` и `cause` для aborted/error. Наблюдаемые native close fields выигрывают у requested fallback владельца.

Стандартный async disposer запрашивает best-effort native close, затем ждёт принадлежащий Defjs teardown lifecycle, message pump, timers, listeners, queues и socket references. Если close event не наблюдался за одну секунду, логический cleanup принудительно завершается и `closed` settles с manual `kind: 'closed'`, но disposer rejects с `DOMException` по имени `TimeoutError`. Если сам native close бросает ошибку, disposer rejects ею после cleanup. Повторные вызовы disposer используют один teardown. Ни один из этих результатов не доказывает закрытие физического TCP-соединения.

Структурные реализации session теперь обязаны предоставлять тот же контракт `[Symbol.asyncDispose](): PromiseLike<void>`. Для implementers это compile-time breaking change; consumers, которые только получают Defjs session, не обязаны делать новый runtime-вызов.

## Граница GraphQL

Defjs даёт типизированный JSON envelope и логический session lifecycle. Он **не** реализует WebSocket application protocol. Фичи GraphQL-over-WebSocket — connection init, operation IDs, `next`/`error`/`complete`, disposal, subscription replay — вне core-контракта.

Используй protocol client вроде `graphql-ws`, когда сервер требует этот протокол, или смоделируй свой envelope через `defineWebSocket(...)`. Один message map сам по себе не договаривается о GraphQL-семантике.

## Связанные рецепты

- [Открыть WebSocket-сессию](../recipes/websocket-session.md)
- [Читать SSE-стрим](../recipes/consume-sse.md)
