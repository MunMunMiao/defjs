---
title: OpenTelemetry Server
description: 애플리케이션이 제공한 OpenTelemetry Tracer와 선택적인 Meter로 outbound Defjs HTTP, SSE, WebSocket 클라이언트를 계측합니다.
---

# `@defjs/opentelemetry-server`

패키지 이름과 달리 이 adapter는 outbound Defjs 클라이언트 작업을 계측합니다. inbound server 계측이 아니며 OpenTelemetry SDK를 초기화하지 않습니다.

애플리케이션은 다음 항목을 소유합니다.

- SDK 및 provider 설정
- exporter 및 processor 설정
- context manager 및 active-context 설정
- sampling, attribute 정책, 민감 정보 마스킹
- force-flush 및 shutdown

애플리케이션이 제공하는 `Tracer`와 선택적인 `Meter`를 `withOpenTelemetryServer(...)`에 전달하세요.

## 클라이언트 설정

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

adapter는 활성화된 트랜스포트마다 인터셉터 하나를 추가합니다. 옵션은 일반적인 클라이언트 순서로 실행되므로 다른 인터셉터에 대한 상대 위치에 따라 span이 감싸는 작업 범위가 달라집니다.

## 옵션

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

각 트랜스포트 옵션은 `enabled?: boolean`, `requestHook`, `responseHook`을 받습니다. WebSocket은 `queryPropagation?: boolean`도 받습니다.

세 트랜스포트는 기본적으로 모두 활성화됩니다. 트랜스포트 하나를 끄려면 option 객체를 사용하세요.

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

이전의 boolean 트랜스포트 필드, top-level hook, `webSocketQueryPropagation`은 런타임에서 migration 오류로 거부됩니다. 현재 형식은 트랜스포트 option 객체, 트랜스포트별 hook, `webSocket.queryPropagation`입니다.

## Propagation

`propagator`를 생략하면 패키지가 W3C Trace Context와 W3C Baggage propagator를 담은 자체 `CompositePropagator`를 만듭니다. 전역 propagator 설정을 읽지 않습니다.

HTTP와 SSE는 propagator가 만든 모든 필드를 request header에 주입합니다. `req.headers`가 이미 `Headers` 인스턴스라면 현재 구현은 그 인스턴스를 재사용해 직접 변경합니다. 그렇지 않으면 새 `Headers` 객체를 만듭니다. WebSocket query propagation의 기본값은 `false`입니다. `queryPropagation: true`로 설정한 경우에만 활성화되며, 브라우저 socket은 임의 handshake header를 추가할 수 없으므로 propagator가 만든 모든 필드를 connection query string 뒤에 추가합니다.

각 인터셉터는 span을 만들기 전에 request header에 `propagator.extract(...)`도 호출합니다. 이 carrier를 애플리케이션이 관리하는 신뢰할 수 있는 입력으로 취급하세요. 신뢰할 수 없는 호출자가 `traceparent`, `tracestate`, `baggage`를 넣게 두지 마세요. 이 필드가 활성 parent context를 바꿀 수 있습니다. 신뢰할 수 없는 propagation 필드는 요청이 이 인터셉터에 도달하기 전에 제거하거나 정규화하세요.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

활성화하기 전에 배포 환경의 URL propagation을 검토하세요. trace context와 baggage는 브라우저, proxy, access log, telemetry system에 기록될 수 있습니다. 사용자 정의 propagator는 `traceparent`보다 더 많은 필드를 추가할 수 있습니다. 서버가 지원한다면 프로토콜 검토를 거친 첫 메시지나 수명이 짧은 일회용 connection ticket을 권장합니다.

`requireParentSpan: true`는 인터셉터가 계측을 시작하기 전에 활성 parent span이 있는지 확인합니다. 활성 span이 없으면 span 생성, propagation, hook, metric을 모두 건너뛰고 다음 handler를 그대로 호출합니다.

## Hook 동작

hook은 트랜스포트별 span과 request/result를 받습니다.

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

hook은 `void` 또는 `Promise<void>`를 반환할 수 있으며 클라이언트 작업을 막지 않습니다. 동기 throw와 비동기 rejection은 모두 잡아서 작업을 중단하지 않고 `defjs.otel.hook.error`로 기록하며, 해당 telemetry 기록 자체의 실패도 격리합니다.

allowlist로 관리하는 low-cardinality attribute만 사용하세요. 원본 header, query string, body, baggage, event ID, 메시지 payload, credential을 붙이지 마세요.

## HTTP 의미

