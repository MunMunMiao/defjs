---
title: 설계 결정
description: Defjs가 계약, 명령, 전송 결과, 디코딩, 소유권을 왜 명시적으로 두는지 설명해요.
---

# 설계 결정

Defjs는 몇 가지를 의도적으로 바꿔요. 편의 API는 요청·스트림·세션의 소유자를 자주 가려요. Defjs는 그 경계를 드러내서, 같은 엔드포인트 계약을 재사용하면서도 캐시·재시도 스케줄러·리소스 관리자를 조용히 끌어들이지 않게 해요.

## 명시적인 클라이언트

`createClient(...)`는 엔드포인트 설정을 명시적인 값으로 만들어요. 환경이나 요청 범위마다 다른 엔드포인트, 자격 증명, 인터셉터, 직렬화기, 전송 핸들을 써요. `@defjs/core`의 `createClient(...)`도 HTTP 전용 소비자에게 같은 방식으로 동작해요.

대가는 프로세스 전역 기본값이 없다는 점이에요. 그 대가는 서버에서 도움이 돼요 — 옵션이나 클로저가 인증, 쿠키, 사용자, 테넌트, 요청 메타데이터를 담을 때 요청 경계 안에서 클라이언트를 만들어요. 명시적인 클라이언트라도 인터셉터가 담은 상태를 격리해 주지는 않고 클라이언트 정체성만으로 보안 경계가 되지는 않아요.

클라이언트는 명령을 디스패치해요. 진행 중인 작업을 소유하지는 않아요. HTTP 요청, SSE 스트림, WebSocket 세션을 시작한 쪽이 취소하거나 닫고, 종료 프로미스를 await 해야 해요.

## 정의, 빌더, 명령

정의는 안정적인 계약이에요. 메서드, path, 입력 Struct, 출력 매핑, 전송 제한이요. 빌더는 호출 가능한 뷰예요. 호출하면 한 번 실행용 opaque 명령이 하나 생겨요.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

백그라운드 작업과 UI 소유자는 같은 `getUser` 형태를 서로 다른 취소/재시도 정책으로 실행할 수 있어요. 명령을 opaque로 두면 앱 코드가 내부 전송 태그·심볼에 의존하지 않아요.

## 전송별 결과

세 전송 모두 error-first 튜플을 써요. 하나의 범용 “response”는 수명 주기 사실을 지워 버려요.

- HTTP → `[error, data, response]` — 디코딩된 출력 + `HttpResponse`
- SSE → `[error, stream, open]` — 논리 스트림 하나 + 시작 응답 스냅샷
- WebSocket → `[error, session, connection]` — 논리 세션 + 시작 연결 스냅샷

세 번째 값은 스냅샷이지, 이후 재연결이 같은 물리 연결을 유지한다는 약속이 아니에요. 시작 실패라도 전송이 먼저 응답/스냅샷을 만들었다면 포함될 수 있어요. 시작 이후 수명 주기 제어는 반환된 핸들이나 세션에 있어요.

## 런타임 디코딩

TypeScript 추론은 기대를 설명할 뿐, 서버 응답을 런타임에 검사하지는 못해요. Struct 파싱이 계약의 나머지 절반이에요. Defjs는 요청을 만들기 전에 명령 입력을 검증하고, 선택한 representation을 디코딩한 뒤, 맞는 Struct를 파싱해요.

그 순서는 status와 body를 별개 사실로 유지해요. 정확히 선언된 status 선택은 body 디코딩 **전에** 일어나요. 선언된 non-2xx → 타입이 잡힌 `error.data`. 잘못된 선언 body → `RESPONSE_VALIDATION_FAILED`. 미선언 status → `UNDECLARED_STATUS` (타입이 없는 성공/실패가 아님). “도착한 JSON이면 뭐든”보다 엄격하지만, 안전한 결정을 내릴 수 있어요.

## `build`의 한계

입력이 이미 path/query/headers/body를 가지면 자동 `struct.request(...)` 매핑이 기본이에요. 커스텀 `build(request, input)`은 호출 형태와 와이어 형태가 다를 때의 제약된 투영이에요.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input`은 스키마에 묶인 뷰이지, 호출자의 런타임 객체가 아니에요. 투영은 선언 필드를 고르고, 대상을 이름 바꾸고, 소스 배열 항목 하나를 출력 항목 하나로 매핑할 수 있어요. 값으로 분기하거나, 리터럴을 넣거나, 개수를 바꿀 수는 없어요. 비즈니스 데이터를 정규화하고 값에 의존하는 검증은 명령을 만들기 전에 해요.

## 옵저버와 정책 배치

인터셉터는 전송 전역 정책용이에요. 인증, 트레이싱, short-circuit, 검토된 재시도요. 자기 전송에만 돌고 onion 순서로 조합돼요. 실행 옵션은 작업별 수명용이에요. `signal`, `timeout`, WebSocket heartbeat, opt-in 재연결이요.

옵저버는 일어난 일을 보고할 뿐, 두 번째 소유자가 되지는 않아요. SSE `onInvalidEvent`, WebSocket 상태 리스너, 런타임 오류 리스너는 한정된 진단·메트릭용이에요. 반환된 스트림/세션이 여전히 순회, 닫기, 구독 해제, 종료 대기를 소유해요. 캐싱, 오래된 결과 억제, 멱등성, 도메인 오류 매핑은 `client.execute(...)` 주변에 두어 앱이 자기 정책과 상태를 볼 수 있게 해요.

## OpenAPI, 소스맵, 텔레메트리

Defjs는 두 번째 OpenAPI 계약을 생성하거나 동기화하지 않아요. OpenAPI가 이미 권위라면 그걸 유지하고 앱 경계에서 런타임 검증을 더해요. 새 서비스라면 엔드포인트 정의와 Struct가 직접 와이어 계약이 될 수 있어요 — 두 번째 진실 원천 없이요.

`withOpenTelemetryServer(...)`는 클라이언트에 **아웃바운드** Defjs 계측을 더해요. OpenTelemetry SDK를 초기화하지는 않아요. `tracer`는 필수, `meter`는 선택, 세 전송은 기본 활성, WebSocket query 전파는 기본 비활성이에요. operation 이름은 정적이고 저카디널리티로 유지해요. 전파, 훅, URL, 헤더, 페이로드, cause, 보존은 민감할 수 있으니 검토해요.

소스맵은 배포 결정이지 Defjs 동작이 아니에요. `sourcesContent`가 있는 공개 맵은 소스를 노출하고, 숨긴 맵에도 소스와 경로가 남으며, 맵을 끄면 소스 수준 심볼화가 사라져요. 비공개 맵은 접근·보존 규칙을 명시한 배포 가능한 디버깅 아티팩트로 취급해요.

## 관련 레시피

- [선언된 404가 있는 GET](../recipes/get-declared-404.md)
- [로컬 Fetch 핸들로 테스트하기](../recipes/test-with-handle.md)
