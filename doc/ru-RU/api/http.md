---
title: HTTP
description: defineRequest, опции execute и типы HTTP request/response.
---

# HTTP

Объяви типизированный запрос, собери команду из input, выполни.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, опциональный `input` struct, `output` по статусу, опциональные `operation` и `build`.
- **Возвращает** builder. Вызови с input — получишь `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})
```

`output` может быть и списком групп `{ status, body }` (один body struct на несколько кодов).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Это то, чем пользуется `client.execute`. В приложении зови `client.execute(command, options)`.

- **Возвращает** `[null, body, response]` или `[error, undefined, response?]`.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

HTTP-транспорт по умолчанию. Работает, пока `withHTTPHandle` его не подменит.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Собери `HttpResponse` без сети (interceptors, тесты). Статус по умолчанию — `0`. `ok` true на 2xx.

## Опции execute

## HttpExecuteOptions {#HttpExecuteOptions}

```ts
type HttpExecuteOptions = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

Отмена — `abort` **или** `timeout`, не оба сразу. `signal` сочетается с любым из них и **не** является алиасом `abort`. Допустимо: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. Недопустимо: `{ abort, timeout }`. `timeout` — положительный safe integer в `1..2_147_483_647`.

## Типы

### RequestDefinition {#RequestDefinition}

`method`, `path`, опциональные `input`, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, опциональный `build` (своя сборка запроса; нужен `input`).

### RequestOutputShape {#RequestOutputShape}

```ts
type RequestOutputShape = { [status: number]: AnyStruct } | readonly { status: number | readonly number[]; body: AnyStruct }[]
```

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]
```

### HttpRequest {#HttpRequest}

Готовый исходящий запрос: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, progress hooks, `baseEndpoint`, query metadata.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}
```

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Колбэки могут быть async.

Подробности — в [гайде HTTP](../core/http.md) и [Командах](../core/commands.md).

## ResponseGroupItem {#ResponseGroupItem}

Строка `{ status, body }` в списковой форме `RequestOutputShape`. `status` — один код или несколько с общим body struct.

## RequestCommandBuilder {#RequestCommandBuilder}

Возвращает `defineRequest`. Вызови с input — получишь `HttpCommand`.

## HttpCommand {#HttpCommand}

Непрозрачная command от request builder. Отдавай в `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Прогресс, отмена. `HttpExecuteOptions` добавляет `signal`.

## RequestSuccessData {#RequestSuccessData}

Успешный body, выведенный из объявленных 2xx `output`.

## RequestErrorData {#RequestErrorData}

Ошибочный body, выведенный из объявленных не-2xx `output`.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Поля для `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `error`.
