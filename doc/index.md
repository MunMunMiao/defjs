---
title: Defjs
description: Typed HTTP, SSE, and WebSocket commands with an explicit client and error-first results.
---

# Defjs

Define an endpoint, build an opaque command, and execute it. Same shape for HTTP, SSE, and WebSocket.

```ts get-health.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

const [error, result, response] = await client.execute(getHealth())
if (!error) console.log(result.ok, response.status)
```

Defjs does not cache results, retry for you, or close streams when you forget. You own cancellation and cleanup.

## Pick a transport

| You need                           | Start with                        | Successful result                           |
| ---------------------------------- | --------------------------------- | ------------------------------------------- |
| Request + status-specific response | [HTTP](./core/http.md)            | Decoded data + `HttpResponse`               |
| Long-lived server event feed       | [SSE](./core/sse.md)              | One stream + startup `open` snapshot        |
| Bidirectional session              | [WebSocket](./core/web-socket.md) | One session + startup `connection` snapshot |

New here? Do [Getting Started](./guide/getting-started.md), then grab a [recipe](./recipes/get-declared-404.md). Want the “why”? Read [Design Decisions](./guide/design-decisions.md) after you’ve run something.

## Pick a package

| Package                       | When                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `@defjs/core`                 | `createClient` (HTTP + SSE + WebSocket)                                                |
| `@defjs/react`                | `ClientProvider` / `useClient` — see [React](./plugins/react.md)                       |
| `@defjs/vue`                  | Plugin + `injectClient` — see [Vue](./plugins/vue.md)                                  |
| `@defjs/opentelemetry-server` | Outbound spans/metrics — see [OpenTelemetry Server](./plugins/opentelemetry-server.md) |

## Result shapes

All three transports return an error-first three-item tuple. Positions match; meanings don’t:

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]`
- WebSocket → `[error, session, connection]`

On startup failure the second item is `undefined`. The third item exists only when that transport produced a response or snapshot first. See [Errors](./core/errors.md).

## Ownership in one breath

Abort HTTP when it’s stale. Close SSE and `await stream.closed`. Close WebSocket and `await session.closed`. On a server, create the client inside the request boundary when options capture cookies, auth, or tenant data. Redact URLs, headers, and bodies before you log them.

## Related recipes

- [GET with a declared 404](./recipes/get-declared-404.md)
- [POST JSON](./recipes/post-json.md)
- [Cancel an HTTP call](./recipes/cancel-http.md)
- [Consume an SSE stream](./recipes/consume-sse.md)
- [Open a WebSocket session](./recipes/websocket-session.md)
- [Test with a local Fetch handle](./recipes/test-with-handle.md)
