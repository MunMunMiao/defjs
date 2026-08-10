---
title: OpenTelemetry Server
description: 以應用程式提供的 OpenTelemetry Tracer 與 optional Meter，instrument outbound Defjs HTTP、SSE 及 WebSocket client。
---

# `@defjs/opentelemetry-server`

雖然 package 名稱有 server，這個 adapter 實際是為 outbound Defjs client 工作加入 instrumentation。它不是 inbound server instrumentation，亦不會初始化 OpenTelemetry SDK。

應用程式負責：

- SDK 與 provider setup；
- exporter 與 processor configuration；
- context manager 與 active-context setup；
- sampling、attribute policy 與敏感資料遮罩；
- force-flush 與 shutdown。

把應用程式提供的 `Tracer` 與 optional `Meter` 傳給 `withOpenTelemetryServer(...)`。

## 設定 Client

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

Adapter 會為每個已啟用 transport 加入一個 interceptor。Option 按一般 client order 執行，所以它相對其他 interceptor 的位置，會決定 span 包裹哪些工作。

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

每種 transport option 都接受 `enabled?: boolean`、`requestHook` 與 `responseHook`；WebSocket 另接受 `queryPropagation?: boolean`。

三種 transport 預設全部啟用。要停用其中一種，請使用 option object：

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

舊的 boolean transport field、top-level hook 與 `webSocketQueryPropagation` 會在 runtime 以 migration error 拒絕。目前形式是 transport option object、transport-scoped hook 及 `webSocket.queryPropagation`。

## Propagation

省略 `propagator` 時，package 會建立自己的 `CompositePropagator`，內含 W3C Trace Context 與 W3C Baggage propagator，而不會讀取 global propagator configuration。

HTTP 與 SSE 會把 propagator 產生的每個欄位注入 request header。如果 `req.headers` 已經是 `Headers` instance，目前實作會沿用並直接修改同一個 instance；否則才會建立新的 `Headers` object。WebSocket query propagation 預設為 `false`，只有明確設定 `queryPropagation: true` 才會啟用。由於 browser socket 不能加入任意 handshake header，啟用後會把 propagator 產生的每個欄位追加至 connection query string。

每個 interceptor 建立 span 前，亦會對 request header 呼叫 `propagator.extract(...)`。請只把這個 carrier 視為由應用控制的可信 input。不要讓不可信來源傳入 `traceparent`、`tracestate` 或 `baggage`，否則這些欄位可能取代目前的 active parent context。Request 到達這個 interceptor 前，應先移除或 normalize 不可信的 propagation field。

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

啟用前必須審查部署環境的 URL propagation。Trace context 與 baggage 可能被 browser、proxy、access log 或 telemetry system 記錄，custom propagator 亦可能加入 `traceparent` 以外的欄位。Server 支援時，優先使用經過 protocol review 的 first frame 或短期一次性 connection ticket。

`requireParentSpan: true` 會在 interceptor 作任何 instrumentation 前檢查 active parent span。沒有 active span 時，它會一併跳過 span creation、propagation、hook 與 metric，再原樣呼叫下一個 handler。

## Hook 行為

Hook 接收 transport-specific span 與 request/result：

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

Hook 可以回傳 `void` 或 `Promise<void>`，但維持非阻塞 observer 語義。同步 throw 與非同步 rejection 都會被捕捉並記錄成 `defjs.otel.hook.error`，不會中斷 client operation；記錄 telemetry 本身的失敗亦會被隔離。

只使用 allowlisted、low-cardinality attribute。不要附加 raw headers、query string、body、baggage、event ID、message payload 或 credentials。

## HTTP 語義

HTTP interceptor 建立 `SpanKind.CLIENT` span，並記錄：

- request method 作為 span name，因為 Defjs 沒有提供低 cardinality URL template；
- `http.request.method`；
- `url.full`；
- `server.address` 和可選 `server.port`；
- 只在收到真實 response status 時記錄 `http.response.status_code`。

