---
title: WebSocket
description: defineWebSocket、session，以及 execute options。
---

# WebSocket

宣告 socket、執行、收發型別化 messages，然後 close。

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`、`incoming` structs、選填 `outgoing`、`input`、`build`、queue 限制。
- **回傳** builder。帶 input 呼叫就得到 `WebSocketCommand`。

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

`client.execute` 走的低階入口。寫功能時請走 client。

- **回傳** `[null, session, connection]` 或 `[error, undefined, connection?]`。

WebSocket execute 可以覆寫 `beforeConnect`、`heartbeat`、`protocols`、`reconnect`。

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

自有作用域優先用 `await using ownedSession = session` 清理。手動 `session.close()` 與 `await session.closed` 仍可使用。

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed` 報告邏輯終止狀態。Async disposer 會要求原生 close 並等待 Defjs 自有 teardown；若持續沒有 close event，則以 1 秒為界，並可能用名為 `TimeoutError` 的 `DOMException` reject。它無法證明實體 TCP 連線已經關閉。

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`、`protocol`、`extensions`、`generation`（重連時遞增）。

### WebSocketCloseInfo {#WebSocketCloseInfo}

socket 結束後的 close 快照（code、reason、clean flag、選填 cause）。手動 close 可以帶 `ManualSocketCloseReason`。

## 執行 options

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

`WebSocketHeartbeatConfig`：`intervalMs`、選填 `message`、`isAck`、`timeoutMs`。

## 訊息 maps

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Incoming／outgoing payloads 會帶 `type` 標籤（依 struct 形狀，欄位會攤平或包在 `data`）。

見 [WebSocket 指南](../core/web-socket.md) 與 [開啟 WebSocket session](../recipes/websocket-session.md)。

## WebSocketDefinition {#WebSocketDefinition}

`path`、`incoming`，可選 `outgoing`／`input`／`build`，還有 queue 上限。

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

`defineWebSocket` 的回傳值。拿 input 呼叫就得到 `WebSocketCommand`。

## WebSocketCommand {#WebSocketCommand}

不透明的 WebSocket command。丟給 `client.execute`。

## UseWebSocketConfig {#UseWebSocketConfig}

heartbeat、reconnect、`beforeConnect`、protocols，再加上取消。`WebSocketExecuteOptions` 再加 `signal`。

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

用 `session.close()` 關掉時記下的原因。

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

從 incoming `SocketStructs` map 推出的入站訊息形狀。

## WebSocketOutgoingData {#WebSocketOutgoingData}

從 outgoing `SocketStructs` map 推出的出站訊息形狀。

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

socket 結束後的終態快照。
