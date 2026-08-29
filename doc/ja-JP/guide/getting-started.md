---
title: 'はじめに: 1 つの HTTP リクエスト'
description: GET /users/:id を定義し、ローカル Fetch ハンドルで動かし、そのあと実 API に向けます。
---

# はじめに: 1 つの HTTP リクエスト

`GET /users/:id` を定義し、明示的なクライアント経由で実行して、`200` と宣言済みの `404` の両方をデコードします。ローカルハンドラで最初の実行はオフラインのままにしておけます。実サービスに差し替えてもコマンドは同じです。

## Step 1 — インストール

`@defjs/core` は ESM で、Node.js 22+、Bun、Deno が必要です。Node は `.ts` をそのまま実行します。package.json に `"type": "module"` を書いてください。ブラウザーでもバンドラーと Fetch は要ります。

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

## Step 2 — リクエストを定義する

`src/get-user.ts` を作ります。`struct.request(...)` は path の値を query・headers・body から分けておきます。

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

`defineRequest(...)` はビルダーを返します。`getUser(...)` を呼ぶと、`client.execute(...)` に渡す不透明なコマンドができます。

## Step 3 — ローカルで実行する

クライアントローカルの Fetch ハンドルを繋ぎ、ネットワークなしで動かします。Defjs はそれでも入力検証、`Request` の組み立て、status による振り分け、ボディのパースを行います。

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

実行します。

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

いないユーザーも試してみましょう — path の id を `8` にしてもう一度実行します。

```txt
User not found
```

成功時は `error` が `null`、`user` が `200` の Struct 出力、`response` が `HttpResponse` です。宣言済み `404` では `error.kind` が `'http'`、`error.status` が `404`、`error.data` は型付きの `NotFound` です。失敗時、タプルの 2 番目は `undefined` です。

## Step 4 — 実 API に向ける

サービスが `GET /v1/users/:id` とそのボディを実装しているなら、`withHTTPHandle(...)` を外して本当のベース URL を設定します。

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

同じコマンド。違うクライアント。

## 結果が違うとき

- 悪い入力 / 無効な build / 衝突するキャンセル options → `REQUEST_VALIDATION_FAILED`
- 宣言済みの non-2xx → 型付き `error.data` 付きの `HTTP_STATUS`
- 宣言済みボディがデコードできない → `RESPONSE_VALIDATION_FAILED`
- 宣言のない status → `UNDECLARED_STATUS`（ボディデコードの前）
- Fetch 失敗 / キャンセル / タイムアウト → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` は `1..2_147_483_647` の正の安全な整数である必要があります。`abort` と `timeout` を同時に渡さないでください。`signal` はどちらとも組み合わせられます。キャンセルは呼び出し側が何を観測したかを伝えます — サーバー側の書き込みがコミットしたかどうかではありません。

## 次のレシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP 呼び出しをキャンセルする](../recipes/cancel-http.md)
- [SSE ストリームを消費する](../recipes/consume-sse.md)
- [WebSocket セッションを開く](../recipes/websocket-session.md)
- [ローカル Fetch ハンドルでテストする](../recipes/test-with-handle.md)
