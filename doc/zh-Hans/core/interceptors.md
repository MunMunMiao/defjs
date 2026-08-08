---
title: Interceptors
description: 按 transport 筛选 interceptor，以洋葱顺序组合，安全 clone request，short-circuit 工作，并实现受限的 auth 和 retry 策略。
---

# Interceptors

Interceptor 包裹 transport boundary。HTTP、SSE 和 WebSocket 各有独立的 interceptor kind 和结果类型。

| Factory                      | Request       | `next` 的结果                         |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

用 `withInterceptors(...)` 注册混合 interceptor。Client 按 `kind` 筛选，并在每种 transport 内保留注册顺序。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## 洋葱顺序

Request 按注册顺序向内流动，返回时按相反顺序向外展开：

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

多次调用 `withInterceptors(...)` 会追加：

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

## 安全 Clone Request

把传入 request 视为 chain 所拥有的对象。修改 header 前先创建新的 `Headers`：

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

同一模式也适用于 SSE header。浏览器 WebSocket constructor 不能发送任意 handshake header，因此在 WebSocket interceptor 中修改 `request.headers` 并不能认证浏览器连接。

替换 HTTP body 时，spread request 并替换 `body`。Fetch boundary 会检测旧 body 的 content-type metadata 已不再属于新 body。不要复用已消费的 `ReadableStream` body。

## Short-Circuit

Interceptor 可以跳过 `next`，但必须返回该 transport 期望的结果类型。HTTP 可以用 `makeResponse(...)` 创建 Defjs wrapper：

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

正常 command layer 仍会按 status 和 output Struct 分派这个 response。如果该 status 属于 endpoint contract，请把它声明出来。

Short-circuit SSE 或 WebSocket 需要提供完整兼容的 handle 或 session，包括关闭语义。通常，这比返回 synthetic HTTP response 麻烦得多。

## 保留 Live Session Getter

不要用 `{ ...session }` 包装 WebSocket session。Spread 会读取一次 `state` 和 `connection`，把 live getter 变成 stale value。请逐个 member 显式 delegate：

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

Wrapper 还必须保留资源所有权。除非应用明确设计并记录了不同语义，否则不要替换 `closed`、吞掉 `close`，或断开 incoming iterable。

## 有界日志

优先使用固定 operation name 和少量经过审查的字段：

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

默认不要记录 endpoint URL、query string、header、body、raw cause、SSE event ID 或 WebSocket payload。

## 保守重试 HTTP

Retry 会改变应用行为。下面的示例只处理 `GET`、`HEAD` 和 `OPTIONS`；只重试 status `0`、`502`、`503` 和 `504`；遵守 `Retry-After`；收到 abort 后立即停止；并拒绝 stream body。

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

这个 interceptor 不重试其他 interceptor 抛出的错误，因为它无法安全分类。Status `0` 是 Defjs Fetch boundary 的 transport-failure wrapper。

不要习惯性扩展到写 method。重试 `POST`、`PUT`、`PATCH` 或 `DELETE` 需要应用级 idempotency contract、可重放 body、服务端支持和经过审查的 status policy。

## Basic Authentication

Root entry 导出 `basicAuthHttpInterceptor(...)` 和 `basicAuthSSEInterceptor(...)`。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic credential 只是 Base64 编码，没有加密。必须使用 TLS。默认 encoder 使用 `globalThis.btoa`，它可能不存在，而且只接受有限字符范围。Runtime 没有 `btoa`，或 credential 需要经过审查的 UTF-8/Base64 实现时，请传入 `options.encode`。

Credential provider 会在 request 经过 interceptor 时执行。服务端 credential 必须保持 request-scoped；不要记录最终 header。

## Observer 与 Callback 安全

SSE 和 WebSocket interceptor 可以给返回的 handle 附加生命周期 observer。所有者结束时要取消 WebSocket listener。Listener 和 predicate 应保持不抛错；当前 realtime 实现没有隔离所有 listener 或 reconnect predicate failure。

Interceptor 可以 throw 或 reject。高层 transport 可能把部分 failure 归一化成 `RequestError`，但 interceptor 代码不应依赖“绝不 reject”的笼统保证。

## 下一步

- [Client](/zh-Hans/core/client)：注册和 option 组合。
- [HTTP](/zh-Hans/core/http)：Fetch wrapper 和 status-0 行为。
- [SSE](/zh-Hans/core/sse) 与 [WebSocket](/zh-Hans/core/web-socket)：各 transport 的生命周期细节。
