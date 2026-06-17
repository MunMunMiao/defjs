---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# クライアント

`@defjs/core` は**明示的なクライアント**設計を採用しています。すべてのリクエストは、あなたが明示的に作成した `Client` インスタンスを通じて実行されます。これにより、テスト、マルチ環境設定、および依存関係の追跡が簡潔になります。

## クライアントの作成

`createClient` を 1 つ以上の設定関数と組み合わせて使用します。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

設定関数は合成されます。後の関数が同じキーに対して先の関数を上書きします。

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### 設定オプション

| 関数                                | 説明                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| `withEndpoint(url)`                 | ベース API アドレス                                                   |
| `withHTTPHandle(fetch)`             | HTTP 用のカスタム `fetch` 実装                                        |
| `withSSEHandle(fetch)`              | SSE 用のカスタム `fetch` 実装                                         |
| `withWebSocketHandle(WebSocket)`    | カスタム `WebSocket` コンストラクター（例: Node 用）                  |
| `withInterceptors(...interceptors)` | トランスポート層インターセプターを登録。`kind` により自動配分されます |
| `withQueryParamsSerializer(fn)`     | カスタムクエリパラメーターのシリアライズ                              |
| `withCredentials(boolean)`          | クロスオリジンクレデンシャルを含めるかどうか                          |
| `withXSRF(options)`                 | XSRF トークンの読み取りと注入の動作                                   |
| `withSSEOptions(options)`           | SSE の再接続、キュー、無効イベント処理など                            |
| `withWebSocketOptions(options)`     | WebSocket のハートビート、再接続、キュー、サブプロトコルなど          |

SSE および WebSocket 固有の設定については、[SSE](/core/sse) と [WebSocket](/core/web-socket) を参照してください。

## コマンドの実行

`Client.execute` は `Command` タイプに基づいて正しいトランスポート層にディスパッチするオーバーロードメソッドです。

### HTTP リクエスト

`defineRequest` で構築されたコマンドを渡します。トリプレットを返します：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

返り値の型：

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE イベントストリーム

`defineEventStream` で構築されたコマンドを渡します。ストリームハンドルと接続情報を返します。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

返り値の型：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket 接続

`defineWebSocket` で構築されたコマンドを渡します。セッションオブジェクトを返します。

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

返り値の型：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## ヘルパー関数

### `isClient`

値が有効な `Client` インスタンスかどうかを確認します。

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

デバッグや高次の抽象化を構築するために、内部設定オブジェクトを抽出します。

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

値が `Client` インスタンスでない場合、`getClientConfig` は `TypeError` をスローします。

## 明示的なクライアント設計

Defjs のすべてのクライアントは明示的に作成されます。`createClient` で `Client` を作成し、必要な場所に渡します。

明示的に作成するメリット：

- **テストしやすい**：異なる `Client` インスタンスをテストに直接渡すため、状態をリセットやモック化する必要がありません。
- **マルチ環境の共存**：同一プロセス内で複数のクライアントを並行して実行できます（例: 内部 API + 公開 API）。
- **依存関係の透明性**：呼び出し側は明示的に `Client` を保持する必要があり、静的解析やコードレビューで依存関係が可視化されます。

アプリケーションで共有するクライアントが必要な場合は、モジュールからエクスポートしてください：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

ビジネスコードでインポートして使用します：

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## 次に読む

- [HTTP Requests →](/core/http) — `defineRequest` と出力パターン
- [SSE →](/core/sse) — SSE の定義、再接続、イベントキュー
- [WebSocket →](/core/web-socket) — WebSocket の定義、ハートビート、再接続戦略
- [Interceptors →](/core/interceptors) — インターセプターの型とオニオンチェーンの仕組み
