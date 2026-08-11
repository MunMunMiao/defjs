---
title: HTTP
description: HTTP URL과 body를 구성하고 상태별 응답 Struct를 선택하며 작업을 취소하고 credentials·XSRF를 설정하고 Fetch 경계를 이해합니다.
---

# HTTP

`defineRequest(...)`는 HTTP 커맨드 빌더를 만듭니다. 엔드포인트 정의와 입력 프로젝션은 [커맨드](/ko-KR/core/commands)에서 다루며, 이 페이지는 HTTP wire 형식과 생명주기 동작을 설명합니다.

## HTTP 전용 client entry

`@defjs/core/http`는 추가적인 HTTP 전용 entry point입니다. HTTP command 및 HTTP 호환 client option과 함께 `createHttpClient(...)`를 export합니다.

```typescript
import { createHttpClient, defineRequest, struct, withEndpoint } from '@defjs/core/http'

const httpClient = createHttpClient(withEndpoint('https://api.example.com'))
```

consumer가 의도적으로 HTTP만 지원할 때 사용하세요. Root entry를 대체하지 않습니다. `@defjs/core`의 `createClient(...)`는 계속 HTTP, SSE, WebSocket command를 모두 지원하는 client입니다.

## URL 구성

`withEndpoint(...)`에는 절대 base URL을 전달해야 합니다. 이 URL의 path는 directory로 유지됩니다.

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

base path 끝에 slash가 없으면 추가합니다. base endpoint의 query와 hash는 버립니다.

endpoint `path` 값은 상대적인 계약 path입니다. 앞의 slash는 허용하지만 해석하기 전에 제거하므로 base directory를 대체하지 않습니다. 런타임은 다음 값을 거부합니다.

- 절대 URL과 protocol-relative URL
- `?`가 포함된 path
- `#`가 포함된 path

Path placeholder는 `:name` 형식을 사용합니다.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

placeholder에는 가공하지 않은 값을 전달하세요. Defjs는 각 scalar를 문자열로 변환하고 빈 값과 값 전체가 `.` 또는 `..`인 경우를 거부한 다음, 치환 전에 `encodeURIComponent`를 정확히 한 번 적용합니다. `/`, `?`, `#`, `%`, 공백, Unicode는 하나의 path segment 안에 유지됩니다. 값을 미리 인코딩하지 마세요. `%`는 원시 입력으로 취급되어 `%25`로 인코딩됩니다.

## 요청 인코딩

wire에 직접 매핑하려면 `struct.request(...)`를 사용하세요.

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Body Struct가 인코딩과 기본 content type을 결정합니다.

| Body Struct                | Wire body             | 기본 `Content-Type`                               |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | boundary를 포함해 platform이 설정                 |
| `struct.blob()`            | `Blob`                | Blob type 또는 `application/octet-stream`         |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

사용자 정의 `build`에서는 대응하는 HTTP builder method를 사용할 수 있습니다. setter method는 해당 요청 부분을 교체하고 `addHeaders`, `addFormData`, `addFormUrlEncoded`는 현재 부분 뒤에 추가합니다. 모든 값은 스키마에 결합된 프로젝션에서 나와야 합니다.

### Query 값

기본 query encoder는 중첩되지 않은 scalar 값과 scalar 배열을 받습니다. 중첩 객체는 요청 구성 중에 실패합니다.

`withQueryParamsSerializer((params, rawParams) => string)`로 이미 허용된 값을 렌더링하는 방식을 바꿀 수 있습니다. 이 함수는 `URLSearchParams` view와 인코딩된 비중첩 record를 받습니다. 중첩 query 객체를 유효하게 만들지는 못하며, 그런 객체는 직렬화 전에 거부됩니다.

alias는 outbound query, path, header key가 됩니다. 호출자 코드는 계속 논리 Struct 필드 이름을 사용합니다.

## Status와 출력 디코딩

`output`은 status code를 응답 Struct에 매핑합니다.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
    { status: 409, body: struct.object({ conflict: struct.string() }) },
  ],
})
```

런타임은 정확한 status로 Struct를 선택합니다. `output`을 선언했는데 일치하는 status가 없으면 `UNDECLARED_STATUS`가 발생합니다. 선언된 2xx body는 성공 data union을 구성합니다. `defineRequest(...)`는 const generic을 사용하므로 inline status는 `as const` 없이 literal을 유지하며, HTTP 오류 union은 각 비-2xx status와 해당 `error.data` body의 연관을 유지합니다.

```typescript
const [statusError] = await client.execute(getUser({ path: { id: 42 } }))

