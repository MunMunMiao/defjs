---
title: 인터셉터
description: 트랜스포트별로 인터셉터를 필터링하고 어니언 순서로 조합하며 요청을 안전하게 복제하고 작업을 short-circuit하고 제한적인 인증·재시도 정책을 구현합니다.
---

# 인터셉터

인터셉터는 트랜스포트 경계를 감쌉니다. HTTP, SSE, WebSocket에는 각각 별도의 인터셉터 kind와 결과 타입이 있습니다.

| Factory                      | 요청          | `next` 결과                           |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

여러 트랜스포트의 인터셉터를 `withInterceptors(...)`로 함께 등록하세요. 클라이언트는 `kind`를 기준으로 필터링하고 각 트랜스포트 안에서 등록 순서를 보존합니다.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## 어니언 순서

요청은 등록 순서로 진행하고 반환은 반대 순서로 풀립니다.

```typescript
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

`withInterceptors(...)`를 여러 번 호출하면 뒤에 추가합니다.

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

WebSocket 인터셉터는 `next`를 한 번만 호출할 수 있습니다. session 생성 후 chain이 실패하면 Core는 전달되지 않은 session을 종료한 뒤 원래 interceptor error를 반환합니다. chain이 다른 short-circuit session으로 성공하면 생성된 session을 닫습니다. wrapper는 원래 `closed` Promise를 위임해 연결을 유지합니다.

## 요청을 안전하게 복제하기

들어온 요청은 체인이 소유하는 값으로 다루세요. header를 바꾸기 전에 새 `Headers` 객체를 만듭니다.

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

SSE header에도 같은 패턴을 사용합니다. 브라우저 WebSocket constructor는 임의의 handshake header를 보낼 수 없으므로 WebSocket 인터셉터에서 `request.headers`를 바꿔도 브라우저 연결이 인증되지는 않습니다.

HTTP body를 교체할 때는 요청을 spread하고 `body`를 교체하세요. Fetch 경계는 이전 body의 content-type metadata가 새 body에 더 이상 맞지 않음을 감지합니다. 이미 소비된 `ReadableStream` body를 재사용하지 마세요.

## Short-circuit

인터셉터는 `next`를 건너뛸 수 있지만 해당 트랜스포트가 기대하는 결과 타입을 반환해야 합니다. HTTP에서는 `makeResponse(...)`로 Defjs 래퍼를 만들 수 있습니다.

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

일반 커맨드 계층은 이 응답에도 status와 output Struct를 적용합니다. 엔드포인트 계약의 일부라면 해당 status를 선언하세요.

SSE나 WebSocket을 short-circuit하려면 종료 의미까지 갖춘 완전하고 호환되는 핸들 또는 세션이 필요합니다. 보통 synthetic HTTP 응답을 반환하는 것보다 훨씬 많은 작업이 필요합니다.

## 라이브 session getter 보존

WebSocket 세션을 `{ ...session }`으로 감싸지 마세요. spread는 `state`와 `connection`을 한 번 읽어 라이브 getter를 오래된 값으로 바꿉니다. 모든 member를 명시적으로 위임하세요.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get bufferedAmount() {
      return session.bufferedAmount
    },
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

wrapper는 리소스 소유권도 그대로 보존해야 합니다. 애플리케이션이 의도적으로 정하고 문서화한 동작이 아니라면 `closed`를 교체하거나 `close`를 막거나 incoming iterable을 분리하지 마세요.

## 제한적인 로깅

고정된 operation 이름과 검토된 소수의 필드만 사용하세요.

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

기본적으로 엔드포인트 URL, query string, header, body, 원본 cause, SSE event ID, WebSocket payload를 로그에 넣지 마세요.

## HTTP는 보수적으로 재시도하기

재시도는 애플리케이션 동작을 바꿉니다. 다음 예제는 `GET`, `HEAD`, `OPTIONS`만 허용하고 status `0`, `502`, `503`, `504`만 재시도합니다. `Retry-After`를 따르고, abort되면 바로 멈추며, stream body는 거부합니다.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

이 인터셉터는 throw된 인터셉터 오류를 안전하게 분류할 수 없어 재시도하지 않습니다. status `0`은 Defjs Fetch 경계의 트랜스포트 실패 래퍼입니다.

별다른 검토 없이 write method까지 허용 범위를 넓히지 마세요. `POST`, `PUT`, `PATCH`, `DELETE` 재시도에는 애플리케이션 수준 idempotency 계약, replay 가능한 body, 서버 지원, 검토된 status 정책이 필요합니다.

## Basic 인증

root entry는 `basicAuthHttpInterceptor(...)`와 `basicAuthSSEInterceptor(...)`를 export합니다.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Basic 자격 증명은 base64로 인코딩될 뿐 암호화되지 않습니다. TLS를 사용하세요. 기본 encoder는 `globalThis.btoa`를 사용하는데, 이 함수가 없을 수 있고 제한된 문자 범위만 받습니다. 런타임에 `btoa`가 없거나 자격 증명에 검토된 UTF-8/base64 구현이 필요하면 `options.encode`를 전달하세요.

credential provider는 요청이 인터셉터를 통과할 때 실행됩니다. 서버 자격 증명은 요청 범위로 유지하고 생성된 header를 로그에 남기지 마세요.

## Observer와 callback의 안전성

SSE와 WebSocket 인터셉터는 반환된 핸들에 생명주기 observer를 붙일 수 있습니다. 소유 범위가 끝나면 WebSocket listener를 구독 해제하세요. WebSocket은 state listener 실패를 runtime-error observer에 알리고, 그 observer의 실패를 `reportError`로 전달하며, reconnect predicate throw를 최종 session error로 처리합니다.

인터셉터는 throw하거나 reject할 수 있습니다. high-level 트랜스포트가 일부 실패를 `RequestError`로 정규화할 수 있지만, 인터셉터 코드는 모든 경우에 promise가 절대 reject하지 않는다고 가정하면 안 됩니다.

## 다음 단계

- [클라이언트](/ko-KR/core/client)에서는 등록과 옵션 조합을 설명합니다.
- [HTTP](/ko-KR/core/http)에서는 Fetch 래퍼와 status 0 동작을 설명합니다.
- [SSE](/ko-KR/core/sse)와 [WebSocket](/ko-KR/core/web-socket)에서는 트랜스포트 생명주기를 설명합니다.
