# React Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `doc/` VitePress 文档站中为 `@defjs/react` 增加默认语言与所有现有 locale 的插件页、导航入口、首页入口和设计决策说明。

**Architecture:** React 文档作为现有 `plugins/` 分组下的新页面加入，和 Angular、Vue、OpenTelemetry Server 保持同级。内容来源限定为 `packages/react/README.md` 与 `packages/react/src/core.tsx` 中已经存在的 API：`ClientProvider`、`useClient`、`withEndpoint`、`withInterceptors`。多语言页面保持同构、轻量、示例一致，只本地化说明文字。

**Tech Stack:** VitePress 2.0.0-alpha.17、Markdown、TypeScript 代码示例、pnpm、React 18+、`@defjs/core`、`@defjs/react`。

## Global Constraints

- 只修改 `doc/` 文档站与 `docs/superpowers` 计划/设计文档，不修改 React 包源码或测试。
- 不引入新的 VitePress 插件、Twoslash 配置或文档构建架构。
- 不扩展 React API，只记录现有 `ClientProvider`、`useClient`、`withEndpoint`、`withInterceptors`。
- React 文档必须说明 React peer dependency 为 `>=18.0.0`。
- 代码示例中的 API 名、包名和 TypeScript 标识符保持英文原文。
- 所有现有 locale 都必须有同名 `plugins/react.md` 页面和入口：`zh-Hans`、`zh-Hant-TW`、`zh-Hant-HK`、`de-DE`、`ja-JP`、`ko-KR`、`ar`、`es-ES`、`ru-RU`、`fr-FR`。
- 不主动提交 git；只有用户明确授权提交时，才运行计划里的提交命令。

---

## File Structure

### 新建文件

每个文件只负责一个语言版本的 React 插件页：

- `doc/plugins/react.md` — 英文 React 插件页。
- `doc/zh-Hans/plugins/react.md` — 简体中文 React 插件页。
- `doc/zh-Hant-TW/plugins/react.md` — 繁体中文（台湾）React 插件页。
- `doc/zh-Hant-HK/plugins/react.md` — 繁体中文（香港）React 插件页。
- `doc/de-DE/plugins/react.md` — 德文 React 插件页。
- `doc/ja-JP/plugins/react.md` — 日文 React 插件页。
- `doc/ko-KR/plugins/react.md` — 韩文 React 插件页。
- `doc/ar/plugins/react.md` — 阿拉伯文 React 插件页。
- `doc/es-ES/plugins/react.md` — 西班牙文 React 插件页。
- `doc/ru-RU/plugins/react.md` — 俄文 React 插件页。
- `doc/fr-FR/plugins/react.md` — 法文 React 插件页。

### 修改文件

- `doc/.vitepress/config.ts` — 将 Plugins 顶部导航改为下拉项，并在每个 locale 的插件侧边栏中加入 React。
- `doc/index.md` 与 `doc/<locale>/index.md` — 在首页 feature 文案和 Framework Integrations 卡片中加入 React。
- `doc/guide/design-decisions.md` 与 `doc/<locale>/guide/design-decisions.md` — 在 Framework Integration 章节加入 React 设计定位和示例，并在依赖表中加入 React。

### 测试入口

- `pnpm --dir doc docs:build` — VitePress 构建验证。
- `git diff --check` — 检查 Markdown/TypeScript 配置变更是否有尾随空白或冲突标记。

---

### Task 1: 新增所有 React 插件页

**Files:**

- Create: `doc/plugins/react.md`
- Create: `doc/zh-Hans/plugins/react.md`
- Create: `doc/zh-Hant-TW/plugins/react.md`
- Create: `doc/zh-Hant-HK/plugins/react.md`
- Create: `doc/de-DE/plugins/react.md`
- Create: `doc/ja-JP/plugins/react.md`
- Create: `doc/ko-KR/plugins/react.md`
- Create: `doc/ar/plugins/react.md`
- Create: `doc/es-ES/plugins/react.md`
- Create: `doc/ru-RU/plugins/react.md`
- Create: `doc/fr-FR/plugins/react.md`

**Interfaces:**

- Consumes: `@defjs/react` public API from `packages/react/src/core.tsx`.
- Produces: `plugins/react.md` pages that later navigation, homepage cards, and sidebar entries can link to.

- [ ] **Step 1: Reconfirm React API source**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
source = Path('packages/react/src/core.tsx').read_text()
for name in ['ClientProvider', 'useClient', 'withEndpoint', 'withInterceptors']:
    if name not in source:
        raise SystemExit(f'missing {name} in packages/react/src/core.tsx')
package = Path('packages/react/package.json').read_text()
if '"react": ">=18.0.0"' not in package:
    raise SystemExit('React peer dependency is not >=18.0.0')
print('React API source confirmed')
PY
```

Expected: `React API source confirmed`.

- [ ] **Step 2: Create `doc/plugins/react.md`**

Write this exact content:

````markdown
---
title: React
description: React integration — ClientProvider, useClient, and option helpers for sharing typed @defjs/core clients in React applications.
---

# @defjs/react

`@defjs/react` integrates `@defjs/core` with React. It creates a `Client` once, exposes it through React Context, and lets child components read it with `useClient()`.

Use it when a React application needs one shared typed client for HTTP, SSE, or WebSocket commands.

## Installation

::: code-group

```bash [npm]
npm install @defjs/react @defjs/core react
```

```bash [pnpm]
pnpm add @defjs/react @defjs/core react
```

```bash [bun]
bun add @defjs/react @defjs/core react
```

:::

`react` is a peer dependency. `@defjs/react` supports React 18 and newer.

## Provide Client

Wrap the part of the component tree that needs the client with `ClientProvider`.

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider` creates a `@defjs/core` client from the provided options and stores it in a private React Context.

