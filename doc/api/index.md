---
title: API Reference
description: Handwritten lookup for workspace packages — functions, options, and types you import.
---

# API Reference

This is the lookup for workspace packages. Signatures are the contract; guides and recipes explain when to use them.

## Packages

| Package                                                    | What you look up                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [`@defjs/core`](./client.md)                               | `createClient`, `defineRequest`, `struct`, HTTP / SSE / WebSocket |
| [`@defjs/vue`](./vue.md)                                   | `createClientPlugin`, `injectClient`                              |
| [`@defjs/react`](./react.md)                               | `ClientProvider`, `useClient`                                     |
| [`@defjs/opentelemetry-server`](./opentelemetry-server.md) | `withOpenTelemetryServer`                                         |

## @defjs/core

| Page                              | What you look up                                                 |
| --------------------------------- | ---------------------------------------------------------------- |
| [Client](./client.md)             | `createClient`, `with*` options, `Client`                        |
| [HTTP](./http.md)                 | `defineRequest`, execute options, `HttpRequest` / `HttpResponse` |
| [Struct](./struct.md)             | `struct.*`, `Infer`, `StructError`                               |
| [Errors](./errors.md)             | `RequestError` variants and factories                            |
| [Interceptors](./interceptors.md) | HTTP / SSE / WebSocket interceptor helpers                       |
| [SSE](./sse.md)                   | `defineEventStream`, stream handle                               |
| [WebSocket](./web-socket.md)      | `defineWebSocket`, session                                       |

## Related

- [Getting Started](/guide/getting-started)
- [GET with a declared 404](/recipes/get-declared-404)
