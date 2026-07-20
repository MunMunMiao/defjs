---
title: 设计决策
description: 与其他 HTTP 库常见模式不同的 API 设计决策。
---

# 设计决策

Defjs 在某些设计决策上故意与其他 HTTP 库的常见模式不同。本文档解释每个决策背后的设计原理。

## 显式客户端设计

Defjs 要求所有客户端显式创建。你使用 `createClient` 创建 `Client`，并在需要的地方传递它。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

为何这样设计：

- **测试友好**：测试之间无需重置或模拟任何状态。直接传递不同的 `Client` 实例。
- **多环境共存**：多个客户端可以在同一进程中并行运行（例如内部 API + 公共 API），互不干扰。
- **依赖透明**：调用方必须显式持有 `Client`，使依赖关系对静态分析和代码审查可见。

如果你在应用中需要共享客户端，请从模块导出：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## 框架集成

`@defjs/vue` 和 `@defjs/react` 将显式客户端接入各框架的依赖模型。Vue 使用 `provideClient` / `injectClient`；React 使用 `ClientProvider` / `useClient`。这允许客户端在组件或服务树中注册和检索。

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // 在组件逻辑中使用 client.execute(...)
}
```

## 请求级选项传给 `execute`，而非 Builder

请求级选项（`abort`、`timeout`、`heartbeat`、`reconnect` 等）通过 `client.execute` 的第二个参数传入，而非命令构建器。

```typescript
// 正确：请求级选项传给 execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` 按命令类型重载

`client.execute` 根据 `Command` 类型自动返回正确的结果类型。

```typescript
// HTTP 请求 — 返回 HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE 流 — 返回 StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — 返回 SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` 是观察者

SSE 的 `onInvalidEvent` 是观察者。内部抛出的异常会被静默忽略，不会中断流。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 即使这里抛出异常，流也会继续
    },
  }),
)
```

## 错误子模块合并

所有错误符号都从 `@defjs/core` 主入口导出。

| 导出                    | 说明               | 典型用法                                                    |
| ----------------------- | ------------------ | ----------------------------------------------------------- |
| `RequestError`          | 错误联合类型       | `switch (error.kind)` 分支                                  |
| `ERR_ABORTED`           | 中止标识           | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | 超时标识           | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | 创建传输错误       | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | 创建定义错误       | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | 创建 HTTP 状态错误 | `createHttpStatusError(404, 'Not Found', response, data)`   |

从主入口导入：

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## 按 `kind` 和 `code` 进行错误分支

Defjs 建议通过 `kind` 和 `code` 进行分支，而不是字符串比较。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## 更严格的端点定义规则

Defjs 强制执行一条严格规则：**当提供 `build` 时，必须同时提供 `input`。**

```typescript
// 正确：同时提供 input 和 build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  output: [{ status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) }] as const,
})

// 正确：不提供 input 和 build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [{ status: 200, body: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) }] as const,
})

// 错误：提供 build 但没有 input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(ctx, input) {
    ctx.setPathParams({ id: input.id }) // TypeScript 错误：缺少 input 结构
  },
  output: [{ status: 200, body: struct.object({ id: struct.number() }) }] as const,
})
```

此规则同样适用于 `defineEventStream` 和 `defineWebSocket`。

## 依赖要求

| 包             | 所需版本 |
| -------------- | -------- |
| `@defjs/core`  | `^0.4.0` |
| `@defjs/vue`   | `^0.4.0` |
| `@defjs/react` | `^0.4.0` |

React 的 peer dependency 范围：`>=18.0.0`。Node 运行时：`>=26`。

## 下一步

- [客户端 →](/core/client) — 显式客户端设计和配置
- [命令 →](/core/commands) — 命令定义和输入规则
- [错误 →](/core/errors) — `RequestError` 结构和分支
