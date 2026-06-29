---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# 立即開始

Defjs 是一款用於定義型別請求 API 並在多種傳輸協定與 JavaScript 執行環境上執行的 TypeScript 函式庫。

## 安裝

使用你偏好的套件管理器：

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## CDN 使用方式

無需建置工具，直接以 ES 模組方式匯入：

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## 三步完成你的第一個請求

### 步驟一：建立用戶端

用戶端（Client）是所有請求執行的入口。使用 `createClient` 建立實例，並設定基礎端點：

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### 步驟二：定義請求

使用 `defineRequest` 定義型別 HTTP 端點。使用 `struct` 描述輸入與回應的形狀：

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
`output` 的鍵為 HTTP 狀態碼。Defjs 會在執行階段自動選擇對應的結構描述，並據此推導 TypeScript 型別：2xx 回應視為成功資料，非 2xx 則視為錯誤資料。
:::

### 步驟三：執行

呼叫 `client.execute` 並傳入請求指令與選擇性設定：

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error 的型別由 output 中的非 2xx 結構描述推導
  console.error(error.code, error.message)
  return
}

// user 的型別為 { id: number; name: string }
console.log(user.name)
```

## 完整範例

以下是一個端到端範例，套件含輸入驗證、輸出驗證、錯誤處理與攔截器：

```typescript
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

// 1. 建立用戶端
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. 定義請求
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': struct.string(),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. 執行
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## 核心 API 速查表

| API                    | 說明                | 典型用法                                                                       |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | 建立請求用戶端      | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | 定義 HTTP 端點      | `defineRequest({ method: 'GET', path: '/user', output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | 定義 SSE 端點       | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | 定義 WebSocket 端點 | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | 結構描述建構器      | `struct.object({ id: struct.number() })`                                       |
| `.alias(name)`         | 欄位 wire 名別名    | `struct.string().alias('user_name')`                                           |
| `withEndpoint`         | 設定基礎 URL        | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | 註冊攔截器          | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | 啟用跨域憑證        | `withCredentials(true)`                                                        |
| `withSSEOptions`       | 設定 SSE 選項       | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | 設定 WebSocket 選項 | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## 接下來

- [用戶端 →](/core/client) — 建立用戶端、執行指令與設定
- [指令 →](/core/commands) — `defineRequest`、`defineEventStream`、`defineWebSocket`
- [錯誤 →](/core/errors) — `RequestError` 結構與分支模式
