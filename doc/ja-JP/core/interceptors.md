---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# インターセプター

`@defjs/core` のインターセプターは、トランスポート層ごとに HTTP、SSE、WebSocket に分類されます。3 つとも同じオニオンチェーン実行モデルを共有しますが、異なるリクエスト／レスポンス形状を扱います：HTTP は `Promise<HttpResponse>` を返し、SSE は `Promise<EventStreamHandle>` を返し、WebSocket は `Promise<WebSocketSessionLike>` を返します。

インターセプターは `withInterceptors(...)` を介して `Client` レベルで登録されます。クライアントはコマンドタイプに基づいて自動的にフィルタリングし、正しいインターセプター連鎖にディスパッチします。

## 3 つのインターセプタータイプ

### HTTP インターセプター

HTTP インターセプターは `HttpRequest` を操作し、`Promise<HttpResponse>` を返します。典型的な用途：認証ヘッダーの注入、ログ出力、リトライ、エラー変換。

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### SSE インターセプター

SSE インターセプターは `HttpRequest`（接続前の HTTP リクエスト）を操作し、`Promise<EventStreamHandle>` を返します。典型的な用途：SSE 接続前の認証ヘッダー注入、接続状態の監視。

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### WebSocket インターセプター

WebSocket インターセプターは `HttpRequest`（ハンドシェイク前の HTTP リクエスト）を操作し、`Promise<WebSocketSessionLike>` を返します。典型的な用途：WebSocket ハンドシェイク前の URL 変更やサブプロトコルヘッダーの注入。

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## オニオンチェーン実行モデル

3 つのインターセプター連鎖はすべて**オニオンモデル**を使用します：リクエストフェーズは登録順に入り、レスポンスフェーズは逆順に戻ります。

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // リクエストフェーズ: 最初に入る
  const res = await next(req)
  order.push(1.1) // レスポンスフェーズ: 最後に出る
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // リクエストフェーズ: 最後に入る
  const res = await next(req)
  order.push(3.1) // レスポンスフェーズ: 最初に出る
  return res
})

// 登録順: a -> b -> c
// 実行順: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### リクエストとレスポンスの変更

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### 返り値のラッピング

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## 一般的なインターセプター例

### 認証インターセプター

Bearer Token をヘッダーに注入します。HTTP と SSE は同じロジックを共有します。

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### ログ出力インターセプター

リクエスト所要時間とステータスコードを記録します。

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### リトライインターセプター

特定のステータスコードをリトライします。リトライインターセプターは連鎖の下位付近、ログ出力の後、実際のリクエストの前に登録するべきです。

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic Auth インターセプター（ビルトイン）

`@defjs/core` は HTTP と SSE 向けのビルトイン Basic Auth インターセプターを提供します。

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

デフォルトのエンコーディングは `globalThis.btoa` を使用します。`btoa` がない環境（例: Node）では、`options.encode` でカスタマイズできます：

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## 登録とフィルタリング

### `withInterceptors` による登録

インターセプターは `createClient` 時に `withInterceptors(...)` を介して登録されます。同じ配列に 3 種類のインターセプターを混在させられます；クライアントはコマンドタイプに基づいて自動的にフィルタリングします。

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### フィルタリングルール

クライアントはコマンドタイプでインターセプターをフィルタリングします：

| コマンドタイプ                | フィルタ条件            | 内部関数                       |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

フィルタリングされたインターセプターは元の登録順を維持し、オニオンチェーンを形成します。

```typescript
// 簡略化された内部実行ロジック
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### インターセプター順序と合成

複数の `withInterceptors` 呼び出しは、順にインターセプターを追加します。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // 最初
  withInterceptors(authInterceptor, retryInterceptor), // 2 番目
)
// 最終順: logging -> auth -> retry
```

## ボディメタデータの注意点

インターセプターが `body` を置き換えた場合、古い `bodyContentType` メタデータは自動的に無効化され、サーバーに誤った `Content-Type` が送信されるのを防ぎます。

```typescript
// 元のボディを保持: Content-Type メタデータは有効なまま
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// ボディを置き換える: 古い Content-Type はクリアされ、新しいボディタイプが決定する
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API リファレンス

### 作成関数

| 関数                             | 説明                             |
| -------------------------------- | -------------------------------- |
| `createHttpInterceptor(fn)`      | HTTP インターセプターを作成      |
| `createSSEInterceptor(fn)`       | SSE インターセプターを作成       |
| `createWebSocketInterceptor(fn)` | WebSocket インターセプターを作成 |

### 型

| 型                     | 説明                                                                                        |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP インターセプターオブジェクト `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | SSE インターセプターオブジェクト `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | WebSocket インターセプターオブジェクト `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | 3 つのインターセプタータイプの共用体                                                        |
| `HttpInterceptorNext`  | HTTP 次ハンドラー `(req: HttpRequest) => Promise<HttpResponse>`                             |
| `SSEHandler`           | SSE 次ハンドラー `(req: HttpRequest) => Promise<EventStreamHandle>`                         |
| `WebSocketHandler`     | WebSocket 次ハンドラー `(req: HttpRequest) => Promise<WebSocketSessionLike>`                |

### ビルトインインターセプター

| 関数                                             | 説明                             |
| ------------------------------------------------ | -------------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth インターセプター |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth インターセプター  |

## 次に読む

- [Client →](/core/client) — クライアントの作成とインターセプターの設定
- [HTTP Requests →](/core/http) — `defineRequest` と出力パターン
- [SSE →](/core/sse) — SSE の定義とストリーミング
- [WebSocket →](/core/web-socket) — WebSocket の定義とライフサイクル
