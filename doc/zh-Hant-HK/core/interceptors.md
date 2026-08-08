---
title: Interceptors
description: 按 transport 選取 interceptor、以洋蔥順序組合、安全 clone request、short-circuit 工作，並實作有界 auth 與 retry policy。
---

# Interceptors

Interceptor 包裹 transport boundary。HTTP、SSE 與 WebSocket 各有自己的 interceptor kind 及 result type。

| Factory                      | Request       | `next` 的結果                         |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

用 `withInterceptors(...)` 註冊混合 interceptor。Client 會按 `kind` 選取，並在每種 transport 內保留 registration order。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## 洋蔥順序

Request flow 按 registration order 向內；return flow 則以相反次序向外展開：

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

多次呼叫 `withInterceptors(...)` 會追加：

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

## 安全地 Clone Request

把傳入的 request 視為 chain 所擁有。修改 header 前先建立新的 `Headers` object：

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

同一模式亦適用於 SSE header。Browser WebSocket constructor 不能傳送任意 handshake header，所以在 WebSocket interceptor 修改 `request.headers` 並不能為 browser connection 做 authentication。

取代 HTTP body 時，spread request 並換掉 `body`。Fetch boundary 會偵測舊 body 的 content-type metadata 已不再屬於新 body。不要重用已讀取的 `ReadableStream` body。

## Short-Circuit

Interceptor 可以跳過 `next`，但必須回傳該 transport 預期的結果類型。HTTP 可用 `makeResponse(...)` 建立 Defjs wrapper：

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

正常 command layer 仍會按 status 與 output Struct 分派這個 response。如果該 status 屬於 endpoint contract，請明確宣告。

Short-circuit SSE 或 WebSocket 要提供完整相容的 handle 或 session，包括 close semantics。這通常比回傳 synthetic HTTP response 複雜得多。

## 保留 Live Session Getter

不要以 `{ ...session }` 包裝 WebSocket session。Spread 只讀取 `state` 與 `connection` 一次，會把 live getter 變成 stale value。請逐一明確 delegate member：

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
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

Wrapper 亦要保留 resource ownership。除非應用程式刻意設計並記錄另一套 semantics，否則不要取代 `closed`、吞掉 `close`，或切斷 incoming iterable。

## 有界 Logging

優先使用固定 operation name，以及少量經審查的欄位：

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

## 保守地 Retry HTTP

Retry 會改變應用程式行為。以下範例只處理 `GET`、`HEAD` 與 `OPTIONS`；只重試 status `0`、`502`、`503` 及 `504`；遵從 `Retry-After`；abort 後立即停止；亦拒絕 stream body。

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

這個 interceptor 不會 retry 其他 interceptor throw 的 error，因為無法安全分類。Status `0` 是 Defjs Fetch boundary 的 transport-failure wrapper。

不要慣性把 method set 擴大至寫入操作。Retry `POST`、`PUT`、`PATCH` 或 `DELETE` 前，必須有 application-level idempotency contract、replayable body、server support，以及經審查的 status policy。

## Basic Authentication

Root entry 匯出 `basicAuthHttpInterceptor(...)` 與 `basicAuthSSEInterceptor(...)`。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic credentials 只經 Base64 encoding，並沒有加密，必須配合 TLS。預設 encoder 使用 `globalThis.btoa`；此 API 可能不存在，而且只接受有限 character set。Runtime 沒有 `btoa`，或 credentials 需要經審查的 UTF-8/Base64 實作時，請傳入 `options.encode`。

Credential provider 會在 request 經過 interceptor 時執行。Server 端 credentials 必須保持 request-scoped；不要記錄最後產生的 header。

## Observer 與 Callback 安全

SSE 與 WebSocket interceptor 可在回傳 handle 加入 lifecycle observer。擁有者結束時要 unsubscribe WebSocket listener。Listener 與 predicate 應保持不拋錯；目前 realtime 實作並未隔離每一個 listener 或 reconnect predicate failure。

Interceptor 可以 throw 或 reject。High-level transport 或會把部分 failure normalize 成 `RequestError`，但 interceptor 程式碼不應假設所有路徑都「絕不 reject」。

## 下一步

- [Client](/zh-Hant-HK/core/client)：registration 與 option composition。
- [HTTP](/zh-Hant-HK/core/http)：Fetch wrapper 與 status-0 behavior。
- [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)：各 transport 的 lifecycle 細節。
