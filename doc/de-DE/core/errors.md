---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# Fehler

Alle Ausführungsergebnisse in `@defjs/core` werden als `[error, result, response]`-Triplets zurückgegeben. `error` ist ein `RequestError`: eine discriminated union mit `kind` und `code`. Branching nach `kind` und `code` ist das empfohlene Pattern statt String-Vergleich.

## RequestError-Struktur

`RequestError` ist eine Union aus drei Fehlertypen:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Alle Fehler teilen diese gemeinsamen Felder:

| Feld       | Typ                                     | Beschreibung                                                  |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | Fehlerkategorie für Top-Level-Branching                       |
| `code`     | `string`                                | Präziser Fehlercode für Second-Level-Branching                |
| `message`  | `string`                                | Menschenlesbare Fehlerbeschreibung                            |
| `data`     | `unknown`                               | Zusätzliche Daten (nur für `http`- und `definition`-Fehler)   |
| `response` | `SettledResponseLike`                   | Roh-Response-Objekt (nur für `http`- und `definition`-Fehler) |

### HttpStatusError

Entsteht, wenn der Server einen Nicht-2xx-Statuscode zurückgibt, der in `output` definiert ist.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

Der `data`-Typ wird aus dem `output`-Struct für den passenden Statuscode abgeleitet. Zum Beispiel schränkt `output: { 404: notFoundStruct }` `error.data` auf den inferred Typ von `notFoundStruct` ein.

### TransportError

Entsteht bei Netzwerk- oder Transport-Layer-Fehlern, einschließlich Abort, Timeout und generischen Netzwerkfehlern.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

Entsteht bei Request-Definition- oder Validierungsfehlern.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Code                         | Auslöserszenario                                                                                           |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Input-Parameter haben `input`-Struct-Validierung nicht bestanden, oder `build` hat eine Exception geworfen |
| `RESPONSE_VALIDATION_FAILED` | Response-Body hat `output`-Struct-Validierung für den zurückgegebenen Statuscode nicht bestanden           |
| `UNDECLARED_STATUS`          | Server hat einen 2xx-Statuscode zurückgegeben, der nicht in `output` deklariert ist                        |

## Fehlerklassifizierung und Branching

**Verwende nicht** String-Vergleich, um Fehlertypen zu beurteilen:

```typescript
// Nicht empfohlen: fragil und kein Type Narrowing
if (error.message.includes('timeout')) { ... }
```

**Empfohlen**: Branching nach `kind` und `code` für präzises Type Narrowing:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error ist auf HttpStatusError eingeengt
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data ist auf { code: string; message: string } eingeengt
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error ist auf TransportError eingeengt
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      // error ist auf DefinitionError eingeengt
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Built-in-Konstanten

`@defjs/core` exportiert zwei Konstanten zur Identifizierung spezifischer Transportfehler:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: Request wurde aktiv abgebrochen
// ERR_TIMEOUT: Request hat das Timeout überschritten
```

### Abbruch in Interceptors auslösen

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### Mit AbortController verwenden

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### Transportfehler manuell erstellen

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## Hilfsfunktionen

### `createTransportError`

Normalisiert eine Roh-Exception in einen `TransportError`.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

Normalisiert eine Roh-Exception in einen `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

Normalisiert eine Nicht-2xx-Response in einen `HttpStatusError`.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## Wie geht es weiter

- [Client →](/core/client) — Clients erstellen und Commands ausführen
- [HTTP Requests →](/core/http) — `defineRequest` und Output-Patterns
- [SSE →](/core/sse) — SSE-Fehler und Wiederverbindungsstrategien
- [WebSocket →](/core/web-socket) — WebSocket-Verbindungsfehlerbehandlung
