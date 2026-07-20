---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: 한 번 정의하면 어디서나 타입 안전합니다. HTTP, SSE, WebSocket에 런타임 검증과 완전한 TypeScript 타입 추론을 제공합니다.
  actions:
    - theme: brand
      text: 시작하기
      link: /guide/getting-started
    - theme: alt
      text: GitHub에서 보기
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: 타입 안전성
    details: struct로 요청 스키마를 정의하면 입력, 출력, 오류 분기까지 엔드투엔드 타입 추론이 제공돼요. 런타임 검증으로 프로덕션에 도달하기 전 불일치를 잡아낼 수 있어요.
  - icon: 🌐
    title: 멀티 트랜스포트
    details: HTTP 요청, Server-Sent Events, WebSocket 연결을 하나의 통일된 API 스타일로 사용하세요. 트랜스포트를 바꿔도 애플리케이션 로직을 다시 작성할 필요가 없어요.
  - icon: 🧅
    title: 인터셉터
    details: 트랜스포트별 어니언 모델 인터셉터로 로깅, 인증, 재시도, 횡단 관심사를 처리하세요. HTTP, SSE, WebSocket 각각의 인터셉터 체인을 가지고 있어요.
  - icon: 📡
    title: 스트리밍
    details: 네이티브 SSE와 WebSocket 지원에 자동 재연결, 하트비트, 메시지 큐잉, 역압력 제어가 내장되어 있어요. 실시간 애플리케이션을 위해 설계되었어요.
  - icon: ⚡
    title: 유니버설 런타임
    details: 브라우저, Node.js, Bun, Deno에서 모두 동작해요. 폴리필이 필요 없고, 코어 패키지는 순수 ESM에 런타임 의존성이 제로예요.
  - icon: 🧩
    title: 프레임워크 지원
    details: Vue, React를 위한 퍼스트클래스 통합으로 provideClient / injectClient / useClient 패턴을 제공해요. 서버 사이드 관측 가능성을 위한 OpenTelemetry 플러그인도 있어요.
---

## 퀵스타트

`@defjs/core`를 원하는 패키지 매니저로 설치하세요:

::: code-group

```bash [npm]
npm install @defjs/core
```

```bash [yarn]
yarn add @defjs/core
```

```bash [pnpm]
pnpm add @defjs/core
```

```bash [bun]
bun add @defjs/core
```

:::

타입이 부여된 요청을 정의하고 세 줄로 실행해 보세요:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())
if (!error) {
  console.log(user.id, user.name) // fully typed
}
```

## 프레임워크 통합

<div class="framework-grid">

### Vue

`@defjs/vue`는 Vue 플러그인으로 `provideClient`를 제공하고, Composition API를 위한 `injectClient`를 제공해요. 애플리케이션 전체에서 하나의 타입화된 `@defjs/core` 클라이언트를 공유해요.

[자세히 알아보기 →](/plugins/vue)

### React

`@defjs/react`는 `ClientProvider`, `useClient`, option helpers를 제공해 타입이 지정된 `@defjs/core` client 하나를 React 컴포넌트 트리에서 공유하게 해요.

[자세히 알아보기 →](/plugins/react)

</div>

## 다음 단계

- [시작하기 →](/guide/getting-started) — 설치, CDN 사용법, 첫 번째 요청
- [코어 개념 →](/core/client) — 클라이언트, 커맨드, 컨텍스트, 오류 처리
- [예제 →](/guide/examples) — REST CRUD, SSE 알림, WebSocket 채팅, 인터셉터 패턴

<style>
.framework-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.framework-grid > div,
.framework-grid > h3 {
  margin: 0;
}
.framework-grid h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.framework-grid p {
  margin: 0 0 0.5rem;
  color: var(--vp-c-text-2);
}
.framework-grid a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
