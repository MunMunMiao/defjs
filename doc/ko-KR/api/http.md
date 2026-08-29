---
title: HTTP
description: defineRequest, 실행 옵션, HTTP request/response 타입이에요.
---

# HTTP

타입이 잡힌 요청을 선언하고, 입력으로 명령을 만든 뒤 실행해요.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, 선택 `input` Struct, status로 키를 잡는 `output`, 선택 `operation`과 `build`예요.
- **Returns** 빌더예요. 입력을 넣으면 `HttpCommand`가 나와요.

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

`output`은 `{ status, body }` 그룹 목록일 수도 있어요 (여러 코드에 body Struct 하나).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute`가 쓰는 저수준 진입점이에요. 앱 코드는 `client.execute(command, options)`를 호출하세요.

- **Returns** `[null, body, response]` 또는 `[error, undefined, response?]`예요.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

기본 HTTP 전송이에요. `withHTTPHandle`이 교체하지 않으면 이걸 써요.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

네트워크 호출 없이 `HttpResponse`를 만들어요 (인터셉터, 테스트). 기본 status는 `0`이에요. 2xx이면 `ok`가 true예요.

## 실행 options

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

취소는 `abort` **또는** `timeout`이지, 둘 다는 아니에요. `signal`은 둘 중 하나와 함께 쓸 수 있고 `abort`의 별칭이 **아니에요**. 유효: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. 무효: `{ abort, timeout }`. `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 해요.

## 타입

### RequestDefinition {#RequestDefinition}

`method`, `path`, 선택 `input`, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, 선택 `build` (커스텀 요청 조립; `input`이 필요해요).

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

정규화된 나가는 요청이에요. `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, 진행률 훅, `baseEndpoint`, query 메타데이터예요.

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

`loaded`, `total`, `lengthComputable`예요. 콜백은 async일 수 있어요.

자세한 내용은 [HTTP 가이드](../core/http.md)와 [명령](../core/commands.md)을 보세요.

## ResponseGroupItem {#ResponseGroupItem}

`RequestOutputShape` 리스트 형태의 `{ status, body }` 한 줄이에요. `status`는 코드 하나여도 되고, 같은 body struct를 공유하는 여러 코드여도 돼요.

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest`가 돌려주는 값이에요. input을 넣어 호출하면 `HttpCommand`가 나와요.

## HttpCommand {#HttpCommand}

요청 builder가 내놓는 불투명 command예요. `client.execute`에 넣어요.

## UseRequestConfig {#UseRequestConfig}

진행, 취소 필드예요. `HttpExecuteOptions`가 `signal`을 더해요.

## RequestSuccessData {#RequestSuccessData}

선언한 2xx `output`에서 추론한 성공 body예요.

## RequestErrorData {#RequestErrorData}

선언한 비 2xx `output`에서 추론한 오류 body예요.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

`makeResponse`용 필드예요. `status`, `statusText`, `url`, `headers`, `body`, `error`.
