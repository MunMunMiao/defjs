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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
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
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
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

## ボディの読み方

`output` は 2xx ボディ用の単一の Struct、`error` はそれ以外すべて用の単一の Struct です。どちらかを宣言して `responseType` を書かなければ、表現は `json` が既定になります。明示する型は `json`、`text`、`blob`、`arraybuffer`。どちらも宣言しなければ `responseType` は許されず、ボディも読まれません。

順序:

1. `ok` が側を選びます。2xx は `output`、それ以外は `error`。両方ということはありません。
2. その側に宣言がない → ボディは読まれません。2xx は `data === undefined` で成功し、non-2xx は `data === undefined` の `HTTP_STATUS` になります。宣言しなかった側のボディが読めなかったことは、その事実ごと丸ごと無視されます。
3. メディアタイプはボディを読む**前**に確認します。不一致は `RES_MEDIA_TYPE_INVALID` で、パースもデコードもしません。
4. 表現を読みます。失敗は `RES_DECODE_FAILED`。
5. Struct が値をパースします。失敗は `RES_STRUCT_MISMATCH`。
6. 2xx → 結果と型付きの `response.body`。non-2xx → `HTTP_STATUS` 上の型付き `data`。

デコードは一度だけ、インターセプターチェーンの後に起きます。だからインターセプターが `makeResponse(...)` で作ったレスポンスも、回線から来たものとまったく同じに読まれます。

成功したレスポンスは `DecodedResponse<T>` です。`url`、`status`、`statusText`、`headers`、`ok`、それに型付きの `body`。何もデコードしていない場所では `HttpMeta` が返ります — 同じフィールドで `body` だけがありません。`ok` は `200 <= status < 300` だけを意味します。どちらもネイティブの `Response` ではありません。トランスポート失敗は fault なので、その代わりを務める status 0 のレスポンスは存在しません。

## 作業をキャンセルする {#cancel-the-work}

実行 options は `signal` に加えて `abort` か `timeout` のどちらかを取ります。**`abort` と `timeout` は排他です。** `signal` はどちらとも組み合わせられます。

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` は `1..2_147_483_647` の正の安全な整数である必要があります。認識されたキャンセル → `NET_ABORTED`。実行タイムアウト → `NET_TIMEOUT`。その他の Fetch/インターセプター失敗 → `NET_UNREACHABLE`。サーバーが書き込みを受け付けたあとのキャンセルは、書き込みがロールバックされたことの**証明にはなりません**。

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
