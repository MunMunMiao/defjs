---
layout: home

hero:
  name: Defjs
  text: 跨传输的类型化 API
  tagline: 一次定义，处处类型安全。支持 HTTP、SSE 和 WebSocket，具备运行时验证与完整的 TypeScript 类型推断。
  actions:
    - theme: brand
      text: 快速开始
      link: /zh-Hans/guide/getting-started
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
    details: 原生支持 SSE 事件流，具备自动重连和可配置的事件队列处理；同时支持带重连、心跳与发送队列的 WebSocket 连接。为实时应用而生。
  - icon: ⚡
    title: 通用运行时
    details: 支持浏览器、Node.js、Bun 和 Deno。无需 polyfill。核心包为纯 ESM，零运行时依赖。
  - icon: 🧩
    title: 框架就绪
    details: 为 Vue 和 React 提供一等公民集成，采用 provideClient / injectClient / useClient 模式。服务端可观测性支持 OpenTelemetry 插件。
---

## 快速开始

这个首页快速开始面向当前仓库里的 source/workspace API。

仓库工作区基线：请使用 Node `>=26`、`pnpm@11.6.0` 和 `engine-strict=true`。这是当前源码工作区以及基于仓库现有 manifests 构建出的包的最低要求；如果你未来安装某个已发布版本，请以那个发布版本随附的 `engines` 字段和 release notes 为准。

使用下面的命令安装 workspace，并验证文档示例：

```bash
pnpm install
pnpm --dir doc run typecheck
```

如果你想直接试运行下面的片段，请把它粘贴到能从源码解析 `@defjs/core` 的 workspace package 或文档 twoslash block 中。仓库根目录本身不是一个直接导入 `@defjs/core` 的应用 package。

> 对已发布 npm/CDN 用户：当前公开发布线可能落后于本页。本首页不讲解旧版 `@defjs/core@0.3.3` API。在外部应用中复制 `withEndpoint(...)` 或 `struct.request(...)` 之前，请先确认你使用的已发布版本，其包信息表或 release notes 已明确包含这一套 API。

定义一个类型化请求并执行：

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
if (!error) {
  console.log(user.id, user.name) // 完整类型推断
}
```

## 框架集成

<div class="framework-grid">

### Vue

`@defjs/vue` 将 `provideClient` 作为 Vue 插件提供，并在组合式 API 中使用 `injectClient`，在应用间共享一个类型化的 `@defjs/core` 客户端。

[了解更多 →](/zh-Hans/plugins/vue)

### React

`@defjs/react` 提供 `ClientProvider`、`useClient` 和 option helpers，用于在 React 组件树中共享一个类型化 `@defjs/core` client。

[了解更多 →](/zh-Hans/plugins/react)

</div>

## 下一步

- [快速开始 →](/zh-Hans/guide/getting-started) — 仓库 source/workspace 入门、已发布包注意事项，以及第一个请求
- [核心概念 →](/zh-Hans/core/client) — 客户端、命令、上下文和错误处理
- [示例 →](/zh-Hans/guide/examples) — REST CRUD、SSE 通知、WebSocket 聊天、拦截器模式

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
