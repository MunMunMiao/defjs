---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# 快速开始

Defjs 是一个 TypeScript 库，用于定义类型化的请求 API，并在多种传输协议和 JavaScript 运行时上执行。

## 安装

使用你喜欢的包管理器：

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

## CDN 使用

无需构建工具，直接作为 ES 模块导入：

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## 三步创建你的第一个请求

### 第一步：创建客户端

客户端是所有请求执行的入口。使用 `createClient` 创建实例，并配置基础端点地址：

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### 第二步：定义请求

使用 `defineRequest` 定义类型化的 HTTP 端点。使用 `struct` 描述输入和响应的形状：

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
`output` 中的键是 HTTP 状态码。Defjs 在运行时自动选择匹配的结构，并据此推断 TypeScript 类型：2xx 响应被类型化为成功数据，非 2xx 被类型化为错误数据。
:::

### 第三步：执行

调用 `client.execute` 并传入你的请求命令和可选配置：

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error 的类型根据 output 中的非 2xx 结构推断
  console.error(error.code, error.message)
  return
}

// user 的类型为 { id: number; name: string }
console.log(user.name)
```

## 完整示例

以下是一个端到端示例，包含输入验证、输出验证、错误处理和拦截器：

```typescript
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

// 1. 创建客户端
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. 定义请求
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.request({
    body: struct.object({
      title: struct.string(),
      body: struct.string(),
    }),
    headers: struct.object({
      'X-Request-ID': struct.string(),
    }),
  }),
  build(ctx, input) {
    ctx.setJson(input.body)
    ctx.setHeaders(input.headers)
  },
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

// 3. 执行
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      body: { title: 'Hello', body: 'World' },
      headers: { 'X-Request-ID': 'uuid-123' },
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

| API                    | 说明                | 典型用法                                                                       |
| ---------------------- | ------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | 创建请求客户端      | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | 定义 HTTP 端点      | `defineRequest({ method: 'GET', path: '/user', output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | 定义 SSE 端点       | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | 定义 WebSocket 端点 | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | 结构构建器          | `struct.object({ id: struct.number() })`                                       |
| `.alias(name)`         | 字段 wire 名别名    | `struct.string().alias('user_name')`                                           |
| `withEndpoint`         | 设置基础 URL        | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | 注册拦截器          | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | 启用跨域凭证        | `withCredentials(true)`                                                        |
| `withSSEOptions`       | 配置 SSE 选项       | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | 配置 WebSocket 选项 | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## 下一步

- [客户端 →](/core/client) — 创建客户端、执行命令和配置
- [命令 →](/core/commands) — `defineRequest`、`defineEventStream`、`defineWebSocket`
- [错误 →](/core/errors) — `RequestError` 结构和分支模式
