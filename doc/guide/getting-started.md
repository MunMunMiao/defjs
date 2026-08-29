---
title: 'Getting Started: one HTTP request'
description: Define GET /users/:id, run it against a local Fetch handle, then point it at a real API.
---

# Getting Started: one HTTP request

You’ll define `GET /users/:id`, execute it through an explicit client, and decode both `200` and declared `404`. The local handler keeps the first run offline; the command stays the same when you swap in a real service.

## Step 1 — Install

`@defjs/core` is ESM and wants Node.js 22+, Bun, or Deno. Node runs the `.ts` file directly — keep `"type": "module"` in package.json. In a browser you still need your bundler and Fetch.

::: tabs
== bun

```sh
bun add @defjs/core
```

== npm

```sh
npm install @defjs/core
```

== pnpm

```sh
pnpm add @defjs/core
```

== yarn

```sh
yarn add @defjs/core
```

== deno

```sh
deno add npm:@defjs/core
```

:::

## Step 2 — Define the request

Create `src/get-user.ts`. `struct.request(...)` keeps path values separate from query, headers, and body.

```ts get-user.ts
import { defineRequest, struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const command = getUser({ path: { id: 7 } })
void command
```

Prefer the `output` array for Getting Started and most recipes. Use a status→body map when you extract declarations into variables. A multi-status group like `status: [400, 409]` must stay in the array form.

`defineRequest(...)` returns the builder. Calling `getUser(...)` builds the opaque command you’ll pass to `client.execute(...)`.

## Step 3 — Execute it locally

Wire a client-local Fetch handle so you can run without a network. Defjs still validates input, builds the `Request`, dispatches by status, and parses the body.

```ts get-user.ts
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const handle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const client = createClient(withEndpoint('https://api.example.test'), withHTTPHandle(handle))

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }), {
  timeout: 5_000,
})

if (error) {
  if (error.kind === 'http' && error.status === 404) {
    console.log(error.data.message)
  } else {
    console.error(error.kind, error.code)
  }
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

Run it:

::: tabs
== bun

```sh
bun src/get-user.ts
```

== npm

```sh
node src/get-user.ts
```

== pnpm

```sh
node src/get-user.ts
```

== yarn

```sh
node src/get-user.ts
```

== deno

```sh
deno run src/get-user.ts
```

:::

```txt
Loaded Ada from 200
```

Try a missing user — change the path id to `8` and run again:

```txt
User not found
```

On success: `error` is `null`, `user` is the `200` Struct output, `response` is an `HttpResponse`. On a declared `404`: `error.kind` is `'http'`, `error.status` is `404`, and `error.data` is typed `NotFound`. The second tuple item is `undefined` on failure.

## Step 4 — Point at a real API

Drop `withHTTPHandle(...)` and set the real base URL when the service implements `GET /v1/users/:id` with those bodies.

```ts
import { createClient, withEndpoint, withHTTPHandle } from '@defjs/core'

const localHandle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const localClient = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(localHandle))
const realClient = createClient(withEndpoint('https://api.example.com/v1'))
void localClient
void realClient
```

Same command. Different client.

## When the result differs

- Bad input / invalid build / conflicting cancel options → `REQUEST_VALIDATION_FAILED`
- Declared non-2xx → `HTTP_STATUS` with typed `error.data`
- Declared body that won’t decode → `RESPONSE_VALIDATION_FAILED`
- Status with no declaration → `UNDECLARED_STATUS` (`kind: 'definition'`; `error.response` may still be present, body is not decoded as success)
- Fetch fail / cancel / timeout → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` must be a positive safe integer in `1..2_147_483_647`. Valid cancel shapes: `{ timeout }`, `{ abort }`, or `{ signal, timeout }` / `{ signal, abort }`. `{ abort, timeout }` together is invalid. Cancellation tells you what the caller saw — not whether a server write committed.

## Next recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
- [Consume an SSE stream](../recipes/consume-sse.md)
- [Open a WebSocket session](../recipes/websocket-session.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)
