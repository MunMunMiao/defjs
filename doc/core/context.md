---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# Context

Defjs execution flow: Client configuration provides global defaults; command definitions describe endpoint structure; `build` maps parsed input to HTTP request parts; and `HttpContext` acts as invisible luggage passed between interceptors during a single execution lifecycle.

## HttpContext Passing

`HttpContext` is a Token-based key-value container for metadata within a single request/connection lifecycle. It does not participate in URL, header, or body serialization. It is read and written by interceptors.

### Creating and Using

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Define a Token (with default value)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. Create context and set values
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. Pass at execution time
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### Reading in Interceptors

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### Merging Contexts

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged contains both requestId and auth
```

### Key API

| Export                                           | Description                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `makeHttpContextToken<T>(defaultValue: () => T)` | Create a Token with default value                                  |
| `makeHttpContext()`                              | Create empty context                                               |
| `makeHttpContext(entries)`                       | Create from `[token, value]` array                                 |
| `makeHttpContext(otherContext)`                  | Copy another context                                               |
| `mergeHttpContexts(primary, secondary)`          | Merge two contexts; secondary overrides primary for the same Token |
| `ctx.set(token, value)`                          | Write value; returns self (chainable)                              |
| `ctx.get(token)`                                 | Read value; returns Token default if unset                         |
| `ctx.has(token) / ctx.del(token)`                | Check / delete                                                     |
| `ctx.keys() / ctx.length`                        | Iterate / count                                                    |

---

## Request Builder and Input Parsing

### Input Parsing Flow

When executing a command, the Client processes input in this order:

1. **Validate**: Validates and parses raw caller data using the `input` Struct.
2. **Build**: Calls `build(ctx, parsedInput)` to map parsed data to request parts.
3. **Transport**: Dispatches to HTTP fetch, SSE stream, or WebSocket connection based on `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(ctx, input) {
    ctx.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Build Handler Capability Matrix

Different transports support different `build` operations:

| Build Method                              | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

Using a transport-unsupported method in `build` throws `REQUEST_VALIDATION_FAILED` at execution time.

### Auto Build

If you omit `build`, you must also omit `input`. However, you can use Struct's `request` shape to let the framework auto-infer build logic:

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // No build needed; framework auto-maps path/query
})
```

If `build` is provided, `input` must also be provided. This is a strict design rule.

---

## Client Configuration

Create a client with `createClient` and one or more configuration functions. Later functions override earlier ones for the same key.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### Core Options

#### `withEndpoint(url)`

Sets the base API address. All request `path` values are appended after this URL.

```typescript
withEndpoint('https://api.example.com/v1')
// Requesting /users produces https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

Whether to include cross-origin credentials (cookies, HTTP auth headers, TLS client certificates). Corresponds to the `fetch` `credentials` option.

```typescript
withCredentials(true) // Include cookies in cross-origin requests
withCredentials(false) // Default
```

#### `withXSRF(options)`

Configures XSRF token read and inject behavior. Defaults to reading `XSRF-TOKEN` from `document.cookie` and injecting it into the `X-XSRF-TOKEN` header.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // Custom read logic, e.g., from localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| Field           | Type                                   | Default                      |
| --------------- | -------------------------------------- | ---------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`               |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`             |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | Reads from `document.cookie` |

#### `withQueryParamsSerializer(fn)`

Custom query parameter serialization. Defaults to `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

When a custom serializer is provided, HTTP and SSE requests allow complex query parameters.

---

## Transport-Specific Configuration

### SSE Options

Configure via `withSSEOptions` or individual configuration functions.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| Option               | Description                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| `sse.fetch`          | SSE-specific `fetch` implementation                                                              |
| `sse.reconnect`      | Reconnect strategy: attempts, delay, backoff factor, jitter, max delay, custom decision function |
| `sse.queue`          | Event queue: max capacity, overflow strategy                                                     |
| `sse.onInvalidEvent` | Invalid event observer (missing struct or validation failure)                                    |
| `sse.maxBufferSize`  | Underlying buffer size limit (bytes)                                                             |

### WebSocket Options

Configure via `withWebSocketOptions` or individual configuration functions.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| Option                    | Description                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `webSocket.WebSocket`     | Custom `WebSocket` constructor                                                                   |
| `webSocket.protocols`     | RFC 6455 subprotocol array                                                                       |
| `webSocket.beforeConnect` | Pre-connect hook (e.g., fetch dynamic token)                                                     |
| `webSocket.heartbeat`     | Heartbeat: interval, timeout, message factory, ACK predicate                                     |
| `webSocket.reconnect`     | Reconnect strategy: attempts, delay, backoff factor, jitter, max delay, custom decision function |
| `webSocket.queue`         | Send queue: max capacity, overflow strategy                                                      |

### Heartbeat Details

WebSocket heartbeat detects connection liveness. If configured, the framework sends heartbeat messages at `intervalMs` and waits for ACK within `timeoutMs`. If ACK times out, reconnect is triggered.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // Send heartbeat every 30s
  timeoutMs: 10000, // Must receive ACK within 10s
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- The heartbeat message type must be compatible with `outgoing` definitions.
- `isAck` determines whether an incoming message is a heartbeat response. When it returns `true`, the message does not enter the `receive` iterator.

---

## Configuration Composition and Priority

Configuration functions apply in order; later ones override earlier ones. Execution-time options (`client.execute(cmd, { timeout: 5000 })`) have the highest priority, followed by client-level configuration.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// Override SSE reconnect at execution time
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## What's Next

- [Client →](/core/client) — Client creation and `execute` usage
- [Commands →](/core/commands) — Command definitions and input optional rules
- [SSE →](/core/sse) — SSE execution, reconnect, and event handling
- [WebSocket →](/core/web-socket) — WebSocket connection, heartbeat, and state management
- [Interceptors →](/core/interceptors) — Interceptor types and onion-chain mechanics
