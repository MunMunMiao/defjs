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

- **definition** — `method`, `path`, 선택 `input` struct, 선택 `output`과 `error` struct, 선택 `operation`과 `build`.
- **Returns** 빌더예요. 입력을 넣으면 `HttpCommand`가 나와요.

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

`output`은 2xx body를 위한 하나의 struct이고, `error`는 모든 non-2xx body를 위한 하나의 struct예요. 둘 다 status로 키를 나누지 않아요. 빼면 그 body는 읽히지 않아요 — [선언은 곧 단언이에요](/ko-KR/guide/design-decisions#선언은-곧-단언이에요)를 보세요.

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

`client.execute`가 쓰는 저수준 진입점이에요. 앱 코드는 `client.execute(command, options)`를 호출하세요.

- **반환** `[null, data, response]` 또는 `[fault, undefined, undefined]`.

2xx가 아닌 status는 언제나 `HTTP_STATUS`예요. `error`를 선언했다면 그 `data`는 디코딩된 오류 body이고, 아니면 `undefined`예요. 실패 시 튜플의 세 번째 자리는 `undefined`이고, 응답 메타데이터는 fault가 지니고 있어요.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

기본 HTTP 전송이에요. `withHTTPHandle`이 교체하지 않으면 이걸 써요. 응답이 클라이언트에 닿지 않았을 때는 합성 응답을 돌려주는 대신 reject 해요.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

네트워크 호출 없이 `HttpResponse`를 만들어요 (인터셉터, 테스트). 기본 status는 `0`이에요. 2xx이면 `ok`가 true예요. 돌려주는 값은 회선에서 온 응답과 똑같은 미디어 타입 확인과 선언 struct를 지나요. 믿고 건너뛰는 경로는 없어요.

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

`method`, `path`, 선택 `input`, `output`, `error`, `responseType`(`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, 선택 `build`(요청을 직접 조립해요. `input`이 필요해요).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

`RequestDefinition`의 `output` / `error` 쪽이에요. 둘 다 없으면 `responseType`도 거부돼요. 아무것도 디코딩하지 않으니 고를 대상이 없어요.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

성공 시 세 번째 자리가 `body`를 갖는 건 `output`을 선언했을 때뿐이에요. 실패 시에는 `undefined`이고, 있었던 응답 메타데이터는 이미 fault가 들고 있어요.

### HttpRequest {#HttpRequest}

정규화된 나가는 요청이에요. `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, 진행률 훅, `baseEndpoint`, query 메타데이터예요.

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

응답이 클라이언트에 도달했다면 언제나 있는 응답 메타데이터예요. `body`는 **없어요**. body는 선언된 struct가 디코딩한 뒤에야 존재해요.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

body가 선언된 struct로 디코딩된 응답이에요. 이 타입을 손에 쥐었다는 것 자체가 디코딩이 일어났다는 증거이고, 그래서 디코딩 실패는 `HttpMeta`만 보고해요.

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

전송이 만들어 내고 인터셉터가 보는 회선상의 모양이에요. `body`는 텍스트이거나 이미 파싱된 JSON이고, 디코딩된 값이 아니에요. 호출한 쪽에 닿는 건 `DecodedResponse`예요.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`예요. 콜백은 async일 수 있어요.

자세한 내용은 [HTTP 가이드](../core/http.md)와 [명령](../core/commands.md)을 보세요. 콜백이 throw 하면 `EXT_OBSERVER_FAILED`예요.

## RequestCommandBuilder {#RequestCommandBuilder}

`defineRequest`가 돌려주는 값이에요. input을 넣어 호출하면 `HttpCommand`가 나와요.

## HttpCommand {#HttpCommand}

요청 builder가 내놓는 불투명 command예요. `client.execute`에 넣어요.

## UseRequestConfig {#UseRequestConfig}

진행, 취소 필드예요. `HttpExecuteOptions`가 `signal`을 더해요.

## RequestSuccessData {#RequestSuccessData}

선언된 `output` struct에서 추론한 성공 body예요. 선언이 없으면 `undefined`.

## RequestErrorData {#RequestErrorData}

선언된 `error` struct에서 추론한 오류 body예요. 선언이 없으면 `undefined`.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

`makeResponse`용 필드예요. `status`, `statusText`, `url`, `headers`, `body`, `request`.
