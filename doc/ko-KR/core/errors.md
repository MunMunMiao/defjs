---
title: 오류
description: 404, 타임아웃, 미선언 status, 전송 실패를 kind와 code로 분기해요.
---

# 오류

선언된 404, 타임아웃, 미선언 status는 throw를 잡는 게 아니라 error-first 튜플을 읽어서 처리해요. `RequestError`는 여전히 `kind` / `code` 유니온이면서 네이티브 `Error`예요(`instanceof Error`가 true). `kind`부터 보고, 그다음 `code`를 봐요.

## Basic Setup

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

## 안정적인 코드

| `kind`       | Codes                                                                                                | Meaning                                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Non-2xx가 HTTP 경계에 도달했어요. `status`, `response`, 디코딩된 status별 `data`가 있으면 유지해요.           |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | 취소, 타임아웃, 또는 Fetch/전송 실패로 정상 결과가 막혔어요.                                                  |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | 입력, 요청 구성, 응답 representation, Struct 디코딩, status 계약 실패, 또는 interceptor의 `throw`를 나타내요. |

`cause`는 transport와 definition 오류에서 선택적이에요. `response`는 HTTP status 오류에 항상 있고, 응답이 이미 있을 때 definition 오류에도 나타날 수 있어요.

## 전송별 튜플 형태

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

시작 실패 → 두 번째 항목 `undefined`. 세 번째 항목은 그 전송이 먼저 응답/스냅샷을 만든 경우에만 있어요. SSE 핸들이나 WebSocket 세션이 반환된 뒤의 실패는 그 핸들 수명에 있고, 이미 확정된 시작 튜플을 다시 쓰지 않아요.

## HTTP status와 data

정확한 status가 먼저예요. `output`이 있으면 Defjs는 body를 디코딩하기 전에 맞는 Struct를 고르므로 `error.status`와 `error.data`가 맞춰져 있어요.

| 상황                                     | 튜플 결과                         | body 동작                                                     |
| ---------------------------------------- | --------------------------------- | ------------------------------------------------------------- |
| 맞는 선언 status의 2xx                   | 성공                              | 선택된 Struct → `data`                                        |
| 맞는 선언 status의 non-2xx               | `HTTP_STATUS`                     | 선택된 Struct → 타입이 잡힌 `error.data`                      |
| 맞는 선언이 없는 아무 status             | `UNDECLARED_STATUS`               | status가 body 디코딩 **전에** 이겨요                          |
| 맞는 status인데 body representation 실패 | `RESPONSE_VALIDATION_FAILED`      | 부분 타입 값 없음                                             |
| `output` 생략                            | 2xx 성공; non-2xx → `HTTP_STATUS` | body를 디코딩하지 않아요; `data`는 `undefined`                |
| 응답 status `0`                          | 전송 오류                         | `response.error` → `NETWORK_ERROR`, `ABORTED`, 또는 `TIMEOUT` |

`HttpResponse.ok`는 `200 <= status < 300`만 의미해요. 정상 non-2xx는 `HttpResponse.error`를 설정하지 않아요 — 그 속성은 Fetch 경계 전송 실패나 body representation 실패용이에요.

## 시작 vs open 이후

SSE는 핸들을 resolve하기 전에 status, `text/event-stream`, body를 검증해요. 실패한 status → `HTTP_STATUS`. 잘못된 content type이나 없는 body → `RESPONSE_VALIDATION_FAILED`. opening 스냅샷은 여전히 튜플 세 번째에 올 수 있어요.

WebSocket 시작은 handshake + 첫 물리 open을 덮어요. 생성자 실패, open 전 close, 타임아웃, 취소 → 시작 튜플. 소켓이 `open`에 도달하지 않아도 연결 스냅샷이 있을 수 있어요.

| Transport | After startup                                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | 치명적 오류에서 iterator가 reject하고, `stream.closed`는 `code: 'error'`와 `EventStreamErrorCode`로 resolve해요                               |
| WebSocket | 메시지/큐/heartbeat/런타임 실패는 `onRuntimeError`; 종료 오류에서 `receive` 실패; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | execute 프로미스는 한 번 settle해요. 인터셉터/콜백 코드는 튜플 정규화 밖에서도 throw할 수 있어요                                              |

`ABORTED` / `TIMEOUT`은 호출자가 보는 시작 결과를 설명해요. 반환된 스트림/세션은 여전히 닫고 종료 프로미스를 await 해야 해요.

## 네이티브 Error 로깅과 cause

`RequestError`의 모든 variant는 네이티브 `Error` 인스턴스라서 diagnostic adapter가 필요 없어요. `String(error)`는 안정적인 네이티브 형식인 `<name>: <message>`를 사용해요. `kind`, `code`, 그리고 `status`, `response`, `data` 같은 variant 필드는 구조화 로깅을 위해 enumerable이고, `name`과 네이티브 `cause` 체인은 non-enumerable이에요.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

`format()`, `flatten()`, `prettify()`를 호출하기 전에 `error.cause instanceof StructError`로 좁혀야 해요. 이 helper들은 Struct cause에 그대로 있고 바깥쪽 `DefinitionError`로 복사되지 않아요. 제어 흐름에서 `message`나 `String(error)`를 파싱하지 마세요 — `kind`, `code`, 검토된 status가 여전히 계약이에요.

## Reference

| Branch | Control-flow check | Useful stable fields | Usually absent / sensitive |
| --- | --- | --- |
| HTTP status 정책 | `error.kind === 'http'` | `error.status`, 검토된 `error.data` | body, 헤더, URL, `cause` |
| 호출자 취소 | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code` | abort 이유와 스택 |
| 타임아웃 | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code` | 요청 URL과 하위 cause |
| 계약 실패 | `error.kind === 'definition'` | `kind`, `code`, 검토된 `response?.status` | Struct 이슈, body, 입력 값 |
| 스트림/세션 런타임 | `stream.closed` / `session.closed` | 종료 code/kind, 검토된 close status | 이벤트 페이로드, 프레임, cause |

status `0`으로 CORS를 추론하지 마세요 — `kind`와 `code`로 분기해요.

`cause`, `data`, 응답 헤더/body, URL, Struct 이슈, 입력 값, 스택은 민감하게 취급해요. 보수적인 요약:

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

`createTransportError`, `createDefinitionError`, `createHttpStatusError`는 이 네이티브 Error 값을 만들어요. 일반 요청 실패는 여전히 튜플로 반환되며, 네이티브 Error를 상속한다고 해서 자동으로 throw되지는 않아요. `ERR_ABORTED`와 `ERR_TIMEOUT`은 전송 정규화기가 인식하는 공유 cause예요.

## 관련 레시피

- [선언된 404가 있는 GET](../recipes/get-declared-404.md)
- [HTTP 호출 취소하기](../recipes/cancel-http.md)
