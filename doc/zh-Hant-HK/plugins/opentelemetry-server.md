---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

伺服器端 OpenTelemetry 整合套件，為 `@defjs/core` 的 HTTP、SSE 與 WebSocket 用戶端提供出站追蹤與指標收集。

**核心定位**：

- **伺服器環境**（Node.js、Bun、Deno），不相依瀏覽器環境。
- **不初始化 SDK** — 你必須在外部初始化 OpenTelemetry SDK，再傳入已建立的 `Tracer`（與選擇性的 `Meter`）。
- **依傳輸協定分離** — HTTP、SSE 與 WebSocket 各自擁有獨立攔截器、span 生命週期與指標維度。

## 安裝

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## 基本用法

傳入外部建立的 `Tracer`，並透過 `withOpenTelemetryServer` 設定用戶端：

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. 在外部初始化 OpenTelemetry SDK，再取得 tracer
const tracer = trace.getTracer('my-service')

// 2. 將 tracer 注入用戶端設定
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## 完整設定

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // 必填
    meter, // 選填，僅當提供時才收集指標
    propagator, // 選填，預設 W3C TraceContext + Baggage
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

### 設定選項

| 選項                | 類型                                  | 預設值                     | 說明                                     |
| ------------------- | ------------------------------------- | -------------------------- | ---------------------------------------- |
| `tracer`            | `Tracer`                              | **必填**                   | 外部 OpenTelemetry tracer                |
| `meter`             | `Meter`                               | `undefined`                | 外部 OpenTelemetry meter，省略則停用指標 |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | 自訂上下文傳播器                         |
| `requireParentSpan` | `boolean`                             | `false`                    | 僅當存在活躍父 span 時才建立出站 span    |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP 傳輸追蹤／指標選項                  |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE 傳輸追蹤／指標選項                   |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket 傳輸追蹤／指標選項             |

### HTTP 選項

| 選項           | 類型                  | 預設值      | 說明                                                     |
| -------------- | --------------------- | ----------- | -------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | 啟用 HTTP 追蹤                                           |
| `requestHook`  | `(span, req) => void` | `undefined` | 在請求前自訂 HTTP span，`req` 為 `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | 在回應後自訂 HTTP span，`res` 為 `HttpResponse<unknown>` |

### SSE 選項

| 選項           | 類型                     | 預設值      | 說明                                                                        |
| -------------- | ------------------------ | ----------- | --------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | 啟用 SSE 追蹤                                                               |
| `requestHook`  | `(span, req) => void`    | `undefined` | 在串流請求前自訂 SSE span                                                   |
| `responseHook` | `(span, stream) => void` | `undefined` | 在串流控制代碼回傳後自訂 SSE span，`stream` 為 `EventStreamHandle<unknown>` |

### WebSocket 選項

| 選項               | 類型                      | 預設值      | 說明                                                                     |
| ------------------ | ------------------------- | ----------- | ------------------------------------------------------------------------ |
| `enabled`          | `boolean`                 | `true`      | 啟用 WebSocket 追蹤                                                      |
| `queryPropagation` | `boolean`                 | `true`      | 將追蹤上下文注入 WebSocket URL 查詢字串                                  |
| `requestHook`      | `(span, req) => void`     | `undefined` | 在連線請求前自訂 WebSocket span                                          |
| `responseHook`     | `(span, session) => void` | `undefined` | 在工作階段回傳後自訂 WebSocket span，`session` 為 `WebSocketSessionLike` |

> **鉤子例外處理**：若 `requestHook` 或 `responseHook` 拋出錯誤，該錯誤會記錄在 span 的 `defjs.otel.hook.error` 事件中，但用戶端請求／串流／工作階段**會繼續正常執行**。

## HTTP 語義規範與指標

HTTP 追蹤遵循穩定的 OpenTelemetry HTTP 用戶端語義規範。預設記錄 `SpanKind.CLIENT` span，並附帶以下低基數屬性：

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

提供 `meter` 時，會收集以下穩定指標：

| 指標                           | 單位 | 屬性                                                                                                                  |
| ------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`、選填 `http.response.status_code`、選填 `server.address`、選填 `server.port`、選填 `error.type` |

