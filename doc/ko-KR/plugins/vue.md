---
title: Vue
description: Vue 3 plugin integration — provideClient and injectClient for composable API usage with typed HTTP, SSE, and WebSocket clients.
---

# @defjs/vue

`@defjs/vue`는 `@defjs/core`의 Vue 3 플러그인이에요. 애플리케이션 레벨에서 `Client` 인스턴스를 등록하는 `provideClient`와, 컴포넌트나 composable 내부에서 해당 인스턴스에 접근하는 `injectClient`를 제공해요.

둘 다 `@defjs/core`의 동일한 설정 헬퍼 `withEndpoint`와 `withInterceptors`를 공유해요.

## 설치

```bash
npm install @defjs/vue @defjs/core
# or
pnpm add @defjs/vue @defjs/core
# or
bun add @defjs/vue @defjs/core
```

## 퀵스타트

### 1. 애플리케이션 엔트리에서 클라이언트 제공

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withEndpoint } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(provideClient(withEndpoint('https://api.example.com')))
app.mount('#app')
```

`provideClient`는 표준 Vue 플러그인을 반환해요. 내부적으로 `app.provide()`를 사용하여 애플리케이션 컨텍스트에 `Client` 인스턴스를 주입해요. 모든 하위 컴포넌트가 `injectClient()`로 접근할 수 있어요.

### 2. 컴포넌트에서 주입하고 사용

```typescript
// UserCard.vue
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineRequest, struct } from '@defjs/core'

const client = injectClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
      email: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser())
  if (error) {
    console.error('Request failed:', error.code, error.message)
    return
  }
  console.log(user.id, user.name, user.email) // fully typed
}
</script>
```

## 인터셉터 설정

`withInterceptors`로 팩토리 함수 배열을 등록해요. 각 팩토리는 플러그인 설치 시점에 실행되고 반환된 인터셉터 인스턴스는 Client에 등록돼요.

```typescript
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers.set('Authorization', `Bearer ${localStorage.getItem('token')}`)
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```

> 참고: `withInterceptors`는 **팩토리 함수**(`() => Interceptor`)를 받아요. 인터셉터 인스턴스가 아니에요. 이것은 Vue 제공 단계에서 필요한 인스턴스를 온디맨드로 생성해요.

## SSE와 WebSocket 예제

Client 인스턴스는 코어 패키지와 같은 사용법으로 SSE와 WebSocket을 지원해요:

```typescript
<script setup lang="ts">
import { injectClient } from '@defjs/vue'
import { defineEventStream, defineWebSocket, struct } from '@defjs/core'

const client = injectClient()

// SSE
const notifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.object({ id: struct.number(), text: struct.string() }),
  },
})

const [error, stream] = await client.execute(notifications())
if (!error) {
  for await (const event of stream) {
    console.log(event.message) // typed as { id: number, text: string }
  }
}

// WebSocket
const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})

const [wsError, ws] = await client.execute(chat())
if (!wsError) {
  ws.send({ type: 'send', data: { text: 'Hello' } })
  for await (const msg of ws.receive) {
    console.log(msg.message)
  }
}
</script>
```

트랜스포트 상세는 다음 문서를 참조하세요:

- [코어 문서](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` 전체 사용법
- [SSE 문서](/core/sse) — SSE 자동 재연결, 하트비트, 역압력
- [WebSocket 문서](/core/web-socket) — WebSocket 연결과 메시지 타입

## API 참조

### `provideClient(...feature: ClientOption[]): Plugin`

Vue 플러그인을 생성해요. 설치 시 `createClient(...)`로 `Client` 인스턴스를 구성하고 `HTTP_CLIENT`를 Injection Key로 애플리케이션 컨텍스트에 제공해요.

### `injectClient(): Client`

컴포넌트 `setup`이나 composable 내부에서 호출하여 주입된 Client 인스턴스를 가져와요. `app.use(provideClient(...))`를 먼저 호출하지 않으면 런타임 오류가 발생해요:

```
No HTTP client provided. Did you forget to call app.use(provideClient(...))?
```

### `withEndpoint(endpoint: string): ClientOption`

HTTP 요청의 기본 URL을 설정해요. 생략하면 요청의 접두사로 `document.location.origin`이 기본값이에요.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

인터셉터를 설정해요. 각 팩토리는 플러그인 설치 시점에 실행되고 반환된 인터셉터는 등록 순서로 어니언 모델 호출 체인을 형성해요.

### `HTTP_CLIENT`

Vue `InjectionKey<Client>`로 내부 `provide` / `inject` 키로 사용돼요. 보통 직접 필요하지 않지만 커스텀 주입 계층을 위해 사용 가능해요:

```typescript
import { HTTP_CLIENT } from '@defjs/vue'
import { inject } from 'vue'

const client = inject(HTTP_CLIENT)
```

## 다음 단계

- [코어 문서](/core/client) — `defineRequest`, `defineEventStream`, `defineWebSocket` 전체 사용법
