---
title: Client
description: 明示的にクライアントを作成し、オプションを合成してトランスポート別のコマンドを実行し、現在の設定を参照します。
---

# Client

`Client` は明示的に作成し、コマンドを実行するコードへ渡します。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

クライアントは設定を保持し、HTTP、SSE、WebSocket のコマンドを振り分けます。グローバルレジストリや、バックグラウンドで動くライフサイクル管理機能は持ちません。

## オプションの合成

オプションは左から右へ実行されます。

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

最終的なエンドポイントは `https://api.example.com` です。インターセプターの順序は `operationLogger`、`authInterceptor`、`retryInterceptor` になります。

合成規則は 3 つです。

1. setter ヘルパーは値を置き換えます。`withEndpoint`、各トランスポートハンドル、クエリシリアライザー、認証情報、XSRF 設定、個別の SSE/WebSocket 設定が該当します。
2. `withInterceptors(...items)` は末尾へ追加します。複数回呼ぶと、登録した順序が保たれます。
3. `withSSEOptions(...)` と `withWebSocketOptions(...)` は、値が定義されている最上位フィールドごとに浅く置き換えます。内側の再接続、ハートビート、キューオブジェクトを再帰的にマージすることはありません。

次の例では、2 番目の再接続オブジェクトが 1 番目を丸ごと置き換えます。`attempts: 5` は残りません。

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

複数項目をまとめて設定するオプションヘルパーは、値が `undefined` のプロパティを無視します。それ以外に指定した最上位プロパティは、現在値を丸ごと置き換えます。

### Core オプション

| オプション                       | 動作                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------- |
| `withEndpoint(url)`              | 全トランスポートが使う絶対ベースエンドポイントを設定します。                 |
| `withHTTPHandle(fetch)`          | HTTP 用の Fetch 実装を置き換えます。                                         |
| `withSSEHandle(fetch)`           | SSE 用の Fetch 実装を置き換えます。                                          |
| `withWebSocketHandle(WebSocket)` | WebSocket コンストラクターを置き換えます。                                   |
| `withInterceptors(...items)`     | 複数トランスポートのインターセプターを末尾へ追加します。                     |
| `withQueryParamsSerializer(fn)`  | HTTP、SSE、WebSocket のクエリシリアライズ処理を置き換えます。                |
| `withCredentials(boolean)`       | `true` の場合、HTTP と SSE で Fetch の `credentials: 'include'` を使います。 |
| `withXSRF(options?)`             | HTTP の XSRF トークン注入を設定します。                                      |
| `withSSEOptions(options)`        | 定義済みの SSE フィールドを浅く置き換えます。                                |
| `withWebSocketOptions(options)`  | 定義済みの WebSocket フィールドを浅く置き換えます。                          |

SSE と WebSocket の個別ヘルパーは、対応する最上位フィールドを 1 つ設定します。デフォルト値とライフサイクルへの影響は各トランスポートのページを参照してください。

## コマンドを実行する

`Client.execute` には 3 つのオーバーロードがあります。どれもエラーを先頭に置く 3 要素タプルを返します。

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

レスポンスが存在する場合、3 番目の要素は Defjs の `SettledResponse` ラッパーです。HTTP オプションには `abort` または `timeout`、追加の `signal` エイリアス、`context`、アップロード・ダウンロード進捗のオブザーバーがあります。

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

3 番目の要素は、検証済みの起動時オープンスナップショットです。`stream.open` は別のライブ getter で、再接続後に変わることがあります。SSE 実行はキャンセルと `HttpContext` を受け取ります。再接続とイベントキューはクライアントオプションで設定します。

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

3 番目の要素は、起動時接続スナップショットです。`session.connection` はライブ getter で、後続の物理接続試行を表す値へ変わることがあります。WebSocket 実行はキャンセルのほか、実行ごとの `beforeConnect`、`heartbeat`、`protocols`、`queue`、`reconnect` を受け取ります。`HttpContext` は受け取りません。

失敗時の正確な分岐は [Errors](/ja-JP/core/errors)、各トランスポートのライフサイクルは [HTTP](/ja-JP/core/http)、[SSE](/ja-JP/core/sse)、[WebSocket](/ja-JP/core/web-socket) を参照してください。

## クライアントのスコープ

ブラウザーアプリケーションでは、エンドポイントとクロージャがブラウザーで安全に扱えるリクエスト非依存の状態だけを含む場合、モジュールレベルのクライアントを使えます。

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

サーバーでは、オプションやインターセプターが認可情報、Cookie、テナントデータ、ユーザーデータ、リクエストコンテキストを取り込む場合、そのクライアントを複数のリクエストで再利用しないでください。サーバーリクエストの境界内でクライアントを作成します。

`Client` に `dispose()` メソッドはありません。実行中のリクエスト、ストリーム、セッションも追跡しません。処理を開始したコードが、対応するライフサイクル境界で HTTP リクエストをキャンセルし、SSE ハンドルまたは WebSocket セッションをクローズする必要があります。

## クライアント設定を確認する

`isClient(value)` は、ランタイム上のクライアントマーカーを確認します。

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` は、クライアントが保持する現在の可変設定オブジェクトをそのまま返します。スナップショットでも読み取り専用ビューでもありません。

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

このオブジェクトを変更すると後続の実行に影響し、通常のオプション合成規則を迂回します。診断用途か、十分にレビューした統合コードに限定してください。引数が有効なクライアントでなければ、`getClientConfig` は `TypeError` を送出します。

## 次に読む

- [Commands](/ja-JP/core/commands) — `execute` に渡す値
- [Interceptors](/ja-JP/core/interceptors) — トランスポート別の選別とオニオン順
- [Context](/ja-JP/core/context) — HTTP と SSE で使うリクエストスコープのメタデータ
