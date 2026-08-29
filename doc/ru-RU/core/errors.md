---
title: Ошибки
description: Ветвись по kind и code для 404, таймаутов, необъявленных статусов и сбоев транспорта.
---

# Ошибки

Обрабатывай объявленный 404, таймаут или необъявленный статус через error-first кортеж — не через catch throws. `RequestError` остаётся union по `kind` / `code` и при этом является нативным `Error` (`instanceof Error` возвращает true). Начинай с `kind`, потом `code`.

## Базовая настройка

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example: RequestError = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## Стабильные коды

| `kind`       | Codes                                                                                                | Смысл                                                                                                              |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `http`       | `HTTP_STATUS`                                                                                        | Non-2xx дошёл до HTTP-границы. Держит `status`, `response` и любые декодированные status-specific `data`.          |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Cancel, timeout или сбой Fetch/transport блокировал нормальный результат.                                          |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Сбой input, сборки запроса, representation ответа, Struct-decode, status-контракта или `throw` внутри interceptor. |

`cause` опционален на transport и definition ошибках. `response` всегда на HTTP status ошибках; на definition ошибках может появиться, если ответ уже был.

## Формы кортежа по транспорту

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

Ошибка старта → второй элемент `undefined`. Третий — только если транспорт успел выдать ответ/снимок. После возврата SSE handle или WebSocket session поздние сбои живут на lifecycle этого handle — они не переписывают settled startup кортеж.

## HTTP status и data

Сначала exact-status. С `output` Defjs выбирает matching Struct до decode тела, так что `error.status` и `error.data` остаются согласованными.

| Ситуация                                    | Исход кортежа                      | Поведение тела                                              |
| ------------------------------------------- | ---------------------------------- | ----------------------------------------------------------- |
| 2xx с matching объявленным статусом         | Success                            | Selected Struct → `data`                                    |
| Non-2xx с matching объявленным статусом     | `HTTP_STATUS`                      | Selected Struct → типизированный `error.data`               |
| Любой статус без matching объявления        | `UNDECLARED_STATUS`                | Статус выигрывает **до** decode тела                        |
| Matching статус, representation тела падает | `RESPONSE_VALIDATION_FAILED`       | Нет частичного типизированного значения                     |
| `output` опущен                             | 2xx успех; non-2xx → `HTTP_STATUS` | Тело не декодируется; `data` — `undefined`                  |
| Response status `0`                         | Transport error                    | `response.error` → `NETWORK_ERROR`, `ABORTED` или `TIMEOUT` |

`HttpResponse.ok` значит только `200 <= status < 300`. Нормальный non-2xx не ставит `HttpResponse.error` — это свойство для transport на Fetch-границе или сбоя body-representation.

## Startup vs post-open

SSE валидирует status, `text/event-stream` и body до resolve handle. Плохой status → `HTTP_STATUS`. Плохой content type или нет body → `RESPONSE_VALIDATION_FAILED`. Opening snapshot всё ещё может лечь в третий слот кортежа.

WebSocket startup покрывает handshake + первое физическое open. Сбой конструктора, pre-open close, timeout или cancel → startup кортеж. Снимок connection может быть даже если сокет никогда не дошёл до `open`.

| Транспорт | После старта                                                                                                                                                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE       | Iterator reject на fatal error; `stream.closed` resolves с `code: 'error'` и `EventStreamErrorCode`                                                          |
| WebSocket | `onRuntimeError` для message/queue/heartbeat/runtime сбоев; `receive` падает на terminal errors; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute promise settles один раз. Код interceptor/callback всё ещё может throw вне нормализации кортежа                                                      |

`ABORTED` / `TIMEOUT` описывают caller-facing startup результат. Возвращённый stream/session всё равно нужно закрыть и дождаться terminal promise.

## Логирование native Error и cause

Все варианты `RequestError` — нативные экземпляры `Error`, поэтому diagnostic adapter не нужен. `String(error)` использует стабильную нативную форму `<name>: <message>`. `kind`, `code` и поля варианта вроде `status`, `response` и `data` остаются enumerable для структурированных логов; `name` и нативная цепочка `cause` — non-enumerable.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

Перед вызовом `format()`, `flatten()` или `prettify()` сузь тип через `error.cause instanceof StructError`. Эти helpers остаются на Struct cause и не копируются на внешний `DefinitionError`. Не разбирай `message` или `String(error)` для управления потоком — контрактом остаются `kind`, `code` и проверенный status.

## Справка

| Ветка                  | Control-flow check                           | Полезные стабильные поля                       | Обычно нет / чувствительно        |
| ---------------------- | -------------------------------------------- | ---------------------------------------------- | --------------------------------- |
| HTTP status policy     | `error.kind === 'http'`                      | `error.status`, проверенный `error.data`       | Body, headers, URL, `cause`       |
| Caller cancellation    | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code`                                 | Abort reason и stack              |
| Timeout                | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code`                                 | Request URL и underlying cause    |
| Contract failure       | `error.kind === 'definition'`                | `kind`, `code`, проверенный `response?.status` | Struct issues, body, input values |
| Stream/session runtime | `stream.closed` / `session.closed`           | Terminal code/kind, проверенный close status   | Event payloads, frames, causes    |

Не выводи CORS из status `0` — ветвись по `kind` и `code`.

Считай `cause`, `data`, response headers/bodies, URL, Struct issues, input values и stacks чувствительными. Консервативное резюме:

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`, `createDefinitionError` и `createHttpStatusError` создают эти нативные Error values. Обычные ошибки запроса по-прежнему возвращаются в кортеже; наследование native Error само по себе не превращает их в throws. `ERR_ABORTED` и `ERR_TIMEOUT` — shared causes, которые узнаёт transport normalizer.

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
