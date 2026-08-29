---
title: '@defjs/opentelemetry-server'
description: 'Исходящая инструментировка: `withOpenTelemetryServer`.'
---

# OpenTelemetry server {#page}

Включай outbound instrumentation при создании клиента. Дописывает interceptors HTTP, SSE и WebSocket. Это **не** inbound server instrumentation и **не** инициализация OpenTelemetry SDK.

См. [гайд OpenTelemetry server](../plugins/opentelemetry-server.md).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

Вешает по interceptor’у на каждый включённый транспорт. Клади в `createClient`.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` обязателен. `meter` опционален — без него пакетные metrics не пишутся. Нет `propagator` → W3C Trace Context + Baggage.

HTTP, SSE и WebSocket по умолчанию включены. `{ enabled: false }` пропускает транспорт.

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

`startSpanHook` выполняется синхронно до создания span для своего HTTP, SSE или WebSocket transport. Возвращённые attributes применяются после встроенных, поэтому приложение может переопределить `url.full` или другое начальное значение. Если hook бросает ошибку, Defjs создаёт span со встроенными attributes, записывает `defjs.otel.hook.error` и продолжает запрос; `requestHook` и `responseHook` сохраняют семантику после создания span.

По умолчанию `url.full` только resolve’ит `request.endpoint` относительно опционального `request.baseEndpoint`; отдельный `request.queryString` не добавляется. Эта граница не является redaction, а у пакета нет встроенного redactor или политики sensitive keys. Явно собери application-owned URL и при необходимости удали чувствительные параметры:

```ts
import { createResolvedRequestUrl, type HttpRequest } from '@defjs/core'
import type { Attributes } from '@opentelemetry/api'

const http = {
  startSpanHook(request: HttpRequest): Attributes {
    if (!request.baseEndpoint) return {}
    const url = createResolvedRequestUrl(request.baseEndpoint, request.endpoint)
    if (request.queryString) url.search = request.queryString
    url.searchParams.delete('access_token')
    return { 'url.full': url.href }
  },
}
```

`queryPropagation` по умолчанию `false`. Включай, только если ок класть trace context в WebSocket URL.
