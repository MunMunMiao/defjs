---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# 시작하기

Defjs는 TypeScript로 타입이 부여된 요청 API를 정의하고 여러 트랜스포트와 JavaScript 런타임에서 실행할 수 있는 라이브러리예요.

## 설치

원하는 패키지 매니저를 사용하세요:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## CDN 사용법

빌드 도구 없이 ES 모듈로 직접 가져올 수 있어요:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## 첫 번째 요청까지 세 단계

### 1단계: 클라이언트 생성

Client는 모든 요청 실행의 진입점이에요. `createClient`로 인스턴스를 만들고 기본 엔드포인트를 설정하세요:

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### 2단계: 요청 정의

`defineRequest`로 타입이 부여된 HTTP 엔드포인트를 정의하세요. 입력과 응답의 형태를 `struct`로 설명하세요:

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
`output`의 키는 HTTP 상태 코드예요. Defjs는 런타임에 응답 상태 코드와 일치하는 스키마를 자동으로 선택하고, 그에 따라 TypeScript 타입을 추론해요. 2xx 응답은 성공 데이터로 타입화되고, 2xx가 아닌 응답은 오류 데이터로 타입화돼요.
:::

### 3단계: 실행

`client.execute`에 요청 커맨드와 선택적 설정을 전달하세요:

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error는 output의 non-2xx 스키마에 따라 타입화돼요
  console.error(error.code, error.message)
  return
}

// user는 { id: number; name: string }으로 타입화돼요
console.log(user.name)
```

## 전체 예제

입력 검증, 출력 검증, 오류 처리, 인터셉터를 포함한 엔드투엔드 예제예요:

```typescript
import { createClient, defineRequest, struct, tag, withEndpoint, withInterceptors } from '@defjs/core'

// 1. 클라이언트 생성
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. 요청 정의
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': tag(struct.string(), { kind: 'header' }),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. 실행
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## 코어 API 퀵 참조

| API                    | 설명                      | 일반적인 사용법                                                                |
| ---------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | 요청 클라이언트 생성      | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | HTTP 엔드포인트 정의      | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserSchema } })` |
| `defineEventStream`    | SSE 엔드포인트 정의       | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | WebSocket 엔드포인트 정의 | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | 스키마 빌더               | `struct.object({ id: struct.number() })`                                       |
| `tag`                  | 필드 메타데이터 태그      | `tag(struct.string(), { kind: 'header' })`                                     |
| `withEndpoint`         | 기본 URL 설정             | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | 인터셉터 등록             | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | 교차 출처 인증 정보 포함  | `withCredentials(true)`                                                        |
| `withSSEOptions`       | SSE 옵션 설정             | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | WebSocket 옵션 설정       | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## 다음 단계

- [클라이언트 →](/core/client) — 클라이언트 생성, 커맨드 실행, 설정
- [커맨드 →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [오류 →](/core/errors) — `RequestError` 구조와 분기 패턴
