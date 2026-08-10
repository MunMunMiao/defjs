---
title: 커맨드
description: 엔드포인트를 정의하고 커맨드 빌더와 커맨드를 만들며 Struct 입력을 wire 형식에 매핑하고 HTTP 출력 타입을 추론합니다.
---

# 커맨드

Defjs는 서로 연결된 세 단계를 사용합니다.

1. **엔드포인트 정의**는 안정적인 HTTP, SSE 또는 WebSocket 계약을 설명합니다.
2. **커맨드 빌더**는 `defineRequest`, `defineEventStream`, `defineWebSocket`이 반환하는 함수입니다.
3. **커맨드**는 빌더를 입력과 함께 호출했을 때 반환되는 값입니다. 이 커맨드를 `client.execute(...)`에 전달합니다.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

여기서 `defineRequest`에 전달한 객체는 엔드포인트 정의, `getUser`는 커맨드 빌더, `command`는 커맨드입니다.

## HTTP 엔드포인트 정의

`defineRequest(...)`는 다음 필드를 받습니다.

| 필드           | 의미                                                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `method`       | HTTP method 문자열입니다.                                                                                                |
| `path`         | 선택적인 `:name` placeholder를 포함한 상대 endpoint path입니다.                                                          |
| `input`        | 커맨드 입력을 구조적으로 디코딩하는 Struct입니다.                                                                        |
| `build`        | 입력 필드에서 요청 부분으로 이어지는 스키마 결합 프로젝션입니다. `input`이 필요합니다.                                   |
| `output`       | 응답 디코딩과 결과 추론에 쓰는 상태 코드와 Struct의 매핑입니다.                                                          |
| `responseType` | `output`을 선언한 경우에만 선택할 수 있는 `json`, `text`, `blob`, `arraybuffer` 모드이며, 생략 시에는 허용되지 않습니다. |

커맨드 필드가 wire section에 직접 대응하면 `struct.request(...)`를 사용하세요.

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

호출자는 논리 필드 이름을 사용합니다. alias가 wire key를 선택합니다.

## 커맨드 빌더의 인자 선택성

`input`이 없는 빌더는 인자를 받지 않습니다.

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

`input`을 선언하면 필수 객체 필드와 선언한 모든 request section을 제공해야 합니다. optional 또는 nullish 필드만 생략할 수 있습니다. endpoint가 사용하지 않는 section은 선언하지 마세요.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search({ query: { q: 'docs' } })
// search() // TypeScript error: an argument is required.
// search({ query: {} }) // TypeScript and runtime error: q is required.
```

이는 구조의 존재 여부와 타입을 검증하는 것이며 애플리케이션 인가, 범위, 금액, 형식, 상태 전이 규칙을 검증하는 것은 아닙니다.

## 자동 요청 구성

`input`이 `struct.request(...)`이고 `build`가 없으면 Defjs가 선언된 section을 자동으로 매핑합니다.

- `path`는 path placeholder를 치환합니다.
- `query`는 query parameter가 됩니다.
- `headers`는 요청 header가 됩니다.
- `body`는 해당 body wrapper를 사용합니다.

요청 body는 지원되는 경계를 선언해야 합니다.

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

`request.body`에 `struct.object(...)`를 그대로 넣지 마세요. `struct.request(...)`가 이를 거부합니다. HTTP는 모든 body 형식을 지원합니다. SSE는 body section을 거부하고 WebSocket은 header와 body section을 모두 거부합니다.

## 사용자 정의 `build`

논리 필드를 다른 wire 위치나 key에 배치해야 할 때 `build(request, input)`을 사용하세요. `input` parameter는 **스키마에 결합된 프로젝션**이며, 파싱된 호출자 값이 아닙니다.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

프로젝션은 다음 작업을 할 수 있습니다.

- 선언된 필드를 선택합니다.
- 대상 wire key를 선택합니다.
- `.map(...)`으로 배열 항목을 1:1 프로젝션합니다.
- 선택한 객체를 JSON에 바인딩할 때 그 필드 alias로 인코딩합니다.

프로젝션은 호출자 값을 검사하거나, 값에 따라 분기하거나, 임의 변환을 계산하거나, 배열 길이를 바꾸거나, 리터럴 값을 주입할 수 없습니다. 예를 들어 `'v1'`은 입력 바인딩 뷰에서 오지 않았으므로 `request.setJson({ version: 'v1' })`은 유효한 프로젝션이 아닙니다.

애플리케이션 데이터를 정규화하고 검증한 뒤 커맨드를 만드세요. `build`는 선언적인 wire 매핑에만 사용하세요.

### Build 기능

| Target                                                | HTTP | SSE    | WebSocket |
| ----------------------------------------------------- | ---- | ------ | --------- |
| `setPathParams`, `setQueryParams`                     | 지원 | 지원   | 지원      |
| `setHeaders`, `addHeaders`                            | 지원 | 지원   | 미지원    |
| JSON, text, HTML, form, Blob, ArrayBuffer body method | 지원 | 미지원 | 미지원    |

TypeScript build context는 트랜스포트별로 다릅니다. 타입 검사를 우회하더라도 런타임 검사가 지원되지 않는 출력을 거부합니다.

## HTTP 출력 추론

`output`은 객체 map이나 status/body pair 배열을 지원합니다.

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

HTTP 성공 타입은 선언된 2xx body의 union입니다. `error.data`는 선언된 2xx가 아닌 body의 union입니다. 배열 형식에서는 상태 코드 리터럴과 그룹화된 readonly 배열을 보존하려고 `as const`를 사용합니다.

`output`을 선언하면 반환된 모든 status에 대응하는 Struct가 있어야 합니다. 일치하지 않는 2xx 또는 비-2xx status는 `UNDECLARED_STATUS`를 만듭니다. `output`이 없으면 응답 body를 읽거나 디코딩하지 않고 best-effort로 취소하며, 결과는 `undefined`입니다.

## SSE 및 WebSocket 정의

`defineEventStream(...)`은 HTTP `output` 대신 `events` map을 사용합니다. 이벤트 이름으로 Struct를 선택하고, 선택적인 `default` 항목이 런타임에 선언되지 않은 이름을 처리합니다.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)`은 `incoming`과 선택적인 `outgoing` 메시지 map을 선언합니다. 메시지 envelope는 `type` discriminator를 사용합니다.

```typescript
const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

디코딩, 큐, 재연결, 종료 소유권은 [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)을 참고하세요.

## 커맨드는 내부를 들여다보지 않는 값으로 다루세요

애플리케이션 코드는 커맨드를 만들어 `Client.execute(...)`에 전달해야 합니다. 트랜스포트 tag나 구조적 reflection에 의존하지 마세요.

현재 root entry는 트랜스포트 커맨드 interface와 저수준 executor 함수를 export합니다. 권장 workflow에는 필요하지 않으며, 이 문서에서는 해당 export의 장기 안정성을 보장하지 않습니다. 런타임 dispatch에 쓰이는 커맨드 tag symbol과 guard 함수는 root export가 아닙니다.

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 실행 오버로드와 옵션 조합을 설명합니다.
- [HTTP](/ko-KR/core/http)에서는 URL, 인코딩, 응답, 취소 동작을 설명합니다.
- [Struct](/ko-KR/core/struct)에서는 엄격한 구조 디코딩을 설명합니다.
