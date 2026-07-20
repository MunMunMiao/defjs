---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

服务端 OpenTelemetry 集成包，为 `@defjs/core` 的 HTTP、SSE 和 WebSocket 客户端提供出站追踪和指标收集。

**核心定位**：

- **服务端环境**（Node.js、Bun、Deno），不依赖浏览器环境。
- **不初始化 SDK** —— 你必须在外部初始化 OpenTelemetry SDK，然后传入创建的 `Tracer`（以及可选的 `Meter`）。
- **按传输协议分离** —— HTTP、SSE 和 WebSocket 各自拥有独立的拦截器、Span 生命周期和指标维度。

## 仓库工作区使用说明

本页当前记录的是本仓库里的 source/workspace 用法。`@defjs/opentelemetry-server` 位于 `packages/opentelemetry-server`，它的 peer dependency 期望使用 `packages/core` 中与之匹配的 `@defjs/core` 工作区版本。

下面示例中的 import specifier 使用包名，但在这个仓库里它们解析到的是工作区源码包，而不是一对已发布到 registry 的包。你的应用仍然需要单独安装并初始化自己的 OpenTelemetry SDK 相关依赖。

公开 npm 目前并没有提供 `@defjs/opentelemetry-server`，而且那里最新的独立 `@defjs/core` 发布版本也不是这个工作区包的兼容 peer。以后如果你把 `@defjs/opentelemetry-server` 和兼容版本的 `@defjs/core` 一起发布到你控制的 registry，或发布到同时承载这两个版本的其他 registry，请在对应环境里成对安装那些已发布版本，而不要把这里的工作区包和不兼容的独立 `@defjs/core` 发布版本混用。

## 基本用法

传入外部创建的 `Tracer`，并通过 `withOpenTelemetryServer` 配置客户端：

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. 在外部初始化 OpenTelemetry SDK，然后获取 tracer
const tracer = trace.getTracer('my-service')

// 2. 将 tracer 注入客户端配置
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## 完整配置

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // 必填
    meter, // 可选，仅在提供时收集指标
    propagator, // 可选，默认 W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### 配置选项

| 选项                | 类型                                  | 默认值                     | 说明                                     |
| ------------------- | ------------------------------------- | -------------------------- | ---------------------------------------- |
| `tracer`            | `Tracer`                              | **必填**                   | 外部 OpenTelemetry tracer                |
| `meter`             | `Meter`                               | `undefined`                | 外部 OpenTelemetry meter，省略则禁用指标 |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | 自定义上下文传播器                       |
| `requireParentSpan` | `boolean`                             | `false`                    | 仅当存在活跃父 Span 时才创建出站 Span    |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP 传输追踪/指标选项                   |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE 传输追踪/指标选项                    |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket 传输追踪/指标选项              |

### HTTP 选项

| 选项           | 类型                  | 默认值      | 说明                                                       |
| -------------- | --------------------- | ----------- | ---------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | 启用 HTTP 追踪                                             |
| `requestHook`  | `(span, req) => void` | `undefined` | 在请求前自定义 HTTP Span，`req` 为 `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | 在响应后自定义 HTTP Span，`res` 为 `HttpResponse<unknown>` |

### SSE 选项

| 选项           | 类型                     | 默认值      | 说明                                                                    |
| -------------- | ------------------------ | ----------- | ----------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | 启用 SSE 追踪                                                           |
| `requestHook`  | `(span, req) => void`    | `undefined` | 在流请求前自定义 SSE Span                                               |
| `responseHook` | `(span, stream) => void` | `undefined` | 在流句柄返回后自定义 SSE Span，`stream` 为 `EventStreamHandle<unknown>` |

### WebSocket 选项

| 选项               | 类型                      | 默认值      | 说明                                                                                                           |
| ------------------ | ------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | 启用 WebSocket 追踪                                                                                            |
| `queryPropagation` | `boolean`                 | `true`      | 为兼容浏览器，将追踪上下文注入 WebSocket URL 查询字符串；对安全敏感的生产流量，推荐明确设为 `false` 作为基线。 |
| `requestHook`      | `(span, req) => void`     | `undefined` | 在连接请求前自定义 WebSocket Span                                                                              |
| `responseHook`     | `(span, session) => void` | `undefined` | 在会话返回后自定义 WebSocket Span，`session` 为 `WebSocketSessionLike`                                         |

> **钩子异常处理**：如果 `requestHook` 或 `responseHook` 抛出异常，错误会记录在 Span 的 `defjs.otel.hook.error` 事件中，但客户端请求/流/会话**继续正常运行**。
>
> **属性卫生**：在 `requestHook` / `responseHook` 中，优先使用显式 allowlist、redaction 和稳定的低基数属性。除非应用已经审查隐私、基数、保留和脱敏要求，否则不要附加原始查询字符串、请求/响应体、完整请求头、baggage 值或消息负载。

## 从旧 API 迁移

| 旧配置                      | 新配置                                                              |
| --------------------------- | ------------------------------------------------------------------- |
| `http: false`               | `http: { enabled: false }`                                          |
| `sse: false`                | `sse: { enabled: false }`                                           |
| `webSocket: false`          | `webSocket: { enabled: false }`                                     |
| `requestHook`               | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook`    |
| `responseHook`              | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                        |

