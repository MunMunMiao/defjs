---
title: HTTP
description: defineRequest, opciones de execute y tipos de solicitud/respuesta HTTP.
---

# HTTP

Declara una solicitud tipada, construye un comando a partir del input, ejecútalo.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, struct `input` opcional, `output` indexado por estado, `operation` y `build` opcionales.
- **Devuelve** un builder. Llámalo con el input para obtener un `HttpCommand`.

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

`output` también puede ser una lista de grupos `{ status, body }` (un struct de body para varios códigos).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Entrada de bajo nivel que usa `client.execute`. En la app llama a `client.execute(command, options)`.

- **Devuelve** `[null, body, response]` o `[error, undefined, response?]`.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Transporte HTTP por defecto. Se usa salvo que `withHTTPHandle` lo reemplace.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Construye un `HttpResponse` sin llamada de red (interceptores, tests). El estado por defecto es `0`. `ok` es true en 2xx.

## Options de execute

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

La cancelación es `abort` **o** `timeout`, no ambos. `signal` se combina con cualquiera; **no** es un alias de `abort`. Válido: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. Inválido: `{ abort, timeout }`. `timeout` debe ser un entero seguro positivo en `1..2_147_483_647`.

## Tipos

### RequestDefinition {#RequestDefinition}

`method`, `path`, `input` opcional, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, `build` opcional (ensamblado personalizado de la solicitud; requiere `input`).

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

Solicitud saliente normalizada: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, hooks de progreso, `baseEndpoint`, metadatos de query.

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

`loaded`, `total`, `lengthComputable`. Los callbacks pueden ser async.

Ver [guía de HTTP](../core/http.md) y [Comandos](../core/commands.md).

## ResponseGroupItem {#ResponseGroupItem}

Una fila `{ status, body }` en la forma lista de `RequestOutputShape`. `status` puede ser un código o varios que comparten el mismo body struct.

## RequestCommandBuilder {#RequestCommandBuilder}

Lo devuelve `defineRequest`. Llámalo con input y sale un `HttpCommand`.

## HttpCommand {#HttpCommand}

Command opaco del request builder. Pásaselo a `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progreso y cancelación. `HttpExecuteOptions` añade `signal`.

## RequestSuccessData {#RequestSuccessData}

Body de éxito inferido de las entradas `output` 2xx declaradas.

## RequestErrorData {#RequestErrorData}

Body de error inferido de las entradas `output` no 2xx declaradas.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Campos para `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `error`.
