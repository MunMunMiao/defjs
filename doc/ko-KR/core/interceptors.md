---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# 인터셉터

`@defjs/core` 인터셉터는 트랜스포트 레이어로 구분돼요: HTTP, SSE, WebSocket. 모두 같은 어니언 체인 실행 모델을 공유하지만 처리하는 요청/응답 형태는 달라요: HTTP는 `Promise<HttpResponse>`를, SSE는 `Promise<EventStreamHandle>`을, WebSocket은 `Promise<WebSocketSessionLike>`를 반환해요.

인터셉터는 `withInterceptors(...)`로 `Client` 레벨에 등록돼요. 클라이언트는 커맨드 타입에 따라 올바른 인터셉터 체인으로 자동 필터링하고 디스패치해요.

## 세 가지 인터셉터 타입

### HTTP 인터셉터

HTTP 인터셉터는 `HttpRequest`를 처리하고 `Promise<HttpResponse>`를 반환해요. 일반적 용도: 인증 헤더 주입, 로깅, 재시도, 오류 변환.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### SSE 인터셉터

SSE 인터셉터는 `HttpRequest`(연결 전 HTTP 요청)를 처리하고 `Promise<EventStreamHandle>`을 반환해요. 일반적 용도: SSE 연결 전 인증 헤더 주입, 연결 상태 모니터링.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### WebSocket 인터셉터

WebSocket 인터셉터는 `HttpRequest`(핸드쉐이크 전 HTTP 요청)를 처리하고 `Promise<WebSocketSessionLike>`을 반환해요. 일반적 용도: WebSocket 핸드쉐이크 전 URL 수정 또는 서브프로토콜 헤더 주입.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## 어니언 체인 실행 모델

세 가지 인터셉터 체인 모두 **어니언 모델**을 사용해요: 요청 단계는 등록 순서대로 들어가고, 응답 단계는 역순으로 돌아와요.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // 요청 단계: 첫 번째로 들어감
  const res = await next(req)
  order.push(1.1) // 응답 단계: 마지막으로 나옴
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // 요청 단계: 마지막으로 들어감
  const res = await next(req)
  order.push(3.1) // 응답 단계: 첫 번째로 나옴
  return res
})

// 등록 순서: a -> b -> c
// 실행 순서: 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### 요청과 응답 수정

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### 반환 결과 감싸기

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## 일반적인 인터셉터 예제

### 인증 인터셉터

헤더에 Bearer Token을 주입해요. HTTP와 SSE는 같은 로직을 공유해요.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### 로깅 인터셉터

요청 소요 시간과 상태 코드를 기록해요.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### 재시도 인터셉터

특정 상태 코드를 재시도해요. 재시도 인터셉터는 체인 하단부에 가깝게 등록해야 해요 — 로깅 뒤, 실제 요청 전에.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Basic Auth 인터셉터 (내장)

`@defjs/core`는 HTTP와 SSE를 위한 내장 Basic Auth 인터셉터를 제공해요.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

기본 인코딩은 `globalThis.btoa`를 사용해요. `btoa`가 없는 환경(예: Node)에서는 `options.encode`로 커스터마이즈하세요:

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## 등록과 필터링

### `withInterceptors`로 등록

인터셉터는 `createClient` 시점에 `withInterceptors(...)`로 등록돼요. 같은 배열에 세 가지 인터셉터 타입을 섞을 수 있고, 클라이언트는 커맨드 타입으로 자동 필터링해요.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### 필터링 규칙

클라이언트는 커맨드 타입으로 인터셉터를 필터링해요:

| 커맨드 타입                   | 필터 조건               | 내부 함수                      |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

필터링된 인터셉터는 원래 등록 순서를 유지한 채 어니언 체인을 형성해요.

```typescript
// 단순화된 내부 실행 로직
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### 인터셉터 순서와 합성

여러 `withInterceptors` 호출은 순서대로 인터셉터를 추가해요.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // 첫 번째
  withInterceptors(authInterceptor, retryInterceptor), // 두 번째
)
// 최종 순서: logging -> auth -> retry
```

## 바디 메타데이터 참고

인터셉터가 `body`를 교체하면 이전 `bodyContentType` 메타데이터는 자동으로 무효화되어 잘못된 `Content-Type`이 서버로 전송되지 않아요.

```typescript
// 원래 바디 유지: Content-Type 메타데이터는 여전히 유효
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// 바디 교체: 이전 Content-Type은 지워지고 새 바디 타입으로 결정
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## API 참조

### 생성 함수

| 함수                             | 설명                    |
| -------------------------------- | ----------------------- |
| `createHttpInterceptor(fn)`      | HTTP 인터셉터 생성      |
| `createSSEInterceptor(fn)`       | SSE 인터셉터 생성       |
| `createWebSocketInterceptor(fn)` | WebSocket 인터셉터 생성 |

### 타입

| 타입                   | 설명                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| `HttpInterceptor`      | HTTP 인터셉터 객체 `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | SSE 인터셉터 객체 `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | WebSocket 인터셉터 객체 `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | 세 인터셉터 타입의 유니온                                                    |
| `HttpInterceptorNext`  | HTTP 다음 핸들러 `(req: HttpRequest) => Promise<HttpResponse>`               |
| `SSEHandler`           | SSE 다음 핸들러 `(req: HttpRequest) => Promise<EventStreamHandle>`           |
| `WebSocketHandler`     | WebSocket 다음 핸들러 `(req: HttpRequest) => Promise<WebSocketSessionLike>`  |

### 내장 인터셉터

| 함수                                             | 설명                     |
| ------------------------------------------------ | ------------------------ |
| `basicAuthHttpInterceptor(credential, options?)` | HTTP Basic Auth 인터셉터 |
| `basicAuthSSEInterceptor(credential, options?)`  | SSE Basic Auth 인터셉터  |

## 다음 단계

- [클라이언트 →](/core/client) — 클라이언트 생성과 인터셉터 설정
- [HTTP 요청 →](/core/http) — `defineRequest`와 출력 패턴
- [SSE →](/core/sse) — SSE 정의와 스트리밍
- [WebSocket →](/core/web-socket) — WebSocket 정의와 생명주기