HTTP 인터셉터는 `SpanKind.CLIENT` span을 만들고 다음 항목을 기록합니다.

- `http.request.method`
- `url.full`
- `server.address`와 선택적인 `server.port`
- 응답 이후 `http.response.status_code`

HTTP semantic convention 전체를 준수한다는 의미는 아닙니다.

현재 status 동작은 많은 애플리케이션의 기대보다 좁습니다.

- status `500` 이상만 span을 `ERROR`로 표시합니다.
- status `400`부터 `499`까지는 `OK`로 표시합니다.
- Defjs status 0 트랜스포트 응답은 `OK`로 표시합니다.
- 인터셉터를 통해 throw된 오류는 `ERROR`로 표시하고 exception을 기록합니다.

HTTP 인터셉터가 Defjs `HttpResponse`를 받으면 HTTP span이 끝납니다. high-level output status dispatch와 Struct 디코딩은 인터셉터가 반환한 뒤 일어납니다. 이후 발생하는 `RESPONSE_VALIDATION_FAILED` 또는 `UNDECLARED_STATUS`는 이미 끝난 span을 갱신할 수 없습니다.

Meter를 전달하면 HTTP는 `http.client.request.duration`을 초 단위로 기록합니다. attribute에는 method, server address/port, 선택적인 response status, throw된 오류의 선택적인 `error.type`이 포함됩니다.

## SSE 의미

SSE 시작이 성공하면 `stream.closed`가 settle될 때까지 span을 열어 둡니다. `sse.connected`를 기록하고, 다루는 종료 경로에 따라 `sse.closed`, `sse.aborted`, `sse.error` 중 하나를 기록합니다.

Meter를 사용하는 SSE 계측은 다음 metric을 제공합니다.

| Metric                                 | 의미                                                     |
| -------------------------------------- | -------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | 논리 stream handle이 반환될 때까지 걸린 시간입니다.      |
| `defjs.client.sse.connection.duration` | handle 반환부터 최종 종료까지 걸린 시간입니다.           |
| `defjs.client.sse.active_streams`      | `closed` promise가 settle되지 않은 논리 handle 수입니다. |

Defjs 전용 metric입니다. active counter에는 물리 재연결 시도 사이의 시간도 포함됩니다. 현재 열려 있는 HTTP connection 수를 세는 값이 아닙니다.

## WebSocket 의미

시작이 성공하면 `session.closed`가 settle될 때까지 WebSocket span을 열어 둡니다. `websocket.connected`를 기록한 뒤, 다루는 경로에서 `websocket.closed` 또는 `websocket.error`를 기록합니다.

Meter를 사용하는 WebSocket 계측은 다음 metric을 제공합니다.

| Metric                                       | 의미                                                      |
| -------------------------------------------- | --------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | 논리 session이 반환될 때까지 걸린 시간입니다.             |
| `defjs.client.websocket.connection.duration` | session 반환부터 최종 종료까지 걸린 시간입니다.           |
| `defjs.client.websocket.active_connections`  | `closed` promise가 settle되지 않은 논리 session 수입니다. |

metric 이름은 connection이지만 구현은 재연결 delay 구간을 포함한 논리 session을 셉니다. 물리 socket 수를 세지 않습니다.

일반 WebSocket semantic convention은 아직 이 adapter에서 안정적이지 않습니다. 패키지는 메시지마다 span을 만들거나 payload와 queue length를 기본으로 기록하지 않습니다.

## 민감한 데이터와 coverage 제한

기본 `url.full`은 직렬화된 query string이 아니라 request endpoint와 base endpoint에서 해석되지만, 해석된 path에도 민감한 identifier가 들어갈 수 있습니다. WebSocket propagation은 별도로 실제 query string에 필드를 추가합니다.

`recordException(...)`은 throw된 오류와 일부 close cause를 받습니다. 오류 메시지와 stack에 민감한 데이터가 노출될 수 있습니다. SDK 수준 processor와 exporter에서 민감 정보를 적절히 마스킹하세요. 이 adapter는 애플리케이션을 대신해 exception을 sanitize하지 않습니다.

배포 전에 서비스가 사용하는 SDK, exporter, processor, context manager, 자동 계측과 함께 이 adapter를 검증하세요. 실제 트래픽에서 end-to-end baggage, 민감 정보 마스킹, shutdown/flush, 중복 span을 확인하세요.

## 다음 단계

- [인터셉터](/ko-KR/core/interceptors)에서는 다른 클라이언트 인터셉터와의 순서를 설명합니다.
- [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)에서는 여기서 세는 논리 handle/session 생명주기를 설명합니다.