預設情況下，**請求／回應主體、所有標頭、原始查詢字串、承載大小與網路事件細節皆不收集**。這些通常為高基數或敏感資料。若需要，請透過 `requestHook` / `responseHook` 明確添加。

## SSE 連線層級追蹤與自訂指標

SSE 是長生命週期的 HTTP 回應。一般 HTTP 請求耗時在串流建立時即結束，無法反映串流是否仍在運作、中斷或出錯。因此，本套件將 SSE 視為**連線層級**遙測。

### Span 生命週期

SSE span 會持續開啟直到 `stream.closed` 解析，並記錄以下生命週期事件：

- `sse.connected` — 串流成功建立
- `sse.closed` — 串流正常結束（伺服器 EOF）
- `sse.aborted` — 透過 `stream.close()` 主動關閉
- `sse.error` — 連線錯誤或重連耗盡

### 自訂指標

提供 `meter` 時，會收集以下 defjs 自訂指標（非官方 OpenTelemetry 穩定語義規範）：

| 指標                                   | 單位       | 含義                           |
| -------------------------------------- | ---------- | ------------------------------ |
| `defjs.client.sse.connect.duration`    | `s`        | 建立串流連線的耗時             |
| `defjs.client.sse.connection.duration` | `s`        | 從串流建立到關閉／錯誤的總耗時 |
| `defjs.client.sse.active_streams`      | `{stream}` | 目前活躍 SSE 串流數            |

預設情況下，**不建立逐事件 span**，且**不收集事件承載、事件 ID、`Last-Event-ID`、傳遞延遲、遺失事件或重連隊列**。這些屬於應用層語義，可能產生高基數或敏感遙測。若需要，請在應用層實作。

## WebSocket 連線層級追蹤與自訂指標

WebSocket 以 HTTP Upgrade 握手開始，但生產環境更關注握手後的連線生命週期：活躍連線數、連線耗時、關閉／錯誤行為、連線失敗率。由於 OpenTelemetry WebSocket 語義規範尚未穩定，本套件使用連線層級自訂指標。

### Span 生命週期

WebSocket span 會持續開啟直到 `session.closed` 解析，並記錄以下生命週期事件：

- `websocket.connected` — 工作階段成功建立
- `websocket.closed` — 連線正常關閉
- `websocket.error` — 連線錯誤

### 自訂指標

提供 `meter` 時，會收集以下 defjs 自訂指標：

| 指標                                         | 單位           | 含義                               |
| -------------------------------------------- | -------------- | ---------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | 建立 WebSocket 工作階段的耗時      |
| `defjs.client.websocket.connection.duration` | `s`            | 從工作階段建立到關閉／錯誤的總耗時 |
| `defjs.client.websocket.active_connections`  | `{connection}` | 目前活躍 WebSocket 連線數          |

預設情況下，**不建立逐訊息 span**，且**不收集訊息承載、訊息大小、背壓、緩衝量、子協定或重連隊列**。訊息層級遙測應在應用層搭配取樣策略實作。

## WebSocket 查詢傳播安全風險

瀏覽器 WebSocket 用戶端通常無法設定任意 HTTP 標頭，因此本套件預設將追蹤上下文注入 WebSocket URL 查詢字串，以確保瀏覽器相容性。

此選項存在安全權衡：查詢字串可能出現在存取紀錄、代理紀錄、瀏覽器／網路除錯工具與 APM URL 欄位中。若傳播器套件含 `baggage`，baggage 值也會寫入 URL，可能攜帶敏感資料。

對於安全敏感的 WebSocket 流量，請明確停用查詢傳播：

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

停用後，追蹤上下文不再透過 URL 傳播。伺服器必須相依其他機制進行追蹤關聯（例如應用層訊息協定中的 trace ID 欄位）。

## 接下來

- [用戶端](/core/client) — `createClient` 與完整傳輸設定
- [SSE](/core/sse) — `defineEventStream` 與串流事件消費
- [WebSocket](/core/web-socket) — `defineWebSocket` 與即時通訊
