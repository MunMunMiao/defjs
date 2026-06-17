---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# Client

`@defjs/core` uses an **explicit client** design. Every request is executed through a `Client` instance you explicitly create. This makes testing, multi-environment configuration, and dependency tracking straightforward.

## Creating a Client

Use `createClient` with one or more configuration functions.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Configuration functions compose. Later functions override earlier ones for the same key.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### Configuration Options

| Function                            | Description                                                       |
| ----------------------------------- | ----------------------------------------------------------------- |
| `withEndpoint(url)`                 | Base API address.                                                 |
| `withHTTPHandle(fetch)`             | Custom `fetch` implementation for HTTP.                           |
| `withSSEHandle(fetch)`              | Custom `fetch` implementation for SSE.                            |
| `withWebSocketHandle(WebSocket)`    | Custom `WebSocket` constructor (e.g., for Node).                  |
| `withInterceptors(...interceptors)` | Register transport-layer interceptors. Auto-dispatched by `kind`. |
| `withQueryParamsSerializer(fn)`     | Custom query parameter serialization.                             |
| `withCredentials(boolean)`          | Whether to include cross-origin credentials.                      |
| `withXSRF(options)`                 | XSRF token read and inject behavior.                              |
| `withSSEOptions(options)`           | SSE reconnect, queue, invalid event handling, etc.                |
| `withWebSocketOptions(options)`     | WebSocket heartbeat, reconnect, queue, subprotocols, etc.         |

For SSE and WebSocket-specific configuration, see [SSE](/core/sse) and [WebSocket](/core/web-socket).

## Executing Commands

`Client.execute` is an overloaded method that dispatches to the correct transport layer based on the `Command` type.

### HTTP Requests

Pass a command built with `defineRequest`. Returns a triplet:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    '200': struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user, response] = await client.execute(getUser())

  if (error) {
    console.error(error.code, error.message)
  } else {
    console.log(user.id, user.name, response.status)
  }
}
```

Return type:

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE Event Streams

Pass a command built with `defineEventStream`. Returns a stream handle and open info.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

Return type:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket Connections

Pass a command built with `defineWebSocket`. Returns a session object.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

Return type:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## Helper Functions

### `isClient`

Check if a value is a valid `Client` instance.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

Extract the internal configuration object for debugging or building higher-level abstractions.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

If the value is not a `Client` instance, `getClientConfig` throws a `TypeError`.

## Explicit Client Design

Every client in Defjs is created explicitly. You create a `Client` with `createClient` and pass it to where it is needed.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Benefits of explicit creation:

- **Test-friendly**: Pass different `Client` instances directly to tests without needing to reset or mock any state.
- **Multi-environment coexistence**: Multiple clients can run in parallel in the same process (e.g., internal API + public API) without interference.
- **Dependency transparency**: Callers must explicitly hold a `Client`, making dependencies visible for static analysis and code review.

If you need a shared client in your application, export it from a module:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Then import and use in business code:

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## What's Next

- [HTTP Requests →](/core/http) — `defineRequest` and output patterns
- [SSE →](/core/sse) — SSE definition, reconnect, and event queues
- [WebSocket →](/core/web-socket) — WebSocket definition, heartbeat, and reconnect strategies
- [Interceptors →](/core/interceptors) — Interceptor types and onion-chain mechanics
