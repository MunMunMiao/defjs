---
title: HTTP
description: HTTP URL とボディの構築、レスポンス Struct の選択、キャンセル、認証情報、XSRF、Fetch 境界を説明します。
---

# HTTP

`defineRequest(...)` は HTTP コマンドビルダーを作ります。定義と入力プロジェクションは [Commands](/ja-JP/core/commands) を参照してください。このページでは HTTP の通信形式とライフサイクルを扱います。

## URL の構築

`withEndpoint(...)` には絶対ベース URL が必要です。そのパスはディレクトリとして保持されます。

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

ベースパスの末尾にスラッシュがなければ追加されます。ベースエンドポイントに含まれるクエリとハッシュは破棄されます。

エンドポイントの `path` は相対的な契約パスです。先頭のスラッシュは受け付けますが、解決前に取り除くためベースディレクトリを置き換えません。ランタイムは次の値を拒否します。

- 絶対 URL とプロトコル相対 URL
- `?` を含むパス
- `#` を含むパス

パスプレースホルダーには `:name` を使います。

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

プレースホルダーには未加工の値を渡します。Defjs は各スカラーを文字列化し、空の値と値全体が `.` または `..` の場合を拒否してから、置換前に `encodeURIComponent` を正確に 1 回適用します。`/`、`?`、`#`、`%`、空白、Unicode は 1 つのパスセグメント内に保たれます。値を事前にエンコードしないでください。`%` は未加工の入力として扱われ、`%25` にエンコードされます。

## リクエストのエンコーディング

通信形式へ直接割り当てる場合は `struct.request(...)` を使います。

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

ボディ Struct がエンコーディングとデフォルトの Content-Type を決めます。

| ボディ Struct              | 通信上のボディ        | デフォルトの `Content-Type`                        |
| -------------------------- | --------------------- | -------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                 |
| `struct.text()`            | 文字列                | `text/plain;charset=UTF-8`                         |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8`  |
| `struct.formData(shape)`   | `FormData`            | boundary を含めてプラットフォームが設定            |
| `struct.blob()`            | `Blob`                | Blob タイプ、未設定なら `application/octet-stream` |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                         |

カスタム `build` では、対応する HTTP ビルダーメソッドを使えます。setter メソッドはリクエストの該当部分を置き換えます。`addHeaders`、`addFormData`、`addFormUrlEncoded` は現在値へ追加します。すべての値はスキーマに束縛されたプロジェクションに由来する必要があります。

### クエリ値

デフォルトのクエリエンコーダーが受け付けるのは、フラットなスカラー値とスカラー配列です。入れ子のオブジェクトはリクエスト構築中に失敗します。

`withQueryParamsSerializer((params, rawParams) => string)` は、受け付け済みのフラットな値をどう文字列化するか変更できます。`URLSearchParams` のビューと、エンコード済みのフラットなレコードを受け取ります。入れ子のクエリオブジェクトを有効にはできません。シリアライザーが呼ばれる前に拒否されます。

エイリアスは送信時のクエリ、パス、ヘッダーのキーになります。呼び出し側は引き続き Struct の論理フィールド名を使います。

## ステータスと出力デコード

`output` はステータスコードをレスポンス Struct に対応させます。

```typescript
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
```

ランタイムはステータスが完全一致する Struct を選びます。`output` が宣言されている場合、未対応のステータスはすべて `UNDECLARED_STATUS` になります。宣言済み 2xx ボディが成功データのユニオン、宣言済みの 2xx 以外のボディが `error.data` です。

`response.ok` が示すのは `status >= 200 && status < 300` だけです。出力デコード、アプリケーション検証、認可の成功を意味しません。

`output` があり `responseType` を省略した場合、レスポンスはデフォルトで `json` としてパースされます。明示できる形式は `json`、`text`、`blob`、`arraybuffer` です。その後、選択された Struct が構造デコードを行います。`output` を省略する場合は `responseType` を指定できず、結果データは `undefined` で、返されるレスポンスラッパーは `body: null` になります。ランタイムはレスポンスボディを読み込んだりデコードしたりせず、best-effort でキャンセルします。

コマンド結果の分類には固定の優先順位があります。ステータス 0 の transport failure → `output` なし → ステータスの完全一致または `UNDECLARED_STATUS` → `response.error` → Struct デコードの順です。そのため、ボディ表現エラーは `output` が宣言されている場合にのみ発生します。Fetch がそのエラーを記録しても、未宣言ステータスの分岐が引き続き優先されます。

### 表現エラー

宣言済み output とステータスが完全一致した場合に JSON または別のボディ codec が失敗すると、Fetch は元の例外を `HttpResponse.error` に保持します。コマンド実行は出力 Struct を適用する前に停止し、`[RESPONSE_VALIDATION_FAILED, undefined, response]` を返します。元の例外は `cause` に残り、型付きの `error.data` は生成されません。

通常の 2xx 以外のレスポンスは `response.error` を設定しません。ステータスは `status` と `ok` で表します。2xx 以外のステータスとボディが宣言済みでボディが有効なら Struct がデコードされ、結果の `HTTP_STATUS` エラーは型付きボディを `error.data` に保持します。

## HTTP の実行結果

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

成功時の `response` は Defjs の `HttpResponse` ラッパーで、ボディは `data` と一致します。失敗時にレスポンスが存在するかは、処理がどこまで進んだかで変わります。正確な分類は [Errors](/ja-JP/core/errors) を参照してください。

## キャンセルとタイムアウト

HTTP 実行は `abort`、`signal`、`timeout` を受け取ります。

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` はクライアント内部の signal、および正のタイムアウトとマージされます。別フィールドの `abort` は、現在の API に残っている代替キャンセル signal です。`abort` と `timeout` を同時に渡すと `REQUEST_VALIDATION_FAILED` になります。`signal` はどちらとも組み合わせられます。

