---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Серверная интеграция с OpenTelemetry, предоставляющая исходящий сбор трасс и метрик для HTTP, SSE и WebSocket клиентов `@defjs/core`.

**Ключевое позиционирование**:

- **Серверная среда** (Node.js, Bun, Deno), не зависит от браузерной среды.
- **Не инициализирует SDK** — Вы должны инициализировать OpenTelemetry SDK внешне, затем передать созданный `Tracer` (и опционально `Meter`).
- **Разделение по транспортам** — HTTP, SSE и WebSocket имеют независимые перехватчики, жизненные циклы span'ов и размерности метрик.

## Установка

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## Базовое использование

Передайте внешне созданный `Tracer` и сконфигурируйте клиент через `withOpenTelemetryServer`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Инициализировать OpenTelemetry SDK внешне, затем получить tracer
const tracer = trace.getTracer('my-service')

// 2. Инжектировать tracer в конфигурацию клиента
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## Полная конфигурация

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // Обязательно
    meter, // Опционально, метрики собираются только при наличии
    propagator, // Опционально, по умолчанию W3C TraceContext + Baggage
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

### Параметры конфигурации

| Опция               | Тип                                   | По умолчанию               | Описание                                                                   |
| ------------------- | ------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **Обязательно**            | Внешний OpenTelemetry tracer                                               |
| `meter`             | `Meter`                               | `undefined`                | Внешний OpenTelemetry meter, при отсутствии метрики отключаются            |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Пользовательский propagator контекста                                      |
| `requireParentSpan` | `boolean`                             | `false`                    | Создавать исходящие span'ы только при наличии активного родительского span |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | Опции трасс/метрик HTTP-транспорта                                         |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | Опции трасс/метрик SSE-транспорта                                          |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | Опции трасс/метрик WebSocket-транспорта                                    |

### HTTP-опции

| Опция          | Тип                   | По умолчанию | Описание                                                                |
| -------------- | --------------------- | ------------ | ----------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`       | Включить HTTP-трассировку                                               |
| `requestHook`  | `(span, req) => void` | `undefined`  | Кастомизировать HTTP-span перед запросом, `req` — `HttpRequest`         |
| `responseHook` | `(span, res) => void` | `undefined`  | Кастомизировать HTTP-span после ответа, `res` — `HttpResponse<unknown>` |

### SSE-опции

| Опция          | Тип                      | По умолчанию | Описание                                                                                       |
| -------------- | ------------------------ | ------------ | ---------------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`       | Включить SSE-трассировку                                                                       |
| `requestHook`  | `(span, req) => void`    | `undefined`  | Кастомизировать SSE-span перед запросом потока                                                 |
| `responseHook` | `(span, stream) => void` | `undefined`  | Кастомизировать SSE-span после возврата хендла потока, `stream` — `EventStreamHandle<unknown>` |

### WebSocket-опции

| Опция              | Тип                       | По умолчанию | Описание                                                                                 |
| ------------------ | ------------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`       | Включить WebSocket-трассировку                                                           |
| `queryPropagation` | `boolean`                 | `true`       | Инжектировать контекст трасс в query-строку URL WebSocket                                |
| `requestHook`      | `(span, req) => void`     | `undefined`  | Кастомизировать WebSocket-span перед запросом соединения                                 |
| `responseHook`     | `(span, session) => void` | `undefined`  | Кастомизировать WebSocket-span после возврата сессии, `session` — `WebSocketSessionLike` |

> **Обработка исключений в хуках**: Если `requestHook` или `responseHook` выбрасывают, ошибка записывается в событие span'а `defjs.otel.hook.error`, но клиентский запрос/поток/сессия **продолжается нормально**.

## HTTP-семантические конвенции и метрики

HTTP-трассировка следует стабильным OpenTelemetry HTTP-клиент семантическим конвенциям. По умолчанию записываются `SpanKind.CLIENT` span'ы со следующими low-cardinality атрибутами:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Когда предоставлен `meter`, собираются следующие стабильные метрики:

| Метрика                        | Единица | Атрибуты                                                                                                                                          |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`     | `http.request.method`, опционально `http.response.status_code`, опционально `server.address`, опционально `server.port`, опционально `error.type` |

