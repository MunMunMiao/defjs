---
title: '@defjs/opentelemetry-server'
description: 出方向の計装 option、`withOpenTelemetryServer` です。
---

# OpenTelemetry server {#page}

クライアント作成時に出方向の計装を足します。HTTP / SSE / WebSocket の interceptor を追加します。入方向のサーバー計装ではなく、OpenTelemetry SDK も初期化しません。

[OpenTelemetry server ガイド](../plugins/opentelemetry-server.md) を見てください。

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

有効な輸送ごとに interceptor を 1 本足します。`createClient` のときに重ねてください。

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` は必須です。`meter` は任意 — 省略するとこのパッケージの metrics は出しません。`propagator` なし → W3C Trace Context + Baggage です。

HTTP、SSE、WebSocket は既定でオンです。輸送に `{ enabled: false }` を渡すとスキップします。

## OpenTelemetryServerOptions {#OpenTelemetryServerOptions}

```ts
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

## OpenTelemetryServerTransportOptions {#OpenTelemetryServerTransportOptions}

```ts
interface OpenTelemetryServerTransportOptions<TResponse> {
  enabled?: boolean
  startSpanHook?: (request: HttpRequest) => Attributes
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, res: TResponse, req: HttpRequest) => Promise<void> | void
}

type OpenTelemetryServerHttpOptions = OpenTelemetryServerTransportOptions<HttpResponse<unknown>>
type OpenTelemetryServerSSEOptions = OpenTelemetryServerTransportOptions<EventStreamHandle<unknown>>
interface OpenTelemetryServerWebSocketOptions extends OpenTelemetryServerTransportOptions<WebSocketSessionLike> {
  queryPropagation?: boolean
}
```

`startSpanHook` は各 HTTP、SSE、WebSocket transport の span 作成前に同期実行されます。application 属性は最後に適用されるので、`url.full` などを上書きできます。throw すると Defjs は `defjs.otel.hook.error` を記録し、built-in 属性で request を継続します。`requestHook` と `responseHook` は span 作成後のままです。

デフォルトの `url.full` は、任意の `request.baseEndpoint` に対して `request.endpoint` を解決するだけで、独立した `request.queryString` を追加しません。これは redaction ではなく、組み込み redactor policy もありません。完全またはマスク済み URL は `startSpanHook` で明示的に構築してください。

`queryPropagation` の既定は `false` です。WebSocket URL に trace context を載せてよいときだけオンにしてください。
