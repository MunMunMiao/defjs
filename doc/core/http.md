---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-schema mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Use `defineRequest` to define an HTTP endpoint, then execute it with `Client.execute()`. The core package handles schema validation, status-code dispatch, signal merging, and response body parsing automatically.

## Defining an Endpoint

`defineRequest` accepts a definition object with `method`, `path`, `input` (optional), `output` (optional), and `build` (optional).

When `input` is provided, `build` must also be provided to describe how input fields map to request parts (path params, query params, headers, body).

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

If no input is needed, omit both `input` and `build`:

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

## Status-Code-to-Schema Output Mapping

`output` maps HTTP status codes to schemas. The runtime selects the matching schema by response status code.

Both object and array forms are supported:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// Object form: keys are status codes, values are schemas
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

// Array form: supports mapping multiple status codes to the same schema
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

If the server returns a status code not declared in `output`, the request fails with a `DefinitionError` whose `code` is `UNDECLARED_STATUS`.

## Success / Error Data Type Inference

`output` drives TypeScript type inference. `Client.execute()` returns `HttpAwaitResult` that automatically distinguishes 2xx success data from non-2xx error data.

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
  // result is typed as { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data is typed as { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### Type Helpers

- `RequestSuccessData<TOutput>`: Extracts all 2xx schema output types from `output`. If no 2xx mapping exists, infers as `unknown`.
- `RequestErrorData<TOutput>`: Extracts all non-2xx schema output types from `output`. If no non-2xx mapping exists, infers as `unknown`.

## Executing a Request

Call `Client.execute()` with a command. The second argument is optional `HttpExecuteOptions`:

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

The returned `HttpAwaitResult` is a triplet:

| Position | Type                                     | Meaning                                                     |
| -------- | ---------------------------------------- | ----------------------------------------------------------- |
| 0        | `RequestError<TErrorData> \| null`       | Error object; `null` on success                             |
| 1        | `TSuccess \| undefined`                  | Success data; `undefined` on failure                        |
| 2        | `SettledResponse<TSuccess> \| undefined` | Raw response wrapper with `status`, `headers`, `body`, etc. |

## Cancellation and Timeout

`abort`, `timeout`, and `signal` control request lifecycle. **`abort` and `timeout` cannot be used together** — doing so produces a validation error before the request is sent.

### Using AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// Cancel later
controller.abort()

// After cancellation, error.kind is 'transport', code is 'ABORTED'
```

### Using Timeout

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5 second timeout
})

// After timeout, error.kind is 'transport', code is 'TIMEOUT'
```

### Merging External Signals

If both `abort` and `signal` are passed, the framework merges them into a single `AbortSignal`. `timeout` also participates as `AbortSignal.timeout()`. Any signal triggering aborts the request.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // merged with abort
})
```

### Error Distinguishing

Cancellation and timeout are both `TransportError`, distinguishable by `error.code`:

| Scenario        | `error.code`    | Description                                             |
| --------------- | --------------- | ------------------------------------------------------- |
| Manual cancel   | `ABORTED`       | `controller.abort()` or external signal triggered       |
| Timeout         | `TIMEOUT`       | `timeout` expired, or `AbortSignal.timeout()` triggered |
| Network failure | `NETWORK_ERROR` | Other exceptions from fetch                             |

## Download / Upload Progress

Track progress via `onDownloadProgress` and `onUploadProgress`.

### Download Progress

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` contains three fields:

- `lengthComputable`: Whether the server returned `Content-Length`
- `loaded`: Bytes received so far
- `total`: Total bytes (only valid when `lengthComputable` is `true`)

### Upload Progress

Upload progress only works when the request body is `ReadableStream<Uint8Array>`. The framework wraps the stream and callbacks after each chunk.

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

## Response Types

By default, if `output` is declared, the framework auto-parses the response as `json`. You can override this with `responseType`, or specify it when `output` is `undefined`.

```typescript
import { defineRequest } from '@defjs/core'

// Explicit response type
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// No output, only care about raw response
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

Supported `responseType` values:

| Value         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `json`        | Read text then `JSON.parse()`; empty body returns `null` |
| `text`        | Return text string directly                              |
| `blob`        | Return `Blob`                                            |
| `arraybuffer` | Return `ArrayBuffer`                                     |

When `responseType` is `json` and `output` defines a schema for the returned status code, the framework validates the parsed JSON against the schema. If validation fails, a `DefinitionError` with `code: 'RESPONSE_VALIDATION_FAILED'` is returned.

## What's Next

- [Client →](/core/client) — Creating `Client`, interceptors, XSRF, global options
- [SSE →](/core/sse) — Server-sent events and streaming responses
- [WebSocket →](/core/web-socket) — Bidirectional real-time communication
