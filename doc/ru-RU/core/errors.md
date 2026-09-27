---
title: Errors
description: Ветвись по замкнутому набору fault-кодов для 404, таймаутов, нечитаемых тел и transport failure.
---

# Errors

Обрабатывай 404, таймаут или нечитаемое тело, читая error-first кортеж, а не отлавливая throw. `Fault` — это нативный `Error` (`instanceof Error` истинно), размеченный одним полем: `code`.

Никакого `kind` нет. Класс провала — это отрезок до первого `_` в его коде, так что `NET_TIMEOUT` — провал класса `NET`, а `RES_STRUCT_MISMATCH` — класса `RES`. Читай префикс для грубой сортировки и код целиком для точного случая.

## Базовая настройка

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [err, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (err?.code === 'HTTP_STATUS' && err.status === 404) {
  console.log(err.data.message)
} else if (err?.code === 'NET_TIMEOUT') {
  console.log('timed out')
} else if (err?.code === 'RES_STRUCT_MISMATCH') {
  console.log('the response did not match what we declared', err.response.status)
} else if (!err) {
  console.log(user.name, response.status)
}
```

Поскольку набор замкнут, `switch` по `code` исчерпывающий:

```typescript twoslash
import { createNetworkFault, ERR_ABORTED, type Fault } from '@defjs/core'

function triage(fault: Fault): string {
  switch (fault.code) {
    case 'HTTP_STATUS':
      return `status ${fault.status}`
    case 'RES_MEDIA_TYPE_INVALID':
    case 'RES_DECODE_FAILED':
    case 'RES_STRUCT_MISMATCH':
      return 'the contract did not hold'
    case 'NET_TIMEOUT':
    case 'NET_ABORTED':
    case 'NET_UNREACHABLE':
    case 'NET_BODY_INCOMPLETE':
      return 'retryable'
    case 'REQ_INPUT_INVALID':
    case 'REQ_OPTIONS_INVALID':
    case 'REQ_BUILD_FAILED':
      return 'fix the call'
    case 'EXT_INTERCEPTOR_FAILED':
    case 'EXT_HOOK_FAILED':
    case 'EXT_OBSERVER_FAILED':
      return 'fix the code you attached'
    case 'CAP_BUFFER_EXCEEDED':
    case 'CAP_QUEUE_OVERFLOW':
      return 'raise a declared limit or read faster'
    case 'ENV_UNSUPPORTED':
      return 'the host runtime is missing something'
  }
}

const example: Fault = createNetworkFault(ERR_ABORTED)
console.log(triage(example))
```

## Стабильные коды

| Класс  | Коды                                                                   | Кому придётся меняться                             |
| ------ | ---------------------------------------------------------------------- | -------------------------------------------------- |
| `HTTP` | `HTTP_STATUS`                                                          | Пир ответил non-2xx; обрабатывай как бизнес-логику |
| `REQ`  | `REQ_INPUT_INVALID`, `REQ_OPTIONS_INVALID`, `REQ_BUILD_FAILED`         | Вызов или объявление endpoint                      |
| `NET`  | `NET_ABORTED`, `NET_TIMEOUT`, `NET_UNREACHABLE`, `NET_BODY_INCOMPLETE` | Никому, или ретрай                                 |
| `RES`  | `RES_MEDIA_TYPE_INVALID`, `RES_DECODE_FAILED`, `RES_STRUCT_MISMATCH`   | Объявление и пир нужно согласовать                 |
| `EXT`  | `EXT_INTERCEPTOR_FAILED`, `EXT_HOOK_FAILED`, `EXT_OBSERVER_FAILED`     | Код, который ты подключил к конвейеру              |
| `CAP`  | `CAP_BUFFER_EXCEEDED`, `CAP_QUEUE_OVERFLOW`                            | Объявленный предел или темп потребителя            |
| `ENV`  | `ENV_UNSUPPORTED`                                                      | Хостовая runtime                                   |

Набор замкнут намеренно: именно это держит `switch` исчерпывающим. Расширения сообщают свою деталь через `cause`, а не через новый код.

### Поля по форме

| Код           | `status`    | `response`                                                           | `data`                                      |
| ------------- | ----------- | -------------------------------------------------------------------- | ------------------------------------------- |
| `HTTP_STATUS` | Всегда      | Всегда; `body` есть только если `error` был объявлен и декодировался | Декодированное `error`-тело или `undefined` |
| `RES_*`       | Всегда      | Всегда, только метаданные — **без `body`**                           | Отсутствует                                 |
| Всё остальное | Отсутствует | Только там, где у транспорта уже были метаданные                     | Отсутствует                                 |

`cause` несёт нижележащее значение: `StructError` при расхождении struct, провал парсера при нечитаемой representation, всё, что бросило расширение.

## Формы кортежа по транспортам

```typescript twoslash
import type {
  DecodedResponse,
  EventStreamHandle,
  EventStreamOpenInfo,
  Fault,
  HttpMeta,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  [err: null, data: unknown, response: DecodedResponse<unknown> | HttpMeta] | [err: Fault, data: undefined, response: undefined]
type SseResult =
  | [err: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [err: Fault, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [err: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [err: Fault, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

При HTTP-провале третий слот — `undefined`: fault уже несёт те метаданные response, которые были. Это важно потому, что именно fault ты передаёшь в handler, логируешь или перебрасываешь, — значит, метаданные должны путешествовать _вместе_ с ним, а не рядом.

У SSE и WebSocket третий слот — снимок старта, и он может присутствовать даже когда старт провалился. После того как handle или session вернулись, дальнейшие провалы живут в их жизненном цикле — они никогда не перезаписывают уже устоявшийся кортеж старта.

## Как читается тело

`ok` — единственная развилка, и декодирует всегда одна сторона. `output` читает тело 2xx; `error` читает всё остальное. Пропустить один значит, что это тело не прочитают.

| Ситуация                                               | Итог                                                    |
| ------------------------------------------------------ | ------------------------------------------------------- |
| 2xx, `output` объявлен, тело декодировалось            | Успех; `data` и `response.body` типизированы            |
| 2xx, `output` пропущен                                 | Успех; `data` — `undefined`, у response нет `body`      |
| Non-2xx, `error` объявлен, тело декодировалось         | `HTTP_STATUS` с типизированным `data`                   |
| Non-2xx, `error` пропущен                              | `HTTP_STATUS` с `data: undefined`                       |
| Media type не тот, который нужен representation        | `RES_MEDIA_TYPE_INVALID`, сообщается **до** чтения тела |
| Байты не являются этой representation                  | `RES_DECODE_FAILED`                                     |
| Значение не соответствует этому struct                 | `RES_STRUCT_MISMATCH`                                   |
| Нечитаемое тело на стороне, которую ты **не** объявлял | Игнорируется целиком — см. ниже                         |

Последняя строка — та, которую стоит запомнить. Если ты объявил `output`, но не `error`, то 500 с битым JSON в теле сообщается как `HTTP_STATUS` со `status: 500`. Ты сказал, что тела ошибок тебя не интересуют, — и это включает то, что тебя не интересует и сам факт нечитаемости.

Декодирование происходит один раз, после цепочки interceptor’ов. Response, собранный interceptor’ом через `makeResponse(...)`, проходит ту же проверку media type и тот же struct, что и пришедший по сети.

`HttpResponse.ok` значит только `200 <= status < 300`. Transport failure — это fault, а никогда не response: никакого response со status 0 вместо него нет.

## Сужение объединения тел ошибок

Один struct `error` покрывает все non-2xx статусы, поэтому при разных формах ты объявляешь объединение. Что ты сможешь делать с `fault.data` дальше, полностью зависит от того, как ты объявил это объединение: library возвращает ровно тот тип, который ты запросил.

`struct.or(...)` даёт обычное объединение, которое TypeScript сам сузить не может. Проверяй нужное поле:

```typescript twoslash
import { struct, type Fault } from '@defjs/core'

const ApiError = struct.or(struct.object({ message: struct.string() }), struct.object({ retryAfter: struct.number() }))

declare const fault: Fault<typeof ApiError>

if (fault.code === 'HTTP_STATUS' && 'retryAfter' in fault.data) {
  console.log(fault.data.retryAfter)
}
```

`struct.discriminatedUnion(...)` сужает по полю, которое тело действительно несёт, — удобная форма, когда API уже размечает свои ошибки:

```typescript twoslash
import { struct, type Fault } from '@defjs/core'

const ApiError = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('validation'), fields: struct.array(struct.string()) }),
  struct.object({ kind: struct.literal('rateLimit'), retryAfter: struct.number() }),
])

declare const fault: Fault<typeof ApiError>

if (fault.code === 'HTTP_STATUS') {
  switch (fault.data.kind) {
    case 'validation':
      console.log(fault.data.fields.length)
      break
    case 'rateLimit':
      console.log(fault.data.retryAfter)
      break
  }
}
```

Когда API кладёт статус **внутрь** тела, размечай по нему, а не по `fault.status`:

```typescript twoslash
import { struct, type Fault } from '@defjs/core'

const ApiError = struct.discriminatedUnion('status', [
  struct.object({ status: struct.literal(404), resource: struct.string() }),
  struct.object({ status: struct.literal(429), retryAfter: struct.number() }),
])

declare const fault: Fault<typeof ApiError>

if (fault.code === 'HTTP_STATUS' && fault.data.status === 429) {
  console.log(fault.data.retryAfter)
}
```

Последнюю форму стоит предпочитать там, где API её поддерживает. `fault.status` — число HTTP-слоя, которое может перезаписать proxy, gateway или CDN; а `data.status` был декодирован из тела, которое утвердил твой struct `error`, так что добраться до него — доказательство, что его выдал backend.

Неразмеченное объединение, которое не сужается, — свойство объявления, а не library: она отдаёт тебе тот тип, который ты объявил. Хочешь сужения — добавь в struct размечающее поле.

## Старт и после открытия

SSE проверяет статус, `text/event-stream` и наличие тела до того, как resolve’ит handle. Non-2xx → `HTTP_STATUS`. Неверный media type → `RES_MEDIA_TYPE_INVALID`. Тела нет → `RES_DECODE_FAILED`. Снимок открытия всё равно может попасть в третий слот кортежа.

Старт WebSocket покрывает handshake плюс первое физическое open. Провал конструктора, закрытие до открытия, таймаут или отмена — всё это даёт кортеж старта. Снимок соединения может существовать, даже если socket так и не дошёл до `open`.

| Транспорт | После старта                                                                                                                                                     |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | Итератор реджектит на фатальной ошибке; `stream.closed` резолвится с `kind: 'error'` и `code` fault’а                                                            |
| WebSocket | `onRuntimeError` для провалов сообщения/очереди/heartbeat; `receive` падает на терминальных ошибках; `session.closed` → `kind: 'closed' \| 'aborted' \| 'error'` |
| HTTP      | Promise от execute settle’ится один раз. Код interceptor’ов и колбэков всё ещё может throw’ить вне нормализации кортежа                                          |

`NET_ABORTED` / `NET_TIMEOUT` описывают то, что вызывающий увидел на старте. Возвращённый stream или session ты всё равно закрываешь и await’ишь его терминальный promise.

## Логирование нативного Error и cause

Fault’ы — это экземпляры нативного `Error`, поэтому диагностический адаптер не нужен. `String(fault)` даёт стабильную нативную форму `DefjsFault: <message>`. `code` и поля вариантов — `status`, `response`, `data` — остаются перечислимыми для структурированного логирования; `name` и нативная цепочка `cause` — нет.

```typescript twoslash
import { StructError, type Fault } from '@defjs/core'

export function logFault(fault: Fault): void {
  console.error(String(fault), { code: fault.code })
  if (fault.cause instanceof StructError) {
    console.error(fault.cause.prettify())
  }
}
```

Сузь `fault.cause instanceof StructError` до вызова `format()`, `flatten()` или `prettify()`. Эти helper’ы живут на cause у Struct и не копируются на fault. Не заставляй поток управления парсить `message` или `String(fault)` — контракт это `code` и проверенный `status`.

## Справка

| Ветка                       | Проверка в потоке управления       | Полезные стабильные поля                    | Обычно отсутствует / чувствительно   |
| --------------------------- | ---------------------------------- | ------------------------------------------- | ------------------------------------ |
| Политика HTTP-статуса       | `fault.code === 'HTTP_STATUS'`     | `fault.status`, проверенный `fault.data`    | Тело, headers, URL, `cause`          |
| Отмена вызывающим           | `fault.code === 'NET_ABORTED'`     | `code`                                      | Причина отмены и стек                |
| Таймаут                     | `fault.code === 'NET_TIMEOUT'`     | `code`                                      | URL запроса и нижележащая cause      |
| Контракт сломался           | `fault.code.startsWith('RES_')`    | `code`, проверенный `fault.response.status` | Struct issue, тело, входные значения |
| Твой собственный код бросил | `fault.code.startsWith('EXT_')`    | `code`, `cause`                             | Всё, что приложило расширение        |
| Runtime потока/сессии       | `stream.closed` / `session.closed` | Терминальные `kind` и `code`                | Payload событий, фреймы, cause       |

Считай `cause`, `data`, headers и тела response, URL, Struct issue, входные значения и стеки чувствительными. Консервативная сводка:

```typescript twoslash
import type { Fault } from '@defjs/core'

export function summarize(fault: Fault): { code: Fault['code']; status?: number } {
  return {
    code: fault.code,
    status: 'status' in fault ? fault.status : undefined,
  }
}
```

`createNetworkFault`, `createPreflightFault`, `createDecodeFault`, `createHttpStatusFault` и `createUndecodedHttpStatusFault` собирают эти нативные Error-значения. Обычные провалы запроса по-прежнему возвращаются в кортеже; их не бросают лишь потому, что они наследуют поведение нативного Error. `ERR_ABORTED` и `ERR_TIMEOUT` — общие cause, которые распознаёт нормализатор транспорта.

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
