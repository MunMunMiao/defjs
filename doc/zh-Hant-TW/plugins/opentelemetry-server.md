---
title: OpenTelemetry Server
description: 使用應用程式提供的 OpenTelemetry Tracer 與選用 Meter，觀測 outbound Defjs HTTP、SSE 與 WebSocket client。
---

# `@defjs/opentelemetry-server`

儘管套件名稱含有 server，這個 adapter 觀測的是 outbound Defjs client 工作。它不是 inbound server instrumentation，也不會初始化 OpenTelemetry SDK。

應用程式負責：

- SDK 與 provider setup；
- exporter 與 processor 設定；
- context manager 與 active-context setup；
- sampling、attribute policy 與敏感資料遮罩；
- force-flush 與 shutdown。

把應用程式提供的 `Tracer` 與選用的 `Meter` 傳給 `withOpenTelemetryServer(...)`。

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

Adapter 會為每個啟用的 transport 加入一個 interceptor。選項仍依一般 client order 執行，因此它和其他攔截器的相對位置，會決定 span 包住哪些工作。

## 選項

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

每個 transport option 都接受 `enabled?: boolean`、`requestHook` 與 `responseHook`。WebSocket 另外接受 `queryPropagation?: boolean`。

三種傳輸預設都啟用。要停用其中一種，請傳入 option object：

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

舊的 boolean transport field、top-level hook 與 `webSocketQueryPropagation` 會在 runtime 以 migration error 拒絕。目前的形式是 transport option object、transport-scoped hook，以及 `webSocket.queryPropagation`。

## Propagation

省略 `propagator` 時，套件會自行建立一個包含 W3C Trace Context 與 W3C Baggage propagator 的 `CompositePropagator`，不會讀取 global propagator 設定。

HTTP 與 SSE 會把 propagator 產生的每個欄位注入 request header。若 `req.headers` 已經是 `Headers` instance，目前實作會沿用並直接修改同一個 instance；否則才會建立新的 `Headers` 物件。WebSocket query propagation 預設為 `false`，只有明確設定 `queryPropagation: true` 才會啟用。由於瀏覽器 socket 無法加入任意 handshake header，啟用後會把 propagator 產生的每個欄位附加到 connection query string。

每個攔截器在建立 span 前，也會對 request header 呼叫 `propagator.extract(...)`。請只把這個 carrier 視為由應用程式控制的可信輸入。不要讓不可信來源傳入 `traceparent`、`tracestate` 或 `baggage`，否則這些欄位可能取代目前的 active parent context。請在 request 到達這個攔截器前，移除或正規化不可信的 propagation field。

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

啟用前必須審查部署環境的 URL propagation。Trace context 與 baggage 可能被瀏覽器、proxy、access log 與 telemetry system 記錄，custom propagator 也可能加入 `traceparent` 以外的欄位。伺服器支援時，優先使用經過通訊協定審查的首幀或短期一次性 connection ticket。

`requireParentSpan: true` 會在攔截器進行任何 instrumentation 前檢查 active parent span。沒有 active span 時，它會略過 span creation、propagation、hook 與 metric，直接原樣呼叫下一個 handler。

## Hook 行為

Hook 會收到各 transport 對應的 span 與 request/result：

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

Hook 可以回傳 `void` 或 `Promise<void>`，但維持非阻塞 observer 語義。同步 throw 與非同步 rejection 都會被捕捉並記錄成 `defjs.otel.hook.error`，不會中斷 client operation；記錄 telemetry 本身的失敗也會被隔離。

Attribute 請使用 allowlist 並保持低 cardinality。不要附加 raw header、query string、body、baggage、event ID、message payload 或 credential。

## HTTP 語意

HTTP interceptor 會建立 `SpanKind.CLIENT` span，並記錄：

- request method 作為 span name，因為 Defjs 不提供低 cardinality URL template；
- `http.request.method`；
- `url.full`；
- `server.address` 與選用的 `server.port`；
- 只在收到真實 response status 時記錄 `http.response.status_code`。

