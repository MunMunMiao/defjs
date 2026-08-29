---
title: WebSocket
description: defineWebSocket, session и опции execute.
---

# WebSocket

Объяви сокет, выполни, шли/принимай типизированные сообщения, потом закрой.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, structs `incoming`, опциональные `outgoing`, `input`, `build`, лимиты queue.
- **Возвращает** builder. Вызови с input — получишь `WebSocketCommand`.

```ts
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { message: struct.object({ text: struct.string() }) },
})
```

## executeWebSocketCommand() {#executeWebSocketCommand}

```ts
function executeWebSocketCommand(
  clientConfig: ClientConfig,
  command: WebSocketCommand,
  options?: WebSocketExecuteOptions,
): Promise<SocketAwaitResult>
```

Это то, чем пользуется `client.execute`. В приложении бери клиент.

- **Возвращает** `[null, session, connection]` или `[error, undefined, connection?]`.

WebSocket execute может переопределить `beforeConnect`, `heartbeat`, `protocols` и `reconnect`.

## WebSocketSession {#WebSocketSession}

```ts
interface WebSocketSession<TIncoming, TOutgoing> extends AsyncDisposable {
  readonly bufferedAmount: number
  readonly connection: WebSocketConnectionInfo
  readonly closed: Promise<WebSocketCloseInfo>
  readonly receive: AsyncIterable<TIncoming>
  readonly state: WebSocketState
  close(code?: number, reason?: string): void
  [Symbol.asyncDispose](): PromiseLike<void>
  send(message: TOutgoing): void
  onRuntimeError(listener: (error: unknown) => void): () => void
  onStateChange(listener: (state: WebSocketState) => void): () => void
}
```

Для cleanup принадлежащей области предпочитай `await using ownedSession = session`. Ручные `session.close()` и `await session.closed` остаются доступны.

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed` сообщает логическое терминальное состояние. Async disposer запрашивает native close и ждёт teardown, которым владеет Defjs, но ограничивает отсутствующий close event одной секундой и может reject с `DOMException` по имени `TimeoutError`. Он не может доказать, что физическое TCP-соединение закрылось.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (растёт на reconnect).

### WebSocketCloseInfo {#WebSocketCloseInfo}

Снимок close после конца сокета (code, reason, clean flag, опциональный cause). Ручной close может нести `ManualSocketCloseReason`.

## Опции execute

## WebSocketExecuteOptions {#WebSocketExecuteOptions}

```ts
type WebSocketExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
  beforeConnect?: (context: { attempt: number; signal: AbortSignal }) => void | Promise<void>
  protocols?: readonly string[]
  heartbeat?: WebSocketHeartbeatConfig
  reconnect?: ClientWebSocketOptions['reconnect']
}
```

`WebSocketHeartbeatConfig`: `intervalMs`, опциональные `message`, `isAck`, `timeoutMs`.

## Карты сообщений

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Входящие и исходящие payload’ы тегируются `type` (и плоские поля или обёртка `data` — зависит от формы struct).

Подробности — в [гайде WebSocket](../core/web-socket.md) и [Открыть WebSocket](../recipes/websocket-session.md).

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, опционально `outgoing` / `input` / `build`, плюс лимиты queue.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

Возвращает `defineWebSocket`. Вызови с input — получишь `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

Непрозрачная WebSocket command. Отдавай в `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

Heartbeat, reconnect, `beforeConnect`, protocols плюс отмена. `WebSocketExecuteOptions` добавляет `signal`.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

Причина, которую пишут, когда закрываешь через `session.close()`.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

Форма входящего сообщения, выведенная из incoming map `SocketStructs`.

## WebSocketOutgoingData {#WebSocketOutgoingData}

Форма исходящего сообщения, выведенная из outgoing map `SocketStructs`.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

Снимок конца жизни, когда сокет уже закрыт.
