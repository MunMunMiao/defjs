---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

서버 사이드 OpenTelemetry 통합 패키지로 `@defjs/core`의 HTTP, SSE, WebSocket 클라이언트에 대한 아웃바운드 추적과 메트릭 수집을 제공해요.

**코어 포지셔닝**:

- **서버 환경** (Node.js, Bun, Deno), 브라우저 환경에 의존하지 않아요.
- **SDK 초기화를 수행하지 않음** — OpenTelemetry SDK를 외부에서 초기화한 후 생성된 `Tracer`(및 선택적으로 `Meter`)를 전달해야 해요.
- **트랜스포트별 분리** — HTTP, SSE, WebSocket 각각 독립적인 인터셉터, 스팬 생명주기, 메트릭 차원을 가져요.

## 리포지토리 워크스페이스 설정

이 페이지는 현재 이 리포지토리 내부에서 소스 패키지와 워크스페이스를 사용하는 방식을 설명해요. `@defjs/opentelemetry-server`는 `packages/opentelemetry-server`에 있고, 피어 의존성은 `packages/core`에 있는 호환 `@defjs/core` 워크스페이스 버전을 기대해요.

아래 import 지정자는 패키지 이름을 사용하지만, 이 리포지토리 안에서는 공개 레지스트리에서 함께 설치한 패키지 쌍이 아니라 워크스페이스 소스 패키지로 해석돼요. 애플리케이션의 OpenTelemetry SDK 의존성은 계속 별도로 설치하고 초기화해야 해요.

공개 npm에는 현재 `@defjs/opentelemetry-server`가 없고, 거기의 최신 단독 `@defjs/core` 릴리스도 이 워크스페이스 패키지와 호환되는 피어가 아니에요. 나중에 `@defjs/opentelemetry-server`와 호환되는 `@defjs/core`를 직접 관리하는 레지스트리나 두 버전을 모두 제공하는 다른 레지스트리에 함께 게시한다면, 그 환경에서는 이 워크스페이스 패키지와 호환되지 않는 단독 `@defjs/core` 릴리스를 섞지 말고 게시된 두 버전을 함께 설치하세요.

## 기본 사용법

외부에서 생성한 `Tracer`를 전달하고 `withOpenTelemetryServer`로 클라이언트를 설정하세요:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. OpenTelemetry SDK를 외부에서 초기화한 후 tracer 획득
const tracer = trace.getTracer('my-service')

// 2. tracer를 클라이언트 설정에 주입
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## 전체 설정

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // 필수
    meter, // 선택적, 제공 시에만 메트릭 수집
    propagator, // 선택적, 기본값 W3C TraceContext + Baggage
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### 설정 옵션

| 옵션                | 타입                                  | 기본값                     | 설명                                               |
| ------------------- | ------------------------------------- | -------------------------- | -------------------------------------------------- |
| `tracer`            | `Tracer`                              | **필수**                   | 외부 OpenTelemetry tracer                          |
| `meter`             | `Meter`                               | `undefined`                | 외부 OpenTelemetry meter, 생략하면 메트릭 비활성화 |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | 커스텀 컨텍스트 전파자                             |
| `requireParentSpan` | `boolean`                             | `false`                    | 활성 부모 스팬이 있을 때만 아웃바운드 스팬 생성    |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP 트랜스포트 추적/메트릭 옵션                   |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE 트랜스포트 추적/메트릭 옵션                    |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket 트랜스포트 추적/메트릭 옵션              |

### HTTP 옵션

