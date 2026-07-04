---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Use `defineRequest` to define an HTTP endpoint, then execute it with `Client.execute()`. The core package handles struct validation, status-code dispatch, signal merging, and response body parsing automatically.

## Defining an Endpoint

`defineRequest` accepts a definition object with `method`, `path`, `input` (optional), `output` (optional), and `build` (optional).

`input` describes the command input shape. There are two common mapping paths:

1. Use `struct.request(...)` when fields map directly to HTTP transport parts such as `path`, `query`, `headers`, or `body`. Defjs can build those request parts automatically.
2. Use `build(ctx, input)` when the public command input differs from the wire shape, or when you need custom mapping logic.

```typescript
import { defineRequest, struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    query: struct.object({ includePosts: struct.boolean() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

If no input is needed, omit both `input` and `build`:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [
    {
      status: 200,
      body: struct.object({
        items: struct.array(User),
      }),
    },
  ] as const,
})
```

When the public input shape differs from the wire shape, add `build(ctx, input)` and map fields explicitly:

```typescript
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.object({
    id: struct.number(),
    preview: struct.boolean(),
    body: struct.object({ name: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams({ id: input.id })
    ctx.setQueryParams({ preview: input.preview })
    ctx.setJson(input.body)
  },
  output: [
    { status: 200, body: User },
    { status: 400, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

## Status-Code-to-Struct Output Mapping

`output` maps HTTP status codes to structs. The runtime selects the matching struct by response status code.

The examples in this guide use the array form because it keeps status/body pairs explicit and supports grouping multiple statuses. Object-form `output` is still supported and remains useful for compact reference examples.

```typescript
import { defineRequest, struct } from '@defjs/core'

// Object form: keys are status codes, values are structs
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.object({ name: struct.string() }),
  }),
  output: {
    201: struct.object({ id: struct.number(), name: struct.string() }),
    400: struct.object({ message: struct.string() }),
    409: struct.object({ message: struct.string() }),
  },
})

// Array form: supports mapping multiple status codes to the same struct
const updateUserOutput = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: [400, 422], body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

If the server returns a status code not declared in `output`, the request fails with a `DefinitionError` whose `code` is `UNDECLARED_STATUS`.

## Success / Error Data Type Inference

`output` drives TypeScript type inference. `Client.execute()` returns an error-first `HttpAwaitResult` tuple that automatically distinguishes 2xx success data from non-2xx error data.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 400, body: struct.object({ field: struct.string(), reason: struct.string() }) },
    { status: 500, body: struct.object({ traceId: struct.string() }) },
  ] as const,
})

const [error, result, response] = await client.execute(endpoint())

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

- `RequestSuccessData<TOutput>`: Extracts all 2xx struct output types from `output`. If no 2xx mapping exists, infers as `unknown`.
- `RequestErrorData<TOutput>`: Extracts all non-2xx struct output types from `output`. If no non-2xx mapping exists, infers as `unknown`.

## Executing a Request

Call `Client.execute()` with a command. The second argument is optional `HttpExecuteOptions`:

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext()

const [error, result, response] = await client.execute(command(), {
  context,
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  signal: abortSignal, // alias for passing an AbortSignal directly
})
```

The returned `HttpAwaitResult` is a triplet:

| Position | Type                                     | Meaning                                                                 |
| -------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| 0        | `RequestError<TErrorData> \| null`       | Error object; `null` on success                                         |
| 1        | `TSuccess \| undefined`                  | Success data; `undefined` on failure, and also `undefined` when `output` is omitted |
| 2        | `SettledResponse<TSuccess> \| undefined` | Raw response wrapper with `status`, `headers`, `body`, etc. When `output` is omitted, the wrapper is still returned for settled requests but its `body` is set to `null`. |

## Cancellation and Timeout

`abort`, `timeout`, and `signal` control request lifecycle. **`abort` and `timeout` cannot be used together** — doing so produces a validation error before the request is sent.

### Using AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command(), {
  abort: controller.signal,
})

// Cancel later
controller.abort()

// After cancellation, error.kind is 'transport', code is 'ABORTED'
```

### Using Timeout

```typescript
const [error] = await client.execute(command(), {
  timeout: 5000, // 5 second timeout
})

// After timeout, error.kind is 'transport', code is 'TIMEOUT'
```

### Merging External Signals

If both `abort` and `signal` are passed, the framework merges them into a single `AbortSignal`. Any signal triggering aborts the request. `timeout` remains a separate alternative and must not be combined with `abort`.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command(), {
  abort: controller.signal,
  signal: someOtherSignal, // merged with abort
})
```

You can also pair `timeout` with `signal` when you want a time limit plus another external signal:

```typescript
const [error] = await client.execute(command(), {
  timeout: 5000,
  signal: someOtherSignal,
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
const [error, result] = await client.execute(command(), {
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

const [error, result] = await client.execute(command(), {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## Response Types

By default, if `output` is declared, the framework auto-parses the response as `json`. You can override this with `responseType`. When `output` is `undefined`, `responseType` only affects the internal response parsing path; callers still receive `undefined` result data and a response wrapper whose `body` is set to `null`.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

// Explicit response type with declared output
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
  output: [
    { status: 200, body: struct.blob() },
  ] as const,
})

// No output: use for status/header-only checks
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})

const [healthError, healthResult, healthResponse] = await client.execute(healthCheck())
// healthResult is undefined
// healthResponse?.body is set to null on this path
// If you need the body, declare output that matches responseType instead.
```

Supported `responseType` values:

| Value         | Description                                              |
| ------------- | -------------------------------------------------------- |
| `json`        | Read text then `JSON.parse()`; empty body returns `null` |
| `text`        | Return text string directly                              |
| `blob`        | Return `Blob`                                            |
| `arraybuffer` | Return `ArrayBuffer`                                     |

When `responseType` is `json` and `output` defines a struct for the returned status code, the framework validates the parsed JSON against the struct. If validation fails, a `DefinitionError` with `code: 'RESPONSE_VALIDATION_FAILED'` is returned.

If `output` is omitted, the request still settles with status and headers, but the second tuple item stays `undefined` and the response wrapper's `body` is set to `null`. That path is appropriate for checks such as health probes, HEAD-style usage, or status/header assertions. If you need response body data, declare `output` with a struct that matches the selected `responseType`.

## What's Next

- [Client →](/core/client) — Creating `Client`, interceptors, XSRF, global options
- [SSE →](/core/sse) — Server-sent events and streaming responses
- [WebSocket →](/core/web-socket) — Bidirectional real-time communication
