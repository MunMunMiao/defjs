---
title: Fehler
description: Auf kind und code branchen für 404s, Timeouts, undeclared Statuses und Transport-Failures.
---

# Fehler

Handle ein deklariertes 404, ein Timeout oder einen undeclared Status, indem du das Error-first-Tupel liest — nicht indem du Throws catchst. `RequestError` bleibt eine `kind`-/`code`-Union, und jeder Wert ist ein natives `Error` (`instanceof Error` ist wahr). Starte mit `kind`, dann `code`.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## Stabile Codes

| `kind`       | Codes                                                                                                | Meaning                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Non-2xx hat die HTTP-Grenze erreicht. Behält `status`, `response` und ggf. dekodiertes status-spezifisches `data`.      |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Cancel, Timeout oder Fetch-/Transport-Failure hat ein normales Ergebnis blockiert.                                      |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Input-, Request-Bau-, Response-Representation-, Struct-Decode-, Status-Contract- oder Interceptor-throw/reject-Failure. |

`cause` ist optional auf Transport- und Definition-Errors. `response` ist immer auf HTTP-Status-Errors; es kann auf Definition-Errors erscheinen, wenn schon eine Response existierte.

## Tupel-Shapes nach Transport

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

Startup-Fehler → zweiter Eintrag `undefined`. Dritter Eintrag nur, wenn dieser Transport zuerst Response/Snapshot erzeugt hat. Nachdem ein SSE-Handle oder eine WebSocket-Session zurückkommt, leben spätere Failures auf dem Lifecycle dieses Handles — sie schreiben das settled Startup-Tupel nicht um.

## HTTP-Status und data

Exact-Status zuerst. Mit `output` wählt Defjs den passenden Struct vor Body-Decode, damit `error.status` und `error.data` korreliert bleiben.

| Situation                                   | Tupel-Outcome                        | Body-Verhalten                                               |
| ------------------------------------------- | ------------------------------------ | ------------------------------------------------------------ |
| 2xx mit matching deklariertem Status        | Success                              | Gewählter Struct → `data`                                    |
| Non-2xx mit matching deklariertem Status    | `HTTP_STATUS`                        | Gewählter Struct → typisiertes `error.data`                  |
| Beliebiger Status ohne matching Deklaration | `UNDECLARED_STATUS`                  | Status gewinnt **vor** Body-Decode                           |
| Matching Status, Body-Representation fails  | `RESPONSE_VALIDATION_FAILED`         | Kein partieller typisierter Wert                             |
| `output` weggelassen                        | 2xx succeed; Non-2xx → `HTTP_STATUS` | Body nicht dekodiert; `data` ist `undefined`                 |
| Response-Status `0`                         | Transport-Error                      | `response.error` → `NETWORK_ERROR`, `ABORTED` oder `TIMEOUT` |

`HttpResponse.ok` bedeutet nur `200 <= status < 300`. Normales Non-2xx setzt `HttpResponse.error` nicht — diese Property ist für Fetch-Boundary-Transport- oder Body-Representation-Failure.

## Startup vs Post-Open

SSE validiert Status, `text/event-stream` und Body, bevor das Handle resolved. Failed Status → `HTTP_STATUS`. Schlechter Content-Type oder fehlender Body → `RESPONSE_VALIDATION_FAILED`. Opening-Snapshot kann trotzdem im dritten Tupel-Slot landen.

WebSocket-Startup deckt Handshake + ersten physischen Open ab. Constructor-Failure, Pre-Open-Close, Timeout oder Cancel → Startup-Tupel. Ein Connection-Snapshot kann existieren, auch wenn der Socket nie `open` erreicht.

| Transport | Nach Startup                                                                                                                                                         |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | Iterator rejected bei fatalem Error; `stream.closed` resolved mit `code: 'error'` und einem `EventStreamErrorCode`                                                   |
| WebSocket | `onRuntimeError` für Message-/Queue-/Heartbeat-/Runtime-Failures; `receive` fails bei terminalen Errors; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute-Promise settles einmal. Interceptor-/Callback-Code kann trotzdem außerhalb der Tupel-Normalisierung throwen                                                  |

`ABORTED` / `TIMEOUT` beschreiben das caller-facing Startup-Ergebnis. Du schließt trotzdem einen zurückgegebenen Stream/Session und awaitest sein Terminal-Promise.

## Logging und Struct-Cause

Jedes `RequestError` ist ein natives `Error`. `String(error)` liefert den stabilen String `<name>: <message>`; für strukturierte Logs bleiben `kind`, `code`, `status`, `response` und `data` enumerable. `cause` ist der native, nicht enumerable Link der Cause-Chain — kopiere seine Helper nicht auf den äußeren Fehler.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.format(), error.cause.flatten(), error.cause.prettify())
  }
}
```

Rufe `format()`, `flatten()` und `prettify()` erst nach `error.cause instanceof StructError` auf. Das einheitliche Tuple bleibt unverändert; besseres Logging macht aus deklarierten Failures keinen Throw.

## Reference

| Branch                  | Control-flow-Check                           | Nützliche stabile Felder                    | Meist absent / sensitiv          |
| ----------------------- | -------------------------------------------- | ------------------------------------------- | -------------------------------- |
| HTTP-Status-Policy      | `error.kind === 'http'`                      | `error.status`, reviewed `error.data`       | Body, Headers, URL, `cause`      |
| Caller-Cancellation     | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code`                              | Abort-Reason und Stack           |
| Timeout                 | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code`                              | Request-URL und underlying Cause |
| Contract-Failure        | `error.kind === 'definition'`                | `kind`, `code`, reviewed `response?.status` | Struct-Issues, Body, Input-Werte |
| Stream-/Session-Runtime | `stream.closed` / `session.closed`           | Terminal Code/Kind, reviewed Close-Status   | Event-Payloads, Frames, Causes   |

Inferiere CORS nicht aus Status `0` — branche auf `kind` und `code`.

Behandle `cause`, `data`, Response-Headers/Bodies, URLs, Struct-Issues, Input-Werte und Stacks als sensitiv. Eine konservative Summary:

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`, `createDefinitionError` und `createHttpStatusError` bauen und liefern native `Error`-Instanzen. Normale Request-Failures bleiben im einheitlichen Tuple; die native `Error`-Identität macht daraus für sich genommen keinen Throw. `ERR_ABORTED` und `ERR_TIMEOUT` sind shared Causes, die der Transport-Normalizer erkennt.

## Verwandte Rezepte

- [GET mit deklariertem 404](../recipes/get-declared-404.md)
- [HTTP-Aufruf abbrechen](../recipes/cancel-http.md)
