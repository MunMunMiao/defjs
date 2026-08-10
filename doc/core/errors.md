---
title: Errors
description: Handle transport-specific result tuples and branch on the plain RequestError discriminated union.
---

# Errors

Every supported transport returns an error-first three-item tuple, but the third item is transport-specific.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP returns decoded data and a Defjs `HttpResponse` wrapper.
- SSE returns a logical stream handle and a startup-open snapshot.
- WebSocket returns a logical session and a startup-connection snapshot.

On failure, the second item is `undefined`. The third item can also be `undefined` when startup failed before the transport produced the corresponding snapshot.

## `RequestError`

`RequestError` is a plain discriminated object returned in the tuple. It does not extend the native `Error` class.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

The exported union is named `RequestError<TErrorData>`.

Branch on `kind`, then on `code` where needed.

### HTTP Status Errors

A declared non-2xx HTTP response produces:

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

`data` exists only on `HttpStatusError`. Its type is the union of all declared non-2xx output bodies for that endpoint. Checking `error.status` does not currently narrow that union. Use an application-owned structural or discriminant check when different status bodies have different shapes.

### Transport Errors

A failed network operation, cancellation, or timeout produces:

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Transport errors do not have `data` or `response` fields.

### Definition Errors

Input decoding, request building, response decoding, or undeclared HTTP status handling can produce:

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Code                         | Current trigger                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Input structural decoding failed, request construction failed, or `build` produced invalid bindings. |
| `RESPONSE_VALIDATION_FAILED` | A declared response or SSE startup response failed structural/content validation.                    |
| `UNDECLARED_STATUS`          | HTTP returned any status with no matching output Struct while `output` was declared.                 |

`UNDECLARED_STATUS` applies to unmatched 2xx and non-2xx statuses.

## Branching

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

Do not log `cause`, `data`, response headers, bodies, or URLs without an explicit redaction and retention policy.

## Response Availability

`HttpResponse` is a Defjs wrapper, not a native `Response`. It exposes status, status text, headers, URL, body, `error`, and `ok`. `ok` means only that the status is in the 2xx range. `error` is reserved for transport or body-representation failures; an ordinary non-2xx response leaves it empty.

A valid declared non-2xx body is Struct-decoded and retained as typed `HttpStatusError.data`. A malformed representation instead produces `RESPONSE_VALIDATION_FAILED` with the original codec exception as `cause`, a response when one was received, and no `data`.

For HTTP:

- a declared HTTP status error has `error.response`;
- response-output validation errors and undeclared statuses can have `error.response`;
- request validation, cancellation before a response, interceptor throws, and status-0 transport failures can have no tuple response.

For SSE, a failed startup can still return a third-item open snapshot when a response arrived before content or status validation failed. For WebSocket, a failed startup can return a connection snapshot only when one was captured.

## Error Factories and Constants

The root entry exports factory helpers for integration code:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` normalizes abort, timeout, and other causes.
- `createDefinitionError(code, cause, response?)` creates a definition error.
- `createHttpStatusError(status, message, response, data?)` creates an HTTP status error.
- `ERR_ABORTED` and `ERR_TIMEOUT` are shared `Error` values recognized by the normalizer.

These helpers create plain `RequestError` objects. They do not throw them.

Built-in command paths convert their expected startup failures into tuples. Tuple handling does not cover arbitrary extension code: custom interceptors and application callbacks can throw, and passing an unsupported command to the broad runtime implementation rejects.

## Next

- [HTTP](/core/http) explains status dispatch and response decoding.
- [SSE](/core/sse) distinguishes startup failure from errors after open.
- [WebSocket](/core/web-socket) covers runtime errors and terminal close.
