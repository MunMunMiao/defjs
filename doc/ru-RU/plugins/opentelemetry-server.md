---
title: OpenTelemetry server
description: Включи исходящую инструментализацию транспорта Defjs своим Tracer и опциональным Meter.
---

# OpenTelemetry server

Включай outbound instrumentation при создании клиента. `@defjs/opentelemetry-server` дописывает interceptors HTTP, SSE и WebSocket. Это **не** inbound server instrumentation и **не** инициализация OpenTelemetry SDK.

## Базовая настройка

Инициализируй SDK в другом месте. Передай его API-объекты:

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')
const readOrders = defineRequest({
  method: 'GET',
  operation: 'orders.read',
  path: '/orders',
})

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer, meter }))

const [error] = await client.execute(readOrders())
if (error) console.error(error.kind, error.code)
```

`tracer` обязателен. `meter` опционален — опусти, чтобы выключить metrics пакета. Нет `propagator` → adapter собирает composite W3C Trace Context + W3C Baggage propagator. Он не читает и не инициализирует global SDK config за тебя.

`withOpenTelemetryServer(options)` возвращает core `ClientOption`. Применяй его в момент `createClient`, чтобы на каждый включённый транспорт дописался один interceptor. HTTP, SSE и WebSocket включены по умолчанию; `{ enabled: false }` выключает один транспорт.

Adapter может создать transport telemetry даже когда запрос падает на transport layer. Экспортируется ли что-то — зависит от твоего SDK и exporters.

## Scope

Ты владеешь SDK init, providers, exporters, processors, context, sampling, redaction, flush и shutdown. Этот пакет потребляет `Tracer`, опциональный `Meter` и опциональный `TextMapPropagator`, которые ты передал. В нём нет встроенного redactor или политики sensitive keys.

Нет кеширования, ретраев, message-level spans или application command-outcome policy. Рассчитан на server-side Node.js. Published package нуждается в Node.js 22+, peers `@defjs/core`, `@opentelemetry/api` 1.x, `@opentelemetry/core` 2.x.

Public API: `withOpenTelemetryServer` плюс `OpenTelemetryServerOptions`, `OpenTelemetryServerHttpOptions`, `OpenTelemetryServerSSEOptions`, `OpenTelemetryServerWebSocketOptions`.

## Опции и hooks

Hooks сидят рядом с транспортом, который меняют. Синхронный `startSpanHook(request)` выполняется до создания span и возвращает начальные `Attributes`; application attributes применяются последними и могут переопределить встроенные значения. `requestHook` и `responseHook` получают уже созданный span и могут вернуть `void` или promise. Сбой hook записывает `defjs.otel.hook.error` и **не** останавливает операцию клиента; при сбое start hook используются встроенные начальные attributes.

```typescript twoslash
import { createClient, createResolvedRequestUrl, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('orders-service')
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    http: {
      startSpanHook(request) {
        const attributes = { 'app.operation': request.operation ?? 'unclassified' }
        if (!request.baseEndpoint) return attributes
        const url = createResolvedRequestUrl(request.baseEndpoint, request.endpoint)
        if (request.queryString) url.search = request.queryString
        url.searchParams.delete('access_token')
        return { ...attributes, 'url.full': url.href }
      },
      requestHook(span, request) {
        span.setAttribute('app.request.started', true)
      },
      responseHook(span, response) {
        span.setAttribute('app.status', response.status)
      },
    },
    sse: { enabled: false },
    webSocket: { enabled: false },
  }),
)

void client
```

Сигнатуры hooks:

- Все три транспорта: `startSpanHook(request): Attributes` (синхронно, до создания span)
- HTTP: `requestHook(span, request)` и `responseHook(span, response, request)`
- SSE: `requestHook(span, request)` и `responseHook(span, stream, request)`
- WebSocket: `requestHook(span, request)` и `responseHook(span, session, request)`

Пустой transport object включает этот транспорт. Старые boolean transport switches и старые top-level hooks отклоняются — используй transport option objects и transport-scoped hooks.

## Идентичность операции и propagation

Ставь статический `operation` на `defineRequest`, `defineEventStream` или `defineWebSocket`, когда у команды стабильная идентичность. Adapter использует его в именах spans и как `defjs.operation`. Он никогда не выводит identity из resolved path, identifier, tenant или query string:

```typescript twoslash
import { defineEventStream, defineRequest, defineWebSocket, struct } from '@defjs/core'

const readOrders = defineRequest({
  method: 'GET',
  operation: 'orders.read',
  path: '/orders',
})
const orderEvents = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  operation: 'orders.watch',
  path: '/orders/events',
  events: { update: struct.json(struct.object({ id: struct.number() })) },
})
const orderSocket = defineWebSocket({
  maxIncomingQueueSize: 100,
  operation: 'orders.connect',
  path: '/orders/socket',
  incoming: { update: struct.object({ id: struct.number() }) },
})

