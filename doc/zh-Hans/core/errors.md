---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# 错误

`@defjs/core` 中的所有执行结果都以 `[error, result, response]` 三元组返回。`error` 是 `RequestError`：一个以 `kind` 和 `code` 区分的联合类型。推荐通过 `kind` 和 `code` 进行分支，而非字符串比较。

## RequestError 结构

`RequestError` 是三种错误类型的联合：

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

所有错误共享以下公共字段：

| 字段       | 类型                                    | 说明                                             |
| ---------- | --------------------------------------- | ------------------------------------------------ |
| `kind`     | `'http' \| 'transport' \| 'definition'` | 错误类别，用于顶层分支                           |
| `code`     | `string`                                | 精确错误码，用于二级分支                         |
| `message`  | `string`                                | 人类可读的错误描述                               |
| `data`     | `unknown`                               | 附加数据（仅 `http` 和 `definition` 错误有）     |
| `response` | `SettledResponseLike`                   | 原始响应对象（仅 `http` 和 `definition` 错误有） |

### HttpStatusError

当服务器返回非 2xx 状态码且该状态码在 `output` 中定义时产生。

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

`data` 类型从 `output` 中匹配状态码的结构推导。例如，`output: { 404: notFoundStruct }` 会将 `error.data` 窄化为 `notFoundStruct` 的推断类型。

### TransportError

当网络或传输层失败时产生，包括中止、超时和一般网络错误。

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

当请求定义或验证失败时产生。

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| 错误码                       | 触发场景                                             |
| ---------------------------- | ---------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 输入参数未通过 `input` 结构验证，或 `build` 抛出异常 |
| `RESPONSE_VALIDATION_FAILED` | 响应体未通过返回状态码对应的 `output` 结构验证       |
| `UNDECLARED_STATUS`          | 服务器返回了 2xx 状态码，但未在 `output` 中声明      |

## 错误分类和分支

**不要**使用字符串比较来判断错误类型：

```typescript
// 不推荐：脆弱且无类型收窄
if (error.message.includes('timeout')) { ... }
```

**推荐**：通过 `kind` 和 `code` 分支，实现精确的类型收窄：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error 被窄化为 HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data 被窄化为 { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error 被窄化为 TransportError
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
      // error 被窄化为 DefinitionError
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

## 内置常量

`@defjs/core` 导出两个常量，用于识别特定的传输错误：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: 请求被主动取消
// ERR_TIMEOUT: 请求超时
```

### 在拦截器中触发取消

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### 与 AbortController 配合使用

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### 手动创建传输错误

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## 辅助函数

### `createTransportError`

将原始异常规范化为 `TransportError`。

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

将原始异常规范化为 `DefinitionError`。

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

将非 2xx 响应规范化为 `HttpStatusError`。

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## 下一步

- [客户端 →](/core/client) — 创建客户端和执行命令
- [HTTP 请求 →](/core/http) — `defineRequest` 和输出模式
- [SSE →](/core/sse) — SSE 错误和重连策略
- [WebSocket →](/core/web-socket) — WebSocket 连接错误处理
