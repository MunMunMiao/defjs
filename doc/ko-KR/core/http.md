---
title: HTTP
description: 요청을 정의하고, 실행하고, status로 분기하고, signal이나 timeout으로 취소해요.
---

# HTTP

정의 → 실행 → 튜플로 분기 → 화면이 사라지면 취소. HTTP 루프의 전부예요.

## Basic Setup

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

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## URL 해석하기

`withEndpoint(...)`는 유효한 절대 URL이 필요해요. 엔드포인트 pathname은 디렉터리로 남고, query와 hash는 명령 해석 전에 버려져요.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

path placeholder는 raw 스칼라이고, 정확히 한 번만 인코딩돼요. 빈 값과 `.` / `..`는 거부돼요. 한 placeholder 안의 슬래시, `?`, `#`, `%`, 공백, 유니코드는 인코딩된 세그먼트 하나로 남아요 — 미리 인코딩하지 마세요.

정의 path에는 `?`나 `#`가 들어갈 수 없고, 절대 경로나 프로토콜 상대 경로도 안 돼요. 기본 query 인코더는 스칼라와 스칼라 배열을 받아요. 중첩/복잡한 query 값은 `withQueryParamsSerializer(...)`가 필요하거나 구성이 실패해요.

## 입력 인코딩하기

`struct.request(...)`는 path, query, 헤더, body를 분리해요. body 래퍼가 코덱과 content type을 골라요.

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

별칭은 아웃바운드 와이어 키만 바꿔요. 파싱된 값과 명령 입력은 논리 이름을 유지해요.

| Wrapper                    | Runtime body      | Default content type                                           |
| -------------------------- | ----------------- | -------------------------------------------------------------- |
| `struct.json(inner)`       | JSON string       | `application/json`                                             |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`              |
| `struct.formData(shape)`   | `FormData`        | Platform multipart boundary; Defjs clears stale `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type or `application/octet-stream`                        |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                     |

커스텀 `build`도 같은 위치/코덱 setter를 노출해요. 최종 body 쓰기가 이겨요 (값 + content-type 메타데이터). 고수준 명령은 임의 객체를 body로 바꾸지 않아요 — 래퍼를 선언하거나 맞는 setter를 쓰세요.

## body를 읽는 방법

`output`은 2xx body를 위한 하나의 Struct이고, `error`는 그 밖의 모든 것을 위한 하나의 Struct예요. 둘 중 하나를 선언하고 `responseType`을 쓰지 않으면 표현은 `json`이 기본이에요. 명시 타입은 `json`, `text`, `blob`, `arraybuffer`. 둘 다 선언하지 않으면 `responseType`은 허용되지 않고, body도 읽히지 않아요.

순서:

1. `ok`가 쪽을 골라요. 2xx는 `output`, 나머지는 `error`. 둘 다인 경우는 없어요.
2. 그쪽에 선언이 없으면 → body는 읽히지 않아요. 2xx는 `data === undefined`로 성공하고, non-2xx는 `data === undefined`인 `HTTP_STATUS`예요. 선언하지 않은 쪽의 body를 읽을 수 없었다는 사실까지 통째로 무시돼요.
3. 미디어 타입은 body를 읽기 **전에** 확인해요. 맞지 않으면 `RES_MEDIA_TYPE_INVALID`이고, 파싱도 디코딩도 하지 않아요.
4. 표현을 읽어요. 실패는 `RES_DECODE_FAILED`.
5. Struct가 값을 파싱해요. 실패는 `RES_STRUCT_MISMATCH`.
6. 2xx → 결과와 타입이 잡힌 `response.body`. non-2xx → `HTTP_STATUS`의 타입이 잡힌 `data`.

디코딩은 인터셉터 체인 뒤에서 딱 한 번 일어나요. 그래서 인터셉터가 `makeResponse(...)`로 만든 응답도 회선에서 온 것과 똑같이 읽혀요.

