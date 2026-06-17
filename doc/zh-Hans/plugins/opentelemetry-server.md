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

## 安装

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

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

| 选项               | 类型                      | 默认值      | 说明                                                                   |
| ------------------ | ------------------------- | ----------- | ---------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | 启用 WebSocket 追踪                                                    |
| `queryPropagation` | `boolean`                 | `true`      | 将追踪上下文注入 WebSocket URL 查询字符串                              |
| `requestHook`      | `(span, req) => void`     | `undefined` | 在连接请求前自定义 WebSocket Span                                      |
| `responseHook`     | `(span, session) => void` | `undefined` | 在会话返回后自定义 WebSocket Span，`session` 为 `WebSocketSessionLike` |

> **钩子异常处理**：如果 `requestHook` 或 `responseHook` 抛出异常，错误会记录在 Span 的 `defjs.otel.hook.error` 事件中，但客户端请求/流/会话**继续正常运行**。

## HTTP 语义约定和指标

HTTP 追踪遵循稳定的 OpenTelemetry HTTP 客户端语义约定。默认记录 `SpanKind.CLIENT` 类型的 Span，包含以下低基数属性：

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

提供 `meter` 时，收集以下稳定指标：

| 指标                           | 单位 | 属性                                                                                                                  |
| ------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`、可选 `http.response.status_code`、可选 `server.address`、可选 `server.port`、可选 `error.type` |

默认情况下，**请求/响应体、所有请求头、原始查询字符串、负载大小和网络事件细节不会被收集**。这些通常是高基数或敏感数据。如需收集，请通过 `requestHook` / `responseHook` 显式添加。

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

浏览器 WebSocket 客户端通常无法设置任意 HTTP 请求头，因此本包默认将追踪上下文注入 WebSocket URL 查询字符串，以兼容浏览器。

这一选择存在安全权衡：查询字符串可能出现在访问日志、代理日志、浏览器/网络调试工具和 APM URL 字段中。如果传播器包含 `baggage`，baggage 值也会被写入 URL，可能携带敏感数据。

对于安全敏感的 WebSocket 流量，显式禁用查询传播：

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

禁用后，追踪上下文不再通过 URL 传播。服务器必须依赖其他机制进行追踪关联（例如应用层消息协议中的追踪 ID 字段）。

## 下一步

- [客户端](/core/client) — `createClient` 和完整传输配置
- [SSE](/core/sse) — `defineEventStream` 和流式事件消费
- [WebSocket](/core/web-socket) — `defineWebSocket` 和实时通信
