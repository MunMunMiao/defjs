---
layout: home

hero:
  name: Defjs
  text: Typed commands for HTTP, SSE, and WebSocket
  tagline: Define wire shapes with Structs, create explicit clients, and keep each transport's result and lifecycle semantics visible.
  actions:
    - theme: brand
      text: Get Started
      link: /guide/getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/defjs/defjs

features:
  - title: Endpoint contracts
    details: Separate endpoint definitions, command builders, and command values. Structs decode caller input and transport data at runtime.
  - title: Transport-specific results
    details: HTTP, SSE, and WebSocket all use error-first three-item tuples, with a response wrapper, startup-open snapshot, or startup-connection snapshot in the third position.
  - title: Interceptor chains
    details: Register HTTP, SSE, and WebSocket interceptors on a client. Each transport filters its own interceptors and runs them in onion order.
  - title: Explicit lifecycle
    details: SSE can retry network and read failures. WebSocket reconnect is opt-in. Applications still own iteration, cancellation, and terminal close.
  - title: Runtime decoding
    details: Decode caller input, responses, stream events, and WebSocket messages with the same Struct contracts that drive TypeScript inference.
  - title: Application integrations
    details: Share clients through Vue or React, and add outbound OpenTelemetry instrumentation in server-side services.
---

## Build a Typed API Client

Start by describing the HTTP, SSE, or WebSocket contract your application calls. Defjs turns that definition into a command builder, validates data at runtime, and keeps the transport result explicit.

The central HTTP flow is small: create a client for your API, define an endpoint, call its command builder, then execute the command.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

Point the client at the service used by your application, and make the Structs match that service's actual response contract. Your application still owns credentials, UI state, retries, cancellation, and resource cleanup.

## Read Next

- [Getting Started](/guide/getting-started) installs the package and takes your application through its first typed request.
- [Client](/core/client) explains option composition and the three `execute` overloads.
- [Commands](/core/commands) defines endpoint definitions, command builders, commands, and schema-bound projections.
- [HTTP](/core/http), [SSE](/core/sse), and [WebSocket](/core/web-socket) document transport behavior and lifecycle ownership.
- [Vue](/plugins/vue), [React](/plugins/react), and [OpenTelemetry Server](/plugins/opentelemetry-server) show how to connect Defjs to your application framework and telemetry setup.