這不代表完整符合 HTTP semantic convention。

HTTP span status 和 `error.type` 遵循以下規則：

- status `100` 至 `399` 保持 span status unset，亦不設定 `error.type`；
- status `400` 或以上把 client span 標記為 `ERROR`，並把 `error.type` 設為 status code string；
- Defjs status-0 transport result 不設定 `http.response.status_code`；caller cancellation 保持 status unset，亦不設定 `error.type`；timeout 使用 `ERROR` / `TIMEOUT`，其他 transport failure 使用 `ERROR` / `NETWORK_ERROR`；
- interceptor path throw 的 error 會把 span 標記為 `ERROR`，record exception，並使用它的 `Error.name` 或其他低 cardinality fallback 作為 `error.type`。

HTTP interceptor 收到 Defjs `HttpResponse` 時便結束 span。High-level output status dispatch 與 Struct decoding 在 interceptor 回傳後才發生，所以之後的 `RESPONSE_VALIDATION_FAILED` 或 `UNDECLARED_STATUS` 無法更新已結束的 span。

提供 Meter 時，HTTP 以秒記錄 `http.client.request.duration`。Attribute 包括 method、server address/port、optional response status 和 optional `error.type`。Metric 使用與 HTTP span 相同的 response status 和 `error.type` 分類。

## SSE 語義

SSE startup 成功後，span 會保持 open，直至 `stream.closed` settle。它先記錄 `sse.connected`，再於已涵蓋的 close path 記錄 `sse.closed`、`sse.aborted` 或 `sse.error`。

有 Meter 時，SSE 記錄：

| Metric                                 | 含義                                                  |
| -------------------------------------- | ----------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | 回傳 logical stream handle 前的時間。                 |
| `defjs.client.sse.connection.duration` | 由回傳 handle 至 terminal close 的時間。              |
| `defjs.client.sse.active_streams`      | `closed` promise 尚未 settle 的 logical handle 數量。 |

這些是 Defjs custom metric。Active counter 包括實體 reconnect attempt 之間的時間，不代表目前 open HTTP connection 的數量。

## WebSocket 語義

WebSocket startup 成功後，span 會保持 open，直至 `session.closed` settle。它先記錄 `websocket.connected`，再於已涵蓋的 path 記錄 `websocket.closed` 或 `websocket.error`。

有 Meter 時，WebSocket instrumentation 使用：

| Metric                                       | 含義                                                   |
| -------------------------------------------- | ------------------------------------------------------ |
| `defjs.client.websocket.connect.duration`    | 回傳 logical session 前的時間。                        |
| `defjs.client.websocket.connection.duration` | 由回傳 session 至 terminal close 的時間。              |
| `defjs.client.websocket.active_connections`  | `closed` promise 尚未 settle 的 logical session 數量。 |

Metric 名稱雖然寫 connection，實作統計的是 logical session，包括 reconnect delay gap，而不是實體 socket。

這裏沒有穩定的通用 WebSocket semantic convention。Package 預設不會為每條 message 建立 span，亦不記錄 payload 或 queue length。

## Sensitive Data 與 Coverage Limit

預設 `url.full` 由 request endpoint 與 base endpoint resolve，不是由 serialized query string 產生；但 resolved path 仍可能含 sensitive identifier。WebSocket propagation 會另外把欄位追加至實際 query string。

`recordException(...)` 會收到 thrown error 與部分 close cause。Error message 及 stack 可能洩漏 sensitive data。請設定 SDK-level processor 與 exporter 敏感資料遮罩；adapter 不會替應用程式 sanitize exception。

部署前，請把 adapter 同 service 實際使用的 SDK、exporter、processor、context manager、automatic instrumentation 一起驗證。用真實 traffic 檢查 end-to-end baggage、敏感資料遮罩、shutdown/flush 同重複 span。

## 下一步

- [Interceptors](/zh-Hant-HK/core/interceptors)：與其他 client interceptor 的 order。
- [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)：這裏統計的 logical handle/session lifetime。