По умолчанию **тела запроса/ответа, все заголовки, сырые query-строки, размеры payload и детали сетевых событий не собираются**. Эти данные обычно высококардинальны или чувствительны. Добавляйте их явно через `requestHook` / `responseHook` при необходимости.

## SSE-трассировка на уровне соединения и кастомные метрики

SSE — это долгоживущий HTTP-ответ. Нормальная длительность HTTP-запроса завершается при установке потока, что не отражает, работает ли поток, прерван ли он или произошла ошибка. Поэтому этот пакет трактует SSE как **телеметрию уровня соединения**.

### Жизненный цикл span

SSE-span остаётся открытым до тех пор, пока `stream.closed` не резолвится, записывая следующие события жизненного цикла:

- `sse.connected` — Поток успешно установлен
- `sse.closed` — Поток нормально завершён (серверный EOF)
- `sse.aborted` — Активное закрытие через `stream.close()`
- `sse.error` — Ошибка соединения или исчерпание попыток переподключения

### Кастомные метрики

Когда предоставлен `meter`, собираются следующие кастомные метрики defjs (не являются официальными стабильными OpenTelemetry семантическими конвенциями):

| Метрика                                | Единица    | Значение                                                  |
| -------------------------------------- | ---------- | --------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Время установки соединения потока                         |
| `defjs.client.sse.connection.duration` | `s`        | Общая длительность от установки потока до закрытия/ошибки |
| `defjs.client.sse.active_streams`      | `{stream}` | Текущее количество активных SSE-потоков                   |

По умолчанию **per-event span'ы не создаются**, и **payload событий, event ID, `Last-Event-ID`, latency доставки, потерянные события или очереди переподключения не собираются**. Это семантика уровня приложения, которая может порождать высококардинальную или чувствительную телеметрию. Реализуйте их на уровне приложения при необходимости.

## WebSocket-трассировка на уровне соединения и кастомные метрики

WebSocket начинается с HTTP Upgrade handshake, но продакшн-среды больше заботят пост-handshake жизненный цикл соединения: активные соединения, длительность соединения, поведение close/error, и частота сбоев соединения. Поскольку WebSocket семантические конвенции OpenTelemetry ещё не стабильны, этот пакет использует кастомные метрики уровня соединения.

### Жизненный цикл span

WebSocket-span остаётся открытым до тех пор, пока `session.closed` не резолвится, записывая следующие события жизненного цикла:

- `websocket.connected` — Сессия успешно установлена
- `websocket.closed` — Соединение нормально закрыто
- `websocket.error` — Ошибка соединения

### Кастомные метрики

Когда предоставлен `meter`, собираются следующие кастомные метрики defjs:

| Метрика                                      | Единица        | Значение                                                  |
| -------------------------------------------- | -------------- | --------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Время установки WebSocket-сессии                          |
| `defjs.client.websocket.connection.duration` | `s`            | Общая длительность от установки сессии до закрытия/ошибки |
| `defjs.client.websocket.active_connections`  | `{connection}` | Текущее количество активных WebSocket-соединений          |

По умолчанию **per-message span'ы не создаются**, и **payload сообщений, размеры сообщений, обратное давление, buffered amount, субпротоколы или очереди переподключения не собираются**. Сообщение-уровневая телеметрия должна реализовываться на уровне приложения со стратегиями сэмплирования.

## Риск безопасности при propagation через query WebSocket

Браузерные WebSocket-клиенты обычно не могут устанавливать произвольные HTTP-заголовки, поэтому этот пакет по умолчанию инжектирует контекст трасс в query-строку URL WebSocket для браузерной совместимости.

Этот выбор имеет компромисс безопасности: query-строки могут появляться в access-логах, proxy-логах, инструментах браузерного/сетевого дебаггинга и APM URL-полях. Если propagator включает `baggage`, baggage-значения также записываются в URL, потенциально неся чувствительные данные.

Для чувствительного к безопасности WebSocket-трафика явно отключите propagation через query:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

После отключения контекст трасс больше не распространяется через URL. Сервер должен полагаться на другие механизмы для корреляции трасс (например, поля trace ID в протоколе сообщений уровня приложения).

## Что дальше

- [Client](/core/client) — `createClient` и полная транспортная конфигурация
- [SSE](/core/sse) — `defineEventStream` и потребление потоковых событий
- [WebSocket](/core/web-socket) — `defineWebSocket` и real-time коммуникация
