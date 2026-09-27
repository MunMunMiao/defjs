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

- **definition** — `method`, `path`, optionaler `input`-Struct, optionale `output`- und `error`-Structs, optional `operation` und `build`.
- **Returns** einen Builder. Ruf ihn mit Input auf und du bekommst einen `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})
```

`output` ist ein Struct für den 2xx-Body; `error` ist ein Struct für jeden Non-2xx-Body. Keines von beiden wird nach Status gekeyt. Lässt du eines weg, wird dieser Body nie gelesen — siehe [Deklaration ist eine Zusicherung](/de-DE/guide/design-decisions#deklaration-ist-eine-zusicherung).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Low-Level-Einstieg, den `client.execute` nutzt. Im Application-Code ruf `client.execute(command, options)` auf.

- **Returns** `[null, data, response]` oder `[fault, undefined, undefined]`.

Ein Non-2xx-Status ist immer `HTTP_STATUS`. Sein `data` ist der dekodierte `error`-Body, wenn einer deklariert war, sonst `undefined`. Bei einem Failure ist der dritte Tuple-Slot `undefined`; die Response-Metadaten trägt der Fault.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Default-HTTP-Transport. Wird genutzt, bis `withHTTPHandle` ihn ersetzt. Er rejectet — statt mit einer synthetischen Response zu resolven —, wenn keine Response den Client erreicht hat.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Baue eine `HttpResponse` ohne Network-Call (Interceptors, Tests). Default-Status ist `0`. `ok` ist true für 2xx. Der zurückgegebene Wert geht durch dieselbe Media-Type-Prüfung und denselben deklarierten Struct wie eine Response von der Leitung; es gibt keinen vertrauten Short-Circuit.

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

`method`, `path`, optional `input`, `output`, `error`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, optional `build` (Request selbst zusammenbauen; braucht `input`).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

Die `output`-/`error`-Hälfte einer `RequestDefinition`. Fehlen beide, ist auch `responseType` abgelehnt: es wird nichts dekodiert, also gibt es nichts auszuwählen.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

Im Erfolgsfall trägt der dritte Slot nur dann `body`, wenn `output` deklariert war. Im Fehlerfall ist er `undefined` — der Fault hält schon alle Response-Metadaten, die es gab.

### HttpRequest {#HttpRequest}

Normalisierter Outgoing-Request: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, Progress-Hooks, `baseEndpoint`, Query-Metadata.

### HttpMeta {#HttpMeta}

```ts
type HttpMeta = {
  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
}
```

Response-Metadaten, verfügbar sobald eine Response den Client erreicht hat. Sie tragen **kein** `body`: einen Body gibt es erst, wenn ein deklarierter Struct einen dekodiert hat.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

Eine Response, deren Body gegen den deklarierten Struct dekodiert wurde. Diesen Typ in der Hand zu haben ist der Beweis, dass dekodiert wurde — deshalb meldet ein Decode-Failure `HttpMeta` allein.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly ok: boolean
}
```

Die Wire-Shape, die Transports produzieren und Interceptors sehen: `body` ist Text oder bereits geparstes JSON, kein dekodierter Wert. Beim Caller landet `DecodedResponse`.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Callbacks dürfen async sein.

Siehe [HTTP-Guide](../core/http.md) und [Commands](../core/commands.md). Ein Callback, der throwt, ist `EXT_OBSERVER_FAILED`.

## RequestCommandBuilder {#RequestCommandBuilder}

Kommt von `defineRequest`. Mit Input aufrufen → `HttpCommand`.

## HttpCommand {#HttpCommand}

Opakes Command vom Request-Builder. Gib es `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progress, Cancel. `HttpExecuteOptions` legt `signal` drauf.

## RequestSuccessData {#RequestSuccessData}

Aus dem deklarierten `output`-Struct inferierter Success-Body, oder `undefined`, wenn keiner deklariert ist.

## RequestErrorData {#RequestErrorData}

Aus dem deklarierten `error`-Struct inferierter Error-Body, oder `undefined`, wenn keiner deklariert ist.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Felder für `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `request`.
