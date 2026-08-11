---
layout: home

hero:
  name: Defjs
  text: HTTP, SSE, WebSocket를 위한 타입 기반 커맨드
  tagline: Struct로 wire 형식을 정의하고 클라이언트를 명시적으로 생성해, 트랜스포트별 결과와 생명주기 의미를 분명하게 드러내세요.
  actions:
    - theme: brand
      text: 시작하기
      link: /ko-KR/guide/getting-started
    - theme: alt
      text: GitHub에서 보기
      link: https://github.com/defjs/defjs

features:
  - title: 엔드포인트 계약
    details: 엔드포인트 정의, 커맨드 빌더, 커맨드 값을 구분합니다. Struct는 호출자 입력과 트랜스포트 데이터를 런타임에 디코딩합니다.
  - title: 트랜스포트별 결과
    details: HTTP, SSE, WebSocket 모두 오류 우선 3요소 튜플을 반환합니다. 세 번째 요소는 각각 응답 래퍼, 시작 시점 open 스냅샷, 시작 시점 connection 스냅샷입니다.
  - title: 인터셉터 체인
    details: 클라이언트에 HTTP, SSE, WebSocket 인터셉터를 등록합니다. 각 트랜스포트는 자신에게 맞는 인터셉터만 골라 어니언 순서로 실행합니다.
  - title: 명시적인 생명주기
    details: SSE는 네트워크 오류와 읽기 실패를 재시도할 수 있습니다. WebSocket 재연결은 명시적으로 활성화해야 합니다. 순회, 취소, 최종 종료는 애플리케이션이 직접 관리합니다.
  - title: 런타임 디코딩
    details: TypeScript 추론에 쓰는 것과 같은 Struct 계약으로 입력, 응답, 스트림 이벤트, WebSocket 메시지를 디코딩합니다.
  - title: 애플리케이션 통합
    details: Vue나 React에서 클라이언트를 공유하고 서버 서비스의 outbound 작업에 OpenTelemetry 계측을 추가합니다.
---

## 타입이 지정된 API 클라이언트 만들기

애플리케이션이 호출할 HTTP, SSE, WebSocket 계약부터 정의하세요. Defjs는 이 정의를 커맨드 빌더로 만들고 런타임에 데이터를 검증하며 트랜스포트 결과를 명확하게 유지합니다.

HTTP 핵심 흐름은 짧습니다. API용 클라이언트를 만들고 엔드포인트를 정의한 뒤 커맨드 빌더를 호출해 커맨드를 실행합니다.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

클라이언트를 애플리케이션이 사용하는 서비스로 연결하고 Struct를 실제 응답 계약에 맞추세요. credential, UI 상태, 재시도, 취소, 리소스 정리는 여전히 애플리케이션이 맡습니다.

## 다음 문서

- [시작하기](/ko-KR/guide/getting-started)는 패키지 설치부터 첫 타입 요청까지 안내합니다.
- [클라이언트](/ko-KR/core/client)는 옵션 조합과 세 가지 `execute` 오버로드를 설명합니다.
- [커맨드](/ko-KR/core/commands)는 엔드포인트 정의, 커맨드 빌더, 커맨드, 스키마 결합 프로젝션을 설명합니다.
- [HTTP](/ko-KR/core/http), [SSE](/ko-KR/core/sse), [WebSocket](/ko-KR/core/web-socket)은 각 트랜스포트의 동작과 생명주기 책임을 설명합니다.
- [Vue](/ko-KR/plugins/vue), [React](/ko-KR/plugins/react), [OpenTelemetry Server](/ko-KR/plugins/opentelemetry-server)는 Defjs를 애플리케이션 framework와 telemetry 설정에 연결하는 방법을 보여 줍니다.
