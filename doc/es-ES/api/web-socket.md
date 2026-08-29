---
title: WebSocket
description: defineWebSocket, sesión y opciones de execute.
---

# WebSocket

Declara un socket, ejecútalo, envía/recibe mensajes tipados y luego cierra.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, structs `incoming`, `outgoing` opcional, `input`, `build`, límites de cola.
- **Devuelve** un builder. Llámalo con el input para obtener un `WebSocketCommand`.

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

Entrada de bajo nivel para `client.execute`. En la app prefiere el cliente.

- **Devuelve** `[null, session, connection]` o `[error, undefined, connection?]`.

El execute de WebSocket puede sobrescribir `beforeConnect`, `heartbeat`, `protocols` y `reconnect`.

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

Tú gestionas el cleanup; usa `await using`. `close()` y `closed` siguen disponibles. `closed` es el estado terminal lógico. El disposer espera como máximo un segundo al teardown de Defjs; si no observa el evento close puede rechazar con una `DOMException` llamada `TimeoutError`. Esto no demuestra un cierre TCP físico.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (incrementa en reconnect).

### WebSocketCloseInfo {#WebSocketCloseInfo}

Snapshot de cierre cuando termina el socket (code, reason, flag clean, cause opcional). Un close manual puede llevar `ManualSocketCloseReason`.

## Options de execute

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

`WebSocketHeartbeatConfig`: `intervalMs`, `message` opcional, `isAck`, `timeoutMs`.

## Mapas de mensajes

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Los payloads incoming/outgoing van etiquetados con `type` (y campos aplanados o un wrapper `data` según la forma del struct).

Ver [guía de WebSocket](../core/web-socket.md) y [Abrir una sesión WebSocket](../recipes/websocket-session.md).

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, `outgoing` / `input` / `build` opcionales, y techos de queue.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

Lo devuelve `defineWebSocket`. Llámalo con input y sale un `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

Command WebSocket opaco. Pásaselo a `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

Heartbeat, reconnect, `beforeConnect`, protocols, más cancelación. `WebSocketExecuteOptions` añade `signal`.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

Razón que se guarda cuando cierras con `session.close()`.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

Forma del mensaje entrante, inferida de un map `SocketStructs` incoming.

## WebSocketOutgoingData {#WebSocketOutgoingData}

Forma del mensaje saliente, inferida de un map `SocketStructs` outgoing.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

Snapshot terminal cuando el socket ya acabó.
