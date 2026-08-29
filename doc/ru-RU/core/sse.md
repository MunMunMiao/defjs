---
title: Server-Sent Events
description: Читай типизированный SSE-стрим, закрой его и дождись terminal closed promise.
---

# Server-Sent Events

Открой стрим, итерируй его и освободи принадлежащий handle через `await using`. Ручные `close()` и `closed` остаются доступны; клиенты и плагины не dispose’ят возвращённый стрим за тебя.

## Базовая настройка

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, stream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using ownedStream = stream
  for await (const event of ownedStream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## Опиши стрим

`defineEventStream(...)` нужен `events`, положительный safe-integer `maxBufferSize`, положительный safe-integer `maxQueueSize` и относительный `path`. Method по умолчанию `GET`.

Request input может иметь `path`, `query` и `headers` — не `body`. Кастомный `build` получает только path/query/header setters. Defjs шлёт `Accept: text/event-stream`, если ты ещё не поставил `Accept`.

Один логический стрим может охватить несколько физических Fetch-попыток. SSE по умолчанию ретраит транзиентные network и stream-read сбои даже без reconnect options; без лимита `attempts` эти ретраи unbounded. Ты всё равно получаешь один handle и один async iterator.

## Открой и посмотри

`client.execute(...)` resolves только после прохождения проверок status, content-type и body:

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

Response должен быть successful, media type essence `text/event-stream`, и иметь body. Non-2xx startup → `HTTP_STATUS`. Плохой content type или нет body → `RESPONSE_VALIDATION_FAILED`. Снимок response всё ещё может сидеть в третьем слоте кортежа, когда валидация падает после прихода response.

`startupOpen` — начальный снимок. `stream.open` live и меняется на более поздних физических opens. Держи значение кортежа, когда важен первый response.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## Декодируй события

Wire event name → `events[eventName]`; иначе `events.default`. Нет matching Struct → событие не доставляется. Нет SSE-поля `event` → логическое имя `message`.

SSE `data` начинается как text. Selected Struct решает conversion:

| Struct                                                                 | Conversion                                                 |
| ---------------------------------------------------------------------- | ---------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | Остаётся text                                              |
| `struct.number()`                                                      | Trimmed text должен быть finite number; пустой invalid     |
| `struct.boolean()`                                                     | Trimmed text ровно `true` или `false`                      |
| `struct.json(inner)`                                                   | Parse JSON, потом decode через `inner`                     |
| Object, array, union, другие ordinary Structs                          | Decode text напрямую; JSON-looking text **не** auto-parsed |

Emitted value: `event`, декодированный `data`, опциональный непустой `id`. С `default` неизвестные имена событий — `string` в inferred union.

## Наблюдай invalid events

Invalid/undeclared события дропаются, не ставятся в очередь. `withSSEOnInvalidEvent(...)` может наблюдать raw ID, имя, text data, плюс `missing-struct` или `validation-failed` и опциональный cause.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

Observer бежит на transform boundary. Его сбой изолирован, пока active attempt signal не aborted. Держи его коротким; не считай raw event data trusted.

## Reconnect

Настройки reconnect кастомизируют default retry path — они не обязательны, чтобы включить ретраи. Нормальный EOF не ретраится. Network и stream-read сбои могут ретраиться. Status/content-type validation, parser limits, message transform failures, queue overflow и нормальный EOF — terminal для логического стрима.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` считает ретраи после initial attempt; `attempts: 0` отключает retry. Нет лимита attempt → unbounded built-in retries. `delayMs` — начальный интервал; `factor` растёт; `maxDelayMs` caps base. SSE `jitter` — **0–1 multiplicative factor**, как WebSocket. Поле стрима `retry:` обновляет текущий интервал. Policy callback, вернувший false / throw / reject, заканчивает логический стрим.

Последний распарсенный event ID становится `Last-Event-ID` на более поздней попытке. Знай replay-семантику сервера до unbounded reconnect.

## Лимиты buffer и queue

Оба — положительные safe integers. Overflow fatal — без silent discard старых событий.

| Limit           | Защищает                                               | Terminal code           |
| --------------- | ------------------------------------------------------ | ----------------------- |
| `maxBufferSize` | Incomplete/oversized SSE line/event при парсинге       | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | События производятся быстрее, чем читает один consumer | `QUEUE_OVERFLOW`        |

Fatal stream также чистит buffered events, отменяет active body, reject’ит iterator и resolves `stream.closed` с `code: 'error'`.

## Close и dispose

`EventStreamHandle`: один live opening snapshot, один terminal promise, один `close`, один async iterator и один стандартный async disposer.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

interface StreamApi<T> extends AsyncIterable<T>, AsyncDisposable {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

Terminal codes: `eof`, `aborted` или `error`. Результат `error` также несёт `EventStreamErrorCode`: `INVALID_RESPONSE`, `MESSAGE_PROCESSING_FAILED`, `PARSER_LIMIT_EXCEEDED`, `QUEUE_OVERFLOW`, `TIMEOUT` или `TRANSPORT_ERROR`.

`close(reason)` abort’ит active attempt, закрывает очередь, settles как `aborted`. Loop `break` / `return` / throw вызывает iterator return и закрывает с `iterator-return`. Код, который execute’ит команду, владеет closure.

`await using` вызывает тот же owned close path и ждёт, пока остановятся чтение/reconnect Defjs и освободится active reader lock. Он не гарантирует завершение provider-controlled `ReadableStream.cancel()`, если его promise завис навсегда. Когда нужны reason или terminal result, по-прежнему можно явно вызвать `stream.close(reason)`, затем `await stream.closed`.

Структурные реализации `EventStreamHandle` теперь обязаны предоставить `[Symbol.asyncDispose](): PromiseLike<void>` и связать его с тем же lifecycle. Для implementers это compile-time breaking change; consumers, которые только получают Defjs handle, не обязаны делать новый runtime-вызов.

Минимальный поддерживаемый и проверенный в репозитории lib-контракт — `ES2022`, `ESNext.Disposable`, `DOM` и `DOM.Iterable` с зафиксированным TypeScript 7. Эта комбинация образует единый baseline; это не означает, что каждая declaration независимо требует все четыре элемента. Непроверенные старые compiler версии не обещаны. Обычный HTTP Client не является `AsyncDisposable`; управляй запросами через timeout или `AbortSignal`.

Держи credentials, event data, event IDs, causes и stream URL вне routine логов. `withCredentials(true)` влияет на Fetch cookies для SSE; он не настраивает WebSocket auth.

## Связанные рецепты

- [Читать SSE-стрим](../recipes/consume-sse.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
