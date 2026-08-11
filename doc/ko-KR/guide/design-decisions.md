---
title: 설계 결정
description: Defjs가 명시적 클라이언트, 트랜스포트별 튜플, 실행 시점 생명주기 옵션, 프로젝션 기반 build, observer를 사용하는 이유를 설명합니다.
---

# 설계 결정

이 페이지는 현재 API가 이렇게 설계된 이유를 설명합니다. 각 필드와 기본값은 참조 문서에서 다룹니다.

## 명시적 클라이언트

Defjs에는 프로세스 전역 기본 클라이언트가 없습니다. `createClient(...)`는 소유권을 호출 지점에 드러내며, 엔드포인트·자격 증명·테스트·요청 범위별로 서로 다른 클라이언트를 만들 수 있게 합니다.

하지만 격리에는 한계가 있습니다. 인터셉터와 옵션 callback이 애플리케이션의 공유 상태를 참조할 수 있으므로, 클라이언트 객체가 둘이라고 해서 주변의 모든 상태까지 자동으로 격리되지는 않습니다. `setErrorMap(...)`도 프로세스 전역으로 동작합니다. 서버 코드에서는 옵션이나 closure에 요청, 사용자, tenant, cookie, 권한 정보가 포함될 때마다 요청 범위 클라이언트를 만드세요.

명시적 클라이언트는 리소스 소유권을 논의하기 쉽게 하지만 리소스 관리자는 아닙니다. 활성 HTTP 요청, SSE 핸들, WebSocket 세션을 추적하거나 정리하지 않습니다.

## 트랜스포트별 튜플

지원되는 모든 커맨드는 오류 우선 3요소 튜플을 사용하지만, 세 번째 요소는 트랜스포트 고유의 의미를 유지합니다.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

HTTP 응답 래퍼, SSE 시작 시점 open 스냅샷, WebSocket 시작 시점 connection 스냅샷을 하나의 모호한 추상화로 뭉치지 않기 위한 선택입니다. 두 번째 요소도 같은 원칙을 따릅니다. HTTP는 디코딩된 데이터를, SSE는 논리 스트림 핸들을, WebSocket은 논리 세션을 반환합니다.

튜플은 예상 가능한 시작 실패를 예외 기반 제어 흐름 없이 명시합니다. 그렇다고 임의의 인터셉터, callback, listener 또는 지원되지 않는 값이 절대로 reject하거나 throw하지 않는다는 보장은 아닙니다.

## 생명주기 옵션은 실행에 둡니다

엔드포인트 정의는 안정적인 통신 계약과 트랜스포트 큐 한도를 나타냅니다. 취소, timeout, heartbeat, 재연결 설정은 해당 작업을 소유하는 실행에 속합니다.

HTTP와 SSE는 실행 시점 취소 옵션을 받습니다. WebSocket은 실행별 `beforeConnect`, heartbeat, 재연결, protocol 옵션도 받습니다. 클라이언트 옵션은 트랜스포트가 지원하는 재사용 가능한 기본값을 제공하지만 WebSocket incoming/outgoing 용량은 엔드포인트에 남습니다.

이렇게 나누면 커맨드를 재사용할 수 있습니다. 백그라운드 작업과 대화형 화면이 같은 커맨드를 서로 다른 생명주기로 실행하면서도 path나 메시지 스키마를 다시 정의할 필요가 없습니다.

## `build`는 프로젝션을 사용합니다

사용자 정의 `build(request, input)`의 `input`은 입력 Struct에서 파생된 선언적 바인딩 뷰입니다. 호출자가 전달한 런타임 값에는 접근할 수 없습니다.

이 뷰는 source 필드를 path, query, header, body target에 매핑하는 방식을 기록합니다. 필드 선택, 명시적 wire key, 배열의 1:1 프로젝션을 지원하지만 값에 따른 분기, 임의 변환, 리터럴 프로젝션 값 주입은 의도적으로 막습니다.

이 제약은 요청 구성을 선언한 Struct 필드에 묶어 둡니다. 애플리케이션 수준의 정규화와 비즈니스 검증은 커맨드를 만들기 전에 수행하세요. 지원되는 프로젝션 형식은 [커맨드](/ko-KR/core/commands)를 참고하세요.

## Observer는 제어 흐름을 소유하지 않습니다

SSE `onInvalidEvent`는 버려진 이벤트를 관찰합니다. throw된 오류와 reject된 promise는 스트림 제어 흐름에서 격리되어 처리가 계속됩니다. 다만 비동기 observer는 계속 await되므로 이후 메시지를 지연할 수 있습니다.

WebSocket 상태 및 런타임 오류 listener도 observer입니다. throw된 오류와 reject된 promise는 격리됩니다. 상태 listener 실패는 런타임 오류 listener로 전달되고, 런타임 오류 listener 실패는 사용 가능한 경우 전역 `reportError`로 전달되며, 나머지 listener와 생명주기 작업은 계속됩니다.

생명주기 결정에는 반환된 핸들이나 세션을 사용하세요. observer는 제한된 로깅, metric, 상태 업데이트에만 사용하고 소유 범위가 끝날 때 제거하세요.

## Sourcemap 배포

production sourcemap policy를 명시적으로 선택하세요.

- **public**: map을 bundle과 함께 배포합니다. map에는 `sourcesContent`가 들어 있으므로 source path가 상대 경로여도 애플리케이션과 dependency source가 공개됩니다.

- **hidden**: bundle의 source-map reference를 제거하고 map을 error platform에 private upload한 뒤 공개 배포하지 않습니다. map file 자체에는 민감한 path와 `sourcesContent`가 남으며 “hidden”이라고 안전해지는 것은 아닙니다.

- **disabled**: production map을 생성하지 않습니다. map disclosure는 막지만 production stack의 source-level symbolication을 포기해 debugging이 어려워집니다.

private map access와 retention을 다른 debugging artifact처럼 제한하세요. relative path만으로 confidentiality boundary가 되지 않습니다.

## OpenAPI 경계

authoritative contract source 하나를 선택하세요. 기존 OpenAPI workflow가 있는 조직은 이를 유지하고 mature generator와 명시적 runtime validator를 application boundary에서 사용해야 합니다. 생성된 TypeScript type만으로 runtime response를 검증할 수 없습니다. greenfield Defjs service에서는 Defjs Struct와 endpoint definition으로 wire contract를 직접 정의합니다.

Core에는 OpenAPI generator/exporter를 추가하지 않으며 OpenAPI와 Defjs를 동기화할 두 source로 유지하지 않습니다. dual-source drift보다 명확한 boundary에서 기존 tool을 조합하는 편이 낫습니다.

## 관련 reference

- [클라이언트](/ko-KR/core/client)에서는 옵션 조합과 클라이언트 범위를 설명합니다.
- [오류](/ko-KR/core/errors)에서는 튜플 실패와 응답 가용성을 설명합니다.
- [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)에서는 논리 핸들, 물리 연결 시도, 최종 종료를 설명합니다.
