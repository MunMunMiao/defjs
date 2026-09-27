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

- **definition** — `method`, `path`, необязательный `input` struct, необязательные `output` и `error` structs, необязательные `operation` и `build`.
- **Возвращает** builder. Вызови с input — получишь `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})
```

`output` — один struct для тела 2xx; `error` — один struct для любого non-2xx тела. Ни один из них не индексируется по статусу. Пропустить один значит, что это тело не прочитают — см. [Объявление — это утверждение](/ru-RU/guide/design-decisions#объявление-—-это-утверждение).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Это то, чем пользуется `client.execute`. В приложении зови `client.execute(command, options)`.

- **Возвращает** `[null, data, response]` или `[fault, undefined, undefined]`.

Non-2xx статус — всегда `HTTP_STATUS`. Его `data` — декодированное `error`-тело, если `error` был объявлен, иначе `undefined`. При провале третий слот кортежа — `undefined`; метаданные response несёт fault.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

HTTP-транспорт по умолчанию. Работает, пока `withHTTPHandle` его не подменит. Он реджектит — а не резолвит синтетическим response — когда до клиента не дошёл ни один response.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Собери `HttpResponse` без сети (interceptors, тесты). Статус по умолчанию — `0`. `ok` true на 2xx. Возвращённое значение проходит ту же проверку media type и тот же объявленный struct, что и response из сети; никакого доверительного short-circuit нет.

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

`method`, `path`, необязательные `input`, `output`, `error`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, необязательный `build` (собираешь запрос сам; нужен `input`).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

Половина `output` / `error` у `RequestDefinition`. Если нет обоих, `responseType` тоже отклоняется: ничего не декодируется, значит и выбирать нечего.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

При успехе третий слот несёт `body` только если был объявлен `output`. При провале он `undefined` — fault уже держит те метаданные response, которые были.

### HttpRequest {#HttpRequest}

Готовый исходящий запрос: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, progress hooks, `baseEndpoint`, query metadata.

### HttpMeta {#HttpMeta}

```ts
type HttpMeta = {
  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
}
```

Метаданные response, доступные всегда, когда response дошёл до клиента. Они **не** несут `body`: тело появляется только после того, как объявленный struct его декодировал.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

Response, чьё тело декодировалось по объявленному struct. Держать этот тип в руках — само доказательство того, что декодирование произошло, поэтому decode-провал сообщает только `HttpMeta`.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly ok: boolean
}
```

Сетевая форма, которую производят transports и видят interceptor’ы: `body` — это текст или уже распарсенный JSON, а не декодированное значение. До вызывающего доходит `DecodedResponse`.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Колбэки могут быть async.

Подробности — в [гайде HTTP](../core/http.md) и [Командах](../core/commands.md). Callback, который throwит, — это `EXT_OBSERVER_FAILED`.

## RequestCommandBuilder {#RequestCommandBuilder}

Возвращает `defineRequest`. Вызови с input — получишь `HttpCommand`.

## HttpCommand {#HttpCommand}

Непрозрачная command от request builder. Отдавай в `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Прогресс, отмена. `HttpExecuteOptions` добавляет `signal`.

## RequestSuccessData {#RequestSuccessData}

Успешное тело, выведенное из объявленного `output` struct, или `undefined`, если он не объявлен.

## RequestErrorData {#RequestErrorData}

Тело ошибки, выведенное из объявленного `error` struct, или `undefined`, если он не объявлен.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Поля для `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `request`.
