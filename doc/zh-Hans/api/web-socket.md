---
title: WebSocket
description: defineWebSocket、session，以及 execute options。
---

# WebSocket

声明一个 socket，execute，收发类型化消息，再 close。

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`、`incoming` structs，可选 `outgoing`、`input`、`build`、queue 上限。
- **返回** 一个 builder。塞 input 调用，得到 `WebSocketCommand`。

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

`client.execute` 的底层入口。业务代码走 client。

- **返回** `[null, session, connection]` 或 `[error, undefined, connection?]`。

WebSocket execute 可以覆盖 `beforeConnect`、`heartbeat`、`protocols`、`reconnect`。

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

自有作用域优先用 `await using ownedSession = session` 清理。手动 `session.close()` 和 `await session.closed` 仍可使用。

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed` 报告逻辑终止状态。Async disposer 会请求原生 close 并等待 Defjs 自有 teardown；若一直没有 close event，则以 1 秒为界，并可能用名为 `TimeoutError` 的 `DOMException` reject。它无法证明物理 TCP 连接已经关闭。

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`、`protocol`、`extensions`、`generation`（重连就加一）。

### WebSocketCloseInfo {#WebSocketCloseInfo}

socket 结束后的关闭快照（code、reason、clean 标记、可选 cause）。手动 close 可以带 `ManualSocketCloseReason`。

## 执行 options

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

`WebSocketHeartbeatConfig`：`intervalMs`，可选 `message`、`isAck`、`timeoutMs`。

## 消息 map

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

入站/出站 payload 带 `type` tag（字段摊平还是包一层 `data`，看 struct 形状）。

### Provider envelope adapters

endpoint 可以在 transport 前选择两个同步、definition-local 的边界：

- `normalizeIncoming(decoded)` 接收已经解码的 wire JSON，返回 `{ type, data }`。`type` 是声明过的静态 dispatch tag，`data` 再交给对应 incoming Struct 校验；返回 `undefined` 表示主动忽略该 frame。
- `normalizeOutgoing(type, encodedPayload)` 接收逻辑 outgoing tag，以及已经通过 Struct 校验和 alias 编码的 payload，再返回 provider 要求的精确 wire value。

```ts
const kraken = defineWebSocket({
  incoming: {
    'method.subscribe': struct.object({ method: struct.literal('subscribe'), success: struct.boolean() }),
  },
  maxIncomingQueueSize: 16,
  normalizeIncoming(decoded) {
    if (typeof decoded !== 'object' || decoded === null || Array.isArray(decoded)) return undefined
    if (Reflect.get(decoded, 'method') !== 'subscribe') return undefined
    return { data: decoded, type: 'method.subscribe' }
  },
  normalizeOutgoing(_type, encodedPayload) {
    if (typeof encodedPayload !== 'object' || encodedPayload === null || Array.isArray(encodedPayload)) {
      throw new TypeError('Expected encoded command')
    }
    return encodedPayload as { readonly [key: string]: unknown }
  },
  outgoing: {
    subscribe: struct.object({
      method: struct.literal('subscribe'),
      params: struct.object({ channel: struct.string() }),
      reqId: struct.number().alias('req_id'),
    }),
  },
  path: '/v2',
})

session.send({ type: 'subscribe', method: 'subscribe', params: { channel: 'ticker' }, reqId: 1 })
// wire: {"method":"subscribe","params":{"channel":"ticker"},"req_id":1}
```

两个 hook 都必须同步。outgoing hook 抛出的异常会同步逃出 `send()`；heartbeat 失败沿用现有 fatal runtime 路径。重连队列保存的是已经 normalize 和序列化的字符串。provider payload 自己也有 wire `type` 时，用 `providerType: struct.literal('update').alias('type')` 之类的非 dispatch 本地属性；公开的 `type` 仍是 Defjs dispatch tag。

这些 adapters 不替代 Struct 校验、subprotocol、reconnect policy 或 session lifecycle。不配置时，现有 incoming 结果和 outgoing bytes 都不变。

见 [WebSocket 指南](../core/web-socket.md) 和[打开 WebSocket 会话](../recipes/websocket-session.md)。

## WebSocketDefinition {#WebSocketDefinition}

`path`、`incoming`，可选 `outgoing` / `input` / `build` / `normalizeIncoming` / `normalizeOutgoing`，还有 queue 上限。

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

`defineWebSocket` 的返回值。拿 input 调一下就得到 `WebSocketCommand`。

## WebSocketCommand {#WebSocketCommand}

不透明的 WebSocket command。丢给 `client.execute`。

## UseWebSocketConfig {#UseWebSocketConfig}

heartbeat、reconnect、`beforeConnect`、protocols，再加上取消。`WebSocketExecuteOptions` 再加 `signal`。

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

用 `session.close()` 关掉时记下的原因。

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

从 incoming `SocketStructs` map 推出来的入站消息形状。

## WebSocketOutgoingData {#WebSocketOutgoingData}

从 outgoing `SocketStructs` map 推出来的出站消息形状。

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

socket 结束后的终态快照。
