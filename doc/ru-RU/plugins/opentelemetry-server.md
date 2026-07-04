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

## Настройка workspace репозитория

Эта страница сейчас описывает использование source/workspace внутри этого репозитория. `@defjs/opentelemetry-server` находится в `packages/opentelemetry-server`, а его peer dependency ожидает соответствующую workspace-версию `@defjs/core` из `packages/core`.

Показанные ниже import specifier используют имена пакетов, но внутри этого репозитория они резолвятся в исходные пакеты workspace, а не в пару пакетов, опубликованных в registry. Зависимости OpenTelemetry SDK для вашего приложения по-прежнему нужно устанавливать и инициализировать отдельно.

Публичный npm сейчас не предоставляет `@defjs/opentelemetry-server`, а последняя отдельно опубликованная версия `@defjs/core`, доступная там, не является совместимым peer для этого workspace-пакета. Если позже вы опубликуете и `@defjs/opentelemetry-server`, и совместимую версию `@defjs/core` в контролируемый вами registry или другой registry, где доступны обе версии, устанавливайте в такой среде эти опубликованные версии вместе, а не смешивайте этот workspace-пакет с несовместимым отдельным релизом `@defjs/core`.

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
| `queryPropagation` | `boolean`                 | `true`       | Инжектировать trace context в query-строку URL WebSocket для совместимости с браузером. Для чувствительного к безопасности продакшн-трафика рекомендуемый базовый вариант — явно установить `false`. |
| `requestHook`      | `(span, req) => void`     | `undefined`  | Кастомизировать WebSocket-span перед запросом соединения                                 |
| `responseHook`     | `(span, session) => void` | `undefined`  | Кастомизировать WebSocket-span после возврата сессии, `session` — `WebSocketSessionLike` |

> **Обработка исключений в хуках**: Если `requestHook` или `responseHook` выбрасывают, ошибка записывается в событие span'а `defjs.otel.hook.error`, но клиентский запрос/поток/сессия **продолжается нормально**.
>
> **Гигиена атрибутов**: В `requestHook` / `responseHook` предпочитайте явные allowlists, redaction и стабильные low-cardinality атрибуты. Не прикрепляйте сырые query-строки, тела запроса/ответа, полные заголовки, значения baggage или payload сообщений, если приложение уже не проверило требования к приватности, cardinality, retention и redaction.

## Миграция со старого API

| Старая конфигурация       | Новая конфигурация                                              |
| ------------------------- | --------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                      |
| `sse: false`              | `sse: { enabled: false }`                                       |
| `webSocket: false`        | `webSocket: { enabled: false }`                                 |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                  |

Старые хуки верхнего уровня и булевы переключатели транспортов намеренно удалены, чтобы каждый транспорт предоставлял корректные типы request/response. Передача этих удалённых старых JavaScript-опций теперь вызывает ошибку миграции вместо того, чтобы молча интерпретироваться как включённая инструментализация.

## HTTP-семантические конвенции и метрики

HTTP-трассировка следует стабильным OpenTelemetry HTTP-клиент семантическим конвенциям. По умолчанию записываются `SpanKind.CLIENT` span'ы со следующими базовыми атрибутами:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Когда предоставлен `meter`, собираются следующие стабильные метрики:

| Метрика                        | Единица | Атрибуты                                                                                                                                          |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`     | `http.request.method`, опционально `http.response.status_code`, опционально `server.address`, опционально `server.port`, опционально `error.type` |

По умолчанию **этот пакет не добавляет тела запроса/ответа, полные заголовки, значения baggage, размеры payload или payload сообщений как пользовательские поля телеметрии**. Он также **не создаёт отдельных span-атрибутов или метрик для сырых query-строк**. Однако `url.full` отражает URL, который реально конструирует ваше приложение, поэтому если сам URL уже содержит query-строку, она может появиться и там. По возможности не помещайте в URL tokens, user ids или другие чувствительные либо высококардинальные входные данные.

Не добавляйте сырые query-строки, тела запроса/ответа, полные заголовки, значения baggage или payload сообщений в spans или метрики, если приложение уже не проверило требования к приватности, cardinality, retention и redaction. При расширении телеметрии через хуки предпочитайте явные allowlists, redaction и стабильные low-cardinality атрибуты.

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

Браузерные WebSocket-клиенты обычно не могут задавать произвольные HTTP-заголовки, поэтому во время выполнения `webSocket.queryPropagation` по умолчанию равно `true` ради совместимости. При таком значении trace context добавляется в query-строку URL WebSocket.

URL c query-строкой могут логироваться, кэшироваться и передаваться дальше, например через прокси, браузеры, APM-инструменты, access-логи и средства сетевой отладки. Поэтому через query-строку нельзя передавать tokens, user ids или другие высококардинальные значения. Если propagator включает `baggage`, значения `baggage` тоже могут попасть в URL и унести чувствительные данные.

Для чувствительного к безопасности production WebSocket-трафика безопасной базовой настройкой должно быть явное `webSocket.queryPropagation: false`:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

После отключения trace context больше не переносится через URL WebSocket. Если серверу всё ещё нужно связывать соединение с trace, используйте на уровне приложения другой уже проверенный механизм корреляции.

## Что дальше

- [Client](/core/client) — `createClient` и полная транспортная конфигурация
- [SSE](/core/sse) — `defineEventStream` и потребление потоковых событий
- [WebSocket](/core/web-socket) — `defineWebSocket` и real-time коммуникация
