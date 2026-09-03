---
title: Server-Sent Events
description: Typisierten SSE-Stream konsumieren, schließen und das Terminal-closed-Promise awaiten.
---

# Server-Sent Events

Öffne einen Stream, iteriere einmal, dann `close` und `await stream.closed`. Du besitzt diesen Lifecycle — Clients und Plugins disposen ihn nicht für dich.

## Basic Setup

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, openedStream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using stream = openedStream
  for await (const event of stream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## Stream definieren

`defineEventStream(...)` braucht `events`, positive Safe-Integer `maxBufferSize`, positive Safe-Integer `maxQueueSize` und einen relativen `path`. Method defaultet auf `GET`.

Request-Input darf `path`, `query`, `headers` und `body` haben. Custom `build` bekommt dieselben Request-Helper wie HTTP, inklusive Body-Setter. Defjs sendet `Accept: text/event-stream`, wenn du `Accept` nicht schon gesetzt hast.

Ein logischer Stream kann mehrere physische Fetch-Versuche umspannen. SSE retried transient Network- und Stream-Read-Failures defaultmäßig auch ohne Reconnect-Options; ohne `attempts`-Limit sind diese Retries unbounded. Du bekommst trotzdem ein Handle und einen Async-Iterator.

## Öffnen und inspizieren

`client.execute(...)` resolved erst, nachdem Status-, Content-Type- und Body-Checks passen:

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

Response muss successful sein, Media-Type-Essence `text/event-stream` und einen Body haben. Non-2xx-Startup → `HTTP_STATUS`. Schlechter Content-Type oder fehlender Body → `RESPONSE_VALIDATION_FAILED`. Ein Response-Snapshot kann trotzdem im dritten Tupel-Slot sitzen, wenn Validierung nach Response-Ankunft failt.

`startupOpen` ist der initiale Snapshot. `stream.open` ist live und wechselt bei späteren physischen Opens. Behalte den Tupel-Wert, wenn die erste Response zählt.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## Events dekodieren

Wire-Event-Name → `events[eventName]`; sonst `events.default`. Kein matching Struct → Event nicht delivered. Fehlendes SSE-`event`-Feld → logischer Name `message`.

SSE-`data` startet als Text. Der gewählte Struct entscheidet die Conversion:

| Struct                                                                 | Conversion                                                           |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | Bleibt Text                                                          |
| `struct.number()`                                                      | Trimmed Text muss finite Number sein; empty invalid                  |
| `struct.boolean()`                                                     | Trimmed Text genau `true` oder `false`                               |
| `struct.json(inner)`                                                   | JSON parsen, dann mit `inner` dekodieren                             |
| Object, Array, Union, andere ordinary Structs                          | Text direkt dekodieren; JSON-looking Text wird **nicht** auto-parsed |

Emittierter Wert: `event`, dekodiertes `data`, optionale non-empty `id`. Mit `default` sind unknown Event-Namen `string` in der inferierten Union.

## Invalid Events beobachten

Invalid/undeclared Events werden dropped, nicht gequeued. `withSSEOnInvalidEvent(...)` kann Raw-ID, Name, Text-Data plus `missing-struct` oder `validation-failed` und optional Cause beobachten.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

Observer läuft an der Transform-Grenze. Sein Failure ist isoliert, außer das Active-Attempt-Signal ist aborted. Halte ihn kurz; behandle Raw-Event-Data nicht als trusted.

## Reconnect

Reconnect-Settings customizen den Default-Retry-Pfad — sie sind nicht nötig, um Retries zu enablen. Normales EOF wird nicht retried. Network- und Stream-Read-Failures können retryen. Status-/Content-Type-Validierung, Parser-Limits, Message-Transform-Failures, Queue-Overflow und normales EOF sind terminal für den logischen Stream.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` zählt Retries nach dem Initial-Attempt; `attempts: 0` disabled Retry. Kein Attempt-Limit → unbounded Built-in-Retries. `delayMs` ist das initiale Interval; `factor` wächst es; `maxDelayMs` cappt die Base. SSE-`jitter` ist ein **0–1-multiplikativer Faktor**, wie WebSocket. Ein Stream-`retry:`-Feld updated das aktuelle Interval. Policy-Callback, der false zurückgibt / throwt / rejectet, endet den logischen Stream.

Latest geparste Event-ID wird `Last-Event-ID` auf einem späteren Attempt. Kenn die Replay-Semantics des Servers vor unbounded Reconnect.

## Buffer- und Queue-Limits

Beide müssen positive Safe Integers sein. Overflow ist fatal — kein silent Discard älterer Events.

| Limit           | Schützt                                                             | Terminal-Code           |
| --------------- | ------------------------------------------------------------------- | ----------------------- |
| `maxBufferSize` | Incomplete/oversized SSE-Line/Event während Parsing                 | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | Events, die schneller produziert werden als der eine Consumer liest | `QUEUE_OVERFLOW`        |

Fatal Stream cleart auch buffered Events, cancelled den Active Body, rejectet den Iterator und resolved `stream.closed` mit `code: 'error'`.

## Schließen und awaiten

`EventStreamHandle`: ein live Opening-Snapshot, ein Terminal-Promise, ein `close`, ein Async-Iterator.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

type StreamApi<T> = {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
  [Symbol.asyncIterator](): AsyncIterator<T>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

Terminal-Codes: `eof`, `aborted` oder `error`. Ein `error`-Result trägt auch ein `EventStreamErrorCode`: `INVALID_RESPONSE`, `MESSAGE_PROCESSING_FAILED`, `PARSER_LIMIT_EXCEEDED`, `QUEUE_OVERFLOW`, `TIMEOUT` oder `TRANSPORT_ERROR`.

`close(reason)` abortet den Active Attempt, schließt die Queue, settled als `aborted`. Loop-`break` / `return` / Throw invokiert Iterator-Return und schließt mit `iterator-return`. Der Code, der den Command ausführt, besitzt Closure.

`await using` ruft denselben owned Lifecycle auf. Es garantiert, dass Defjs-Lese- und Reconnect-Arbeit endet und der Reader-Lock freigegeben wird; nicht, dass ein beim Provider hängendes `ReadableStream.cancel()`-Promise fertig wird. `close()` und `closed` bleiben verfügbar. Strukturelle eigene `EventStreamHandle`-Implementierungen müssen denselben Disposer ergänzen; Code, der nur Defjs-Handles empfängt, braucht keinen zusätzlichen Runtime-Aufruf.

Der kleinste unterstützte und im Repository verifizierte Lib-Vertrag ist `ES2022`, `ESNext.Disposable`, `DOM` und `DOM.Iterable` mit festem TypeScript 7. Diese Kombination ist ein gemeinsamer Baseline-Vertrag; nicht jede Declaration erzwingt unabhängig alle vier Einträge, und ungetestete ältere Compiler sind nicht zugesagt. Ein normaler HTTP-Client ist kein `AsyncDisposable`; verwalte Requests mit Timeout oder `AbortSignal`.

Halte Credentials, Event-Data, Event-IDs, Causes und Stream-URLs aus Routine-Logs. `withCredentials(true)` betrifft Fetch-Cookies für SSE; es konfiguriert keine WebSocket-Auth.

## Verwandte Rezepte

- [SSE-Stream konsumieren](../recipes/consume-sse.md)
- [HTTP-Aufruf abbrechen](../recipes/cancel-http.md)
