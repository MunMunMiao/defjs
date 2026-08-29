---
title: '開始使用：一個 HTTP 請求'
description: 定義 GET /users/:id，對本機 Fetch handle 跑一次，再指向真實 API。
---

# 開始使用：一個 HTTP 請求

你會定義 `GET /users/:id`，透過明確的 client 執行，並解碼 `200` 與已宣告的 `404`。本機 handler 讓第一次執行離線就能跑；換成真實服務時，command 不用改。

## Step 1 — 安裝

`@defjs/core` 是 ESM，需要 Node.js 22+、Bun 或 Deno。Node 直接跑 `.ts`，package.json 寫 `"type": "module"`。瀏覽器環境仍要有 bundler 與 Fetch。

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

## Step 2 — 定義請求

建立 `src/get-user.ts`。`struct.request(...)` 把 path 值跟 query、headers、body 分開。

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

`defineRequest(...)` 回傳 builder。呼叫 `getUser(...)` 會建立要傳給 `client.execute(...)` 的不透明 command。

## Step 3 — 本機執行

接上 client 本機的 Fetch handle，就能在沒有網路的情況下跑。Defjs 仍會驗證 input、建立 `Request`、依狀態碼分派，並剖析 body。

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

執行：

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

試一個不存在的使用者 — 把 path id 改成 `8` 再跑一次：

```txt
User not found
```

成功時：`error` 是 `null`，`user` 是 `200` Struct 輸出，`response` 是 `HttpResponse`。已宣告的 `404`：`error.kind` 是 `'http'`，`error.status` 是 `404`，`error.data` 是型別化的 `NotFound`。失敗時第二項是 `undefined`。

## Step 4 — 指向真實 API

服務有實作 `GET /v1/users/:id` 且 body 對得上時，拿掉 `withHTTPHandle(...)`，設好真實的 base URL。

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

同一個 command。換的是 client。

## 結果不一樣時

- 壞 input / 無效 build / 互相衝突的取消選項 → `REQUEST_VALIDATION_FAILED`
- 已宣告的非 2xx → `HTTP_STATUS`，帶型別化的 `error.data`
- 已宣告但解碼失敗的 body → `RESPONSE_VALIDATION_FAILED`
- 沒宣告的狀態碼 → `UNDECLARED_STATUS`（在 body 解碼之前）
- Fetch 失敗 / 取消 / 逾時 → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` 必須是 `1..2_147_483_647` 的正 safe integer。不要同時傳 `abort` 跟 `timeout`；`signal` 可以跟其中一個搭配。取消只告訴你呼叫端看到什麼 — 不代表伺服器寫入有沒有提交。

## 接下來的 recipes

- [已宣告 404 的 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [取消 HTTP 呼叫](../recipes/cancel-http.md)
- [消費 SSE 串流](../recipes/consume-sse.md)
- [開啟 WebSocket session](../recipes/websocket-session.md)
- [用本機 Fetch handle 測試](../recipes/test-with-handle.md)
