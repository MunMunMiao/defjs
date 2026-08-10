---
title: 攔截器
description: 依傳輸篩選攔截器、以洋蔥順序組合、安全複製請求、short-circuit 工作，並實作有界的認證與重試政策。
---

# 攔截器

攔截器會包住傳輸邊界。HTTP、SSE 與 WebSocket 各自有不同的 interceptor kind 與 result type。

| Factory                      | Request       | `next` 的結果                         |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

用 `withInterceptors(...)` 註冊混合各傳輸的攔截器。Client 會依 `kind` 篩選，並保留同一傳輸內的註冊順序。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## 洋蔥順序

Request flow 依註冊順序往內執行，return flow 則反向展開：

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

多次呼叫 `withInterceptors(...)` 會附加項目：

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

WebSocket 攔截器最多只能呼叫一次 `next`。如果 chain 在建立 session 後失敗，Core 會先 settle 未交付的 session，再回傳原始攔截器錯誤。如果 chain 成功回傳另一個 short-circuit session，Core 會關閉已建立的 session；wrapper 必須沿用原始 `closed` Promise 以維持關聯。

## 安全複製 Request

把傳入的 request 視為 chain 所擁有。修改 header 前，先建立新的 `Headers` 物件：

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

SSE header 也使用相同模式。瀏覽器的 WebSocket constructor 無法傳送任意 handshake header，因此在 WebSocket 攔截器改 `request.headers`，不能用來驗證瀏覽器連線。

取代 HTTP body 時，spread request 再取代 `body`。Fetch 邊界會偵測舊 body 的 content-type metadata 已不適用於新 body。不要重用已消耗的 `ReadableStream` body。

## Short-Circuit

攔截器可以不呼叫 `next`，但必須回傳該傳輸預期的 result type。HTTP 可以用 `makeResponse(...)` 建立 Defjs wrapper：

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

正常指令層仍會依 status 與 output Struct 分派這個回應。若該 status 是端點契約的一部分，就要明確宣告。

Short-circuit SSE 或 WebSocket 需要提供完整相容的 handle 或 session，連關閉語意也不能少。這通常比回傳合成 HTTP response 麻煩得多。

## 保留即時 Session Getter

不要用 `{ ...session }` 包裝 WebSocket session。Spread 會立刻讀取 `state` 與 `connection`，把即時 getter 變成過期值。每個 member 都要明確 delegate：

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

Wrapper 也必須保留資源歸屬。除非應用程式刻意這樣設計並清楚記錄，否則不能取代 `closed`、隱藏 `close`，或切斷 incoming iterable。

## 有界的 Logging

優先使用固定 operation name 與少量、經審查的欄位：

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

預設不要記錄 endpoint URL、query string、headers、body、raw cause、SSE event ID 或 WebSocket payload。

## 保守地重試 HTTP

重試會改變應用程式行為。以下範例只允許 `GET`、`HEAD` 與 `OPTIONS`；只重試 status `0`、`502`、`503` 與 `504`；遵守 `Retry-After`；abort 後會盡快停止；也拒絕 stream body。

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

這個攔截器不重試其他攔截器 throw 的錯誤，因為無法安全分類。Status `0` 是 Defjs Fetch 邊界的 transport-failure wrapper。

不要習慣性把 write method 加進集合。重試 `POST`、`PUT`、`PATCH` 或 `DELETE`，需要應用程式層級的 idempotency 契約、可 replay 的 body、伺服器支援，以及審查過的 status 政策。

## Basic Authentication

Root entry 有匯出 `basicAuthHttpInterceptor(...)` 與 `basicAuthSSEInterceptor(...)`。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic credential 只做 base64 編碼，沒有加密，請務必使用 TLS。預設 encoder 使用 `globalThis.btoa`；它可能不存在，而且只接受有限字元範圍。執行環境沒有 `btoa`，或 credential 需要經審查的 UTF-8/base64 實作時，請傳入 `options.encode`。

Credential provider 會在 request 經過攔截器時執行。伺服器端 credential 必須維持 request-scoped，也不要記錄產生的 header。

## 觀察器與 Callback 安全性

SSE 與 WebSocket 攔截器可以在回傳 handle 上註冊生命週期觀察器。擁有者結束時要取消訂閱 WebSocket listener。WebSocket 會把 state listener failure 交給 runtime-error observer，把後者的 failure 轉送到 `reportError`，並把 reconnect predicate throw 視為 terminal session error。

攔截器本身可以 throw 或 reject。High-level transport 可能會把部分失敗正規化成 `RequestError`，但攔截器程式碼不應依賴「永遠不 reject」的概括保證。

## 下一步

- [Client](/zh-Hant-TW/core/client)說明註冊與選項組合。
- [HTTP](/zh-Hant-TW/core/http)說明 Fetch wrapper 與 status 0 行為。
- [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)各自說明傳輸生命週期。
