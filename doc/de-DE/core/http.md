---
title: HTTP
description: Request definieren, ausführen, nach Status branchen und mit signal oder timeout canceln.
---

# HTTP

Definieren → ausführen → auf dem Tupel branchen → canceln, wenn der Screen weg ist. Das ist die ganze HTTP-Schleife.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## URL auflösen

`withEndpoint(...)` braucht eine gültige absolute URL. Endpoint-Pathname bleibt als Directory; Query und Hash werden vor der Command-Resolution verworfen.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Path-Placeholder sind Raw-Scalars, genau einmal encoded. Leere Werte und `.` / `..` werden rejected. Slashes, `?`, `#`, `%`, Spaces und Unicode in einem Placeholder bleiben ein encoded Segment — pre-encode nicht.

Definition-Path darf kein `?` oder `#` enthalten und darf nicht absolut oder protocol-relative sein. Default-Query-Encoder akzeptiert Scalars und Arrays von Scalars. Nested/komplexe Query-Werte brauchen `withQueryParamsSerializer(...)`, sonst failt Construction.

## Input encoden

`struct.request(...)` hält Path, Query, Headers und Body getrennt. Der Body-Wrapper wählt Codec und Content-Type:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Aliasse schreiben nur outbound Wire-Keys um. Geparste Werte und Command-Inputs behalten logische Namen.

| Wrapper                    | Runtime-Body      | Default Content-Type                                           |
| -------------------------- | ----------------- | -------------------------------------------------------------- |
| `struct.json(inner)`       | JSON-String       | `application/json`                                             |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`              |
| `struct.formData(shape)`   | `FormData`        | Platform Multipart-Boundary; Defjs cleart stale `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob-Type oder `application/octet-stream`                      |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                     |

Custom `build` exponiert dieselben Location-/Codec-Setter. Finaler Body-Write gewinnt (Value + Content-Type-Metadata). High-Level-Commands machen aus einem beliebigen Object keinen Body — deklariere einen Wrapper oder nutze den passenden Setter.

## Nach Status dispatchen

`output` ist eine Status → Struct-Map oder `{ status, body }[]`. Mit `output` und ohne `responseType` ist Representation default `json`. Explizite Types: `json`, `text`, `blob`, `arraybuffer`.

Reihenfolge:

1. Status `0` → Transport-Error.
2. Kein `output` → 2xx succeed mit `data === undefined`; Non-2xx → `HTTP_STATUS` mit `error.data === undefined`. Body nicht dekodiert.
3. Mit `output` wählt exakter deklarierter Status seinen Struct. Array-Form: späterer Match überschreibt früheren gruppierten Match.
4. Undeclared Status → `UNDECLARED_STATUS` **vor** Body-Decode.
5. Representation-Failure → `RESPONSE_VALIDATION_FAILED`, keine partial Data.
6. Dekodiertes deklariertes 2xx → Result; dekodiertes deklariertes Non-2xx → typisiertes `error.data` auf `HTTP_STATUS`.

`HttpResponse` hat `url`, `status`, `statusText`, `headers`, `body`, `error` und `ok`. `ok` bedeutet nur `200 <= status < 300`. Es ist ein Defjs-Wert, keine native `Response`. Ohne `output` ist `responseType` nicht erlaubt.

## Arbeit canceln

Execution-Options nehmen `signal` plus entweder `abort` oder `timeout`. **`abort` und `timeout` sind mutually exclusive.** `signal` kann mit jedem der beiden kombiniert werden.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` muss eine positive Safe Integer in `1..2_147_483_647` sein. Recognized Cancel → `ABORTED`; Execution-Timeout → `TIMEOUT`; andere Fetch-/Interceptor-Failures → `NETWORK_ERROR`. Cancel nach akzeptiertem Server-Write beweist **nicht**, dass der Write zurückgerollt wurde.

## Credentials und XSRF

`withCredentials(true)` setzt Fetch `credentials: 'include'` für HTTP und SSE. Es erzeugt kein `Authorization` und konfiguriert keine WebSocket-Auth. `false` lässt Credentials unspecified.

`withXSRF(...)` ist HTTP-only. Defaults: `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. Header injectet nur für Non-Safe Methods, nur wenn der Caller ihn nicht schon gesetzt hat, und nur für Same-Origin-Browser-Requests. Skippt `GET`, `HEAD`, `OPTIONS`, `TRACE`. Außerhalb eines Browsers gib einen synchronen request-scoped `tokenProvider`, wenn du Injection brauchst.

Halte Credentials, XSRF-Tokens und Query Strings aus Routine-Logs. Nutze Query-Params nicht als allgemeinen Credential-Kanal.

## Progress und die Fetch-Grenze

`onDownloadProgress` läuft, während eine explizite Response-Representation gelesen wird. `lengthComputable` ist nur bei positivem `Content-Length` true. Kein `responseType` → kein Body-Decode → kein Body-Read-Progress.

`onUploadProgress` beobachtet einen `ReadableStream<Uint8Array>`-Request-Body, während Fetch ihn liest. Normale Body-Wrapper exponieren keinen Raw-Stream-Setter — Upload-Progress ist vor allem für Low-Level-Construction.

`fetchHandler(httpRequest, fetchImpl?)` ist die niedrigere Fetch-Grenze: baut einen nativen `Request`, ruft Fetch, liest die Representation, gibt `HttpResponse` zurück. Es validiert **nicht** Command-Input, dispatcht kein `output` und läuft keine Interceptors. Nützlich für injizierte Transport-Tests — kein Ersatz für `client.execute`.

## Replay-Limits

Defjs auto-retried HTTP **nicht**. Einen Read zu retryen braucht trotzdem eine reviewed Timeout-/Network-/Duplicate-Policy. Eine Mutation zu retryen braucht replayable Bytes, Server-Support, einen Idempotency-Key gebunden an Auth-Scope + Request-Bytes und eine Receiver-Duplicate-Policy.

Eine Client-/Command-/Fetch-Grenze kann nicht wissen, ob ein failed Write committed hat. Halte Replay-Entscheidungen in der App oder einem reviewed Interceptor. Interceptors können den Low-Level-Request short-circuiten oder ersetzen; finaler Status und Body müssen trotzdem den Command-Vertrag erfüllen.

## Verwandte Rezepte

- [GET mit deklariertem 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP-Aufruf abbrechen](../recipes/cancel-http.md)
- [Mit lokalem Fetch-Handle testen](../recipes/test-with-handle.md)
