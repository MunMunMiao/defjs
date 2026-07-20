---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# Interceptors

`@defjs/core` interceptors are divided by transport layer: HTTP, SSE, and WebSocket. They share the same onion-chain execution model but handle different request/response shapes: HTTP returns `Promise<HttpResponse>`, SSE returns `Promise<EventStreamHandle>`, and WebSocket returns `Promise<WebSocketSessionLike>`.

Interceptors are registered at the `Client` level via `withInterceptors(...)`. The client automatically filters and dispatches to the correct interceptor chain based on command type.

## Three Interceptor Types

### HTTP Interceptors

HTTP interceptors operate on `HttpRequest` and return `Promise<HttpResponse>`. Typical use: inject auth headers, logging, retry, error transformation.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### SSE Interceptors

SSE interceptors operate on `HttpRequest` (the HTTP request before connection) and return `Promise<EventStreamHandle>`. Typical use: inject auth headers before SSE connection, monitor connection state.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### WebSocket Interceptors

WebSocket interceptors operate on `HttpRequest` (the request before the socket is opened) and return `Promise<WebSocketSessionLike>`. Typical use: inspect or rewrite the resolved URL, add logging, or wrap the returned session.

WebSocket subprotocol negotiation is configured through the public WebSocket options API, not by mutating handshake headers in an interceptor. Use one of these public entry points instead:

- endpoint-level `protocols: ['v1']`
- `withWebSocketProtocols(['v1'])`
- `withWebSocketOptions({ protocols: ['v1'] })`
- `client.execute(command, { protocols: ['v1'] })`

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsLoggingInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const target = req.queryString ? `${req.endpoint}?${req.queryString}` : req.endpoint
  console.log(`[WS] ${target}`)
  const session = await next(req)
  console.log('[WS] protocol:', session.connection.protocol)
  return session
})
```

## Onion-Chain Execution Model

All three interceptor chains use the **onion model**: request phase enters in registration order, response phase returns in reverse order.

```typescript
import { createHttpInterceptor } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // Request phase: first in
  const res = await next(req)
  order.push(1.1) // Response phase: last out
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // Request phase: last in
  const res = await next(req)
  order.push(3.1) // Response phase: first out
  return res
})

// Register with withInterceptors(a, b, c)
// Execution order: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### Modifying Requests and Responses

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### Wrapping Return Results

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## Common Interceptor Examples

### Auth Interceptor

Inject Bearer Token into headers. HTTP and SSE share the same logic.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### Logging Interceptor

Record request duration and status code.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### Retry Interceptor

Retry specific status codes. The retry interceptor should be registered near the bottom of the chain, after logging but before the actual request.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic Auth Interceptor (Built-in)

`@defjs/core` provides built-in Basic Auth interceptors for HTTP and SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

Default encoding uses `globalThis.btoa`. For environments without `btoa` (e.g., Node), customize via `options.encode`:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## Registration and Filtering

### Registering via `withInterceptors`

Interceptors are registered at `createClient` time via `withInterceptors(...)`. The same array can mix all three interceptor types; the client filters by command type automatically.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### Filtering Rules

The client filters interceptors by command type:

| Command Type                  | Filter Condition        |
| ----------------------------- | ----------------------- |
| HTTP (`defineRequest`)        | `kind === 'http'`       |
| SSE (`defineEventStream`)     | `kind === 'sse'`        |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` |

Filtered interceptors maintain their original registration order, then form an onion chain.

```typescript
// Conceptual execution sketch — public API does the filtering and chaining internally.
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor, authInterceptor, retryInterceptor),
)

const [error, result] = await client.execute(command)
```

### Interceptor Order and Composition

Multiple `withInterceptors` calls append interceptors in order.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // First
  withInterceptors(authInterceptor, retryInterceptor), // Second
)
// Final order: logging -> auth -> retry
```

## Body Metadata Notes

When an interceptor replaces `body`, the old `bodyContentType` metadata is automatically invalidated to prevent incorrect `Content-Type` from being sent to the server.

```typescript
// Keeping original body: Content-Type metadata remains valid
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// Replacing body: old Content-Type is cleared, new body type determines it
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API Reference

### Creation Functions

| Function                         | Description                    |
| -------------------------------- | ------------------------------ |
| `createHttpInterceptor(fn)`      | Create an HTTP interceptor     |
| `createSSEInterceptor(fn)`       | Create an SSE interceptor      |
| `createWebSocketInterceptor(fn)` | Create a WebSocket interceptor |

### Types

| Type                   | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP interceptor object `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | SSE interceptor object `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | WebSocket interceptor object `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | Union of all three interceptor types                                              |
| `HttpInterceptorNext`  | HTTP next handler `(req: HttpRequest) => Promise<HttpResponse>`                   |
| `SSEHandler`           | SSE next handler `(req: HttpRequest) => Promise<EventStreamHandle>`               |
| `WebSocketHandler`     | WebSocket next handler `(req: HttpRequest) => Promise<WebSocketSessionLike>`      |

### Built-in Interceptors

| Function                                         | Description                 |
| ------------------------------------------------ | --------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth interceptor |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth interceptor  |

## What's Next

- [Client →](/core/client) — Creating clients and configuring interceptors
- [HTTP Requests →](/core/http) — `defineRequest` and output patterns
- [SSE →](/core/sse) — SSE definition and streaming
- [WebSocket →](/core/web-socket) — WebSocket definition and lifecycle
