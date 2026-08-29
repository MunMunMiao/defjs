---
title: WebSocket
description: defineWebSocket, Session und Execute-Options.
---

# WebSocket

Deklariere einen Socket, führe ihn aus, sende/empfange typisierte Messages, dann schließe.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, `incoming`-Structs, optionales `outgoing`, `input`, `build`, Queue-Limits.
- **Returns** einen Builder. Ruf ihn mit Input auf und du bekommst einen `WebSocketCommand`.

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

Low-Level-Einstieg für `client.execute`. Im Application-Code lieber den Client nutzen.

- **Returns** `[null, session, connection]` oder `[error, undefined, connection?]`.

Du kannst `beforeConnect`, `heartbeat`, `protocols` und `reconnect` überschreiben.

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

Du besitzt Cleanup; nutze `await using`. `close()` und `closed` bleiben verfügbar. `closed` ist der logische Lifecycle-Endzustand. Der Disposer wartet höchstens eine Sekunde auf Defjs-Teardown; fehlt das Close-Event, kann er mit einer `DOMException` namens `TimeoutError` rejecten. Das beweist keinen physischen TCP-Close.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (zählt bei Reconnect hoch).

### WebSocketCloseInfo {#WebSocketCloseInfo}

Close-Snapshot, nachdem der Socket endet (code, reason, clean Flag, optionales cause). Manual Close kann `ManualSocketCloseReason` tragen.

## Execute-Optionen

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

`WebSocketHeartbeatConfig`: `intervalMs`, optionales `message`, `isAck`, `timeoutMs`.

## Message-Maps

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Incoming-/Outgoing-Payloads sind mit `type` getaggt (und flattened Fields oder ein `data`-Wrapper, je nach Struct-Shape).

Siehe [WebSocket-Guide](../core/web-socket.md) und [WebSocket-Session öffnen](../recipes/websocket-session.md).

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, optional `outgoing` / `input` / `build`, plus Queue-Limits.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

Kommt von `defineWebSocket`. Mit Input aufrufen → `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

Opakes WebSocket-Command. Gib es `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

Heartbeat, Reconnect, `beforeConnect`, Protocols, plus Cancel. `WebSocketExecuteOptions` legt `signal` drauf.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

Grund, der landet, wenn du mit `session.close()` zu machst.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

Eingehende Message-Form, inferiert aus einer incoming-`SocketStructs`-Map.

## WebSocketOutgoingData {#WebSocketOutgoingData}

Ausgehende Message-Form, inferiert aus einer outgoing-`SocketStructs`-Map.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

End-Snapshot, wenn der Socket durch ist.