## Use Client

Call `useClient()` inside a child component to retrieve the nearest provided client.

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

If `useClient()` is called outside `ClientProvider`, it throws a runtime error so the missing provider is visible immediately.

## Option Helpers

`withEndpoint` and `withInterceptors` are React package helpers that produce `@defjs/core` client options.

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((request, next) => {
  request.headers.set('Authorization', 'Bearer token')
  return next(request)
})

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`withInterceptors` accepts factory functions. Each factory returns an interceptor, and the resulting interceptors are registered on the created client.

## Client Components

The React wrapper is marked with `"use client"`. In React Server Component applications, render `ClientProvider` from a client component boundary.

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API Reference

### `<ClientProvider options?: ClientOption[]>`

Creates a client and provides it to child components. Options are evaluated when the provider creates the client.

### `useClient(): Client`

Returns the client from the nearest `ClientProvider`. Throws if no provider is found.

### `withEndpoint(endpoint: string): ClientOption`

Sets the base endpoint URL for the client.

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

Registers interceptors through factory functions.

## Notes

- React 18 or newer is required.
- `ClientProvider` belongs in client component code.
- `useClient()` must run below a `ClientProvider`.
- `@defjs/react` does not change the request, command, interceptor, or error model from `@defjs/core`.

## What's Next

- [Core Client →](/core/client) — Client creation and configuration
- [Interceptors →](/core/interceptors) — Onion-model interceptor chains
- [Commands →](/core/commands) — HTTP, SSE, and WebSocket command definitions
````

- [ ] **Step 3: Create `doc/zh-Hans/plugins/react.md`**

Write this exact content:

````markdown
---
title: React
description: React 集成 — 使用 ClientProvider、useClient 和 option helpers 在 React 应用中共享类型化 @defjs/core client。
---

# @defjs/react

`@defjs/react` 将 `@defjs/core` 接入 React。它创建一次 `Client`，通过 React Context 暴露给组件树，并让子组件使用 `useClient()` 读取。

当 React 应用需要共享一个用于 HTTP、SSE 或 WebSocket 命令的类型化 client 时使用它。

## 安装

::: code-group

```bash [npm]
npm install @defjs/react @defjs/core react
```

```bash [pnpm]
pnpm add @defjs/react @defjs/core react
```

```bash [bun]
bun add @defjs/react @defjs/core react
```

:::

`react` 是 peer dependency。`@defjs/react` 支持 React 18 及更高版本。

## 提供 Client

用 `ClientProvider` 包裹需要访问 client 的组件树。

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

`ClientProvider` 根据传入的 options 创建 `@defjs/core` client，并将它保存在私有 React Context 中。

## 使用 Client

在子组件中调用 `useClient()`，读取最近的 provider 提供的 client。

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

如果在 `ClientProvider` 外调用 `useClient()`，它会抛出运行时错误，让缺失 provider 的问题立即暴露。

## Option Helpers

`withEndpoint` 和 `withInterceptors` 是 React 包提供的 helpers，用来生成 `@defjs/core` client options。

```tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createHttpInterceptor } from '@defjs/core'

const authInterceptor = createHttpInterceptor((request, next) => {
  request.headers.set('Authorization', 'Bearer token')
  return next(request)
})

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com'), withInterceptors(() => authInterceptor)]}>
      <Router />
    </ClientProvider>
  )
}
```

`withInterceptors` 接收工厂函数。每个工厂函数返回一个 interceptor，生成的 interceptors 会注册到创建出来的 client 上。

## Client Components

React wrapper 标记了 `"use client"`。在 React Server Component 应用中，请从 client component 边界渲染 `ClientProvider`。

```tsx
'use client'

import { ClientProvider, withEndpoint } from '@defjs/react'

export function ApiProvider({ children }: { children: React.ReactNode }) {
  return <ClientProvider options={[withEndpoint('https://api.example.com')]}>{children}</ClientProvider>
}
```

## API 参考

### `<ClientProvider options?: ClientOption[]>`

创建 client，并提供给子组件。Options 会在 provider 创建 client 时求值。

### `useClient(): Client`

返回最近的 `ClientProvider` 中的 client。找不到 provider 时会抛错。

### `withEndpoint(endpoint: string): ClientOption`

设置 client 的 base endpoint URL。

### `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`

通过工厂函数注册 interceptors。

## 注意事项

- 需要 React 18 或更高版本。
- `ClientProvider` 应放在 client component 代码中。
- `useClient()` 必须在 `ClientProvider` 下方调用。
- `@defjs/react` 不改变 `@defjs/core` 的请求、命令、拦截器或错误模型。

## 下一步

- [客户端 →](/core/client) — Client 创建与配置
- [拦截器 →](/core/interceptors) — 洋葱模型拦截器链
- [命令 →](/core/commands) — HTTP、SSE 和 WebSocket 命令定义
````

- [ ] **Step 4: Create remaining localized plugin pages**

Create the remaining files with the same code examples as the English and Simplified Chinese pages. Use these localized text choices exactly:

