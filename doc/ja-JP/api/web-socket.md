---
title: WebSocket
description: defineWebSocket、session、execute options です。
---

# WebSocket

ソケットを宣言し、実行し、型付きメッセージを送受信してから閉じます。

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`、`incoming` structs、任意の `outgoing`、`input`、`build`、キュー上限です。
- **戻り値** — ビルダーです。入力を渡すと `WebSocketCommand` になります。

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

`client.execute` の低レベル入口です。アプリコードではクライアントを使ってください。

- **戻り値** — `[null, session, connection]`、または `[error, undefined, connection?]` です。

WebSocket の execute は `beforeConnect`、`heartbeat`、`protocols`、`reconnect` を上書きできます。

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

cleanup は呼び出し側の所有です。`await using` を使えます。`close()` と `closed` も残っています。`closed` は論理ライフサイクルの終端です。disposer は Defjs teardown を最大 1 秒待ち、close event がなければ `TimeoutError` という名前の `DOMException` を reject できます。これは物理 TCP close の証明ではありません。

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`、`protocol`、`extensions`、`generation`（再接続で増えます）。

### WebSocketCloseInfo {#WebSocketCloseInfo}

ソケット終了後の close スナップショットです（code、reason、clean フラグ、任意の cause）。手動 close は `ManualSocketCloseReason` を持てます。

## 実行 options

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

`WebSocketHeartbeatConfig` は `intervalMs`、任意の `message`、`isAck`、`timeoutMs` です。

## メッセージ map

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

incoming/outgoing のペイロードは `type` でタグ付けされます（struct の形に応じて、フラットなフィールドか `data` ラッパー）。

[WebSocket ガイド](../core/web-socket.md) と [WebSocket セッションを開く](../recipes/websocket-session.md) を見てください。

## WebSocketDefinition {#WebSocketDefinition}

`path`、`incoming`、任意の `outgoing` / `input` / `build`、キュー上限です。

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

`defineWebSocket` の戻り値です。input を渡して呼ぶと `WebSocketCommand` になります。

## WebSocketCommand {#WebSocketCommand}

不透明な WebSocket command です。`client.execute` に渡します。

## UseWebSocketConfig {#UseWebSocketConfig}

heartbeat、reconnect、`beforeConnect`、protocols、それにキャンセルです。`WebSocketExecuteOptions` は `signal` を足します。

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

`session.close()` で閉じたときに残す理由です。

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

incoming の `SocketStructs` map から推論した受信メッセージの形です。

## WebSocketOutgoingData {#WebSocketOutgoingData}

outgoing の `SocketStructs` map から推論した送信メッセージの形です。

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

ソケットが終わったあとの終端ライフサイクルのスナップショットです。
