---
title: OpenTelemetry Server
description: 使用应用提供的 OpenTelemetry Tracer 和可选 Meter，观测 outbound Defjs HTTP、SSE 和 WebSocket client。
---

# `@defjs/opentelemetry-server`

虽然 package 名称带有 server，但这个 adapter 观测的是 outbound Defjs client 工作。它不处理 inbound server instrumentation，也不会初始化 OpenTelemetry SDK。

应用负责：

- SDK 和 provider setup；
- exporter 和 processor 配置；
- context manager 和 active-context setup；
- sampling、attribute policy 和敏感数据脱敏；
- force-flush 和 shutdown。

把应用提供的 `Tracer` 和可选 `Meter` 传给 `withOpenTelemetryServer(...)`。

## 配置 Client

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

Adapter 会为每种启用的 transport 添加一个 interceptor。Option 按正常 client 顺序执行，因此它相对其他 interceptor 的位置决定 span 包裹哪些工作。

## Options

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

每种 transport option 都接受 `enabled?: boolean`、`requestHook` 和 `responseHook`。WebSocket 还接受 `queryPropagation?: boolean`。

三种 transport 默认全部启用。用 option object 禁用其中一个：

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

旧的 boolean transport field、顶层 hook 和 `webSocketQueryPropagation` 会在 runtime 以 migration error 拒绝。当前形式是 transport option object、transport-scoped hook 和 `webSocket.queryPropagation`。

## Propagation

省略 `propagator` 时，package 会创建自己的 `CompositePropagator`，其中包含 W3C Trace Context 和 W3C Baggage propagator。它不会读取 global propagator 配置。

HTTP 和 SSE 会把 propagator 产生的每个字段注入 request header。如果 `req.headers` 已经是 `Headers` 实例，当前实现会复用并原地修改这个实例；否则才会新建 `Headers` 对象。WebSocket query propagation 默认是 `true`，因为浏览器 socket 不能添加任意 handshake header。它会把 propagator 产生的每个字段追加到连接 query string。

每个 interceptor 创建 span 前，还会对 request header 调用 `propagator.extract(...)`。请只把这个 carrier 当作应用自己控制的可信 input。不要让不可信调用方传入 `traceparent`、`tracestate` 或 `baggage`，这些字段可能替换当前 active parent context。请求到达这个 interceptor 前，应删除或归一化不可信的 propagation field。

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: false,
  },
})
```

除非部署环境已经审查 URL propagation，否则应关闭 query propagation。Trace context 和 baggage 可能被 browser、proxy、access log 和 telemetry system 记录。Custom propagator 还可能加入 `traceparent` 之外的更多字段。

`requireParentSpan: true` 会在 interceptor 执行任何 instrumentation 前检查 active parent span。没有 active span 时，它会跳过 span creation、propagation、hook 和 metric，然后原样调用下一个 handler。

## Hook 行为

Hook 接收 transport-specific span 和 request/result：

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

Hook 是同步的。同步 throw 会被捕获并记录为 `defjs.otel.hook.error`，不会中断 client operation。如果 JavaScript 绕过类型并返回 rejected promise，hook wrapper 不会 await 或捕获这个异步 rejection。

只使用 allowlist 中的低基数 attribute。不要附加原始 header、query string、body、baggage、event ID、message payload 或 credential。

## HTTP 语义

HTTP interceptor 创建 `SpanKind.CLIENT` span，并记录：

- `http.request.method`；
- `url.full`；
- `server.address` 和可选 `server.port`；
- 收到 response 后的 `http.response.status_code`。

这不代表完整支持 HTTP semantic convention。

当前 status 行为比很多应用预期的范围更窄：

- status `500` 及以上会把 span 标记为 `ERROR`；
- status `400` 到 `499` 会标记为 `OK`；
- Defjs status-0 transport response 会标记为 `OK`；
- 经过 interceptor 抛出的错误会标记为 `ERROR`，并记录 exception。

HTTP interceptor 收到 Defjs `HttpResponse` 时就会结束 span。高层 output status dispatch 和 Struct 解码发生在 interceptor 返回之后。因此，后续 `RESPONSE_VALIDATION_FAILED` 或 `UNDECLARED_STATUS` 无法更新已经结束的 span。

提供 Meter 时，HTTP 会以秒为单位记录 `http.client.request.duration`。Attribute 包括 method、server address/port、可选 response status，以及 thrown error 的可选 `error.type`。

## SSE 语义

SSE 启动成功后，span 会保持打开，直到 `stream.closed` settle。它先记录 `sse.connected`，再在覆盖到的 close path 上记录 `sse.closed`、`sse.aborted` 或 `sse.error`。

有 Meter 时，SSE 记录：

| Metric                                 | 含义                                              |
| -------------------------------------- | ------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | 返回逻辑 stream handle 前的耗时。                 |
| `defjs.client.sse.connection.duration` | 从返回 handle 到终止关闭的耗时。                  |
| `defjs.client.sse.active_streams`      | `closed` promise 尚未 settle 的逻辑 handle 数量。 |

这些是 Defjs 自定义 metric。Active counter 包含物理重连尝试之间的时间，不表示当前打开的 HTTP connection 数量。

如果 core callback path 让 `stream.closed` 一直无法 settle，span 和 counter 也无法通过该 promise 结束。Reconnect callback 应保持不抛错。

## WebSocket 语义

WebSocket 启动成功后，span 会保持打开，直到 `session.closed` settle。它先记录 `websocket.connected`，再在覆盖到的 path 上记录 `websocket.closed` 或 `websocket.error`。

有 Meter 时，WebSocket instrumentation 使用：

| Metric                                       | 含义                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | 返回逻辑 session 前的耗时。                        |
| `defjs.client.websocket.connection.duration` | 从返回 session 到终止关闭的耗时。                  |
| `defjs.client.websocket.active_connections`  | `closed` promise 尚未 settle 的逻辑 session 数量。 |

Metric 名称写的是 connection，但实现统计逻辑 session，包括 reconnect delay gap，不统计物理 socket。

这里没有稳定的通用 WebSocket semantic convention。Package 默认不会为每条 message 创建 span，也不会记录 payload 和 queue length。

## 敏感数据与覆盖限制

默认 `url.full` 根据 request endpoint 和 base endpoint 解析，而不是根据已序列化 query string 生成；但解析后的 path 仍可能包含敏感 identifier。WebSocket propagation 会另外把字段追加到实际 query string。

`recordException(...)` 会收到 thrown error 和部分 close cause。Error message 和 stack 可能暴露敏感数据。请配置 SDK-level processor 和 exporter 脱敏；这个 adapter 不会替应用清理 exception。

部署前，请把 adapter 和服务实际使用的 SDK、exporter、processor、context manager、自动 instrumentation 一起验证。在真实流量下检查端到端 baggage、敏感数据脱敏、shutdown/flush 和重复 span。

## 下一步

- [Interceptors](/zh-Hans/core/interceptors)：与其他 client interceptor 的顺序。
- [SSE](/zh-Hans/core/sse) 和 [WebSocket](/zh-Hans/core/web-socket)：这里统计的逻辑 handle/session 生命周期。