| File                              | Frontmatter description                                                                                                                                | Main overview sentence                                                                                                                                                                   | Notes heading   |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| `doc/zh-Hant-TW/plugins/react.md` | `React 整合 — 使用 ClientProvider、useClient 與 option helpers 在 React 應用程式中共享型別化 @defjs/core client。`                                     | `` `@defjs/react` 將 `@defjs/core` 接入 React。它只建立一次 `Client`，透過 React Context 暴露給元件樹，並讓子元件使用 `useClient()` 讀取。``                                             | `## 注意事項`   |
| `doc/zh-Hant-HK/plugins/react.md` | `React 整合 — 使用 ClientProvider、useClient 與 option helpers 在 React 應用程式中共享類型化 @defjs/core client。`                                     | `` `@defjs/react` 將 `@defjs/core` 接入 React。它只建立一次 `Client`，透過 React Context 暴露給組件樹，並讓子組件使用 `useClient()` 讀取。``                                             | `## 注意事項`   |
| `doc/de-DE/plugins/react.md`      | `React-Integration — ClientProvider, useClient und Option-Helper zum Teilen typisierter @defjs/core Clients in React-Anwendungen.`                     | `` `@defjs/react` integriert `@defjs/core` in React. Es erstellt einmal einen `Client`, stellt ihn über React Context bereit und lässt Kindkomponenten ihn mit `useClient()` lesen.``    | `## Hinweise`   |
| `doc/ja-JP/plugins/react.md`      | `React 統合 — ClientProvider、useClient、option helpers を使い、型付き @defjs/core client を React アプリケーションで共有します。`                     | `` `@defjs/react` は `@defjs/core` を React に統合します。`Client` を一度作成し、React Context 経由でコンポーネントツリーに公開し、子コンポーネントは `useClient()` で読み取ります。``   | `## 注意点`     |
| `doc/ko-KR/plugins/react.md`      | `React 통합 — ClientProvider, useClient, option helpers로 타입이 지정된 @defjs/core client를 React 애플리케이션에서 공유합니다.`                       | `` `@defjs/react`는 `@defjs/core`를 React에 통합합니다. `Client`를 한 번 만들고 React Context를 통해 컴포넌트 트리에 제공하며, 자식 컴포넌트는 `useClient()`로 읽습니다.``               | `## 참고 사항`  |
| `doc/ar/plugins/react.md`         | `تكامل React — ClientProvider و useClient و option helpers لمشاركة عميل @defjs/core مكتوب الأنواع داخل تطبيقات React.`                                 | `` يدمج `@defjs/react` حزمة `@defjs/core` مع React. ينشئ `Client` مرة واحدة، ويعرضه عبر React Context، وتقرأه المكونات الفرعية باستخدام `useClient()`.``                                 | `## ملاحظات`    |
| `doc/es-ES/plugins/react.md`      | `Integración con React — ClientProvider, useClient y option helpers para compartir clientes @defjs/core tipados en aplicaciones React.`                | `` `@defjs/react` integra `@defjs/core` con React. Crea un `Client` una sola vez, lo expone mediante React Context y permite que los componentes hijos lo lean con `useClient()`.``      | `## Notas`      |
| `doc/ru-RU/plugins/react.md`      | `Интеграция React — ClientProvider, useClient и option helpers для совместного использования типизированных клиентов @defjs/core в React-приложениях.` | `` `@defjs/react` интегрирует `@defjs/core` с React. Он один раз создаёт `Client`, передаёт его через React Context и позволяет дочерним компонентам получать его через `useClient()`.`` | `## Примечания` |
| `doc/fr-FR/plugins/react.md`      | `Intégration React — ClientProvider, useClient et option helpers pour partager des clients @defjs/core typés dans les applications React.`             | `` `@defjs/react` intègre `@defjs/core` à React. Il crée un `Client` une seule fois, l’expose via React Context et permet aux composants enfants de le lire avec `useClient()`.``        | `## Notes`      |

For each page, preserve these section names localized as follows:

| Locale     | Installation      | Provide Client             | Use Client                | Option Helpers      | Client Components      | API Reference          | What's Next             |
| ---------- | ----------------- | -------------------------- | ------------------------- | ------------------- | ---------------------- | ---------------------- | ----------------------- |
| zh-Hant-TW | `## 安裝`         | `## 提供 Client`           | `## 使用 Client`          | `## Option Helpers` | `## Client Components` | `## API 參考`          | `## 接下來`             |
| zh-Hant-HK | `## 安裝`         | `## 提供 Client`           | `## 使用 Client`          | `## Option Helpers` | `## Client Components` | `## API 參考`          | `## 接下來`             |
| de-DE      | `## Installation` | `## Client bereitstellen`  | `## Client verwenden`     | `## Option Helpers` | `## Client Components` | `## API-Referenz`      | `## Wie geht es weiter` |
| ja-JP      | `## インストール` | `## Client を提供する`     | `## Client を使う`        | `## Option Helpers` | `## Client Components` | `## API リファレンス`  | `## 次に読む`           |
| ko-KR      | `## 설치`         | `## Client 제공`           | `## Client 사용`          | `## Option Helpers` | `## Client Components` | `## API Reference`     | `## 다음 단계`          |
| ar         | `## التثبيت`      | `## توفير Client`          | `## استخدام Client`       | `## Option Helpers` | `## Client Components` | `## مرجع API`          | `## ما التالي`          |
| es-ES      | `## Instalación`  | `## Proveer Client`        | `## Usar Client`          | `## Option Helpers` | `## Client Components` | `## Referencia de API` | `## Próximos pasos`     |
| ru-RU      | `## Установка`    | `## Предоставление Client` | `## Использование Client` | `## Option Helpers` | `## Client Components` | `## Справочник API`    | `## Что дальше`         |
| fr-FR      | `## Installation` | `## Fournir Client`        | `## Utiliser Client`      | `## Option Helpers` | `## Client Components` | `## Référence API`     | `## Prochaines étapes`  |