HTTP、SSE、WebSocket 実行の `timeout` は `1..2_147_483_647` の範囲にある正の安全な整数でなければならず、`0`、負数、小数、`NaN`、`Infinity`、上限を超える値を指定すると、request、stream、socket のリソースを作成する前に `REQUEST_VALIDATION_FAILED` になります。

認識されたキャンセルは `ABORTED` になります。`AbortSignal.timeout(...)` の理由または実行タイムアウトは `TIMEOUT`、その他の Fetch 失敗は `NETWORK_ERROR` です。

## 認証情報と XSRF

`withCredentials(true)` は HTTP と SSE で Fetch の `credentials: 'include'` を設定します。`false` の場合は Fetch オプションを未指定のままにし、`omit` を強制しません。この設定は `Authorization` ヘッダーを追加せず、WebSocket 認証も設定しません。

`withXSRF(...)` は HTTP リクエストにだけ適用されます。デフォルト値は次のとおりです。

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

注入を試みるメソッドは `POST`、`PUT`、`PATCH`、`DELETE` だけです。設定対象のヘッダーがすでにあれば維持します。ブラウザーでの Cookie 参照は同一オリジンのリクエストに限られます。ブラウザー以外では同期 `tokenProvider` を指定してください。Cookie の参照より優先されます。

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

サーバーのトークンプロバイダーはリクエストスコープに保ってください。`withCredentials(true)` を設定しても、クロスオリジンのブラウザー Cookie を JavaScript から読めるようにはなりません。また、クロスオリジンへ XSRF ヘッダーを注入することもありません。

## 進捗オブザーバー

`onDownloadProgress` は Fetch レスポンスボディの読み取り中にバイト数を通知します。`lengthComputable` が `true` になるのは、正の `Content-Length` がある場合だけです。

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` が観測するのは、`ReadableStream<Uint8Array>` のリクエストボディだけです。現在の高レベルコマンドビルダーには Blob と ArrayBuffer 用のプロジェクション setter はありますが、生のストリームを設定する setter はありません。そのため、このオプションが必要とするストリームを標準の `defineRequest` 例から渡すことはできません。構築したストリームを、動作する高レベルコマンドボディの例として示さないでください。

進捗コールバックはトランスポートの読み書きの途中で実行されます。例外を送出しない軽い処理にしてください。

## 低レベル Fetch 境界

`fetchHandler(httpRequest, fetchImpl?)` はエクスポートされています。Defjs の `HttpRequest` をネイティブ `Request` へ変換し、Fetch を呼び、選択されたレスポンス表現をパースして、Defjs の `HttpResponse` ラッパーを返します。Fetch 失敗はステータス 0 のラッパーになります。

`fetchHandler` を直接呼ぶと、次の処理を迂回します。

- コマンド入力デコードとリクエストプロジェクション
- HTTP 出力のステータスディスパッチと Struct デコード
- クライアントインターセプターの連携処理
- 高レベルの `RequestError` タプルへの変換

これはエクスポートされた低レベル境界であり、推奨するコマンドワークフローではありません。長期的な安定性の方針は、ここでは確定していません。

## 次に読む

- [Interceptors](/ja-JP/core/interceptors) — リクエストの複製、ショートサーキット、再試行
- [Errors](/ja-JP/core/errors) — HTTP ステータス、トランスポート、定義の失敗
- [Struct](/ja-JP/core/struct) — 厳密な構造デコード
