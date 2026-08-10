---
title: Client
description: Create explicit clients, compose options, execute transport-specific commands, and inspect live configuration.
---

# Client

Create a `Client` explicitly and pass it to the code that executes commands.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

The client stores configuration and dispatches HTTP, SSE, and WebSocket commands. It does not own a global registry or a background lifecycle manager.

## Option Composition

Options run left to right.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

The final endpoint is `https://api.example.com`. The interceptor order is `operationLogger`, `authInterceptor`, then `retryInterceptor`.

Composition follows three rules:

1. Setter helpers replace their value. This includes `withEndpoint`, transport handles, the query serializer, credentials, XSRF configuration, and individual SSE or WebSocket settings.
2. `withInterceptors(...items)` appends. Multiple calls preserve the order in which interceptors were added.
3. `withSSEOptions(...)` and `withWebSocketOptions(...)` shallow-replace each defined top-level field. They do not deep-merge nested reconnect or heartbeat objects.

For example, the second reconnect object below replaces the first one. It does not retain `attempts: 5`.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

The grouped option helpers ignore properties whose value is `undefined`. Every other provided top-level property replaces the current value as a whole.

### Core Options

| Option                           | Effect                                                         |
| -------------------------------- | -------------------------------------------------------------- |
| `withEndpoint(url)`              | Set the absolute base endpoint used by all transports.         |
| `withHTTPHandle(fetch)`          | Replace the Fetch implementation for HTTP.                     |
| `withSSEHandle(fetch)`           | Replace the Fetch implementation for SSE.                      |
| `withWebSocketHandle(WebSocket)` | Replace the WebSocket constructor.                             |
| `withInterceptors(...items)`     | Append mixed transport interceptors.                           |
| `withQueryParamsSerializer(fn)`  | Replace HTTP, SSE, and WebSocket query serialization.          |
| `withCredentials(boolean)`       | Use Fetch `credentials: 'include'` for HTTP and SSE when true. |
| `withXSRF(options?)`             | Configure HTTP XSRF token injection.                           |
| `withSSEOptions(options)`        | Shallow-replace defined SSE fields.                            |
| `withWebSocketOptions(options)`  | Shallow-replace defined WebSocket fields.                      |

Individual SSE and WebSocket helpers set one corresponding top-level field. The transport pages list their defaults and lifecycle consequences.

## Test Through a Client-Local Fetch

`withHTTPHandle(...)` accepts a `typeof fetch` implementation. It replaces HTTP transport only for that client, so tests can exercise real command projection, interceptors, status dispatch, response decoding, and cancellation without patching global Fetch or adopting a process-wide mocking framework.

Build a native `Request` inside the fixture. That captures the final URL, headers, body, credentials, and signal after Defjs request building and HTTP interceptors:

```typescript
import { createClient, withEndpoint, withHTTPHandle } from '@defjs/core'

export function createHttpFixture() {
  const requests: Request[] = []
  const pending = new Set<() => void>()
  let closed = false

  const handle: typeof fetch = async (input, init) => {
    if (closed) {
      throw new Error('HTTP fixture is closed')
    }

    const request = new Request(input, init)
    requests.push(request.clone())
    const path = new URL(request.url).pathname

    if (path === '/network-error') {
      throw new TypeError('fixture network failure')
    }
    if (path === '/malformed') {
      return new Response('{"id":', { headers: { 'content-type': 'application/json' }, status: 200 })
    }
    if (path === '/missing') {
      return Response.json({ code: 'NOT_FOUND' }, { status: 404 })
    }
    if (path === '/slow') {
      return new Promise<Response>((_resolve, reject) => {
        const rejectPending = () => {
          request.signal.removeEventListener('abort', rejectPending)
          pending.delete(rejectPending)
          reject(request.signal.reason ?? new DOMException('Fixture closed', 'AbortError'))
        }

        pending.add(rejectPending)
        if (request.signal.aborted) {
          rejectPending()
        } else {
          request.signal.addEventListener('abort', rejectPending, { once: true })
        }
      })
    }

    return Response.json({ id: 1, name: 'Ada' })
  }

  return {
    client: createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(handle)),
    requests,
    reset() {
      requests.length = 0
    },
    close() {
      closed = true
      for (const rejectPending of pending) {
        rejectPending()
      }
      requests.length = 0
    },
  }
}
```

Create a fresh fixture per test or call `reset()` between cases, and always call `close()` in `finally`. Define commands with the success and error statuses under test, add interceptors to the client normally, then assert the captured native request and the returned high-level tuple. The `/slow` branch must be aborted or closed so no pending promise or abort listener leaks into the next test. A separate loopback test using native Fetch is still useful when DNS, sockets, proxies, CORS, or other real network behavior matters.

## Execute Commands

`Client.execute` has three overloads. Each returns an error-first three-item tuple.

For HTTP, SSE, and WebSocket execution, `timeout` must be a positive safe integer in `1..2_147_483_647`; `0`, negative or fractional values, `NaN`, `Infinity`, and values above the limit return `REQUEST_VALIDATION_FAILED` before any request, stream, or socket resource is created.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

The third item is a Defjs `HttpResponse` wrapper when a response is available. HTTP options include `abort` or `timeout`, the additional `signal` alias, `context`, and upload/download progress observers.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

The third item is the validated startup-open snapshot. `stream.open` is a separate live getter that can change after reconnect attempts. SSE execution accepts cancellation and `HttpContext`; reconnect is a client option. The required `maxBufferSize` and `maxQueueSize` limits belong to each event-stream definition.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

The third item is the startup-connection snapshot. `session.connection` is a live getter and can describe a later physical connection attempt. WebSocket execution accepts cancellation plus per-execution `beforeConnect`, `heartbeat`, `protocols`, and `reconnect`. The required `maxIncomingQueueSize` and optional `maxOutgoingQueueSize` limits belong to each WebSocket definition. WebSocket execution does not accept `HttpContext`.

See [Errors](./errors.md) for exact failure branches and [HTTP](./http.md), [SSE](./sse.md), and [WebSocket](./web-socket.md) for transport lifecycle details.

## Client Scope

A browser application can keep a module-level client when its endpoint and closures contain only browser-safe, request-independent state.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Do not reuse a server client across requests when its options or interceptors capture authorization, cookies, tenant data, user data, or request context. Create that client inside the server request boundary.

A `Client` has no `dispose()` method. It does not track active requests, streams, or sessions. The code that starts work must cancel the HTTP request, close the SSE handle, or close the WebSocket session at the matching lifecycle boundary.

## Advanced Inspection

Use `isClient(value)` to test the runtime client marker.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` returns the live mutable configuration object held by the client. It is not a snapshot or a readonly view.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

Mutating this object changes later executions and bypasses normal option composition. Prefer it for diagnostics or carefully reviewed integration code. `getClientConfig` throws `TypeError` when its argument is not a valid client.

## Next

- [Commands](./commands.md) defines the values passed to `execute`.
- [Interceptors](./interceptors.md) explains filtering and onion order.
- [Context](./context.md) covers request-scoped metadata for HTTP and SSE.
