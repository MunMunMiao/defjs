---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# 拦截器

`@defjs/core` 拦截器按传输层分为 HTTP、SSE 和 WebSocket。它们共享相同的洋葱链执行模型，但处理不同的请求/响应形状：HTTP 返回 `Promise<HttpResponse>`，SSE 返回 `Promise<EventStreamHandle>`，WebSocket 返回 `Promise<WebSocketSessionLike>`。

拦截器在 `Client` 级别通过 `withInterceptors(...)` 注册。客户端根据命令类型自动过滤并分发到正确的拦截器链。

## 三种拦截器类型

### HTTP 拦截器

HTTP 拦截器操作 `HttpRequest` 并返回 `Promise<HttpResponse>`。典型用途：注入认证请求头、日志、重试、错误转换。

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

### SSE 拦截器

SSE 拦截器操作 `HttpRequest`（连接前的 HTTP 请求）并返回 `Promise<EventStreamHandle>`。典型用途：在 SSE 连接前注入认证请求头、监控连接状态。

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

### WebSocket 拦截器

WebSocket 拦截器操作 `HttpRequest`（握手前的 HTTP 请求）并返回 `Promise<WebSocketSessionLike>`。典型用途：在 WebSocket 握手前修改 URL 或注入子协议请求头。

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

## 洋葱链执行模型

三种拦截器链都使用**洋葱模型**：请求阶段按注册顺序进入，响应阶段按逆序返回。

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // 请求阶段：第一个进入
  const res = await next(req)
  order.push(1.1) // 响应阶段：最后一个退出
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // 请求阶段：最后一个进入
  const res = await next(req)
  order.push(3.1) // 响应阶段：第一个退出
  return res
})

// 注册顺序：a -> b -> c
// 执行顺序：1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### 修改请求和响应

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

### 包装返回结果

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

## 常见拦截器示例

### 认证拦截器

将 Bearer Token 注入请求头。HTTP 和 SSE 共享相同逻辑。

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

### 日志拦截器

记录请求耗时和状态码。

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

### 重试拦截器

对特定状态码重试。重试拦截器应注册在靠近链底部的位置，在日志之后、实际请求之前。

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
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic Auth 拦截器（内置）

`@defjs/core` 为 HTTP 和 SSE 提供内置 Basic Auth 拦截器。

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

默认编码使用 `globalThis.btoa`。对于没有 `btoa` 的环境（如 Node），通过 `options.encode` 自定义：

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## 注册和过滤

### 通过 `withInterceptors` 注册

拦截器在 `createClient` 时通过 `withInterceptors(...)` 注册。同一个数组可以混合三种拦截器类型；客户端按命令类型自动过滤。

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

### 过滤规则

客户端按命令类型过滤拦截器：

| 命令类型                      | 过滤条件                | 内部函数                       |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

过滤后的拦截器保持原始注册顺序，然后形成洋葱链。

```typescript
// 简化的内部执行逻辑
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### 拦截器顺序和组合

多次调用 `withInterceptors` 按顺序追加拦截器。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // 第一个
  withInterceptors(authInterceptor, retryInterceptor), // 第二个
)
// 最终顺序：logging -> auth -> retry
```

## 请求体元数据说明

当拦截器替换 `body` 时，旧的 `bodyContentType` 元数据会自动失效，以防止错误的 `Content-Type` 被发送到服务器。

```typescript
// 保留原始 body：Content-Type 元数据保持有效
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// 替换 body：旧 Content-Type 被清除，新 body 类型决定新的 Content-Type
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API 参考

### 创建函数

| 函数                             | 说明                  |
| -------------------------------- | --------------------- |
| `createHttpInterceptor(fn)`      | 创建 HTTP 拦截器      |
| `createSSEInterceptor(fn)`       | 创建 SSE 拦截器       |
| `createWebSocketInterceptor(fn)` | 创建 WebSocket 拦截器 |

### 类型

| 类型                   | 说明                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP 拦截器对象 `{ kind: 'http', fn: InterceptorFn }`                        |
| `SSEInterceptor`       | SSE 拦截器对象 `{ kind: 'sse', fn: SSEInterceptorFn }`                       |
| `WebSocketInterceptor` | WebSocket 拦截器对象 `{ kind: 'web-socket', fn: WebSocketInterceptorFn }`    |
| `Interceptor`          | 三种拦截器的联合类型                                                         |
| `HttpInterceptorNext`  | HTTP 下一个处理器 `(req: HttpRequest) => Promise<HttpResponse>`              |
| `SSEHandler`           | SSE 下一个处理器 `(req: HttpRequest) => Promise<EventStreamHandle>`          |
| `WebSocketHandler`     | WebSocket 下一个处理器 `(req: HttpRequest) => Promise<WebSocketSessionLike>` |

### 内置拦截器

| 函数                                             | 说明                   |
| ------------------------------------------------ | ---------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth 拦截器 |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth 拦截器  |

## 下一步

- [客户端 →](/core/client) — 创建客户端和配置拦截器
- [HTTP 请求 →](/core/http) — `defineRequest` 和输出模式
- [SSE →](/core/sse) — SSE 定义和流式传输
- [WebSocket →](/core/web-socket) — WebSocket 定义和生命周期
