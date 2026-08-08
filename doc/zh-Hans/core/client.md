---
title: Client
description: 显式创建 client，组合 option，执行不同 transport 的 command，并检查实时配置。
---

# Client

显式创建 `Client`，再把它传给执行 command 的代码。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Client 保存配置，并分派 HTTP、SSE 和 WebSocket command。它不管理全局 registry，也不是后台生命周期管理器。

## Option 组合

Options 从左到右执行。

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

最终 endpoint 是 `https://api.example.com`。Interceptor 顺序是 `operationLogger`、`authInterceptor`、`retryInterceptor`。

组合遵循三条规则：

1. Setter helper 替换原值。包括 `withEndpoint`、transport handle、query serializer、credentials、XSRF 配置，以及单项 SSE 或 WebSocket 设置。
2. `withInterceptors(...items)` 追加。多次调用会保留 interceptor 的添加顺序。
3. `withSSEOptions(...)` 和 `withWebSocketOptions(...)` 对每个已定义的顶层字段做浅替换。它们不会 deep merge 嵌套的 reconnect、heartbeat 或 queue 对象。

例如，下面第二个 reconnect 对象会完整替换第一个，不会保留 `attempts: 5`：

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

分组选项 helper 会忽略值为 `undefined` 的属性。其他已提供的顶层属性都会整体替换当前值。

### Core Options

| Option                           | 作用                                                          |
| -------------------------------- | ------------------------------------------------------------- |
| `withEndpoint(url)`              | 设置所有 transport 使用的 absolute base endpoint。            |
| `withHTTPHandle(fetch)`          | 替换 HTTP 使用的 Fetch 实现。                                 |
| `withSSEHandle(fetch)`           | 替换 SSE 使用的 Fetch 实现。                                  |
| `withWebSocketHandle(WebSocket)` | 替换 WebSocket constructor。                                  |
| `withInterceptors(...items)`     | 追加混合 transport interceptor。                              |
| `withQueryParamsSerializer(fn)`  | 替换 HTTP、SSE 和 WebSocket 的 query serializer。             |
| `withCredentials(boolean)`       | 为 true 时，HTTP 和 SSE 使用 Fetch `credentials: 'include'`。 |
| `withXSRF(options?)`             | 配置 HTTP XSRF token 注入。                                   |
| `withSSEOptions(options)`        | 浅替换已定义的 SSE 字段。                                     |
| `withWebSocketOptions(options)`  | 浅替换已定义的 WebSocket 字段。                               |

单项 SSE 和 WebSocket helper 只设置对应的一个顶层字段。各 transport 页列出了默认值及其生命周期影响。

## 执行 Command

`Client.execute` 有三个 overload。每个都返回 error-first 三元素 tuple。

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

有 response 时，第三项是 Defjs `SettledResponse` wrapper。HTTP option 包括 `abort` 或 `timeout`、额外的 `signal` alias、`context`，以及上传/下载进度 observer。

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

第三项是已通过校验的启动 open 快照。`stream.open` 是单独的 live getter，可能在重连后变化。SSE execution 接受取消和 `HttpContext`；reconnect 和 event queue 在 client option 中配置。

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

第三项是启动 connection 快照。`session.connection` 是 live getter，可能描述后续的物理连接尝试。WebSocket execution 接受取消，以及单次执行的 `beforeConnect`、`heartbeat`、`protocols`、`queue` 和 `reconnect`。它不接受 `HttpContext`。

具体失败分支见 [Errors](/zh-Hans/core/errors)；transport 生命周期见 [HTTP](/zh-Hans/core/http)、[SSE](/zh-Hans/core/sse) 和 [WebSocket](/zh-Hans/core/web-socket)。

## Client 作用域

如果 endpoint 和闭包只包含浏览器可安全持有、且与请求无关的状态，浏览器应用可以保留 module-level client。

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

服务端 client 的 option 或 interceptor 一旦捕获 authorization、cookie、tenant 数据、user 数据或 request context，就不要跨请求复用。请在服务端请求边界内创建 client。

`Client` 没有 `dispose()` 方法，也不跟踪活动中的 request、stream 或 session。发起工作的代码必须在对应生命周期边界取消 HTTP 请求、关闭 SSE handle 或关闭 WebSocket session。

## 高级检查

用 `isClient(value)` 检查 runtime client marker。

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` 返回 client 内部持有的实时可变配置对象。它不是 snapshot，也不是 readonly view。

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

修改该对象会影响后续 execution，并绕过正常的 option 组合流程。只建议把它用于诊断或经过仔细审查的集成代码。参数不是有效 client 时，`getClientConfig` 会抛出 `TypeError`。

## 下一步

- [Commands](/zh-Hans/core/commands)：传给 `execute` 的值如何定义。
- [Interceptors](/zh-Hans/core/interceptors)：transport 筛选和洋葱顺序。
- [Context](/zh-Hans/core/context)：HTTP 和 SSE 的请求作用域 metadata。