| 옵션           | 타입                  | 기본값      | 설명                                                            |
| -------------- | --------------------- | ----------- | --------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | HTTP 추적 활성화                                                |
| `requestHook`  | `(span, req) => void` | `undefined` | 요청 전 HTTP 스팬 커스터마이징, `req`는 `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | 응답 후 HTTP 스팬 커스터마이징, `res`는 `HttpResponse<unknown>` |

### SSE 옵션

| 옵션           | 타입                     | 기본값      | 설명                                                                               |
| -------------- | ------------------------ | ----------- | ---------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | SSE 추적 활성화                                                                    |
| `requestHook`  | `(span, req) => void`    | `undefined` | 스트림 요청 전 SSE 스팬 커스터마이징                                               |
| `responseHook` | `(span, stream) => void` | `undefined` | 스트림 핸들 반환 후 SSE 스팬 커스터마이징, `stream`은 `EventStreamHandle<unknown>` |

### WebSocket 옵션

| 옵션               | 타입                      | 기본값      | 설명                                                                         |
| ------------------ | ------------------------- | ----------- | ---------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | WebSocket 추적 활성화                                                        |
| `queryPropagation` | `boolean`                 | `true`      | 브라우저 호환성을 위해 WebSocket URL 쿼리 문자열에 추적 컨텍스트를 주입해요. 보안에 민감한 프로덕션 트래픽에서는 명시적으로 `false`로 설정하는 것을 권장 기본선으로 삼으세요. |
| `requestHook`      | `(span, req) => void`     | `undefined` | 연결 요청 전 WebSocket 스팬 커스터마이징                                     |
| `responseHook`     | `(span, session) => void` | `undefined` | 세션 반환 후 WebSocket 스팬 커스터마이징, `session`은 `WebSocketSessionLike` |

> **훅 예외 처리**: `requestHook` 또는 `responseHook`에서 예외가 발생하면 오류가 스팬의 `defjs.otel.hook.error` 이벤트로 기록되지만, 클라이언트 요청/스트림/세션은 **정상적으로 계속돼요**.
>
> **속성 위생**: `requestHook` / `responseHook`에서는 명시적인 allowlist, redaction, 안정적인 저카디널리티 속성을 우선하세요. 애플리케이션이 개인정보, 카디널리티, 보존, redaction 요구 사항을 이미 검토한 경우가 아니라면 원시 쿼리 문자열, 요청/응답 바디, 전체 헤더, `baggage` 값, 메시지 페이로드를 붙이지 마세요.

## 이전 API에서 마이그레이션

| 이전 설정                 | 새 설정                                                          |
| ------------------------- | ---------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                       |
| `sse: false`              | `sse: { enabled: false }`                                        |
| `webSocket: false`        | `webSocket: { enabled: false }`                                  |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                   |

각 트랜스포트가 올바른 요청/응답 타입을 노출하도록 기존 최상위 훅과 불리언 트랜스포트 토글은 의도적으로 제거되었어요. 이제 제거된 예전 JavaScript 옵션을 전달하면 조용히 계측 활성화로 해석되는 대신 마이그레이션 오류가 발생해요.

## HTTP 시맨틱 규칙과 메트릭

HTTP 추적은 안정적인 OpenTelemetry HTTP 클라이언트 시맨틱 규칙을 따라요. 기본적으로 다음과 같은 기본 속성을 가진 `SpanKind.CLIENT` 스팬을 기록해요:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

`meter`가 제공되면 다음 안정적인 메트릭이 수집돼요:

| 메트릭                         | 단위 | 속성                                                                                                                          |
| ------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, 선택적 `http.response.status_code`, 선택적 `server.address`, 선택적 `server.port`, 선택적 `error.type` |

기본적으로 **이 패키지는 요청/응답 바디, 전체 헤더, `baggage` 값, 페이로드 크기, 메시지 페이로드를 기본 커스텀 텔레메트리 필드로 추가하지 않아요**. 또한 **원시 쿼리 문자열을 위한 별도 스팬 속성이나 메트릭도 만들지 않아요**. 하지만 `url.full`은 애플리케이션이 실제로 구성한 요청 URL을 반영하므로, URL 자체에 쿼리 문자열이 포함되어 있으면 그 값이 거기에 나타날 수 있어요. 가능하면 URL에 token, user id 또는 기타 민감하거나 높은 카디널리티 입력을 넣지 마세요.

애플리케이션이 개인정보, 카디널리티, 보존, redaction 요구 사항을 이미 검토한 경우가 아니라면 원시 쿼리 문자열, 요청/응답 바디, 전체 헤더, `baggage` 값, 메시지 페이로드를 스팬이나 메트릭에 추가하지 마세요. 훅으로 텔레메트리를 확장할 때는 명시적인 allowlist, redaction, 안정적인 저카디널리티 속성을 우선하세요.

## SSE 연결 레벨 추적과 커스텀 메트릭

SSE는 장기 지속 HTTP 응답이에요. 정상적인 HTTP 요청 지속 시간은 스트림 수립 시점에 끝나며, 스트림이 여전히 실행 중인지, 중단되었는지, 오류가 났는지를 반영하지 않아요. 따라서 이 패키지는 SSE를 **연결 레벨** 텔레메트리로 처리해요.

### 스팬 생명주기

SSE 스팬은 `stream.closed`가 resolve될 때까지 열린 상태를 유지하며, 다음 생명주기 이벤트를 기록해요:

- `sse.connected` — 스트림이 성공적으로 수립됨
- `sse.closed` — 스트림 정상 종료(서버 EOF)
- `sse.aborted` — `stream.close()`로 능동적으로 종료
- `sse.error` — 연결 오류 또는 재연결 소진

### 커스텀 메트릭

`meter`가 제공되면 다음 defjs 커스텀 메트릭이 수집돼요(공식 OpenTelemetry 안정 시맨틱 규칙은 아님):

| 메트릭                                 | 단위       | 의미                                         |
| -------------------------------------- | ---------- | -------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | 스트림 연결 수립까지 걸린 시간               |
| `defjs.client.sse.connection.duration` | `s`        | 스트림 수립부터 종료/오류까지의 총 지속 시간 |
| `defjs.client.sse.active_streams`      | `{stream}` | 현재 활성 SSE 스트림 개수                    |

기본적으로 **이벤트별 스팬은 생성되지 않고**, **이벤트 페이로드, 이벤트 ID, `Last-Event-ID`, 전달 지연, 손실 이벤트, 재연결 큐는 수집되지 않아요**. 이들은 애플리케이션 레벨 시맨틱으로 높은 카디널리티나 민감한 텔레메트리를 만들 수 있어요. 필요하면 애플리케이션 레이어에서 구현하세요.

## WebSocket 연결 레벨 추적과 커스텀 메트릭

WebSocket은 HTTP Upgrade 핸드쉐이크로 시작하지만 프로덕션 환경은 핸드쉐이크 이후의 연결 생명주기에 더 관심이 있어요: 활성 연결, 연결 지속 시간, 종료/오류 동작, 연결 실패율. OpenTelemetry WebSocket 시맨틱 규칙이 아직 안정화되지 않았으므로 이 패키지는 연결 레벨 커스텀 메트릭을 사용해요.

### 스팬 생명주기

WebSocket 스팬은 `session.closed`가 resolve될 때까지 열린 상태를 유지하며, 다음 생명주기 이벤트를 기록해요:

- `websocket.connected` — 세션이 성공적으로 수립됨
- `websocket.closed` — 연결 정상 종료
- `websocket.error` — 연결 오류

### 커스텀 메트릭

`meter`가 제공되면 다음 defjs 커스텀 메트릭이 수집돼요:

| 메트릭                                       | 단위           | 의미                                       |
| -------------------------------------------- | -------------- | ------------------------------------------ |
| `defjs.client.websocket.connect.duration`    | `s`            | WebSocket 세션 수립까지 걸린 시간          |
| `defjs.client.websocket.connection.duration` | `s`            | 세션 수립부터 종료/오류까지의 총 지속 시간 |
| `defjs.client.websocket.active_connections`  | `{connection}` | 현재 활성 WebSocket 연결 개수              |

기본적으로 **메시지별 스팬은 생성되지 않고**, **메시지 페이로드, 메시지 크기, 역압력, 버퍼드 양, 서브프로토콜, 재연결 큐는 수집되지 않아요**. 메시지 레벨 텔레메트리는 샘플링 전략과 함께 애플리케이션 레이어에서 구현해야 해요.

## WebSocket 쿼리 전파 보안 위험

브라우저 WebSocket 클라이언트는 보통 임의의 HTTP 헤더를 설정할 수 없어서 `webSocket.queryPropagation`의 런타임 기본값이 호환성을 위해 `true`예요. 이 기본값은 추적 컨텍스트를 WebSocket URL 쿼리 문자열에 주입해요.

쿼리 문자열은 프록시, 브라우저, APM 도구, 접근 로그, 네트워크 디버깅 도구에 기록될 수 있어요. 또한 token, user id 또는 다른 고카디널리티 입력을 포함할 수도 있어요. 전파자에 `baggage`가 포함되면 `baggage` 값도 URL에 기록되어 민감한 데이터를 노출할 수 있어요.

보안에 민감한 프로덕션 WebSocket 트래픽에서는 권장 보안 기본선으로 쿼리 전파를 명시적으로 비활성화하세요:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

비활성화 후에는 추적 컨텍스트가 더 이상 WebSocket URL을 통해 전달되지 않아요. 서버가 여전히 연결을 trace에 연결해야 한다면 애플리케이션 계층에서 이미 검토된 다른 상관관계 메커니즘을 사용하세요.

## 다음 단계

- [클라이언트](/core/client) — `createClient`와 전체 트랜스포트 설정
- [SSE](/core/sse) — `defineEventStream`과 스트리밍 이벤트 소비
- [WebSocket](/core/web-socket) — `defineWebSocket`과 실시간 통신
