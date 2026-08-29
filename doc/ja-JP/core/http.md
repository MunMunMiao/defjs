---
title: HTTP
description: リクエストを定義して実行し、status で分岐し、signal または timeout でキャンセルします。
---

# HTTP

定義 → 実行 → タプルで分岐 → 画面が消えたらキャンセル。それが HTTP のループ全体です。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## URL を解決する

`withEndpoint(...)` には有効な絶対 URL が必要です。エンドポイントの pathname はディレクトリとして残り、query と hash はコマンド解決の前に捨てられます。

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

path のプレースホルダは生のスカラーで、ちょうど一度エンコードされます。空の値と `.` / `..` は拒否されます。1 つのプレースホルダ内のスラッシュ、`?`、`#`、`%`、空白、Unicode は、1 つのエンコード済みセグメントのままです — 事前エンコードしないでください。

定義の path に `?` や `#` は入れられず、絶対やプロトコル相対にもできません。デフォルトの query エンコーダはスカラーとスカラーの配列を受け付けます。入れ子/複雑な query 値は `withQueryParamsSerializer(...)` が要り、なければ組み立てに失敗します。

## 入力をエンコードする

`struct.request(...)` は path、query、headers、body を分けておきます。ボディラッパーがコーデックと content type を選びます。

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

エイリアスは送信ワイヤのキーだけ書き換えます。パース済みの値とコマンド入力は論理名のままです。

| ラッパー                   | 実行時ボディ      | デフォルト content type                                                   |
| -------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `struct.json(inner)`       | JSON 文字列       | `application/json`                                                        |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                                |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`                         |
| `struct.formData(shape)`   | `FormData`        | プラットフォームの multipart boundary。Defjs は古い `Content-Type` を消す |
| `struct.blob()`            | `Blob`            | Blob の type、または `application/octet-stream`                           |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                                |

カスタム `build` も同じ location/codec の setter を公開します。最後のボディ書き込みが勝ちます（値 + content-type メタデータ）。高レベルコマンドは任意オブジェクトをボディに変えません — ラッパーを宣言するか、対応する setter を使ってください。

## status で振り分ける

`output` は status → Struct のマップ、または `{ status, body }[]` です。`output` があり `responseType` がないとき、表現のデフォルトは `json` です。明示タイプは `json`、`text`、`blob`、`arraybuffer`。

処理順:

1. status `0` → トランスポートエラー。
2. `output` なし → 2xx は `data === undefined` で成功。non-2xx → `error.data === undefined` の `HTTP_STATUS`。ボディはデコードされない。
3. `output` ありなら、厳密に宣言された status がその Struct を選ぶ。配列形では、後の一致が先のグループ一致を上書き。
4. 未宣言 status → ボディデコードの**前**に `UNDECLARED_STATUS`。
5. 表現失敗 → `RESPONSE_VALIDATION_FAILED`。部分データなし。
6. デコード済みの宣言 2xx → 結果。デコード済みの宣言 non-2xx → `HTTP_STATUS` 上の型付き `error.data`。

`HttpResponse` は `url`、`status`、`statusText`、`headers`、`body`、`error`、`ok` を持ちます。`ok` は `200 <= status < 300` だけを意味します。Defjs の値であり、ネイティブ `Response` ではありません。`output` なしでは `responseType` は使えません。

## 作業をキャンセルする

実行 options は `signal` に加えて `abort` か `timeout` のどちらかを取ります。**`abort` と `timeout` は排他です。** `signal` はどちらとも組み合わせられます。

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` は `1..2_147_483_647` の正の安全な整数である必要があります。認識されたキャンセル → `ABORTED`。実行タイムアウト → `TIMEOUT`。その他の Fetch/インターセプター失敗 → `NETWORK_ERROR`。サーバーが書き込みを受け付けたあとのキャンセルは、書き込みがロールバックされたことの**証明にはなりません**。

## 資格情報と XSRF

`withCredentials(true)` は HTTP と SSE で Fetch `credentials: 'include'` を立てます。`Authorization` は作らず、WebSocket 認証も設定しません。`false` は credentials を未指定のままにします。

`withXSRF(...)` は HTTP 専用です。デフォルトは `cookieName: 'XSRF-TOKEN'`、`headerName: 'X-XSRF-TOKEN'`。ヘッダー注入は非セーフメソッドのみ、呼び出し側がすでに立てていないときのみ、同一オリジンのブラウザーリクエストのみです。`GET`、`HEAD`、`OPTIONS`、`TRACE` はスキップします。ブラウザー外では、注入が要るなら同期のリクエストスコープ `tokenProvider` を渡してください。

資格情報、XSRF トークン、query 文字列は日常ログに出さないでください。query パラメータを一般的な資格情報チャネルにしないでください。

## 進捗と Fetch 境界

`onDownloadProgress` は、明示的なレスポンス表現を読んでいるあいだ動きます。`lengthComputable` は正の `Content-Length` があるときだけ true です。`responseType` なし → ボディデコードなし → ボディ読み取り進捗なし。

`onUploadProgress` は、Fetch が読む `ReadableStream<Uint8Array>` リクエストボディを監視します。通常のボディラッパーは生ストリーム setter を公開しません — アップロード進捗は主に低レベル組み立て向けです。

`fetchHandler(httpRequest, fetchImpl?)` はより低レベルの Fetch 境界です。ネイティブ `Request` を作り、Fetch を呼び、表現を読み、`HttpResponse` を返します。コマンド入力の検証、`output` の振り分け、インターセプター実行は**しません**。注入トランスポートのテストには便利ですが、`client.execute` の代わりにはなりません。

## リプレイの限界

Defjs は HTTP を**自動リトライしません**。読み取りのリトライでも、レビュー済みのタイムアウト/ネットワーク/重複方針が要ります。ミューテーションのリトライには、再生可能なバイト、サーバー側の支持、認証スコープ + リクエストバイトに束縛された冪等キー、受信側の重複方針が要ります。

クライアント/コマンド/Fetch 境界は、失敗した書き込みがコミットしたかを知りません。リプレイ判断はアプリかレビュー済みインターセプターに置いてください。インターセプターは低レベルリクエストをショートサーキットしたり差し替えたりできますが、最終の status とボディはコマンドの契約を満たす必要があります。

## 関連レシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP 呼び出しをキャンセルする](../recipes/cancel-http.md)
- [ローカル Fetch ハンドルでテストする](../recipes/test-with-handle.md)
