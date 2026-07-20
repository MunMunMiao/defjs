---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: 一次定義，處處類型安全。HTTP、SSE 與 WebSocket 皆具備執行階段驗證及完整 TypeScript 類型推導。
  actions:
    - theme: brand
      text: 立即開始
      link: /guide/getting-started
    - theme: alt
      text: 在 GitHub 上檢視
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: 類型安全
    details: 使用 struct 定義請求結構描述，取得輸入、輸出與錯誤分支的端到端類型推導。執行階段驗證可在問題進入生產環境前即攔截不一致。
  - icon: 🌐
    title: 多傳輸協定
    details: 以統一的 API 風格處理 HTTP 請求、Server-Sent Events 與 WebSocket 連線。切換傳輸協定無需重寫應用程式邏輯。
  - icon: 🧅
    title: 攔截器
    details: 各傳輸協定具備洋蔥模型攔截器，支援紀錄、驗證、重試與橫切關注點。HTTP、SSE 與 WebSocket 各自擁有獨立的攔截器鏈。
  - icon: 📡
    title: 串流
    details: 原生 SSE 與 WebSocket 支援，具備自動重連、心跳、訊息隊列與背壓控制。專為即時應用程式打造。
  - icon: ⚡
    title: 通用執行環境
    details: 支援瀏覽器、Node.js、Bun 與 Deno。無需 polyfill。核心套件為純 ESM，零執行階段相依。
  - icon: 🧩
    title: 框架就緒
    details: 為 Vue 與 React 提供 first-class 整合，採用 provideClient / injectClient / useClient 模式。伺服器端可觀測性則有 OpenTelemetry 外掛。
---

## 快速開始

使用你偏好的套件管理器安裝 `@defjs/core`：

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

定義一個類型請求，只需三行即可執行：

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
  console.log(user.id, user.name) // 完整型別推導
}
```

## 框架整合

<div class="framework-grid">

### Vue

`@defjs/vue` 提供 `provideClient` 作為 Vue 外掛，並以 `injectClient` 搭配 Composition API 使用，讓應用間共享一個類型化的 `@defjs/core` 用戶端。

[深入了解 →](/plugins/vue)

### React

`@defjs/react` 提供 `ClientProvider`、`useClient` 與 option helpers，用於在 React 元件樹中共享一個類型化 `@defjs/core` client。

[深入了解 →](/plugins/react)

</div>

## 接下來

- [立即開始 →](/guide/getting-started) — 安裝、CDN 使用方式與你的第一個請求
- [核心概念 →](/core/client) — 用戶端、指令、上下文與錯誤處理
- [範例 →](/guide/examples) — REST CRUD、SSE 通知、WebSocket 聊天、攔截器模式

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