旧的顶层 Hook 和布尔传输开关被有意移除，这样每个传输协议都能暴露正确的请求/响应类型。现在如果继续从 JavaScript 传入这些已删除的旧选项，会直接抛出迁移错误，而不是被静默解释为已启用遥测。

## HTTP 语义约定和指标

HTTP 追踪遵循稳定的 OpenTelemetry HTTP 客户端语义约定。默认记录 `SpanKind.CLIENT` 类型的 Span，包含以下基础属性：

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

提供 `meter` 时，收集以下稳定指标：

| 指标                           | 单位 | 属性                                                                                                                  |
| ------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`、可选 `http.response.status_code`、可选 `server.address`、可选 `server.port`、可选 `error.type` |

默认情况下，**本包不会把请求/响应体、完整请求头、baggage 值、负载大小或消息负载作为自定义遥测字段附加**。它也**不会为原始查询字符串额外创建单独的 Span 属性或指标**。但 `url.full` 反映的是应用实际构造的请求 URL，因此只要 URL 本身包含查询字符串，这些值仍可能出现在该属性里。请尽量避免在 URL 中放入 token、user id 或其他敏感、高基数输入。

除非应用已经审查隐私、基数、保留和脱敏要求，否则不要把原始查询字符串、请求/响应体、完整请求头、baggage 值或消息负载附加到 Span 或指标里。通过 Hook 扩展遥测时，优先使用显式 allowlist、redaction 和稳定的低基数属性。

## SSE 连接级追踪和自定义指标

SSE 是长寿命的 HTTP 响应。正常的 HTTP 请求耗时在流建立时结束，这无法反映流是否仍在运行、中断或出错。因此，本包将 SSE 视为**连接级**遥测。

### Span 生命周期

SSE Span 保持打开直到 `stream.closed` 解析，记录以下生命周期事件：

- `sse.connected` — 流成功建立
- `sse.closed` — 流正常结束（服务器 EOF）
- `sse.aborted` — 通过 `stream.close()` 主动关闭
- `sse.error` — 连接错误或重连耗尽

### 自定义指标

提供 `meter` 时，收集以下 defjs 自定义指标（非官方 OpenTelemetry 稳定语义约定）：

| 指标                                   | 单位       | 含义                        |
| -------------------------------------- | ---------- | --------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | 建立流连接所需时间          |
| `defjs.client.sse.connection.duration` | `s`        | 从流建立到关闭/错误的总耗时 |
| `defjs.client.sse.active_streams`      | `{stream}` | 当前活跃 SSE 流数量         |

默认情况下，**不会创建逐事件 Span**，且**不会收集事件负载、事件 ID、`Last-Event-ID`、投递延迟、丢失事件或重连队列**。这些是应用级语义，可能产生高基数或敏感遥测。如需实现，请在应用层自行处理。

## WebSocket 连接级追踪和自定义指标

WebSocket 以 HTTP Upgrade 握手开始，但生产环境更关注握手后的连接生命周期：活跃连接数、连接持续时间、关闭/错误行为和连接失败率。由于 OpenTelemetry WebSocket 语义约定尚未稳定，本包使用连接级自定义指标。

### Span 生命周期

WebSocket Span 保持打开直到 `session.closed` 解析，记录以下生命周期事件：

- `websocket.connected` — 会话成功建立
- `websocket.closed` — 连接正常关闭
- `websocket.error` — 连接错误

### 自定义指标

提供 `meter` 时，收集以下 defjs 自定义指标：

| 指标                                         | 单位           | 含义                          |
| -------------------------------------------- | -------------- | ----------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | 建立 WebSocket 会话所需时间   |
| `defjs.client.websocket.connection.duration` | `s`            | 从会话建立到关闭/错误的总耗时 |
| `defjs.client.websocket.active_connections`  | `{connection}` | 当前活跃 WebSocket 连接数量   |

默认情况下，**不会创建逐消息 Span**，且**不会收集消息负载、消息大小、背压、缓冲量、子协议或重连队列**。消息级遥测应在应用层通过采样策略实现。

## WebSocket 查询传播安全风险

浏览器 WebSocket 客户端通常无法设置任意 HTTP 请求头，因此 `webSocket.queryPropagation` 的运行时默认值是 `true`，用来兼容浏览器。这个默认值会把追踪上下文注入到 WebSocket URL 查询字符串里。

查询字符串可能被代理、浏览器、APM 工具、访问日志和网络调试工具记录。它们也可能包含 token、user id 或其他高基数输入。如果传播器包含 `baggage`，baggage 值也可能被写入 URL，并带出敏感数据。

对于安全敏感的生产 WebSocket 流量，建议把查询传播显式禁用，作为推荐的安全基线：

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

禁用后，追踪上下文不再通过 WebSocket URL 传递。如果服务端仍需要把连接关联到 trace，请在应用层使用其他已经审查过的关联机制。

## 下一步

- [客户端](/core/client) — `createClient` 和完整传输配置
- [SSE](/core/sse) — `defineEventStream` 和流式事件消费
- [WebSocket](/core/web-socket) — `defineWebSocket` 和实时通信