성공한 응답은 `DecodedResponse<T>`예요. `url`, `status`, `statusText`, `headers`, `ok`, 그리고 타입이 잡힌 `body`. 아무것도 디코딩하지 않은 곳에서는 `HttpMeta`를 받아요 — 같은 필드에 `body`만 없어요. `ok`는 `200 <= status < 300`만 뜻해요. 둘 다 네이티브 `Response`가 아니에요. 전송 실패는 fault니까, 그 자리를 대신하는 status 0 응답은 없어요.

## 작업 취소하기 {#cancel-the-work}

실행 옵션은 `signal`에 `abort` 또는 `timeout` 중 하나를 받아요. **`abort`와 `timeout`은 서로 배타적이에요.** `signal`은 둘 중 하나와 조합할 수 있어요.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 해요. 인식된 취소 → `NET_ABORTED`; 실행 타임아웃 → `NET_TIMEOUT`; 다른 Fetch/인터셉터 실패 → `NET_UNREACHABLE`. 서버가 쓰기를 받아들인 뒤의 취소는 쓰기가 롤백됐다는 증명이 **아니에요**.

## 자격 증명과 XSRF

`withCredentials(true)`는 HTTP와 SSE에 Fetch `credentials: 'include'`를 설정해요. `Authorization`을 만들지도, WebSocket 인증을 설정하지도 않아요. `false`는 credentials를 지정하지 않은 채로 둬요.

`withXSRF(...)`는 HTTP 전용이에요. 기본값: `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. 헤더는 비안전 메서드에만, 호출자가 이미 설정하지 않았을 때만, same-origin 브라우저 요청에만 주입해요. `GET`, `HEAD`, `OPTIONS`, `TRACE`는 건너뛰어요. 브라우저 밖에서는 주입이 필요하면 동기식 요청 범위 `tokenProvider`를 넘기세요.

자격 증명, XSRF 토큰, query 문자열은 일상 로그에 넣지 마세요. query 파라미터를 일반 자격 증명 채널로 쓰지 마세요.

## 진행률과 Fetch 경계

`onDownloadProgress`는 명시적 응답 representation을 읽는 동안 돌아요. `lengthComputable`은 양의 `Content-Length`가 있을 때만 true예요. `responseType`이 없으면 → body 디코딩 없음 → body 읽기 진행률 없음.

`onUploadProgress`는 Fetch가 읽을 때 `ReadableStream<Uint8Array>` 요청 body를 지켜봐요. 일반 body 래퍼는 raw stream setter를 노출하지 않아요 — 업로드 진행률은 주로 저수준 구성용이에요.

`fetchHandler(httpRequest, fetchImpl?)`는 더 낮은 Fetch 경계예요. 네이티브 `Request`를 만들고, Fetch를 호출하고, representation을 읽고, `HttpResponse`를 돌려줘요. 명령 입력을 검증하거나, `output`을 디스패치하거나, 인터셉터를 돌리지는 **않아요**. 주입된 전송 테스트에 유용하고 — `client.execute` 대체는 아니에요.

## 재시도 한도

Defjs는 HTTP를 **자동 재시도하지 않아요**. 읽기 재시도에도 검토된 타임아웃/네트워크/중복 정책이 필요해요. 변경 재시도에는 재생 가능한 바이트, 서버 지원, 인증 범위 + 요청 바이트에 묶인 멱등성 키, 수신자 중복 정책이 필요해요.

클라이언트/명령/Fetch 경계는 실패한 쓰기가 커밋됐는지 알 수 없어요. 재시도 결정은 앱이나 검토된 인터셉터에 두세요. 인터셉터는 저수준 요청을 short-circuit하거나 바꿀 수 있지만, 최종 status와 body는 여전히 명령 계약을 만족해야 해요.

## 관련 레시피

- [선언된 404가 있는 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP 호출 취소하기](../recipes/cancel-http.md)
- [로컬 Fetch 핸들로 테스트하기](../recipes/test-with-handle.md)