Use this invariant code block in every localized page for the provider example:

```tsx
// App.tsx
import { ClientProvider, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <Router />
    </ClientProvider>
  )
}
```

Use this invariant code block in every localized page for the hook example:

```tsx
// UserProfile.tsx
import { useEffect, useState } from 'react'
import { defineRequest, struct } from '@defjs/core'
import { useClient } from '@defjs/react'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

export function UserProfile() {
  const client = useClient()
  const [name, setName] = useState('')

  useEffect(() => {
    client.execute(getUser()).then(([error, user]) => {
      if (!error) {
        setName(user.name)
      }
    })
  }, [client])

  return <div>{name}</div>
}
```

Use this invariant note list translated per language, preserving the API names:

- React 18 or newer is required.
- `ClientProvider` belongs in client component code.
- `useClient()` must run below a `ClientProvider`.
- `@defjs/react` does not change the request, command, interceptor, or error model from `@defjs/core`.

- [ ] **Step 5: Verify plugin pages build before adding links**

Run:

```bash
pnpm --dir doc docs:build
```

Expected: VitePress build completes successfully. If it fails on a syntax issue in a newly created Markdown page, fix that page only and rerun this command.

---

### Task 2: 更新 VitePress 插件导航与侧边栏

**Files:**

- Modify: `doc/.vitepress/config.ts`

**Interfaces:**

- Consumes: `doc/**/plugins/react.md` pages created by Task 1.
- Produces: top nav dropdowns and plugin sidebars that expose React for every locale.

- [ ] **Step 1: Replace each `nav*` plugins entry with a dropdown**

In `doc/.vitepress/config.ts`, replace each current single-link plugins nav item with the exact dropdown for that locale:

```ts
// navEn
{
  text: 'Plugins',
  items: [
    { text: 'Angular', link: '/plugins/angular' },
    { text: 'Vue', link: '/plugins/vue' },
    { text: 'React', link: '/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/plugins/opentelemetry-server' },
  ],
}

// navZh
{
  text: '插件',
  items: [
    { text: 'Angular', link: '/zh-Hans/plugins/angular' },
    { text: 'Vue', link: '/zh-Hans/plugins/vue' },
    { text: 'React', link: '/zh-Hans/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/zh-Hans/plugins/opentelemetry-server' },
  ],
}

// navZhTw
{
  text: '外掛程式',
  items: [
    { text: 'Angular', link: '/zh-Hant-TW/plugins/angular' },
    { text: 'Vue', link: '/zh-Hant-TW/plugins/vue' },
    { text: 'React', link: '/zh-Hant-TW/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/zh-Hant-TW/plugins/opentelemetry-server' },
  ],
}

// navZhHk
{
  text: '外掛',
  items: [
    { text: 'Angular', link: '/zh-Hant-HK/plugins/angular' },
    { text: 'Vue', link: '/zh-Hant-HK/plugins/vue' },
    { text: 'React', link: '/zh-Hant-HK/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/zh-Hant-HK/plugins/opentelemetry-server' },
  ],
}

// navDe
{
  text: 'Plugins',
  items: [
    { text: 'Angular', link: '/de-DE/plugins/angular' },
    { text: 'Vue', link: '/de-DE/plugins/vue' },
    { text: 'React', link: '/de-DE/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/de-DE/plugins/opentelemetry-server' },
  ],
}

// navJa
{
  text: 'プラグイン',
  items: [
    { text: 'Angular', link: '/ja-JP/plugins/angular' },
    { text: 'Vue', link: '/ja-JP/plugins/vue' },
    { text: 'React', link: '/ja-JP/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/ja-JP/plugins/opentelemetry-server' },
  ],
}

// navKo
{
  text: '플러그인',
  items: [
    { text: 'Angular', link: '/ko-KR/plugins/angular' },
    { text: 'Vue', link: '/ko-KR/plugins/vue' },
    { text: 'React', link: '/ko-KR/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/ko-KR/plugins/opentelemetry-server' },
  ],
}

// navAr
{
  text: 'الإضافات',
  items: [
    { text: 'Angular', link: '/ar/plugins/angular' },
    { text: 'Vue', link: '/ar/plugins/vue' },
    { text: 'React', link: '/ar/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/ar/plugins/opentelemetry-server' },
  ],
}

// navEs
{
  text: 'Plugins',
  items: [
    { text: 'Angular', link: '/es-ES/plugins/angular' },
    { text: 'Vue', link: '/es-ES/plugins/vue' },
    { text: 'React', link: '/es-ES/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/es-ES/plugins/opentelemetry-server' },
  ],
}

// navRu
{
  text: 'Плагины',
  items: [
    { text: 'Angular', link: '/ru-RU/plugins/angular' },
    { text: 'Vue', link: '/ru-RU/plugins/vue' },
    { text: 'React', link: '/ru-RU/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/ru-RU/plugins/opentelemetry-server' },
  ],
}

// navFr
{
  text: 'Plugins',
  items: [
    { text: 'Angular', link: '/fr-FR/plugins/angular' },
    { text: 'Vue', link: '/fr-FR/plugins/vue' },
    { text: 'React', link: '/fr-FR/plugins/react' },
    { text: 'OpenTelemetry Server', link: '/fr-FR/plugins/opentelemetry-server' },
  ],
}
```