if (statusError?.kind === 'http') {
  if (statusError.status === 404) {
    console.error(statusError.data.message)
  } else {
    // status는 409이고 data는 선언된 conflict body입니다.
    console.error(statusError.data.conflict)
  }
}
```

`response.ok`는 `status >= 200 && status < 300`이라는 뜻일 뿐입니다. output 디코딩, 애플리케이션 검증 또는 인가 성공을 의미하지 않습니다.

`output`을 선언하고 `responseType`을 생략하면 응답 parsing은 기본적으로 `json`을 사용합니다. 명시적인 모드는 `json`, `text`, `blob`, `arraybuffer`입니다. 선택된 Struct가 이어서 구조적 디코딩을 수행합니다. `output`이 없으면 `responseType`을 지정할 수 없고, 결과 데이터는 `undefined`이며, 반환된 응답 래퍼의 `body`는 `null`입니다. 런타임은 응답 body를 읽거나 디코딩하는 대신 best-effort로 취소합니다.

커맨드 결과 분류는 고정 우선순위를 따릅니다. status 0 transport failure → `output` 없음 → 정확한 status 일치 또는 `UNDECLARED_STATUS` → `response.error` → Struct 디코딩 순서입니다. 따라서 body 표현 오류는 `output`을 선언한 경우에만 발생할 수 있으며, Fetch가 이 오류를 기록해도 선언되지 않은 status 분기가 계속 우선합니다.

### 표현 오류

선언된 output과 status가 정확히 일치한 경우 JSON 또는 다른 body codec이 실패하면 Fetch는 원래 예외를 `HttpResponse.error`에 보존합니다. 커맨드 실행은 output Struct를 적용하기 전에 중단하고 `[RESPONSE_VALIDATION_FAILED, undefined, response]`를 반환합니다. 원래 예외는 `cause`에 남고 typed `error.data`는 생성되지 않습니다.

일반적인 비-2xx 응답은 `response.error`를 채우지 않으며 status는 `status`와 `ok`로 표현합니다. 비-2xx status와 body가 선언되어 있고 body가 유효하면 Struct가 디코딩되고 결과 `HTTP_STATUS` 오류는 typed body를 `error.data`에 보존합니다.

## HTTP 결과

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

성공하면 `response`는 body가 `data`와 일치하는 Defjs `HttpResponse` 래퍼입니다. 실패할 때 response가 있는지는 실행이 어디까지 진행됐는지에 따라 달라집니다. 정확한 분류는 [오류](/ko-KR/core/errors)를 참고하세요.

## 취소와 timeout

HTTP 실행은 `abort`, `signal`, `timeout`을 받습니다.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal`은 클라이언트 내부 signal 및 양수 timeout과 병합됩니다. 별도의 `abort` 필드는 현재 API에 남아 있는 다른 취소 signal입니다. `abort`와 `timeout`을 함께 전달하면 `REQUEST_VALIDATION_FAILED`가 반환됩니다. `signal`은 둘 중 어느 것과도 함께 사용할 수 있습니다.

HTTP, SSE, WebSocket 실행의 `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 하며, `0`, 음수, 소수, `NaN`, `Infinity`, 상한을 넘는 값은 request, stream, socket 리소스를 만들기 전에 `REQUEST_VALIDATION_FAILED`를 반환합니다.

인식된 취소는 `ABORTED`를 만듭니다. `AbortSignal.timeout(...)` reason이나 실행 timeout은 `TIMEOUT`을 만듭니다. 그 외 Fetch 실패는 `NETWORK_ERROR`를 만듭니다.

## Credentials와 XSRF

`withCredentials(true)`는 HTTP와 SSE Fetch에 `credentials: 'include'`를 설정합니다. `false`는 Fetch 옵션을 지정하지 않은 채로 두며 `omit`을 강제하지 않습니다. 이 설정은 `Authorization` header를 추가하거나 WebSocket 인증을 설정하지 않습니다.

`withXSRF(...)`는 HTTP 요청에만 적용됩니다. 기본값은 다음과 같습니다.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

RFC 안전 메서드인 `GET`, `HEAD`, `OPTIONS`, `TRACE`에서는 주입을 건너뜁니다. `PROPPATCH`와 같은 사용자 정의 비안전 메서드를 포함한 그 밖의 모든 메서드에서는 주입 전에 기존 header, same-origin, token에 대한 동일한 guard를 적용합니다. 설정된 header가 이미 있으면 유지합니다. 브라우저 cookie 조회는 same-origin 요청으로 제한됩니다. 브라우저 밖에서는 동기 `tokenProvider`를 제공하세요. cookie 조회보다 우선합니다.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

서버 token provider는 요청 범위로 유지하세요. `withCredentials(true)`를 사용해도 cross-origin 브라우저 cookie를 JavaScript에서 읽을 수 있게 되거나 cross-origin XSRF header가 주입되지는 않습니다.

## Progress observer

`onDownloadProgress`는 Fetch 응답 body를 읽는 동안 byte 수를 보고합니다. 양수 `Content-Length`를 사용할 수 있을 때만 `lengthComputable`이 true입니다.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress`는 `ReadableStream<Uint8Array>` 요청 body만 관찰합니다. 현재 high-level 커맨드 빌더는 Blob과 ArrayBuffer 프로젝션 setter는 제공하지만 원본 stream setter는 제공하지 않습니다. 따라서 이 옵션에 필요한 stream을 전달하는 표준 `defineRequest` 예제는 없습니다. 직접 만든 stream을 작동하는 high-level 커맨드 body로 소개하지 마세요.

progress callback은 트랜스포트의 read/write 경로에서 실행됩니다. throw하지 않고 빠르게 끝나도록 작성하세요.

## 저수준 Fetch 경계

`fetchHandler(httpRequest, fetchImpl?)`는 export되어 있습니다. Defjs `HttpRequest`를 native `Request`로 변환하고 Fetch를 호출한 뒤 선택된 응답 표현을 parse하여 Defjs `HttpResponse` 래퍼를 반환합니다. Fetch 실패는 status 0 래퍼가 됩니다.

`fetchHandler`를 직접 호출하면 다음 단계를 우회합니다.

- 커맨드 입력 디코딩과 요청 프로젝션
- HTTP output status dispatch와 Struct 디코딩
- 클라이언트 인터셉터 실행 체계
- high-level `RequestError` 튜플로의 변환

이는 export된 저수준 경계이며 권장 커맨드 workflow가 아닙니다. 장기 안정성 보장은 이 문서에서 정하지 않습니다.

## 다음 단계

- [인터셉터](/ko-KR/core/interceptors)에서는 요청 복제, short-circuit, 재시도를 설명합니다.
- [오류](/ko-KR/core/errors)에서는 HTTP status, 트랜스포트, definition 실패를 설명합니다.
- [Struct](/ko-KR/core/struct)에서는 엄격한 구조 디코딩을 설명합니다.
