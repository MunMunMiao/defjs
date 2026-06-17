---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# Errors

All execution results in `@defjs/core` are returned as `[error, result, response]` triplets. `error` is a `RequestError`: a discriminated union with `kind` and `code`. Branching by `kind` and `code` is the recommended pattern instead of string comparison.

## RequestError Structure

`RequestError` is a union of three error types:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

All errors share these common fields:

| Field      | Type                                    | Description                                                   |
| ---------- | --------------------------------------- | ------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | Error category for top-level branching                        |
| `code`     | `string`                                | Precise error code for second-level branching                 |
| `message`  | `string`                                | Human-readable error description                              |
| `data`     | `unknown`                               | Additional data (only for `http` and `definition` errors)     |
| `response` | `SettledResponseLike`                   | Raw response object (only for `http` and `definition` errors) |

### HttpStatusError

Produced when the server returns a non-2xx status code that is defined in `output`.

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

The `data` type is derived from the `output` schema for the matching status code. For example, `output: { 404: notFoundStruct }` narrows `error.data` to `notFoundStruct`'s inferred type.

### TransportError

Produced on network or transport layer failures, including abort, timeout, and generic network errors.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

Produced on request definition or validation failures.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Code                         | Trigger Scenario                                                                 |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Input parameters failed `input` struct validation, or `build` threw an exception |
| `RESPONSE_VALIDATION_FAILED` | Response body failed `output` struct validation for the returned status code     |
| `UNDECLARED_STATUS`          | Server returned a 2xx status code not declared in `output`                       |

## Error Classification and Branching

**Do not** use string comparison to judge error types:

```typescript
// Not recommended: fragile and no type narrowing
if (error.message.includes('timeout')) { ... }
```

**Recommended**: Branch by `kind` and `code` for precise type narrowing:

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
      // error is narrowed to HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data is narrowed to { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error is narrowed to TransportError
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
      // error is narrowed to DefinitionError
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

## Built-in Constants

`@defjs/core` exports two constants for identifying specific transport errors:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: Request was actively cancelled
// ERR_TIMEOUT: Request timed out
```

### Triggering Cancellation in Interceptors

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

### Using with AbortController

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### Creating Transport Errors Manually

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## Helper Functions

### `createTransportError`

Normalizes a raw exception into a `TransportError`.

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

Normalizes a raw exception into a `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

Normalizes a non-2xx response into an `HttpStatusError`.

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

## What's Next

- [Client →](/core/client) — Creating clients and executing commands
- [HTTP Requests →](/core/http) — `defineRequest` and output patterns
- [SSE →](/core/sse) — SSE errors and reconnect strategies
- [WebSocket →](/core/web-socket) — WebSocket connection error handling
