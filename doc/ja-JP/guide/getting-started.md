---
title: はじめに
description: Defjs をインストールし、型付き HTTP エンドポイントを定義して、アプリケーションから呼び出します。
---

# はじめに

Defjs を使うと、アプリケーションが呼び出す API 契約を一度定義し、型付き入力、実行時デコード、明示的なトランスポート結果とともに再利用できます。

## インストール

アプリケーションに Core パッケージを追加します。

```sh
pnpm add @defjs/core
```

別のパッケージマネージャーを使うプロジェクトでは、npm、Yarn、Bun の同等コマンドを使ってください。`@defjs/core` は ESM です。Node.js で実行する場合、現在のパッケージメタデータは Node 22 以降を要求します。

アプリケーションで必要なアダプターだけを追加します。

| 構成                     | パッケージ                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| React 18+                | `@defjs/core`、`@defjs/react`、`react`                                                    |
| Vue 3+                   | `@defjs/core`、`@defjs/vue`、`vue`                                                        |
| サーバー側 OpenTelemetry | `@defjs/core`、`@defjs/opentelemetry-server`、`@opentelemetry/api`、`@opentelemetry/core` |

::: tip インストールしたバージョンに合うドキュメントを使う
このページは、このドキュメント版の API を説明しています。アプリケーションに入っているバージョンを確認してください。export や option が異なる場合は、別バージョンの例を混ぜず、そのバージョンのドキュメントとリリースノートを使います。
:::

## 最初のリクエストを定義する

API が `GET /users/:id` を提供しているとします。ベース URL とレスポンス Struct は、自分のサービスの実際の契約に置き換えてください。

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

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` は**コマンドビルダー**を返します。`getUser(...)` を呼び出すと、エンドポイント定義と呼び出し入力を保持する**コマンド**が作られます。続いて `client.execute(...)` が、HTTP 用の 3 要素タプルを返します。

```typescript
;[error, result, response]
```

成功時は `error` が `null`、`result` がデコード済みの出力データ、`response` が Defjs の `HttpResponse` ラッパーです。失敗時は `result` が `undefined` になります。レスポンスを受信する前に失敗した場合は、レスポンスラッパーも `undefined` です。

### `as const` が必要な理由

配列形式の `output` は、ステータスリテラルを使って 2xx の成功ボディと 2xx 以外のエラーボディを分けます。`as const` は各ステータス値と、複数ステータスをまとめた配列を `readonly` リテラルのまま保持します。省略すると TypeScript が `number` や `number[]` に型を広げ、成功・エラー分岐の推論が弱くなることがあります。

オブジェクト形式の `output` も使えます。

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## アプリケーションに組み込む

エンドポイント定義は、サービス API を表すモジュールに置きます。そのコマンドビルダーをコンポーネント、route handler、job、store から再利用してください。endpoint、認証情報、インターセプター、ライフサイクルを管理する境界でクライアントを作ります。

- ブラウザーアプリケーションでは、通常 1 つのクライアントを共有できます。
- サーバーレンダリングでは、ヘッダー、Cookie、ユーザー、テナントがリクエストごとに変わる場合、リクエストスコープのクライアントを作ります。
- SSE や WebSocket を開くコードは、そのリソースの消費とクローズも担当します。

## 次に読む

- [Commands](/ja-JP/core/commands) — リクエストの自動マッピングとカスタムのスキーマに束縛されたプロジェクション
- [Errors](/ja-JP/core/errors) — 3 種類のトランスポートタプルと `RequestError` ユニオン
- [HTTP](/ja-JP/core/http) — URL 解決、リクエストボディ、出力デコード、キャンセル、XSRF
- [Examples](/ja-JP/guide/examples) — 各契約を組み合わせ、アプリケーション側で所有する実用例
