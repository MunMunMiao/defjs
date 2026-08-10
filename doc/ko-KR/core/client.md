---
title: 클라이언트
description: 명시적 클라이언트를 만들고 옵션을 조합하며 트랜스포트별 커맨드를 실행하고 현재 설정 객체를 살펴봅니다.
---

# 클라이언트

`Client`를 명시적으로 생성하고 커맨드를 실행하는 코드에 전달하세요.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

클라이언트는 설정을 보관하고 HTTP, SSE, WebSocket 커맨드를 알맞은 실행 경로로 보냅니다. 전역 레지스트리나 백그라운드 생명주기 관리 기능은 없습니다.

## 옵션 조합

옵션은 왼쪽에서 오른쪽으로 실행됩니다.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

최종 엔드포인트는 `https://api.example.com`입니다. 인터셉터 순서는 `operationLogger`, `authInterceptor`, `retryInterceptor`입니다.

조합 규칙은 세 가지입니다.

1. setter helper는 해당 값을 교체합니다. `withEndpoint`, 트랜스포트 handle, query serializer, credentials, XSRF 설정, 개별 SSE·WebSocket 설정이 여기에 포함됩니다.
2. `withInterceptors(...items)`는 뒤에 추가합니다. 여러 번 호출해도 인터셉터를 추가한 순서를 유지합니다.
3. `withSSEOptions(...)`와 `withWebSocketOptions(...)`는 정의된 각 최상위 필드를 얕게 교체합니다. 중첩된 reconnect 또는 heartbeat 객체를 깊게 병합하지 않습니다.

예를 들어 아래 두 번째 reconnect 객체는 첫 번째 객체를 통째로 교체합니다. `attempts: 5`는 유지되지 않습니다.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

그룹 옵션 helper는 값이 `undefined`인 property를 무시합니다. 그 외에 전달된 최상위 property는 현재 값을 통째로 교체합니다.

### Core 옵션

| 옵션                             | 효과                                                                 |
| -------------------------------- | -------------------------------------------------------------------- |
| `withEndpoint(url)`              | 모든 트랜스포트가 사용하는 절대 base endpoint를 설정합니다.          |
| `withHTTPHandle(fetch)`          | HTTP용 Fetch 구현을 교체합니다.                                      |
| `withSSEHandle(fetch)`           | SSE용 Fetch 구현을 교체합니다.                                       |
| `withWebSocketHandle(WebSocket)` | WebSocket constructor를 교체합니다.                                  |
| `withInterceptors(...items)`     | 여러 트랜스포트의 인터셉터를 뒤에 추가합니다.                        |
| `withQueryParamsSerializer(fn)`  | HTTP, SSE, WebSocket의 query 직렬화를 교체합니다.                    |
| `withCredentials(boolean)`       | `true`이면 HTTP와 SSE Fetch에 `credentials: 'include'`를 사용합니다. |
| `withXSRF(options?)`             | HTTP XSRF token 주입을 설정합니다.                                   |
| `withSSEOptions(options)`        | 정의된 SSE 필드를 얕게 교체합니다.                                   |
| `withWebSocketOptions(options)`  | 정의된 WebSocket 필드를 얕게 교체합니다.                             |

개별 SSE 및 WebSocket helper는 대응하는 최상위 필드 하나를 설정합니다. 각 트랜스포트 문서에서 기본값과 생명주기상 결과를 확인할 수 있습니다.

## 커맨드 실행

`Client.execute`에는 세 가지 오버로드가 있습니다. 모두 오류 우선 3요소 튜플을 반환합니다.

HTTP, SSE, WebSocket 실행의 `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 하며, `0`, 음수, 소수, `NaN`, `Infinity`, 상한을 넘는 값은 request, stream, socket 리소스를 만들기 전에 `REQUEST_VALIDATION_FAILED`를 반환합니다.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

응답이 있으면 세 번째 요소는 Defjs `HttpResponse` 래퍼입니다. HTTP 옵션에는 `abort` 또는 `timeout`, 추가 별칭인 `signal`, `context`, upload/download progress observer가 있습니다.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

세 번째 요소는 검증을 통과한 시작 시점 open 스냅샷입니다. `stream.open`은 재연결 시도 이후 바뀔 수 있는 별도의 라이브 getter입니다. SSE 실행은 취소와 `HttpContext`를 받고, 재연결은 클라이언트 옵션으로 설정합니다. 필수 제한인 `maxBufferSize`와 `maxQueueSize`는 각 event stream 정의에 속합니다.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

세 번째 요소는 시작 시점 connection 스냅샷입니다. `session.connection`은 이후 물리 연결 시도를 나타낼 수 있는 라이브 getter입니다. WebSocket 실행은 취소와 연결별 `beforeConnect`, `heartbeat`, `protocols`, `reconnect`를 받습니다. 필수 `maxIncomingQueueSize`와 선택적 `maxOutgoingQueueSize` 제한은 각 WebSocket 정의에 속합니다. WebSocket 실행은 `HttpContext`를 받지 않습니다.

정확한 실패 분기는 [오류](/ko-KR/core/errors)를, 트랜스포트별 생명주기는 [HTTP](/ko-KR/core/http), [SSE](/ko-KR/core/sse), [WebSocket](/ko-KR/core/web-socket)을 참고하세요.

## 클라이언트 범위

엔드포인트와 closure가 브라우저에서 사용해도 안전하고 요청과 무관한 상태만 담는다면, 브라우저 애플리케이션은 모듈 수준 클라이언트를 유지할 수 있습니다.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

옵션이나 인터셉터가 권한 정보, cookie, tenant, 사용자 또는 요청 context를 참조한다면 서버 요청 사이에서 클라이언트를 재사용하지 마세요. 서버 요청 경계 안에서 클라이언트를 만드세요.

`Client`에는 `dispose()` method가 없습니다. 활성 요청, 스트림, 세션도 추적하지 않습니다. 작업을 시작한 코드가 대응하는 생명주기 경계에서 HTTP 요청을 취소하거나 SSE 핸들 또는 WebSocket 세션을 닫아야 합니다.

## 고급 점검

`isClient(value)`로 런타임 클라이언트 marker를 검사할 수 있습니다.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)`는 클라이언트가 보관하는 현재의 변경 가능한 설정 객체를 반환합니다. 스냅샷이나 readonly view가 아닙니다.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

이 객체를 변경하면 이후 실행에 영향을 주며 정상적인 옵션 조합 절차를 우회합니다. 진단이나 충분히 검토한 통합 코드에서만 사용하세요. 인자가 유효한 클라이언트가 아니면 `getClientConfig`는 `TypeError`를 던집니다.

## 다음 단계

- [커맨드](/ko-KR/core/commands)에서는 `execute`에 전달하는 값을 정의합니다.
- [인터셉터](/ko-KR/core/interceptors)에서는 트랜스포트 필터링과 어니언 순서를 설명합니다.
- [컨텍스트](/ko-KR/core/context)에서는 HTTP와 SSE의 요청 범위 메타데이터를 설명합니다.
