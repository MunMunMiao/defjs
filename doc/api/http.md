---
title: HTTP
description: defineRequest, execute options, and HTTP request/response types.
---

# HTTP

Declare a typed request, build a command from input, execute it.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, optional `input` struct, `output` keyed by status, optional `operation` and `build`.
- **Returns** a builder. Call it with input to get an `HttpCommand`.

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

`output` may also be a list of `{ status, body }` groups (one body struct for several codes).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Low-level entry used by `client.execute`. Application code should call `client.execute(command, options)`.

- **Returns** `[null, body, response]` or `[error, undefined, response?]`.

Undeclared `output` status is `kind: 'definition'` / `UNDECLARED_STATUS`. The response may still be present; the body is not decoded as success.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Default HTTP transport. Used unless `withHTTPHandle` replaces it.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Build an `HttpResponse` without a network call (interceptors, tests). Default status is `0`. `ok` is true for 2xx.

## Execute options

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

Cancellation is `abort` **or** `timeout`, not both. `signal` combines with either; it is **not** an alias for `abort`. Valid shapes: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. `{ abort, timeout }` is invalid. `timeout` must be a positive safe integer in `1..2_147_483_647`.

## Types

### RequestDefinition {#RequestDefinition}

`method`, `path`, optional `input`, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, optional `build` (custom request assembly; requires `input`).

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

Normalized outgoing request: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, progress hooks, `baseEndpoint`, query metadata.

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

`loaded`, `total`, `lengthComputable`. Callbacks may be async.

See [HTTP guide](/core/http) and [Commands](/core/commands).

## ResponseGroupItem {#ResponseGroupItem}

`{ status, body }` row in the list form of `RequestOutputShape`. `status` may be one code or several sharing a body struct.

## RequestCommandBuilder {#RequestCommandBuilder}

Returned by `defineRequest`. Call with input to get an `HttpCommand`.

## HttpCommand {#HttpCommand}

Opaque command from a request builder. Pass to `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progress and cancellation fields. `HttpExecuteOptions` adds `signal`.

## RequestSuccessData {#RequestSuccessData}

Inferred success body from declared 2xx `output` entries.

## RequestErrorData {#RequestErrorData}

Inferred error body from declared non-2xx `output` entries.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Fields for `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `error`.
