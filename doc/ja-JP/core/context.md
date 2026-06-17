---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# コンテキスト

Defjs の実行フロー：クライアント設定がグローバルデフォルトを提供します；コマンド定義がエンドポイント構造を記述します；`build` がパース済み入力を HTTP リクエストの各部分にマッピングします；そして `HttpContext` は、単一の実行ライフサイクル中にインターセプター間で受け渡される見えない荷物として機能します。

## HttpContext の受け渡し

`HttpContext` は、単一のリクエスト／接続ライフサイクル内でメタデータを保持するための Token ベースのキー・バリューコンテナです。URL、ヘッダー、ボディのシリアライズには関与しません。インターセプターによって読み書きされます。

### 作成と利用

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Token を定義（デフォルト値付き）
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. コンテキストを作成し値を設定
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. 実行時に渡す
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### インターセプター内での読み取り

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### コンテキストのマージ

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged は requestId と auth の両方を含む
```

### 主要 API

| エクスポート                                     | 説明                                                                      |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | デフォルト値付きの Token を作成                                           |
| `makeHttpContext()`                              | 空のコンテキストを作成                                                    |
| `makeHttpContext(entries)`                       | `[token, value]` 配列から作成                                             |
| `makeHttpContext(otherContext)`                  | 別のコンテキストをコピー                                                  |
| `mergeHttpContexts(primary, secondary)`          | 2 つのコンテキストをマージ。同じ Token では secondary が primary を上書き |
| `ctx.set(token, value)`                          | 値を書き込み。自身を返す（チェーン可能）                                  |
| `ctx.get(token)`                                 | 値を読み取り。未設定の場合は Token のデフォルト値を返す                   |
| `ctx.has(token) / ctx.del(token)`                | 確認／削除                                                                |
| `ctx.keys() / ctx.length`                        | 反復／カウント                                                            |

---

## リクエストビルダーと入力パース

### 入力パースフロー

コマンド実行時、クライアントは以下の順序で入力を処理します：

1. **Validate**：`input` Struct を使って、呼び出し側の生データを検証・パースします。
2. **Build**：`build(request, parsedInput)` を呼び出し、パース済みデータをリクエストの各部分にマッピングします。
3. **Transport**：`kind` に基づいて HTTP fetch、SSE ストリーム、または WebSocket 接続にディスパッチします。

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Build ハンドラー機能マトリックス

トランスポートによってサポートされる `build` 操作は異なります：

| Build メソッド                            | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

トランスポートがサポートしていないメソッドを `build` 内で使用すると、実行時に `REQUEST_VALIDATION_FAILED` がスローされます。

### 自動 Build

`build` を省略する場合、`input` も省略する必要があります。ただし、Struct の `request` 形状を使って、フレームワークにビルドロジックを自動推論させることができます：

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // build は不要。フレームワークが path/query を自動マッピング
})
```

`build` を提供する場合、`input` も提供する必要があります。これは厳密な設計ルールです。

---

## クライアント設定

`createClient` と 1 つ以上の設定関数でクライアントを作成します。後の関数が同じキーに対して先の関数を上書きします。

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### コアオプション

#### `withEndpoint(url)`

ベース API アドレスを設定します。すべてのリクエスト `path` はこの URL の後に追加されます。

```typescript
withEndpoint('https://api.example.com/v1')
// /users をリクエストすると https://api.example.com/v1/users が生成されます
```

#### `withCredentials(boolean)`

クロスオリジンクレデンシャル（クッキー、HTTP 認証ヘッダー、TLS クライアント証明書）を含めるかどうかを設定します。`fetch` の `credentials` オプションに対応します。

```typescript
withCredentials(true) // クロスオリジンリクエストにクッキーを含める
withCredentials(false) // デフォルト
```

#### `withXSRF(options)`

XSRF トークンの読み取りと注入の動作を設定します。デフォルトでは `document.cookie` から `XSRF-TOKEN` を読み取り、`X-XSRF-TOKEN` ヘッダーに注入します。

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // カスタム読み取りロジック。例: localStorage から
    return localStorage.getItem('xsrf-token')
  },
})
```

| フィールド      | 型                                     | デフォルト                     |
| --------------- | -------------------------------------- | ------------------------------ |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`                 |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`               |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | `document.cookie` から読み取り |

#### `withQueryParamsSerializer(fn)`

カスタムクエリパラメーターシリアライズ。デフォルトは `URLSearchParams.toString()` です。

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

カスタムシリアライザーが提供された場合、HTTP と SSE リクエストで複雑なクエリパラメーターが許可されます。

---

## トランスポート固有の設定

### SSE オプション

`withSSEOptions` または個別の設定関数で設定します。

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| オプション           | 説明                                                                             |
| -------------------- | -------------------------------------------------------------------------------- |
| `sse.fetch`          | SSE 専用の `fetch` 実装                                                          |
| `sse.reconnect`      | 再接続戦略：試行回数、遅延、バックオフ倍率、ジッター、最大遅延、カスタム判定関数 |
| `sse.queue`          | イベントキュー：最大容量、オーバーフロー戦略                                     |
| `sse.onInvalidEvent` | 無効イベントオブザーバー（スキーマ欠落または検証失敗）                           |
| `sse.maxBufferSize`  | 基盤バッファーのサイズ制限（バイト）                                             |

### WebSocket オプション

`withWebSocketOptions` または個別の設定関数で設定します。

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| オプション                | 説明                                                                             |
| ------------------------- | -------------------------------------------------------------------------------- |
| `webSocket.WebSocket`     | カスタム `WebSocket` コンストラクター                                            |
| `webSocket.protocols`     | RFC 6455 サブプロトコル配列                                                      |
| `webSocket.beforeConnect` | 接続前フック（例: 動的トークンの取得）                                           |
| `webSocket.heartbeat`     | ハートビート：間隔、タイムアウト、メッセージファクトリー、ACK 述語               |
| `webSocket.reconnect`     | 再接続戦略：試行回数、遅延、バックオフ倍率、ジッター、最大遅延、カスタム判定関数 |
| `webSocket.queue`         | 送信キュー：最大容量、オーバーフロー戦略                                         |

### ハートビートの詳細

WebSocket ハートビートは接続の生死を検知します。設定された場合、フレームワークは `intervalMs` ごとにハートビートメッセージを送信し、`timeoutMs` 以内に ACK を待ちます。ACK がタイムアウトした場合、再接続がトリガーされます。

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // 30 秒ごとにハートビートを送信
  timeoutMs: 10000, // 10 秒以内に ACK を受信する必要がある
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- ハートビートメッセージの型は `outgoing` 定義と互換性が必要です。
- `isAck` は受信メッセージがハートビート応答かどうかを判定します。`true` を返すと、そのメッセージは `receive` イテレーターに入りません。

---

## 設定の合成と優先順位

設定関数は順に適用され、後のものが先のものを上書きします。実行時オプション（`client.execute(cmd, { timeout: 5000 })`）が最も優先度が高く、次にクライアントレベルの設定が適用されます。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// 実行時に SSE 再接続を上書き
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## 次に読む

- [Client →](/core/client) — クライアントの作成と `execute` の使い方
- [Commands →](/core/commands) — コマンド定義と入力のオプショナルルール
- [SSE →](/core/sse) — SSE の実行、再接続、イベント処理
- [WebSocket →](/core/web-socket) — WebSocket 接続、ハートビート、状態管理
- [Interceptors →](/core/interceptors) — インターセプターの型とオニオンチェーンの仕組み
