---
title: WebSocket
description: defineWebSocket、session，同 execute options。
---

# WebSocket

Declare 一個 socket，execute 佢，send/receive typed messages，之後 close。

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`、`incoming` structs，optional `outgoing`、`input`、`build`、queue limits。
- **Returns** 一個 builder。Call 再傳 input，就會得到 `WebSocketCommand`。

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

`client.execute` 嘅 low-level entry。Application code prefer 用 client。

- **Returns** `[null, session, connection]` 或者 `[error, undefined, connection?]`。

WebSocket execute 可以 override `beforeConnect`、`heartbeat`、`protocols` 同 `reconnect`。

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

自己 own 嘅 scope 優先用 `await using ownedSession = session` cleanup。Manual `session.close()` 同 `await session.closed` 仍然用得。

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed` report 嘅係 logical terminal state。Async disposer 會 request native close，再等 Defjs-owned teardown；但如果一直收唔到 close event，就會 bound 喺 1 秒，亦可能用名為 `TimeoutError` 嘅 `DOMException` reject。佢證明唔到 physical TCP connection 已經 close。

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`、`protocol`、`extensions`、`generation`（reconnect 就會 increment）。

### WebSocketCloseInfo {#WebSocketCloseInfo}

Socket 完咗之後嘅 close snapshot（code、reason、clean flag、optional cause）。Manual close 可以帶 `ManualSocketCloseReason`。

## Execute options

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

`WebSocketHeartbeatConfig`：`intervalMs`，optional `message`、`isAck`、`timeoutMs`。

## Message maps

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Incoming/outgoing payloads 會 tagged `type`（視乎 struct shape，再加 flattened fields 或者 `data` wrapper）。

睇 [WebSocket guide](../core/web-socket.md) 同 [Open a WebSocket session](../recipes/websocket-session.md)。

## WebSocketDefinition {#WebSocketDefinition}

`path`、`incoming`，optional `outgoing` / `input` / `build`，仲有 queue 上限。

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

`defineWebSocket` 嘅回傳。用 input call 一次就攞到 `WebSocketCommand`。

## WebSocketCommand {#WebSocketCommand}

Opaque WebSocket command。交畀 `client.execute`。

## UseWebSocketConfig {#UseWebSocketConfig}

heartbeat、reconnect、`beforeConnect`、protocols，再加 cancellation。`WebSocketExecuteOptions` 再加 `signal`。

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

用 `session.close()` 閂嗰陣記低嘅 reason。

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

由 incoming `SocketStructs` map infer 出嚟嘅入站 message shape。

## WebSocketOutgoingData {#WebSocketOutgoingData}

由 outgoing `SocketStructs` map infer 出嚟嘅出站 message shape。

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

socket 完咗之後嘅終態 snapshot。
