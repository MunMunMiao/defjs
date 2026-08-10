---
title: Interceptors
description: トランスポート別の選別、オニオン順、安全なリクエスト複製、ショートサーキット、範囲を限定した認証・再試行ポリシーを説明します。
---

# Interceptors

インターセプターはトランスポート境界を包みます。HTTP、SSE、WebSocket には、それぞれ異なるインターセプター種別と結果型があります。

| ファクトリー                 | リクエスト    | `next` の戻り値                       |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

複数トランスポートのインターセプターは `withInterceptors(...)` でまとめて登録します。クライアントは `kind` で選別し、トランスポート内では登録順を保ちます。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## オニオン順

リクエストは登録順に進み、戻り処理は逆順にたどります。

```typescript
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

`withInterceptors(...)` を複数回呼ぶと末尾へ追加されます。

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

WebSocket インターセプターが `next` を呼べるのは 1 回だけです。セッション作成後にチェーンが失敗した場合、Core は未返却のセッションを終了してから元のインターセプターエラーを返します。別の short-circuit セッションを返して成功した場合は作成済みセッションを閉じます。ラッパーは元の `closed` Promise を委譲して関連付けを維持します。

## リクエストを安全に複製する

受け取ったリクエストはチェーンが所有するものとして扱います。ヘッダーを変更する前に、新しい `Headers` オブジェクトを作ってください。

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

SSE ヘッダーでも同じパターンを使えます。ブラウザーの WebSocket コンストラクターは任意のハンドシェイクヘッダーを送れないため、WebSocket インターセプターで `request.headers` を変更してもブラウザー接続の認証にはなりません。

HTTP ボディを置き換える場合はリクエストを展開し、`body` を置き換えます。Fetch 境界は、以前のボディに対応する Content-Type メタデータが新しいボディに合わないことを検出します。消費済みの `ReadableStream` ボディを再利用しないでください。

## ショートサーキット

インターセプターは `next` を呼ばずに終了できますが、トランスポートが期待する結果タイプを返す必要があります。HTTP では `makeResponse(...)` で Defjs ラッパーを作れます。

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

通常のコマンド層は、このレスポンスに対して引き続きステータスディスパッチと出力 Struct を適用します。エンドポイント契約の一部なら、そのステータスを宣言してください。

SSE または WebSocket をショートサーキットする場合、クローズ時の動作まで含む完全な互換ハンドルまたはセッションが必要です。通常は合成 HTTP レスポンスより手間がかかります。

## セッションのライブ getter を保つ

WebSocket セッションを `{ ...session }` で包まないでください。オブジェクトの展開は `state` と `connection` をその時点で一度読み取り、ライブ getter を古い固定値に変えてしまいます。各メンバーを明示的に委譲します。

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get bufferedAmount() {
      return session.bufferedAmount
    },
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

ラッパーはリソースの所有権も保つ必要があります。意図したアプリケーション動作として明記する場合を除き、`closed` を置き換えたり、`close` を抑止したり、受信イテラブルを切り離したりしないでください。

## 範囲を限定したログ

固定した操作名と、少数のレビュー済みフィールドを使います。

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

エンドポイント URL、クエリ文字列、ヘッダー、ボディ、生の原因、SSE イベント ID、WebSocket ペイロードはデフォルトでログへ出さないでください。

## HTTP 再試行は慎重に限定する

再試行はアプリケーションの動作を変えます。次の例は `GET`、`HEAD`、`OPTIONS` だけを対象にし、ステータス `0`、`502`、`503`、`504` だけを再試行します。`Retry-After` を尊重し、中断時はすぐ停止し、ストリームボディは拒否します。

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

このインターセプターは、別のインターセプターが送出した例外を安全に分類できないため再試行しません。ステータス `0` は Defjs Fetch 境界が返すトランスポート失敗のラッパーです。

書き込みメソッドを安易に追加しないでください。`POST`、`PUT`、`PATCH`、`DELETE` の再試行には、アプリケーションレベルの冪等性契約、再送できるボディ、サーバー側の対応、レビュー済みステータスポリシーが必要です。

## Basic 認証

ルートエントリーは `basicAuthHttpInterceptor(...)` と `basicAuthSSEInterceptor(...)` をエクスポートしています。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic 認証情報は base64 エンコードされるだけで、暗号化はされません。TLS を使ってください。デフォルトエンコーダーは `globalThis.btoa` を使いますが、ランタイムによっては利用できず、受け付ける文字範囲にも制限があります。`btoa` がない場合や認証情報にレビュー済みの UTF-8/base64 実装が必要な場合は、`options.encode` を渡してください。

認証情報プロバイダーはリクエストがインターセプターを通るたびに実行されます。サーバー認証情報はリクエストスコープに保ち、生成されたヘッダーをログへ出さないでください。

## オブザーバーとコールバックの安全性

SSE と WebSocket のインターセプターは、返されたハンドルにライフサイクルオブザーバーを付けられます。WebSocket リスナーは所有者の終了時に解除してください。WebSocket は状態リスナーの失敗をランタイムエラーオブザーバーへ通知し、そのオブザーバーの失敗は `reportError` へ転送します。再接続述語の例外はセッションの終端エラーです。

インターセプター自体は例外を送出したり、Promise を reject したりできます。高レベルのトランスポートが一部の失敗を `RequestError` へ正規化する場合はありますが、インターセプターコードで「絶対に reject しない」という保証に依存しないでください。

## 次に読む

- [Client](/ja-JP/core/client) — 登録とオプション合成
- [HTTP](/ja-JP/core/http) — Fetch ラッパーとステータス 0 の動作
- [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) — トランスポートライフサイクル
