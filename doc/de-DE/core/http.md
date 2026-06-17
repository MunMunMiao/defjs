---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-schema mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Verwende `defineRequest`, um einen HTTP-Endpunkt zu definieren, und führe ihn mit `Client.execute()` aus. Das Core-Paket handhabt Schema-Validierung, Statuscode-Verteilung, Signal-Merging und Response-Body-Parsing automatisch.

## Endpunkt definieren

`defineRequest` akzeptiert ein Definition-Objekt mit `method`, `path`, `input` (optional), `output` (optional) und `build` (optional).

Falls `input` angegeben ist, muss auch `build` angegeben werden, um zu beschreiben, wie Input-Felder auf Request-Teile (Path-Params, Query-Params, Headers, Body) gemappt werden.

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

Falls kein Input benötigt wird, lasse sowohl `input` als auch `build` weg:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## Status-Code-zu-Schema-Output-Mapping

`output` mapped HTTP-Statuscodes auf Schemata. Die Laufzeit wählt das passende Schema per Response-Statuscode.

Sowohl Objekt- als auch Array-Form werden unterstützt:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// Objekt-Form: Schlüssel sind Statuscodes, Werte sind Schemata
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// Array-Form: unterstützt Mapping mehrerer Statuscodes auf dasselbe Schema
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

Falls der Server einen Statuscode zurückgibt, der nicht in `output` deklariert ist, schlägt der Request mit einem `DefinitionError` mit `code: 'UNDECLARED_STATUS'` fehl.

## Success / Error-Daten-Typ-Inferenz

`output` treibt TypeScript-Typinferenz an. `Client.execute()` gibt `HttpAwaitResult` zurück, das automatisch 2xx-Success-Daten von Nicht-2xx-Fehlerdaten unterscheidet.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result ist typisiert als { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data ist typisiert als { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### Type-Helper

- `RequestSuccessData<TOutput>`: Extrahiert alle 2xx-Schema-Output-Typen aus `output`. Falls kein 2xx-Mapping existiert, wird als `unknown` inferred.
- `RequestErrorData<TOutput>`: Extrahiert alle Nicht-2xx-Schema-Output-Typen aus `output`. Falls kein Nicht-2xx-Mapping existiert, wird als `unknown` inferred.

## Request ausführen

Rufe `Client.execute()` mit einem Command auf. Das zweite Argument sind optionale `HttpExecuteOptions`:

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* custom context readable by interceptors */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // alias, equivalent to abort
})
```

Das zurückgegebene `HttpAwaitResult` ist ein Triplet:

| Position | Typ                                      | Bedeutung                                                 |
| -------- | ---------------------------------------- | --------------------------------------------------------- |
| 0        | `RequestError<TErrorData> \| null`       | Fehlerobjekt; `null` bei Erfolg                           |
| 1        | `TSuccess \| undefined`                  | Success-Daten; `undefined` bei Fehler                     |
| 2        | `SettledResponse<TSuccess> \| undefined` | Roh-Response-Wrapper mit `status`, `headers`, `body` etc. |

## Abbruch und Timeout

`abort`, `timeout` und `signal` steuern den Request-Lifecycle. **`abort` und `timeout` können nicht zusammen verwendet werden** — das erzeugt einen Validierungsfehler, bevor der Request gesendet wird.

### AbortSignal verwenden

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// Später abbrechen
controller.abort()

// Nach Abbruch ist error.kind 'transport', code ist 'ABORTED'
```

### Timeout verwenden

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5 Sekunden Timeout
})

// Nach Timeout ist error.kind 'transport', code ist 'TIMEOUT'
```

### Externe Signals mergen

Falls sowohl `abort` als auch `signal` übergeben werden, merged das Framework sie in ein einziges `AbortSignal`. `timeout` partizipiert ebenfalls als `AbortSignal.timeout()`. Jedes Signal, das auslöst, bricht den Request ab.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // merged with abort
})
```

### Fehlerunterscheidung

Abbruch und Timeout sind beide `TransportError`, unterscheidbar durch `error.code`:

| Szenario          | `error.code`    | Beschreibung                                                 |
| ----------------- | --------------- | ------------------------------------------------------------ |
| Manueller Abbruch | `ABORTED`       | `controller.abort()` oder externes Signal ausgelöst          |
| Timeout           | `TIMEOUT`       | `timeout` abgelaufen, oder `AbortSignal.timeout()` ausgelöst |
| Netzwerkfehler    | `NETWORK_ERROR` | Andere Exceptions aus fetch                                  |

## Download / Upload-Fortschritt

Verfolge Fortschritt über `onDownloadProgress` und `onUploadProgress`.

### Download-Fortschritt

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` enthält drei Felder:

- `lengthComputable`: Ob der Server `Content-Length` zurückgegeben hat
- `loaded`: Bisher empfangene Bytes
- `total`: Gesamtbytes (nur gültig, wenn `lengthComputable` `true` ist)

### Upload-Fortschritt

Upload-Fortschritt funktioniert nur, wenn der Request-Body `ReadableStream<Uint8Array>` ist. Das Framework wrappt den Stream und ruft Callbacks nach jedem Chunk auf.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## Response-Typen

Standardmäßig, falls `output` deklariert ist, parst das Framework die Response automatisch als `json`. Du kannst das mit `responseType` überschreiben, oder es angeben, wenn `output` `undefined` ist.

```typescript
import { defineRequest } from '@defjs/core'

// Expliziter Response-Typ
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// Kein output, nur Roh-Response interessant
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

Unterstützte `responseType`-Werte:

| Wert          | Beschreibung                                                    |
| ------------- | --------------------------------------------------------------- |
| `json`        | Text lesen, dann `JSON.parse()`; leerer Body gibt `null` zurück |
| `text`        | Text-String direkt zurückgeben                                  |
| `blob`        | `Blob` zurückgeben                                              |
| `arraybuffer` | `ArrayBuffer` zurückgeben                                       |

Falls `responseType` `json` ist und `output` ein Schema für den zurückgegebenen Statuscode definiert, validiert das Framework das geparste JSON gegen das Schema. Falls die Validierung fehlschlägt, wird ein `DefinitionError` mit `code: 'RESPONSE_VALIDATION_FAILED'` zurückgegeben.

## Wie geht es weiter

- [Client →](/core/client) — `Client` erstellen, Interceptors, XSRF, globale Optionen
- [SSE →](/core/sse) — Server-Sent Events und Streaming-Responses
- [WebSocket →](/core/web-socket) — Bidirektionale Echtzeitkommunikation
