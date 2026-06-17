---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Commands

Defjs ist um "Commands" aufgebaut: typsichere ausführbare Objekte, die von `defineRequest`, `defineEventStream` und `defineWebSocket` erstellt werden. Jeder Command trägt ein `kind` (Transport-Typ), eine `definition` (Endpoint-Schema) und `input` (Call-Daten). Der Client verteilt basierend auf `kind` an die korrekte Transport-Logik.

## defineRequest: HTTP-Endpunkt-Definition

`defineRequest` definiert einen RESTful-HTTP-Endpunkt. Es akzeptiert ein Definition-Objekt und gibt einen Command-Builder zurück.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### Definition-Objekt-Felder

| Feld           | Typ                               | Beschreibung                                                       |
| -------------- | --------------------------------- | ------------------------------------------------------------------ |
| `method`       | `string`                          | HTTP-Methode, z. B. `GET`, `POST`                                  |
| `path`         | `string`                          | URL-Pfad, unterstützt `:param`-Platzhalter                         |
| `input`        | `AnyStruct \| undefined`          | Input-Daten-Struct-Validator                                       |
| `build`        | `RequestBuildHandler`             | Mapped geparste Inputs auf HTTP-Request-Teile                      |
| `output`       | `RequestOutputShape \| undefined` | Mapped Statuscodes auf Response-Structs                            |
| `responseType` | `HttpResponseType`                | Optional, erzwingt Response-Parsing-Modus (`json`, `text`, `blob`) |

### input / output / build-Beziehung

1. **input**: Beschreibt die Daten, die der Aufrufer bereitstellen muss. Zur Ausführungszeit validiert und parst der Client Roh-Input mit dem `input`-Struct.
2. **build**: Erhält einen `RequestBuilder` und geparsten Input (`RequestBuildInput`), mapped Daten auf Path-Params, Query-Params, Headers und Body.
3. **output**: Beschreibt mögliche Server-Responses. Der Client wählt das passende Struct per HTTP-Statuscode und leitet Success- (2xx) und Fehler- (Nicht-2xx) Typen ab.

Falls `build` weggelassen wird, muss auch `input` weggelassen werden. Der Command akzeptiert dann keinen Input und sendet direkt an `path`.

Falls `build` angegeben ist, muss auch `input` angegeben werden. Das ist eine strikte Design-Regel.

### Shortcut für keinen Input

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // Keine Argumente nötig
```

### Output-Typ-Inferenz

`output` unterstützt sowohl Array- als auch Objektform mit gleichem Verhalten:

```typescript
// Array-Form (empfohlen)
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// Objekt-Form
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

Ausführungsergebnisse werden automatisch typisiert: 2xx-Daten gehen in den Success-Zweig, alles andere in den Fehler-Zweig.

---

## defineEventStream: SSE-Stream-Definition

`defineEventStream` definiert einen Server-Sent Events (SSE)-Endpunkt. Es mapped Event-Namen auf Structs für Event-Level-Typensicherheit.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### events-Mapping

Jeder Schlüssel in `events` entspricht dem SSE-`event`-Feld. Der Client schlägt das passende Struct per `event`-Name nach, wenn eine Nachricht ankommt.

### default-Fallback

Falls der Server einen nicht deklarierten Event-Namen sendet, kannst du ein `default`-Schema als Fallback bereitstellen:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // Unmatched events parsed as string
  },
})
```

Ohne `default` werden nicht gematchte Events verworfen. Falls ein `onInvalidEvent`-Interceptor konfiguriert ist, erhält er eine Benachrichtigung.

### SSE mit Input

SSE verwendet standardmäßig `GET`. Falls du Query-Parameter brauchst, gib `input` und `build` wie bei `defineRequest` an:

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE-`build` unterstützt keinen Request-Body und `withCredentials`.

---

## defineWebSocket: WebSocket-Definition

`defineWebSocket` definiert einen WebSocket-Endpunkt und unterscheidet **incoming** (Server → Client) und **outgoing** (Client → Server) Message-Schemata.

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming Message-Schema

`incoming` definiert Message-Typen, die vom Server gepusht werden. Jede Nachricht muss ein `type`-Feld enthalten, das einem `incoming`-Schlüssel entspricht. Falls der Payload ein Objekt ist, werden seine Felder mit `type` gemerged:

```typescript
// Server sends: { type: 'message', user: 'Alice', text: 'Hi' }
// Parsed as:    { type: 'message', user: 'Alice', text: 'Hi' }
```

Falls der Payload ein Skalar (String, Number etc.) ist, wird er als `{ type: 'xxx', data: <value> }` gewrapped.

### outgoing Message-Schema

`outgoing` definiert Message-Typen, die vom Client gesendet werden. Das `type` wird automatisch aus dem Schlüsselnamen gefüllt. Du gibst nur den Payload an:

```typescript
// Send: { type: 'sendMessage', text: 'Hello' }
// Or:   { type: 'sendMessage', data: { text: 'Hello' } }
```

Falls ein outgoing Message-Payload ein Objekt ist, werden beide Formen unterstützt. Falls es ein Skalar ist, musst du `{ type: 'xxx', data: <value> }` verwenden.

### Incoming-Only WebSocket

Falls du keine Nachrichten an den Server senden musst, lasse `outgoing` weg:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket-build-Einschränkungen

WebSocket-`build` unterstützt nur `setPathParams` und `setQueryParams`. HTTP-spezifische Operationen (Headers, Body) werden nicht unterstützt.

---

## Command-Objekt-Struktur

Unabhängig vom Definition-Typ folgt der gebaute Command einer einheitlichen Struktur:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP command
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE command
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket command
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` ist das Transport-Typ-Tag. `Client.execute` verteilt an den passenden Executor (HTTP fetch, SSE stream, WebSocket connection) basierend darauf.

---

## Input-Optional-Regeln (IsInputOptional)

Ob das Argument eines Command-Builders optional ist, wird automatisch durch `IsInputOptional` abgeleitet:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

Regeln:

1. **Kein `input` definiert**: `TInput` ist `undefined`, Parameter ist vollständig optional.
2. **Hat `input`, aber alle Felder optional**: `{} extends EndpointInput<...>` ist true, Parameter ist weiterhin optional.
3. **Hat `input` mit required Feldern**: Parameter ist erforderlich.

```typescript
// Kein input — optional
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Input mit allen optionalen Feldern — optional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// Required Felder — erforderlich
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript error: missing argument
C({ body: { name: 'defjs' } }) // OK
```

## Wie geht es weiter

- [SSE →](/core/sse) — SSE-Ausführung, Wiederverbindung und Event-Handling
- [WebSocket →](/core/web-socket) — WebSocket-Verbindung, Heartbeat und State-Management
- [Client →](/core/client) — Client-Erstellung und `execute`-Nutzung
