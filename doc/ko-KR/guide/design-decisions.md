---
title: 설계 결정
description: Defjs가 계약, 명령, 전송 결과, 디코딩, 소유권을 왜 명시적으로 두는지 설명해요.
---

# 설계 결정

Defjs는 몇 가지를 의도적으로 바꿔요. 편의 API는 요청·스트림·세션의 소유자를 자주 가려요. Defjs는 그 경계를 드러내서, 같은 엔드포인트 계약을 재사용하면서도 캐시·재시도 스케줄러·리소스 관리자를 조용히 끌어들이지 않게 해요.

## 선언은 곧 단언이에요

이 여섯 가지 규칙이 응답을 어떻게 읽을지에 대한 모든 질문을 결정해요. 나중에 논의할 때 다시 유도하지 않고 바로 인용할 수 있도록 번호를 붙였어요.

### 1. 선언한 것이 곧 단언한 것

`output`은 "`ok`가 true일 때 body는 **이 모양이다**"라는 뜻이에요. `error`는 "`ok`가 false일 때 body는 **이 모양이다**"예요. 선언은 힌트도, 잘 되면 좋겠다는 바람도 아니라, 무엇이 도착할지에 대한 주장이에요.

### 2. `ok`가 유일한 분기점이고, 읽는 쪽은 항상 한쪽뿐

2xx는 `output`으로 읽어요. 나머지는 모두 `error`로 읽어요. 둘 다 시도하는 일은 없고, 다른 쪽을 폴백으로 쓰지도 않아요.

### 3. 단언과 다른 현실은 실패이고, 분명하게 보고해요

형식을 추측하지 않고, 약한 쪽으로 낮추지 않고, 침묵하지 않아요. 백엔드가 바뀌었는지, 게이트웨이가 끼어들었는지, 누가 응답을 손댔는지는 **결론을 바꾸지 않아요**. 라이브러리는 그것들을 구분할 수 없고, 구분하는 척해서도 안 돼요.

이 규칙은 사람들이 가장 자주 완화해 달라고 하는 것이라, 상황을 분명히 말해 둘 만해요. 공격자가 당신의 페이지가 `output`으로 읽으려던 `200`을 고칠 수 있고, 대신 `3xx`, `4xx`, `5xx`가 도착했다고 해 봐요. 실패하는 건 불편이 아니라 유일하게 안전한 결과예요. "혹시 모르니" 원본 body를 건네주는 건, 응답을 주입할 수 있는 사람에게 당신이 요구한 검증을 우회할 길을 주는 셈이에요.

### 4. 디코딩이 실패했다면 body는 없어요

body**란** 디코딩된 값이에요. 디코딩이 실패했다면 값이 없어요 — 들여다볼 반쯤 디코딩된 body 같은 건 없어요. 문제의 세부는 `cause`에 실리고, 응답은 메타데이터만 지녀요.

이 규칙은 관례가 아니라 타입 시스템이 강제해요. 디코딩 fault의 `response`는 `HttpMeta`라서 `body` 필드가 아예 없고, 꺼내려 하면 컴파일 오류예요.

### 5. 단언에 얽매이고 싶지 않다면 선언하지 마세요

`output`을 빼면 "2xx body는 신경 쓰지 않는다"는 뜻이고, 그 body는 읽히지 않아요. `error`를 빼면 나머지에 대해서도 같아요. 이건 실수가 아니라 명시적인 opt-out이고, 끝까지 일관돼요. opt out한 쪽의 body를 읽을 수 없더라도 그건 당신 일이 아니에요. "읽을 수 없었다"는 사실조차요.

### 6. 3xx는 오류 코드 구간이 아니에요

어떤 엔드포인트가 리다이렉트 status를 준다는 걸 알고 있다면, `output`에 그 스키마를 넘기지 말거나 빈 값을 받아들이는 스키마를 선언하세요. 그러지 않으면 실패가 보고되는 게 예상된 결과이고, 빈틈이 아니에요.

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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
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

디코딩은 **인터셉터 체인 뒤에서 딱 한 번** 일어나요. 인터셉터가 `makeResponse(...)`로 만든 응답은 실제 회선에서 온 것과 똑같이 해석돼요. 응답이 어디서 왔는지는 읽는 방식을 바꾸지 않으니, "인터셉터는 믿는다" 같은 따져 볼 경로가 아예 없어요.

순서는 미디어 타입, 그다음 표현, 그다음 Struct예요.

| 지켜지지 않은 것                               | Fault                                                |
| ---------------------------------------------- | ---------------------------------------------------- |
| 미디어 타입이 선언된 표현이 요구하는 것과 다름 | `RES_MEDIA_TYPE_INVALID` — body를 읽기 **전에** 보고 |
| 바이트가 그 표현이 아님                        | `RES_DECODE_FAILED`                                  |
| 값이 그 Struct에 맞지 않음                     | `RES_STRUCT_MISMATCH`                                |
| non-2xx이고 `error`가 디코딩됨                 | 타입이 잡힌 `data`를 지닌 `HTTP_STATUS`              |
| non-2xx이고 `error`를 선언하지 않음            | `data: undefined`인 `HTTP_STATUS`                    |

미디어 타입을 먼저 확인하는 덕분에 "JSON을 요청했는데 HTML이 왔다"가 파서 오류가 아니라 하나의 정확한 fault가 돼요. 게다가 읽기, 파싱, Struct를 통째로 건너뛰어요.

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
  output: struct.object({ accepted: struct.number() }),
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
