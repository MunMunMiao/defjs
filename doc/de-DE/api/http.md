---
title: HTTP
description: defineRequest, Execute-Options und HTTP-Request-/Response-Types.
---

# HTTP

Deklariere einen typisierten Request, baue aus dem Input einen Command, führe ihn aus.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, optionales `input`-Struct, `output` nach Status, optionales `operation` und `build`.
- **Returns** einen Builder. Ruf ihn mit Input auf und du bekommst einen `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})
```

`output` darf auch eine Liste von `{ status, body }`-Groups sein (ein Body-Struct für mehrere Codes).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Low-Level-Einstieg, den `client.execute` nutzt. Im Application-Code ruf `client.execute(command, options)` auf.

- **Returns** `[null, body, response]` oder `[error, undefined, response?]`.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Default-HTTP-Transport. Wird genutzt, bis `withHTTPHandle` ihn ersetzt.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Baue eine `HttpResponse` ohne Network-Call (Interceptors, Tests). Default-Status ist `0`. `ok` ist true für 2xx.

## Execute-Optionen

## HttpExecuteOptions {#HttpExecuteOptions}

```ts
type HttpExecuteOptions = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Cancellation ist `abort` **oder** `timeout`, nicht beides. `signal` kombiniert mit einem von beiden; es ist **kein** Alias für `abort`. Gültig: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. Ungültig: `{ abort, timeout }`. `timeout` muss eine positive Safe Integer in `1..2_147_483_647` sein.

## Typen

### RequestDefinition {#RequestDefinition}

`method`, `path`, optionales `input`, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, optionales `build` (custom Request-Assembly; braucht `input`).

### RequestOutputShape {#RequestOutputShape}

```ts
type RequestOutputShape = { [status: number]: AnyStruct } | readonly { status: number | readonly number[]; body: AnyStruct }[]
```

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]
```

### HttpRequest {#HttpRequest}

Normalisierter Outgoing-Request: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, Progress-Hooks, `baseEndpoint`, Query-Metadata.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}
```

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Callbacks dürfen async sein.

Siehe [HTTP-Guide](../core/http.md) und [Commands](../core/commands.md).

## ResponseGroupItem {#ResponseGroupItem}

Eine `{ status, body }`-Zeile in der Listenform von `RequestOutputShape`. `status` darf ein Code sein oder mehrere, die sich ein Body-Struct teilen.

## RequestCommandBuilder {#RequestCommandBuilder}

Kommt von `defineRequest`. Mit Input aufrufen → `HttpCommand`.

## HttpCommand {#HttpCommand}

Opakes Command vom Request-Builder. Gib es `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progress, Cancel. `HttpExecuteOptions` legt `signal` drauf.

## RequestSuccessData {#RequestSuccessData}

Erfolgreicher Body, inferiert aus deklarierten 2xx-`output`-Einträgen.

## RequestErrorData {#RequestErrorData}

Fehler-Body, inferiert aus deklarierten Nicht-2xx-`output`-Einträgen.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Felder für `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `error`.
