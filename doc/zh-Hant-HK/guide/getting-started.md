---
title: 'Getting Started: 一個 HTTP request'
description: Define GET /users/:id，用 local Fetch handle run 一次，之後再指去真實 API。
---

# Getting Started: 一個 HTTP request

你會 define `GET /users/:id`，用明確嘅 client 去 execute，同時 decode `200` 同 declared `404`。Local handler 令第一次 run 可以 offline；換真實 service 時 command 唔使改。

## Step 1 — Install

`@defjs/core` 係 ESM，要 Node.js 22+、Bun 或 Deno。Node 直接 run `.ts`，package.json 寫 `"type": "module"`。Browser 仍然要你自己嘅 bundler 同 Fetch。

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

## Step 2 — Define 個 request

Create `src/get-user.ts`。`struct.request(...)` 會將 path values 同 query、headers、body 分開。

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

`defineRequest(...)` return 嘅係 builder。Call `getUser(...)` 會 build 出你之後傳去 `client.execute(...)` 嘅 opaque command。

## Step 3 — 喺本機 execute

Wire 一個 client-local Fetch handle，等你可以唔使 network 都 run 到。Defjs 仍然會 validate input、build `Request`、按 status dispatch，再 parse body。

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

Run 佢：

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

試吓 missing user — 將 path id 改做 `8`，再 run 一次：

```txt
User not found
```

Success 時：`error` 係 `null`，`user` 係 `200` Struct output，`response` 係 `HttpResponse`。Declared `404`：`error.kind` 係 `'http'`，`error.status` 係 `404`，`error.data` 有 typed `NotFound`。失敗時 tuple 第二項係 `undefined`。

## Step 4 — 指去真實 API

Service 已經實作 `GET /v1/users/:id` 同嗰啲 bodies 之後，掉走 `withHTTPHandle(...)`，再 set 真實 base URL。

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

同一個 command。唔同 client。

## Result 唔同時

- Bad input / invalid build / 衝突嘅 cancel options → `REQUEST_VALIDATION_FAILED`
- Declared non-2xx → `HTTP_STATUS`，連 typed `error.data`
- Declared body decode 唔到 → `RESPONSE_VALIDATION_FAILED`
- Status 冇 declare → `UNDECLARED_STATUS`（喺 body decode 之前）
- Fetch fail / cancel / timeout → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` 一定要係 `1..2_147_483_647` 入面嘅 positive safe integer。唔好同時傳 `abort` 同 `timeout`；`signal` 可以同其中一個一齊用。Cancellation 淨係話你 caller 見到咩 — 唔證明 server write 有冇 commit。

## Next recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
- [Consume an SSE stream](../recipes/consume-sse.md)
- [Open a WebSocket session](../recipes/websocket-session.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)