這不代表完整遵循 HTTP semantic convention。

HTTP span status 與 `error.type` 遵循以下規則：

- status `100` 到 `399` 保持 span status 未設定，也不設定 `error.type`；
- status `400` 以上會把 client span 標成 `ERROR`，並把 `error.type` 設為 status code 字串；
- Defjs status 0 transport result 不設定 `http.response.status_code`；caller cancellation 保持 status 未設定，也不設定 `error.type`；timeout 使用 `ERROR` / `TIMEOUT`，其他 transport failure 使用 `ERROR` / `NETWORK_ERROR`；
- 經由 interceptor throw 的 error 會把 span 標成 `ERROR`，記錄 exception，並使用它的 `Error.name` 或其他低 cardinality fallback 作為 `error.type`。

HTTP interceptor 收到 Defjs `HttpResponse` 時，HTTP span 就會結束。High-level output status dispatch 與 Struct decoding 發生在 interceptor return 之後，因此稍後產生的 `RESPONSE_VALIDATION_FAILED` 或 `UNDECLARED_STATUS` 無法更新已結束的 span。

提供 Meter 時，HTTP 會以秒為單位記錄 `http.client.request.duration`。Attribute 包含 method、server address/port、選用的 response status 與選用的 `error.type`。Metric 使用與 HTTP span 相同的 response status 和 `error.type` 分類。

## SSE 語意

SSE 成功啟動後，span 會保持開啟到 `stream.closed` settle。它先記錄 `sse.connected`，再依涵蓋到的 close path 記錄 `sse.closed`、`sse.aborted` 或 `sse.error`。

有 Meter 時，SSE 會提供：

| Metric                                 | 意義                                              |
| -------------------------------------- | ------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | 到回傳邏輯 stream handle 為止的時間。             |
| `defjs.client.sse.connection.duration` | 從回傳 handle 到終止關閉的時間。                  |
| `defjs.client.sse.active_streams`      | `closed` promise 尚未 settle 的邏輯 handle 數量。 |

這些是 Defjs 自訂 metric。Active counter 也會計入實體 reconnect attempt 之間的等待時間，並不是目前開啟的 HTTP connection 數量。

## WebSocket 語意

WebSocket 成功啟動後，span 會保持開啟到 `session.closed` settle。它先記錄 `websocket.connected`，再依涵蓋到的路徑記錄 `websocket.closed` 或 `websocket.error`。

有 Meter 時，WebSocket 會提供：

| Metric                                       | 意義                                               |
| -------------------------------------------- | -------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | 到回傳邏輯 session 為止的時間。                    |
| `defjs.client.websocket.connection.duration` | 從回傳 session 到終止關閉的時間。                  |
| `defjs.client.websocket.active_connections`  | `closed` promise 尚未 settle 的邏輯 session 數量。 |

Metric 名稱雖然寫 connections，實作計算的是邏輯 session，連 reconnect delay gap 也算在內；它不計算實體 socket。

這裡沒有穩定的通用 WebSocket semantic convention。套件不會為每個 message 建立 span，預設也不記錄 payload 或 queue length。

## 敏感資料與涵蓋限制

預設 `url.full` 從 request endpoint 與 base endpoint 解析，不包含序列化後的 query string；但解析後的 path 仍可能含敏感 identifier。WebSocket propagation 會另外把欄位附加到實際 query string。

`recordException(...)` 會收到 thrown error 與部分 close cause。Error message 與 stack 可能暴露敏感資料。請在 SDK-level processor 與 exporter 設定敏感資料遮罩；這個 adapter 不會替應用程式清理 exception。

部署前，請把 adapter 和服務實際使用的 SDK、exporter、processor、context manager、自動 instrumentation 一起驗證。用真實流量檢查端到端 baggage、敏感資料遮罩、shutdown/flush 與重複 span。

## 下一步

- [攔截器](/zh-Hant-TW/core/interceptors)說明它和其他 client interceptor 的順序。
- [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)說明這裡計算的邏輯 handle/session 生命週期。
