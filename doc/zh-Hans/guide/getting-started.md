---
title: Getting Started
description: 使用当前仓库 source/workspace API 创建你的第一个类型化请求，并为已发布 npm/CDN 用户补充单独说明。
---

# 快速开始

Defjs 是一个 TypeScript 库，用于定义类型化的 HTTP、SSE 和 WebSocket API，并在 JavaScript 运行时上执行。

## 仓库 source/workspace 路线

本教程面向当前仓库里的 source/workspace API。

如果你想原样跟随本页示例，请先安装 workspace 依赖，并在能从本仓库源码解析 `@defjs/core` 的 workspace package 中运行示例：

```sh
pnpm install
pnpm --dir doc run typecheck
```

::: info 开发基线
本仓库使用 Node `>=26`、`pnpm@11.6.0` 和 `engine-strict=true` 开发。这个基线适用于在 monorepo 中协作的贡献者；如果你是在应用里安装已发布的 defjs 包，则应以该发布包声明的运行时和 bundler 约束为准。
:::

## 已发布 npm/CDN 的注意事项

如果你今天是从 npm 安装 `@defjs/core`，或通过 CDN 导入它，当前最新公开版本可能仍然落后于本教程。例如 `@defjs/core@0.3.3` 仍使用旧的 `createClient(options)` / `defineRequest(method, endpoint)` 风格。

本页不提供完整的旧版 `0.3.3` 教程。在外部应用中复制 `withEndpoint(...)` 或 `struct.request(...)` 之前，请先确认你使用的已发布版本，其 README、包信息表或 release notes 已明确包含这一套 API。

如果你需要面向当前已发布线的 CDN 导入，请单独导入那个已发布版本，并遵循它自己的 README/API 参考，而不是下面这些 source/workspace 示例。

## 三步创建你的第一个请求

### 第一步：创建客户端

客户端是所有请求执行的入口。使用 `createClient` 创建实例，并配置基础端点：

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### 第二步：定义请求

使用 `defineRequest` 定义类型化 HTTP 端点。当你的输入可以直接映射到 HTTP 的 path、query、headers 或 body 分区时，使用 `struct.request(...)`：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})
```

::: tip
本指南里的示例使用数组形式的 `output`，因为它能显式保留 status/body 配对，也便于多个状态码分组。对象形式的 `output` 仍然受支持，依然适合更紧凑的参考示例。
:::

### 第三步：执行

调用 `client.execute` 并传入请求命令。HTTP 执行返回 error-first 元组：成功时是 `[null, result, response]`，失败时是 `[error, undefined, response?]`。

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    },
    {
      status: 404,
      body: struct.object({
        message: struct.string(),
      }),
    },
  ] as const,
})

async function loadUser() {
  const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

  if (error) {
    console.error(error.code, error.message)
    return
  }

  console.log(user.name)
}
```

## 完整示例

下面是一个端到端示例，包含自动请求映射、输出验证、错误处理和拦截器：

```typescript
import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  struct,
  withEndpoint,
  withInterceptors,
} from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (request, next) => {
  const headers = request.headers ?? new Headers()
  request.headers = headers
  headers.set('Authorization', 'Bearer token')
  return next(request)
})

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(authInterceptor),
)

const createPostRequest = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.request({
    headers: struct.object({
      'X-Request-ID': struct.string(),
    }),
    body: struct.object({
      title: struct.string(),
      body: struct.string(),
    }),
  }),
  output: [
    {
      status: 201,
      body: struct.object({
        id: struct.number(),
        title: struct.string(),
      }),
    },
    {
      status: 400,
      body: struct.object({
        field: struct.string(),
        reason: struct.string(),
      }),
    },
  ] as const,
})

async function submitPost() {
  const [error, post] = await client.execute(
    createPostRequest({
      headers: { 'X-Request-ID': 'uuid-123' },
      body: { title: 'Hello', body: 'World' },
    }),
  )

  if (error) {
    console.error(error)
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## 核心 API 速查表

| API                    | 说明                | 典型用法                                                                                                                                     |
| ---------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `createClient`         | 创建请求客户端      | `createClient(withEndpoint('https://api.example.com'))`                                                                                      |
| `defineRequest`        | 定义 HTTP 端点      | `defineRequest({ method: 'GET', path: '/user/:id', input: struct.request({ path: struct.object({ id: struct.number() }) }), output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | 定义 SSE 端点       | `defineEventStream({ path: '/events', events: { message: struct.string() } })`                                                               |
| `defineWebSocket`      | 定义 WebSocket 端点 | `defineWebSocket({ path: '/ws', incoming, outgoing })`                                                                                       |
| `struct`               | 结构构建器          | `struct.object({ id: struct.number() })`                                                                                                     |
| `.alias(name)`         | 字段 wire 名别名    | `struct.string().alias('user_name')`                                                                                                         |
| `withEndpoint`         | 设置基础 URL        | `withEndpoint('https://api.example.com')`                                                                                                    |
| `withInterceptors`     | 注册拦截器          | `withInterceptors(loggingInterceptor, authInterceptor)`                                                                                      |
| `withCredentials`      | 启用跨域凭证        | `withCredentials(true)`                                                                                                                      |
| `withSSEReconnect`     | 配置 SSE 重连策略   | `withSSEReconnect({ attempts: 3, delayMs: 1000 })`                                                                                           |
| `withWebSocketOptions` | 配置 WebSocket 选项 | `withWebSocketOptions({ protocols: ['v1'] })`                                                                                                |

## 下一步

- [客户端 →](/core/client) — 创建客户端、执行命令和配置
- [命令 →](/core/commands) — `defineRequest`、`defineEventStream`、`defineWebSocket`
- [错误 →](/core/errors) — `RequestError` 结构和分支模式
