---
title: WebSocket
description: defineWebSocket, session, and execute options.
---

# WebSocket

Declare a socket, execute it, send/receive typed messages, then close.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, `incoming` structs, optional `outgoing`, `input`, `build`, queue limits.
- **Returns** a builder. Call with input to get a `WebSocketCommand`.

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

Low-level entry for `client.execute`. Prefer the client in application code.

- **Returns** `[null, session, connection]` or `[error, undefined, connection?]`.

WebSocket execute can override `beforeConnect`, `heartbeat`, `protocols`, and `reconnect`.

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

Prefer `await using ownedSession = session` for owned scope cleanup. Manual `session.close()` and `await session.closed` remain available.

```ts
async function consume(session: WebSocketSession<unknown, never>): Promise<void> {
  await using ownedSession = session
  for await (const message of ownedSession.receive) console.log(message)
}
```

`closed` reports the logical terminal state. The async disposer requests native close and waits for Defjs-owned teardown, but bounds a missing close event at one second and may reject with a `DOMException` named `TimeoutError`. It cannot prove that the physical TCP connection closed.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (increments on reconnect).

### WebSocketCloseInfo {#WebSocketCloseInfo}

Close snapshot after the socket ends (code, reason, clean flag, optional cause). Manual close can carry `ManualSocketCloseReason`.

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

`WebSocketHeartbeatConfig`: `intervalMs`, optional `message`, `isAck`, `timeoutMs`.

When `reconnect` is set, `attempts` defaults to 3; `0` disables. Omitting `attempts` is not unlimited.

## Message maps

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Incoming/outgoing payloads are tagged with `type` (and flattened fields or a `data` wrapper depending on the struct shape).

### Provider envelope adapters

An endpoint can opt into two synchronous, definition-local boundaries before transport:

- `normalizeIncoming(decoded)` receives decoded wire JSON and returns `{ type, data }`, where `type` is a declared static dispatch tag and `data` is validated by its incoming Struct. Returning `undefined` intentionally ignores the frame.
- `normalizeOutgoing(type, encodedPayload)` receives the logical outgoing tag and the payload after Struct validation and alias encoding, then returns the exact provider wire value.

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

Both hooks are synchronous. An outgoing hook exception escapes `send()` synchronously, while heartbeat failures use the existing fatal runtime path. Queued sends store the normalized serialized string. For a provider payload whose wire field is named `type`, use a different local property such as `providerType: struct.literal('update').alias('type')`; the public `type` remains the Defjs dispatch tag.

These adapters do not replace Struct validation, subprotocols, reconnect policy, or session lifecycle. Omitting them preserves the existing incoming results and outgoing bytes.

See [WebSocket guide](/core/web-socket) and [Open a WebSocket session](/recipes/websocket-session).

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, optional `outgoing` / `input` / `build` / `normalizeIncoming` / `normalizeOutgoing`, queue limits.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

Returned by `defineWebSocket`. Call with input to get a `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

Opaque WebSocket command. Pass to `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

Heartbeat, reconnect, `beforeConnect`, protocols, plus cancellation. `WebSocketExecuteOptions` adds `signal`.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

Reason recorded when the session is closed via `session.close()`.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

Incoming message shape inferred from an incoming `SocketStructs` map.

## WebSocketOutgoingData {#WebSocketOutgoingData}

Outgoing message shape inferred from an outgoing `SocketStructs` map.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

Terminal lifecycle snapshot after the socket ends.