- [ ] **Step 2: Add React sidebar entries**

In every plugin sidebar items array, insert the React item after Vue and before OpenTelemetry Server:

```ts
{ text: 'React', link: '/plugins/react' }
{ text: 'React', link: '/zh-Hans/plugins/react' }
{ text: 'React', link: '/zh-Hant-TW/plugins/react' }
{ text: 'React', link: '/zh-Hant-HK/plugins/react' }
{ text: 'React', link: '/de-DE/plugins/react' }
{ text: 'React', link: '/ja-JP/plugins/react' }
{ text: 'React', link: '/ko-KR/plugins/react' }
{ text: 'React', link: '/ar/plugins/react' }
{ text: 'React', link: '/es-ES/plugins/react' }
{ text: 'React', link: '/ru-RU/plugins/react' }
{ text: 'React', link: '/fr-FR/plugins/react' }
```

Each one belongs in the sidebar block matching its path prefix.

- [ ] **Step 3: Verify config builds**

Run:

```bash
pnpm --dir doc docs:build
```

Expected: VitePress build completes successfully and does not report missing `/plugins/react` pages.

---

### Task 3: 更新所有首页的 Framework Integrations 入口

**Files:**

- Modify: `doc/index.md`
- Modify: `doc/zh-Hans/index.md`
- Modify: `doc/zh-Hant-TW/index.md`
- Modify: `doc/zh-Hant-HK/index.md`
- Modify: `doc/de-DE/index.md`
- Modify: `doc/ja-JP/index.md`
- Modify: `doc/ko-KR/index.md`
- Modify: `doc/ar/index.md`
- Modify: `doc/es-ES/index.md`
- Modify: `doc/ru-RU/index.md`
- Modify: `doc/fr-FR/index.md`

**Interfaces:**

- Consumes: React plugin links from Task 1 and Task 2.
- Produces: Home page entry cards for React in every locale.

- [ ] **Step 1: Update the feature details line in every homepage frontmatter**

Replace the existing framework-ready details text with these locale-specific strings:

```yaml
# doc/index.md
First-class integrations for Angular, Vue, and React with provideClient / injectClient / useClient patterns. OpenTelemetry plugin for server-side observability.

# doc/zh-Hans/index.md
为 Angular、Vue 和 React 提供一等公民集成，采用 provideClient / injectClient / useClient 模式。服务端可观测性支持 OpenTelemetry 插件。

# doc/zh-Hant-TW/index.md
為 Angular、Vue 與 React 提供 first-class 整合，採用 provideClient / injectClient / useClient 模式。伺服器端可觀測性則有 OpenTelemetry 外掛程式。

# doc/zh-Hant-HK/index.md
為 Angular、Vue 與 React 提供 first-class 整合，採用 provideClient / injectClient / useClient 模式。伺服器端可觀測性則有 OpenTelemetry 外掛。

# doc/de-DE/index.md
First-Class-Integrationen für Angular, Vue und React mit provideClient / injectClient / useClient Patterns. OpenTelemetry-Plugin für serverseitige Observability.

# doc/ja-JP/index.md
Angular、Vue、React 向けのファーストクラス統合。provideClient / injectClient / useClient パターンを提供します。サーバーサイドの可観測性には OpenTelemetry プラグインを利用できます。

# doc/ko-KR/index.md
Angular, Vue, React를 위한 일급 통합을 provideClient / injectClient / useClient 패턴으로 제공합니다. 서버 측 관측성을 위한 OpenTelemetry 플러그인도 제공합니다.

# doc/ar/index.md
تكاملات من الدرجة الأولى لـ Angular و Vue و React مع أنماط provideClient / injectClient / useClient. إضافة OpenTelemetry لقابلية المراقبة من جانب الخادم.

# doc/es-ES/index.md
Integraciones de primera clase para Angular, Vue y React con patrones provideClient / injectClient / useClient. Plugin OpenTelemetry para observabilidad del lado del servidor.

# doc/ru-RU/index.md
Интеграции первого класса для Angular, Vue и React с паттернами provideClient / injectClient / useClient. Плагин OpenTelemetry для серверной наблюдаемости.

# doc/fr-FR/index.md
Intégrations de première classe pour Angular, Vue et React avec les patterns provideClient / injectClient / useClient. Plugin OpenTelemetry pour l'observabilité côté serveur.
```

- [ ] **Step 2: Add the React card after the Vue card in every homepage**

Use these exact cards:

```markdown
<!-- doc/index.md -->

### React

`@defjs/react` provides `ClientProvider` and `useClient` for React Context-based client sharing. Option helpers mirror the core client configuration model.

[Learn more →](/plugins/react)

<!-- doc/zh-Hans/index.md -->

### React

`@defjs/react` 提供基于 React Context 的 `ClientProvider` 和 `useClient`，用于共享 client。Option helpers 与核心 client 配置模型保持一致。

[了解更多 →](/plugins/react)

<!-- doc/zh-Hant-TW/index.md -->

### React

`@defjs/react` 提供基於 React Context 的 `ClientProvider` 與 `useClient`，用於共享 client。Option helpers 與核心 client 設定模型保持一致。

[深入了解 →](/plugins/react)

<!-- doc/zh-Hant-HK/index.md -->

### React

`@defjs/react` 提供基於 React Context 的 `ClientProvider` 與 `useClient`，用於共享 client。Option helpers 與核心 client 設定模型保持一致。

[深入了解 →](/plugins/react)

<!-- doc/de-DE/index.md -->

### React

`@defjs/react` stellt `ClientProvider` und `useClient` für client sharing über React Context bereit. Option Helpers folgen dem Konfigurationsmodell des Core-Clients.

[Mehr erfahren →](/plugins/react)

<!-- doc/ja-JP/index.md -->

### React

`@defjs/react` は React Context ベースの client 共有のために `ClientProvider` と `useClient` を提供します。Option helpers は core client の設定モデルに合わせています。

[詳細を見る →](/plugins/react)

<!-- doc/ko-KR/index.md -->

### React

`@defjs/react`는 React Context 기반 client 공유를 위해 `ClientProvider`와 `useClient`를 제공합니다. Option helpers는 core client 설정 모델과 일치합니다.

[자세히 보기 →](/plugins/react)

<!-- doc/ar/index.md -->

### React

يوفر `@defjs/react` كلًا من `ClientProvider` و `useClient` لمشاركة client عبر React Context. تتبع option helpers نموذج إعداد core client.

[تعرّف على المزيد →](/plugins/react)

<!-- doc/es-ES/index.md -->

### React

`@defjs/react` proporciona `ClientProvider` y `useClient` para compartir client mediante React Context. Los option helpers siguen el modelo de configuración del core client.

[Más información →](/plugins/react)

<!-- doc/ru-RU/index.md -->

### React

`@defjs/react` предоставляет `ClientProvider` и `useClient` для совместного использования client через React Context. Option helpers следуют модели конфигурации core client.

[Подробнее →](/plugins/react)

<!-- doc/fr-FR/index.md -->

### React

`@defjs/react` fournit `ClientProvider` et `useClient` pour partager un client via React Context. Les option helpers suivent le modèle de configuration du core client.

[En savoir plus →](/plugins/react)
```

- [ ] **Step 3: Verify homepage changes build**

Run:

```bash
pnpm --dir doc docs:build
```

Expected: VitePress build completes successfully. The `framework-grid` CSS remains unchanged.

---

### Task 4: 更新所有设计决策页的 React 集成说明

**Files:**

- Modify: `doc/guide/design-decisions.md`
- Modify: `doc/zh-Hans/guide/design-decisions.md`
- Modify: `doc/zh-Hant-TW/guide/design-decisions.md`
- Modify: `doc/zh-Hant-HK/guide/design-decisions.md`
- Modify: `doc/de-DE/guide/design-decisions.md`
- Modify: `doc/ja-JP/guide/design-decisions.md`
- Modify: `doc/ko-KR/guide/design-decisions.md`
- Modify: `doc/ar/guide/design-decisions.md`
- Modify: `doc/es-ES/guide/design-decisions.md`
- Modify: `doc/ru-RU/guide/design-decisions.md`
- Modify: `doc/fr-FR/guide/design-decisions.md`

**Interfaces:**

- Consumes: React plugin API facts from Task 1.
- Produces: Design rationale that explains React wrapper as a thin Context layer over `@defjs/core`.

- [ ] **Step 1: Update the Framework Integration intro sentence**

Replace the existing sentence that only mentions Angular and Vue with these locale-specific versions:

```markdown
# doc/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue`, and `@defjs/react` integrate with each framework's dependency sharing model. Angular and Vue use `provideClient` / `injectClient`; React uses `ClientProvider` / `useClient` over React Context.

# doc/zh-Hans/guide/design-decisions.md

`@defjs/angular`、`@defjs/vue` 和 `@defjs/react` 分别接入各自框架的依赖共享模型。Angular 与 Vue 使用 `provideClient` / `injectClient`；React 基于 React Context 使用 `ClientProvider` / `useClient`。

# doc/zh-Hant-TW/guide/design-decisions.md

`@defjs/angular`、`@defjs/vue` 與 `@defjs/react` 分別接入各自框架的相依共享模型。Angular 與 Vue 使用 `provideClient` / `injectClient`；React 則基於 React Context 使用 `ClientProvider` / `useClient`。

# doc/zh-Hant-HK/guide/design-decisions.md

`@defjs/angular`、`@defjs/vue` 與 `@defjs/react` 分別接入各自框架的依賴共享模型。Angular 與 Vue 使用 `provideClient` / `injectClient`；React 則基於 React Context 使用 `ClientProvider` / `useClient`。

# doc/de-DE/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue` und `@defjs/react` integrieren sich in das Dependency-Sharing-Modell des jeweiligen Frameworks. Angular und Vue verwenden `provideClient` / `injectClient`; React verwendet `ClientProvider` / `useClient` über React Context.

# doc/ja-JP/guide/design-decisions.md

`@defjs/angular`、`@defjs/vue`、`@defjs/react` は、それぞれのフレームワークの依存共有モデルに統合します。Angular と Vue は `provideClient` / `injectClient` を使い、React は React Context 上で `ClientProvider` / `useClient` を使います。

# doc/ko-KR/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue`, `@defjs/react`는 각 프레임워크의 의존성 공유 모델에 통합됩니다. Angular와 Vue는 `provideClient` / `injectClient`를 사용하고, React는 React Context 위에서 `ClientProvider` / `useClient`를 사용합니다.

# doc/ar/guide/design-decisions.md

تتكامل `@defjs/angular` و `@defjs/vue` و `@defjs/react` مع نموذج مشاركة التبعيات الخاص بكل إطار. يستخدم Angular و Vue ‏`provideClient` / `injectClient`؛ ويستخدم React ‏`ClientProvider` / `useClient` فوق React Context.

