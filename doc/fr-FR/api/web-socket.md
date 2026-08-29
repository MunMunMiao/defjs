---
title: WebSocket
description: defineWebSocket, session, et options d’execute.
---

# WebSocket

Déclare un socket, exécute-le, envoie/reçois des messages typés, puis ferme.

## defineWebSocket() {#defineWebSocket}

```ts
function defineWebSocket(definition: WebSocketDefinition): WebSocketCommandBuilder
```

- **definition** — `path`, structs `incoming`, `outgoing` optionnel, `input`, `build`, limites de queue.
- **Renvoie** un builder. Appelle-le avec l’input pour obtenir un `WebSocketCommand`.

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

Entrée bas niveau pour `client.execute`. Préfère le client dans le code d’application.

- **Renvoie** `[null, session, connection]` ou `[error, undefined, connection?]`.

L’execute WebSocket peut overrider `beforeConnect`, `heartbeat`, `protocols` et `reconnect`.

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

Tu possèdes le cleanup ; utilise `await using`. `close()` et `closed` restent disponibles. `closed` est l’état terminal logique du lifecycle. Le disposer attend au plus une seconde le teardown Defjs ; sans événement close, il peut rejeter avec une `DOMException` nommée `TimeoutError`. Cela ne prouve pas une fermeture TCP physique.

### WebSocketState {#WebSocketState}

`'idle' | 'connecting' | 'open' | 'closing' | 'closed' | 'reconnecting' | 'aborted' | 'error'`

### WebSocketConnectionInfo {#WebSocketConnectionInfo}

`url`, `protocol`, `extensions`, `generation` (s’incrémente au reconnect).

### WebSocketCloseInfo {#WebSocketCloseInfo}

Instantané de close après la fin du socket (code, reason, flag clean, cause optionnelle). Un close manuel peut porter `ManualSocketCloseReason`.

## Options d’execute

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

`WebSocketHeartbeatConfig` : `intervalMs`, `message` optionnel, `isAck`, `timeoutMs`.

## Maps de messages

## SocketStructs {#SocketStructs}

```ts
type SocketStructs = { [typeName: string]: AnyStruct }
```

Les payloads incoming/outgoing sont taggés avec `type` (et des champs flatten ou un wrapper `data` selon la forme du struct).

Voir [le guide WebSocket](../core/web-socket.md) et [Ouvrir une session WebSocket](../recipes/websocket-session.md).

## WebSocketDefinition {#WebSocketDefinition}

`path`, `incoming`, `outgoing` / `input` / `build` optionnels, plus les plafonds de queue.

## WebSocketCommandBuilder {#WebSocketCommandBuilder}

Renvoyé par `defineWebSocket`. Appelle avec l’input, tu obtiens un `WebSocketCommand`.

## WebSocketCommand {#WebSocketCommand}

Command WebSocket opaque. Passe-la à `client.execute`.

## UseWebSocketConfig {#UseWebSocketConfig}

Heartbeat, reconnect, `beforeConnect`, protocols, plus l’annulation. `WebSocketExecuteOptions` ajoute `signal`.

## SocketAwaitResult {#SocketAwaitResult}

`[null, session, connection]` or `[error, undefined, connection?]`.

## ManualSocketCloseReason {#ManualSocketCloseReason}

Raison enregistrée quand tu fermes avec `session.close()`.

## WebSocketHeartbeatConfig {#WebSocketHeartbeatConfig}

`intervalMs`, optional `message`, `isAck`, `timeoutMs`.

## WebSocketIncomingData {#WebSocketIncomingData}

Forme des messages entrants, inférée d’une map `SocketStructs` incoming.

## WebSocketOutgoingData {#WebSocketOutgoingData}

Forme des messages sortants, inférée d’une map `SocketStructs` outgoing.

## SocketLifecycleOutcome {#SocketLifecycleOutcome}

Snapshot de fin de vie, une fois le socket terminé.
