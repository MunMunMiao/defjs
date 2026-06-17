---
title: 설계 결정
description: 다른 HTTP 라이브러리의 일반적인 패턴과 의도적으로 다른 API 설계 결정 사항입니다.
---

# 설계 결정

Defjs는 다른 HTTP 라이브러리에서 흔히 볼 수 있는 패턴과 의도적으로 다르게 설계된 부분이 있습니다. 이 문서는 각 결정의 설계 근거를 설명합니다.

## 명시적 클라이언트 설계

Defjs는 모든 클라이언트를 명시적으로 생성해야 합니다. `createClient`로 `Client`를 생성하고 필요한 곳에 전달합니다.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

이 설계의 이점:

- **테스트 친화적**: 상태를 리셋하거나 모킹할 필요가 없어요. 다른 `Client` 인스턴스를 테스트에 직접 전달하면 돼요.
- **멀티 환경 공존**: 동일 프로세스에서 여러 클라이언트가 병렬로 실행돼도 간섭하지 않아요(예: 내부 API + 공개 API).
- **의존성 투명성**: 호출자가 반드시 `Client`를 명시적으로 보유해야 해서, 정적 분석과 코드 리뷰에서 의존성이 보여요.

애플리케이션에서 공유 클라이언트가 필요하다면 모듈에서보내세요:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## 프레임워크 통합

`@defjs/angular`, `@defjs/vue`, `@defjs/react`는 명시적 클라이언트를 각 프레임워크의 의존성 모델에 통합해요. Angular와 Vue는 `provideClient` / `injectClient`를 사용하고, React는 `ClientProvider` / `useClient`를 사용해요. 이를 통해 클라이언트는 컴포넌트 또는 서비스 트리 내에서 등록하고 검색할 수 있어요.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // 컴포넌트 로직에서 client.execute(...) 사용
}
```

## 요청 레벨 옵션은 `execute`에 전달, Builder 아님

요청 레벨 옵션(`abort`, `timeout`, `heartbeat`, `reconnect` 등)은 `client.execute`의 두 번째 인자로 전달돼요. 커맨드 빌더가 아니에요.

```typescript
// 올바름: 요청 레벨 옵션은 execute에 전달
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## 커맨드 타입으로 오버로드된 `execute`

`client.execute`는 `Command` 타입에 따라 자동으로 올바른 결과 타입을 반환해요.

```typescript
// HTTP 요청 — HttpAwaitResult 반환
const [error, user, response] = await client.execute(httpCommand())

// SSE 스트림 — StreamAwaitResult 반환
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — SocketAwaitResult 반환
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent`는 이제 옵저버

SSE의 `onInvalidEvent`는 이제 옵저버예요. 내부에서 예외를 던져도 조용히 무시되고 스트림이 중단되지 않아요.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 내부에서 예외를 던져도 스트림은 계속돼요
    },
  },
})
```

## 오류 서브모듈 통합

모든 오류 심볼은 메인 `@defjs/core` 엔트리에서 보내져요.

| Export                  | 설명                 | 일반적인 사용법                                             |
| ----------------------- | -------------------- | ----------------------------------------------------------- |
| `RequestError`          | 오류 유니온 타입     | `switch (error.kind)` 분기                                  |
| `ERR_ABORTED`           | 중단 식별자          | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | 타임아웃 식별자      | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | 트랜스포트 오류 생성 | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | 정의 오류 생성       | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | HTTP 상태 오류 생성  | `createHttpStatusError(404, 'Not Found', response, data)`   |

메인 엔트리에서 임포트:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## `kind`와 `code`로 오류 분기

Defjs는 문자열 비교 대신 `kind`와 `code`로 분기하는 것을 권장해요.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## 더 엄격한 엔드포인트 정의 규칙

Defjs는 엄격한 규칙을 강제해요: **`build`가 제공되면 `input`도 반드시 제공되어야 한다.**

```typescript
// 올바름: input과 build 모두 있음
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 올바름: input과 build 모두 없음
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// 오류: build는 있지만 input이 없음
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript 오류: input 스키마 누락
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

이 규칙은 `defineEventStream`과 `defineWebSocket`에도 적용돼요.

## 의존성

| 패키지           | 필요 버전 |
| ---------------- | --------- |
| `@defjs/core`    | `^0.4.0`  |
| `@defjs/angular` | `19.x`    |
| `@defjs/vue`     | `^0.4.0`  |
| `@defjs/react`   | `^0.4.0`  |

Angular 피어 의존성 범위: `>=18.0.0 <=22.0.0`. React 피어 의존성 범위: `>=18.0.0`. Node 런타임: `>=26`.

## 다음 단계

- [클라이언트 →](/core/client) — 명시적 클라이언트 설계와 설정
- [커맨드 →](/core/commands) — 커맨드 정의와 입력 규칙
- [오류 →](/core/errors) — `RequestError` 구조와 분기
