---
title: Context
description: 通过 HttpContext 在 HTTP 和 SSE interceptor 链中传递请求作用域 metadata。
---

# Context

`HttpContext` 是一个以 token 为 key 的 metadata 容器。它会随 HTTP 或 SSE execution 传递，并出现在 interceptor 看到的 `HttpRequest` 上。它本身不会序列化进 URL、headers 或 body。

## Token 与默认值

用默认值 factory 创建带类型的 token：

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

Context 中没有已存值时，`context.get(token)` 会调用 token factory。默认值不会写入 context，因此有状态的 factory 可能在每次缺失读取时产生不同结果。建议使用确定性默认值。

## 创建并传入 Context

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` 会修改 context，并返回同一个 context，方便链式调用。向 `get(...)` 或 `set(...)` 传入不是由 `makeHttpContextToken(...)` 创建的值时，它们会抛出 `TypeError`。

Interceptor 读取的是同一个对象：

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

使用固定 operation name 和经过审查的 metadata。默认不要把 secret、原始 headers、body、URL 或 query string 写入日志。

## 引用语义

Execution 按引用传递 `HttpContext`。如果某个 interceptor 修改它，后续 interceptor 和仍持有该对象的调用方都能看到变化。

Context 只要包含 request、user、tenant、trace、cookie 或 authorization 数据，就应为每个请求新建一个。并发复用同一个可变 context 可能泄漏或覆盖 metadata。

目前 HTTP 和 SSE execute option 接受 `context`，WebSocket execute option 不接受。SSE 逻辑 handle 会在后续连接尝试中继续携带这次请求关联的 context；应用仍应把该 context 视为 stream 请求作用域拥有的对象。

## 复制与合并

`makeHttpContext(existing)` 会浅复制 token map：

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

两个 map 相互独立，但其中存储的对象值不会 deep clone。

`makeHttpContext(entries)` 也接受 token/value pair：

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` 返回新 context。同一个 token 同时存在时，`secondary` 的值覆盖 `primary`。

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

只传一个 context 时仍会返回副本；两个都不传时返回空 context。

## Context API

| Member              | 行为                                            |
| ------------------- | ----------------------------------------------- |
| `set(token, value)` | 存储值并返回同一个 context。                    |
| `get(token)`        | 返回已存值；没有时调用 token 的默认值 factory。 |
| `has(token)`        | 检查是否存有值。                                |
| `del(token)`        | 删除值并返回同一个 context。                    |
| `keys()`            | 迭代已存 token。                                |
| `length`            | 已存 token 数量。                               |

需要 runtime guard 时，可以使用 `isHttpContext(...)` 和 `isHttpContextToken(...)`。

请求映射是另一个问题。自动 request section 和 schema-bound projection 见 [Commands](/zh-Hans/core/commands)，chain 行为见 [Interceptors](/zh-Hans/core/interceptors)。