# doc/es-ES/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue` y `@defjs/react` se integran con el modelo de compartición de dependencias de cada framework. Angular y Vue usan `provideClient` / `injectClient`; React usa `ClientProvider` / `useClient` sobre React Context.

# doc/ru-RU/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue` и `@defjs/react` интегрируются с моделью совместного использования зависимостей каждого фреймворка. Angular и Vue используют `provideClient` / `injectClient`; React использует `ClientProvider` / `useClient` поверх React Context.

# doc/fr-FR/guide/design-decisions.md

`@defjs/angular`, `@defjs/vue` et `@defjs/react` s’intègrent au modèle de partage de dépendances de chaque framework. Angular et Vue utilisent `provideClient` / `injectClient` ; React utilise `ClientProvider` / `useClient` au-dessus de React Context.
```

- [ ] **Step 2: Insert a React subsection after the Vue subsection**

Use this exact English subsection for `doc/guide/design-decisions.md`, and translate the prose while preserving the code block for locale pages:

````markdown
### React

```tsx
import { ClientProvider, withEndpoint, useClient } from '@defjs/react'

function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  return <button onClick={() => client.execute(getUser())}>Load</button>
}
```

React integration stays intentionally thin: `ClientProvider` creates one `@defjs/core` client and stores it in React Context. `useClient()` only retrieves that client; it does not wrap commands, errors, interceptors, or transport behavior.
````

For localized pages, use the same `### React` heading and the same code block. Replace only the final explanatory paragraph with:

```markdown
# zh-Hans

React 集成刻意保持轻量：`ClientProvider` 创建一个 `@defjs/core` client，并将它保存在 React Context 中。`useClient()` 只负责取回这个 client；它不会包装命令、错误、拦截器或传输行为。

# zh-Hant-TW

React 整合刻意保持輕量：`ClientProvider` 建立一個 `@defjs/core` client，並將它保存在 React Context 中。`useClient()` 只負責取回這個 client；它不會包裝指令、錯誤、攔截器或傳輸行為。

# zh-Hant-HK

React 整合刻意保持輕量：`ClientProvider` 建立一個 `@defjs/core` client，並將它保存在 React Context 中。`useClient()` 只負責取回這個 client；它不會包裝指令、錯誤、攔截器或傳輸行為。

# de-DE

Die React-Integration bleibt bewusst dünn: `ClientProvider` erstellt einen `@defjs/core` Client und speichert ihn in React Context. `useClient()` ruft nur diesen Client ab; es umhüllt keine Commands, Fehler, Interceptors oder Transportlogik.

# ja-JP

React 統合は意図的に薄い層のままです。`ClientProvider` は 1 つの `@defjs/core` client を作成して React Context に保存します。`useClient()` はその client を取得するだけで、コマンド、エラー、インターセプター、トランスポート動作をラップしません。

# ko-KR

React 통합은 의도적으로 얇게 유지됩니다. `ClientProvider`는 하나의 `@defjs/core` client를 만들고 React Context에 저장합니다. `useClient()`는 그 client를 가져오기만 하며 commands, errors, interceptors, transport 동작을 감싸지 않습니다.

# ar

يبقى تكامل React طبقة خفيفة عمدًا: ينشئ `ClientProvider` عميل `@defjs/core` واحدًا ويحفظه في React Context. يكتفي `useClient()` باسترجاع ذلك العميل؛ ولا يغلّف الأوامر أو الأخطاء أو الاعتراضات أو سلوك النقل.

# es-ES

La integración con React se mantiene deliberadamente delgada: `ClientProvider` crea un cliente `@defjs/core` y lo guarda en React Context. `useClient()` solo recupera ese cliente; no envuelve comandos, errores, interceptores ni comportamiento de transporte.

# ru-RU

Интеграция React намеренно остаётся тонкой: `ClientProvider` создаёт один клиент `@defjs/core` и сохраняет его в React Context. `useClient()` только получает этот клиент; он не оборачивает команды, ошибки, интерцепторы или транспортное поведение.

# fr-FR

L’intégration React reste volontairement fine : `ClientProvider` crée un client `@defjs/core` et le stocke dans React Context. `useClient()` ne fait que récupérer ce client ; il n’enveloppe pas les commandes, les erreurs, les intercepteurs ni le comportement de transport.
```

- [ ] **Step 3: Add React to dependency tables**

In each design-decisions dependency table, add this row after `@defjs/vue`:

```markdown
| `@defjs/react` | `0.x` |
```

Then update the following sentence so it mentions React peer dependency:

```markdown
# English

Angular's peer dependency range: `>=18.0.0 <=22.0.0`. React peer dependency range: `>=18.0.0`. Node runtime: `>=26`.

# zh-Hans

Angular 的 peer dependency 范围：`>=18.0.0 <=22.0.0`。React 的 peer dependency 范围：`>=18.0.0`。Node 运行时：`>=26`。

# zh-Hant-TW

Angular 的 peer dependency 範圍：`>=18.0.0 <=22.0.0`。React 的 peer dependency 範圍：`>=18.0.0`。Node 執行環境：`>=26`。

# zh-Hant-HK

Angular 的 peer dependency 範圍：`>=18.0.0 <=22.0.0`。React 的 peer dependency 範圍：`>=18.0.0`。Node 執行環境：`>=26`。

# de-DE

Angular-Peer-Dependency-Range: `>=18.0.0 <=22.0.0`. React-Peer-Dependency-Range: `>=18.0.0`. Node-Laufzeit: `>=26`.

# ja-JP

Angular の peer dependency 範囲: `>=18.0.0 <=22.0.0`。React の peer dependency 範囲: `>=18.0.0`。Node ランタイム: `>=26`。

# ko-KR

Angular peer dependency 범위: `>=18.0.0 <=22.0.0`. React peer dependency 범위: `>=18.0.0`. Node 런타임: `>=26`.

# ar

نطاق peer dependency لـ Angular هو `>=18.0.0 <=22.0.0`. نطاق peer dependency لـ React هو `>=18.0.0`. بيئة تشغيل Node: ‏`>=26`.

# es-ES

Rango de peer dependency de Angular: `>=18.0.0 <=22.0.0`. Rango de peer dependency de React: `>=18.0.0`. Runtime de Node: `>=26`.

# ru-RU

Диапазон peer dependency для Angular: `>=18.0.0 <=22.0.0`. Диапазон peer dependency для React: `>=18.0.0`. Среда выполнения Node: `>=26`.

# fr-FR

Plage de peer dependency Angular : `>=18.0.0 <=22.0.0`. Plage de peer dependency React : `>=18.0.0`. Runtime Node : `>=26`.
```

- [ ] **Step 4: Verify design decisions build**

Run:

```bash
pnpm --dir doc docs:build
```

Expected: VitePress build completes successfully.

---

### Task 5: 全站一致性验证

**Files:**

- Check: `doc/.vitepress/config.ts`
- Check: `doc/**/index.md`
- Check: `doc/**/guide/design-decisions.md`
- Check: `doc/**/plugins/react.md`

**Interfaces:**

- Consumes: all outputs from Tasks 1–4.
- Produces: verified documentation change set ready for review.

- [ ] **Step 1: Verify every locale has a React plugin page**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
locales = ['', 'zh-Hans', 'zh-Hant-TW', 'zh-Hant-HK', 'de-DE', 'ja-JP', 'ko-KR', 'ar', 'es-ES', 'ru-RU', 'fr-FR']
missing = []
for locale in locales:
    path = Path('doc') / locale / 'plugins' / 'react.md' if locale else Path('doc/plugins/react.md')
    if not path.exists():
        missing.append(str(path))
if missing:
    raise SystemExit('missing React docs:\n' + '\n'.join(missing))
print('all React plugin pages exist')
PY
```

Expected: `all React plugin pages exist`.

- [ ] **Step 2: Verify config exposes React for each locale**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
config = Path('doc/.vitepress/config.ts').read_text()
links = [
    '/plugins/react',
    '/zh-Hans/plugins/react',
    '/zh-Hant-TW/plugins/react',
    '/zh-Hant-HK/plugins/react',
    '/de-DE/plugins/react',
    '/ja-JP/plugins/react',
    '/ko-KR/plugins/react',
    '/ar/plugins/react',
    '/es-ES/plugins/react',
    '/ru-RU/plugins/react',
    '/fr-FR/plugins/react',
]
missing = [link for link in links if link not in config]
if missing:
    raise SystemExit('missing config links:\n' + '\n'.join(missing))
print('all React config links exist')
PY
```

Expected: `all React config links exist`.

- [ ] **Step 3: Run whitespace and conflict-marker check**

Run:

```bash
git diff --check
```

Expected: no output and exit code `0`.

- [ ] **Step 4: Run final VitePress build**

Run:

```bash
pnpm --dir doc docs:build
```

Expected: VitePress build completes successfully.

- [ ] **Step 5: Inspect final diff**

Run:

```bash
git diff -- doc docs/superpowers/specs/2026-06-17-react-docs-design.md docs/superpowers/plans/2026-06-17-react-docs.md
```

Expected: diff only contains React documentation, React doc navigation, homepage React entries, design decision React notes, and the approved spec/plan documents.

- [ ] **Step 6: Commit only if explicitly authorized**

If the user has explicitly asked for a commit, run:

```bash
git add doc docs/superpowers/specs/2026-06-17-react-docs-design.md docs/superpowers/plans/2026-06-17-react-docs.md
git commit -m "docs: add React docs"
```

Expected: commit succeeds. If the user has not explicitly asked for a commit, skip this step and report the uncommitted changed files.

---

## Self-Review

### Spec coverage

- New default React page: Task 1 creates `doc/plugins/react.md`.
- New locale React pages: Task 1 creates `doc/<locale>/plugins/react.md` for every existing locale.
- VitePress navigation and sidebar: Task 2 updates `doc/.vitepress/config.ts`.
- Homepage React entries: Task 3 updates all `index.md` files.
- Design decisions React positioning: Task 4 updates all `guide/design-decisions.md` files.
- Build validation: Task 1, Task 2, Task 3, Task 4, and Task 5 run `pnpm --dir doc docs:build` at appropriate checkpoints.
- No React source/API expansion: all tasks only modify docs and config.

### Placeholder scan

This plan uses concrete file paths, exact commands, exact expected outputs, and concrete copy blocks. It does not rely on undefined functions, unspecified files, or open-ended implementation instructions.

### Type and API consistency

- `ClientProvider`, `useClient`, `withEndpoint`, and `withInterceptors` match `packages/react/src/core.tsx`.
- `ClientProvider` receives `options?: ClientOption[]`, matching `ClientProviderProps`.
- `withInterceptors` is shown with factory functions `() => authInterceptor`, matching `withInterceptors(...fns: (() => Interceptor)[])`.
- React version floor `>=18.0.0` matches `packages/react/package.json`.
