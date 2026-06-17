---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# 攔截器

`@defjs/core` 的攔截器依傳輸層區分：HTTP、SSE 與 WebSocket。它們共享相同的洋蔥鏈執行模型，但處理不同的請求／回應形狀：HTTP 回傳 `Promise<HttpResponse>`，SSE 回傳 `Promise<EventStreamHandle>`，WebSocket 回傳 `Promise<WebSocketSessionLike>`。

攔截器透過 `withInterceptors(...)` 在用戶端層級註冊。用戶端會依指令型別自動篩選並分派至正確的攔截器鏈。

## 三種攔截器型別

### HTTP 攔截器

HTTP 攔截器操作 `HttpRequest` 並回傳 `Promise<HttpResponse>`。典型用途：注入驗證標頭、紀錄、重試、錯誤轉換。

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

### SSE 攔截器

SSE 攔截器操作 `HttpRequest`（連線前的 HTTP 請求）並回傳 `Promise<EventStreamHandle>`。典型用途：在 SSE 連線前注入驗證標頭、監控連線狀態。

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

### WebSocket 攔截器

WebSocket 攔截器操作 `HttpRequest`（握手前的 HTTP 請求）並回傳 `Promise<WebSocketSessionLike>`。典型用途：在 WebSocket 握手前修改 URL 或注入子協定標頭。

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

## 洋蔥鏈執行模型

三種攔截器鏈皆使用**洋蔥模型**：請求階段依註冊順序進入，回應階段依相反順序回傳。

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // 請求階段：第一個進入
  const res = await next(req)
  order.push(1.1) // 回應階段：最後一個出來
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // 請求階段：最後一個進入
  const res = await next(req)
  order.push(3.1) // 回應階段：第一個出來
  return res
})

// 註冊順序：a -> b -> c
// 執行順序：1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### 修改請求與回應

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

### 套件裝回傳結果

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

## 常見攔截器範例

### 驗證攔截器

將 Bearer Token 注入標頭。HTTP 與 SSE 共用相同邏輯。

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

### 紀錄攔截器

記錄請求耗時與狀態碼。

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

### 重試攔截器

重試特定狀態碼。重試攔截器應註冊在鏈的較下方，位於紀錄之後、實際請求之前。

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

### Basic Auth 攔截器（內建）

`@defjs/core` 提供 HTTP 與 SSE 的內建 Basic Auth 攔截器。

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

預設編碼使用 `globalThis.btoa`。若環境無 `btoa`（例如 Node），可透過 `options.encode` 自訂：

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## 註冊與篩選

### 透過 `withInterceptors` 註冊

攔截器在 `createClient` 時透過 `withInterceptors(...)` 註冊。同一陣列可混合三種攔截器型別；用戶端會依指令型別自動篩選。

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

### 篩選規則

用戶端依指令型別篩選攔截器：

| 指令型別                      | 篩選條件                | 內部函式                       |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

篩選後的攔截器保留原始註冊順序，再形成洋蔥鏈。

```typescript
// 簡化的內部執行邏輯
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### 攔截器順序與組合

多次呼叫 `withInterceptors` 會依序附加攔截器。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // 第一個
  withInterceptors(authInterceptor, retryInterceptor), // 第二個
)
// 最終順序：logging -> auth -> retry
```

## 主體後設資料注意事項

當攔截器替換 `body` 時，舊的 `bodyContentType` 後設資料會自動失效，以避免將錯誤的 `Content-Type` 發送至伺服器。

```typescript
// 保留原始主體：Content-Type 後設資料保持有效
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// 替換主體：舊 Content-Type 被清除，新主體型別決定 Content-Type
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API 參考

### 建立函式

| 函式                             | 說明                  |
| -------------------------------- | --------------------- |
| `createHttpInterceptor(fn)`      | 建立 HTTP 攔截器      |
| `createSSEInterceptor(fn)`       | 建立 SSE 攔截器       |
| `createWebSocketInterceptor(fn)` | 建立 WebSocket 攔截器 |

### 型別

| 型別                   | 說明                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP 攔截器物件 `{ kind: 'http', fn: InterceptorFn }`                        |
| `SSEInterceptor`       | SSE 攔截器物件 `{ kind: 'sse', fn: SSEInterceptorFn }`                       |
| `WebSocketInterceptor` | WebSocket 攔截器物件 `{ kind: 'web-socket', fn: WebSocketInterceptorFn }`    |
| `Interceptor`          | 三種攔截器型別的聯合                                                         |
| `HttpInterceptorNext`  | HTTP 下一個處理器 `(req: HttpRequest) => Promise<HttpResponse>`              |
| `SSEHandler`           | SSE 下一個處理器 `(req: HttpRequest) => Promise<EventStreamHandle>`          |
| `WebSocketHandler`     | WebSocket 下一個處理器 `(req: HttpRequest) => Promise<WebSocketSessionLike>` |

### 內建攔截器

| 函式                                             | 說明                   |
| ------------------------------------------------ | ---------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth 攔截器 |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth 攔截器  |

## 接下來

- [用戶端 →](/core/client) — 建立用戶端與設定攔截器
- [HTTP 請求 →](/core/http) — `defineRequest` 與輸出模式
- [SSE →](/core/sse) — SSE 定義與串流
- [WebSocket →](/core/web-socket) — WebSocket 定義與生命週期