void readOrders
void orderEvents
void orderSocket
```

Имена spans становятся `GET orders.read`, `SSE orders.watch`, `WebSocket orders.connect`. Без `operation` fallback — method / `SSE` / `WebSocket`, а `defjs.operation` опускается.

HTTP и SSE инжектят propagated fields в request headers. Существующие `Headers` instances переиспользуются и мутируются; иначе создаётся новый `Headers`. WebSocket query propagation — **opt-in** (браузеры не могут добавить произвольные handshake headers):

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

const tracer = trace.getTracer('orders-service')
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    webSocket: { queryPropagation: true },
  }),
)
```

С `queryPropagation` поля propagator дописываются в connection query string. Сначала проверь URL logging, proxy visibility, access logs, baggage и retention. `requireParentSpan: true` пропускает создание span, propagation, hooks и metrics, когда нет active parent, потом вызывает `next` без изменений.

## Семантика HTTP, SSE и WebSocket

Adapter измеряет transport lifetimes, не каждую стадию интерпретации команды.

- **HTTP** — span начинается в HTTP interceptor и заканчивается, когда он получает Defjs `HttpResponse`. Status dispatch, representation checks и Struct decode идут после. Поздний `RESPONSE_VALIDATION_FAILED` или `UNDECLARED_STATUS` не может обновить уже ended transport span.
- **SSE** — span открыт, пока не settles `stream.closed`. Записывает `sse.connected`, потом `sse.closed` / `sse.aborted` / `sse.error`. Один логический стрим (включая reconnects) → один span. Нет per-event spans.
- **WebSocket** — span открыт, пока не settles `session.closed`. Events: `websocket.connected`, `websocket.closed`, `websocket.error`. Reconnecting physical sockets остаются частью логической сессии. Нет per-message spans.

Нужен финальный результат команды, не только transport? Оберни `client.execute(...)` в application span:

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { SpanStatusCode, trace } from '@opentelemetry/api'

const tracer = trace.getTracer('orders-service')
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
const readOrders = defineRequest({ method: 'GET', operation: 'orders.read', path: '/orders' })

const outcome = await tracer.startActiveSpan('orders.command', async (span) => {
  try {
    const outcome = await client.execute(readOrders())
    const [error] = outcome
    if (error) {
      span.setAttribute('error.type', error.code)
      span.setStatus({ code: SpanStatusCode.ERROR })
    }
    return outcome
  } finally {
    span.end()
  }
})

void outcome
```

Outer span — твой. Плагин всё равно репортит lower-level transport span — два разных вопроса.

## Справка

Когда передан `meter`:

| Metric                                       | Meaning                                          |
| -------------------------------------------- | ------------------------------------------------ |
| `http.client.request.duration`               | HTTP request duration (seconds)                  |
| `defjs.client.sse.connect.duration`          | Time until SSE handle returned                   |
| `defjs.client.sse.connection.duration`       | Handle return → terminal close                   |
| `defjs.client.sse.active_streams`            | Logical SSE handles with pending `closed`        |
| `defjs.client.websocket.connect.duration`    | Time until WebSocket session returned            |
| `defjs.client.websocket.connection.duration` | Session return → terminal close                  |
| `defjs.client.websocket.active_connections`  | Logical WebSocket sessions with pending `closed` |

Active SSE/WebSocket instruments считают логические ресурсы (включая reconnect gaps), не physical sockets или отдельные HTTP attempts.

HTTP spans записывают method, resolved `url.full`, server address/port когда доступны, и response status когда получен. Default `url.full` resolve’ит `request.endpoint` относительно опционального `request.baseEndpoint` и не добавляет независимый `request.queryString`. Это граница построения, не sanitization. Используй `startSpanHook`, когда нужно собрать полный или отредактированный application-owned URL. Status `400+` → span status `ERROR` со status string как `error.type`. Status `100..399` оставляет span status unset. Status-zero transport outcome без response status; cancel оставляет status unset; timeout/other transport failures используют `TIMEOUT` или `NETWORK_ERROR`. Metrics используют стабильные dimensions: method, static operation, server address/port, response status, low-cardinality error type.

SSE/WebSocket connection metrics записывают connect time, logical connection duration, active resource count, `defjs.result`, operation, server address/port и low-cardinality failure types. По умолчанию нет request/response bodies, message payloads, queue lengths или per-message spans.

Считай `url.full` и `recordException(...)` потенциально чувствительными. Defjs не редактирует их за тебя. Держи имена операций и hook attributes allowlisted; redact через `startSpanHook` или SDK processors/exporters. Не копируй raw URL, query strings, headers, baggage или payloads в custom telemetry без review privacy, cardinality, retention и redaction.

WebSocket query propagation может раскрыть trace context и baggage браузерам, proxies, access logs и телеметрии. Это не credential channel. `withCredentials(true)` — Fetch credentials для HTTP/SSE — не WebSocket auth.

Adapter не init/shut down SDK и не dispose’ит core клиент или transport handles. Ты flush’ишь telemetry и закрываешь HTTP/SSE/WebSocket работу. См. [Interceptors](../core/interceptors.md), [SSE](../core/sse.md) и [WebSocket](../core/web-socket.md).

## Связанные рецепты

- [Тест с локальным Fetch handle](../recipes/test-with-handle.md)
- [Читать SSE-стрим](../recipes/consume-sse.md)
- [Открыть WebSocket-сессию](../recipes/websocket-session.md)
