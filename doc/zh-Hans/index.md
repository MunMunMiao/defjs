---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: 一次定义，处处类型安全。支持 HTTP、SSE 和 WebSocket，具备运行时验证与完整的 TypeScript 类型推断。
  actions:
    - theme: brand
      text: 快速开始
      link: /guide/getting-started
    - theme: alt
      text: 在 GitHub 上查看
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: 类型安全
    details: 使用 struct 定义请求结构。实现输入、输出和错误分支的端到端类型推断。运行时验证能够在问题到达生产环境之前捕获类型不匹配。
  - icon: 🌐
    title: 多传输协议
    details: 一套统一的 API 风格，同时支持 HTTP 请求、服务器推送事件（SSE）和 WebSocket 连接。切换传输协议无需重写应用逻辑。
  - icon: 🧅
    title: 拦截器
    details: 按传输协议隔离的洋葱模型拦截器，支持日志、认证、重试和横切关注点。HTTP、SSE 和 WebSocket 各自拥有独立的拦截器链。
  - icon: 📡
    title: 流式传输
    details: 原生支持 SSE 和 WebSocket，内置自动重连、心跳检测、消息队列和背压控制。为实时应用而生。
  - icon: ⚡
    title: 通用运行时
    details: 支持浏览器、Node.js、Bun 和 Deno。无需 polyfill。核心包为纯 ESM，零运行时依赖。
  - icon: 🧩
    title: 框架就绪
    details: 为 Angular、Vue 和 React 提供一等公民集成，采用 provideClient / injectClient / useClient 模式。服务端可观测性支持 OpenTelemetry 插件。
---

## 快速开始

使用你喜欢的包管理器安装 `@defjs/core`：

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

用三行代码定义一个类型化请求并执行：

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
  console.log(user.id, user.name) // 完全类型推断
}
```

## 框架集成

<div class="framework-grid">

### Angular

`@defjs/angular` 为 Angular 依赖注入系统提供 `provideClient` 和 `injectClient`。拦截器可以通过工厂函数注入 Angular 服务。

[了解更多 →](/plugins/angular)

### Vue

`@defjs/vue` 将 `provideClient` 作为 Vue 插件提供，并在组合式 API 中使用 `injectClient`。与 Angular 包的 API 设计保持一致，实现跨框架知识的无缝复用。

[了解更多 →](/plugins/vue)

### React

`@defjs/react` 提供 `ClientProvider`、`useClient` 和 option helpers，用于在 React 组件树中共享一个类型化 `@defjs/core` client。

[了解更多 →](/plugins/react)

</div>

## 下一步

- [快速开始 →](/guide/getting-started) — 安装、CDN 使用和第一个请求
- [核心概念 →](/core/client) — 客户端、命令、上下文和错误处理
- [示例 →](/guide/examples) — REST CRUD、SSE 通知、WebSocket 聊天、拦截器模式

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
