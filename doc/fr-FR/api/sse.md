---
title: SSE
description: defineEventStream, options d’execute, et le handle de flux.
---

# SSE

Déclare un flux d’événements, exécute-le, itère les events, puis ferme.

## defineEventStream() {#defineEventStream}

```ts
function defineEventStream(definition: EventStreamDefinition): EventStreamCommandBuilder
```

- **definition** — `path`, map `events`, `method` optionnel (défaut `'GET'`), `input`, `build`, limites de buffer/queue.
- **Renvoie** un builder. Appelle-le avec l’input pour obtenir un `EventStreamCommand`.

```ts
import { defineEventStream, struct } from '@defjs/core'

const ticks = defineEventStream({
  path: '/ticks',
  events: { message: struct.object({ text: struct.string() }) },
})
```

## executeEventStreamCommand() {#executeEventStreamCommand}

```ts
function executeEventStreamCommand(
  clientConfig: ClientConfig,
  command: EventStreamCommand,
  options?: EventStreamExecuteOptions,
): Promise<StreamAwaitResult>
```

Entrée bas niveau pour `client.execute`. Préfère le client dans le code d’application.

- **Renvoie** `[null, stream, open]` ou `[error, undefined, open?]`.

## Options d’execute

## EventStreamExecuteOptions {#EventStreamExecuteOptions}

```ts
type EventStreamExecuteOptions = {
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Mêmes règles d’annulation que HTTP : `abort` ou `timeout`, pas les deux.

## EventStreamHandle {#EventStreamHandle}

```ts
interface EventStreamHandle<TEvent> extends AsyncIterable<TEvent>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}
```

`open` est l’instantané de démarrage ; après reconnect il peut changer — lis aussi `stream.open`. Utilise `await using` pour le cleanup propriétaire. `close()` et `closed` restent disponibles pour le contrôle manuel.

Le disposer attend l’arrêt des boucles de lecture/reconnexion Defjs et la libération du reader lock. Il ne garantit pas qu’une Promise `ReadableStream.cancel()` bloquée chez le provider se termine. Toute implémentation structurelle personnalisée de `EventStreamHandle` doit ajouter le même `[Symbol.asyncDispose]()` ; c’est un changement breaking à la compilation.

### EventStreamOpenInfo {#EventStreamOpenInfo}

```ts
interface EventStreamOpenInfo {
  response: HttpResponse<unknown>
  url: string
}
```

### EventStreamCloseInfo {#EventStreamCloseInfo}

```ts
type EventStreamCloseInfo =
  | { code: 'eof' | 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

`EventStreamErrorCode` : `'INVALID_RESPONSE' | 'MESSAGE_PROCESSING_FAILED' | 'PARSER_LIMIT_EXCEEDED' | 'QUEUE_OVERFLOW' | 'TIMEOUT' | 'TRANSPORT_ERROR'`.

## Map d’événements

## EventStructs {#EventStructs}

```ts
type EventStructs = { [eventName: string]: AnyStruct }
```

Voir [le guide SSE](../core/sse.md) et [Consommer un flux SSE](../recipes/consume-sse.md).

## EventStreamDefinition {#EventStreamDefinition}

`path`, `events`, `method` / `input` / `build` optionnels, plus les plafonds buffer et queue.

## EventStreamCommandBuilder {#EventStreamCommandBuilder}

Renvoyé par `defineEventStream`. Appelle avec l’input, tu obtiens un `EventStreamCommand`.

## EventStreamCommand {#EventStreamCommand}

Command SSE opaque. Passe-la à `client.execute`.

## StreamAwaitResult {#StreamAwaitResult}

`[null, stream, open]` or `[error, undefined, open?]`.

## EventStreamData {#EventStreamData}

Payload d’événement parsé, inféré d’une map `EventStructs`.
