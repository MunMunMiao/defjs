# @defjs/react 包装器设计文档

**日期**: 2026-06-17
**状态**: 待批准
**作者**: Claude Code

## 目录

1. [概述](#概述)
2. [设计目标](#设计目标)
3. [架构设计](#架构设计)
4. [API 设计](#api-设计)
5. [数据流设计](#数据流设计)
6. [错误处理设计](#错误处理设计)
7. [测试设计](#测试设计)
8. [构建配置设计](#构建配置设计)
9. [文件结构设计](#文件结构设计)
10. [与 Vue/Angular 包装器的对比](#与-vueangular-包装器的对比)
11. [待确认问题](#待确认问题)

## 概述

@defjs/react 是 @defjs/core 的 React 包装器，为 React 应用提供与 @defjs/vue、@defjs/angular 功能对等的依赖注入桥接。它采用 React Context + Hook 模式，保持跨框架 API 命名一致。

### 核心特性

- **功能对等**: 与 Vue/Angular 包装器功能完全一致
- **React 惯用法**: 使用 React Context 和 `useContext` Hook
- **类型安全**: 完整的 TypeScript 类型定义
- **SSR 安全**: Provider 文件标记 `"use client"`，客户端才创建 Client 实例
- **真实测试**: 使用真实浏览器 + 真实 Hono 服务器测试

## 设计目标

1. **API 一致性**: 与 Vue/Angular 包装器保持相同的函数命名和使用方式
2. **React 惯用法**: 使用 `ClientProvider` 组件和 `useClient` Hook
3. **无感设计**: 内部 Context 是内部实现细节，用户不需要感知
4. **类型安全**: Provider 的 `options` prop 类型为 `ClientOption[]`
5. **SSR/RSC 安全**: 不在服务端创建 Client，避免 `document`、`fetch`、`WebSocket` 等浏览器 API 报错

## 架构设计

### 核心架构

@defjs/react 包装器采用 React Context + Hook 模式：

```
┌─────────────────────────────────────────────────────────┐
│                   React Application                      │
├─────────────────────────────────────────────────────────┤
│  <ClientProvider options={[...]}>                       │
│    ↓                                                     │
│  执行 ClientOption 函数，配置 ClientConfig               │
│    ↓                                                     │
│  createClient(config) 创建 Client 实例                  │
│    ↓                                                     │
│  <HttpClientContext.Provider value={client}>            │
│    ↓                                                     │
│  useClient() → useContext(HttpClientContext)            │
└─────────────────────────────────────────────────────────┘
```

### 与 Vue/Angular 包装器的映射

| Vue/Angular                  | React                                  | 实现方式                          |
| ---------------------------- | -------------------------------------- | --------------------------------- |
| `provideClient(...options)`  | `<ClientProvider options={[...]}>`     | React Context Provider            |
| `injectClient()`             | `useClient()`                          | `useContext(HttpClientContext)`   |
| `withEndpoint(endpoint)`     | `withEndpoint(endpoint)`               | 复用 @defjs/core 的 helper        |
| `withInterceptors(...fns)`   | `withInterceptors(...fns)`             | 复用 @defjs/core 的 helper        |

### 关键设计决策

1. **单 client Provider**: 一个 Provider 只支持单 client 配置，多 client 通过嵌套 Provider 实现
2. **客户端创建**: 使用 `useState(() => createClient(...))` 确保 Client 在客户端创建
3. **Context 不导出**: 内部 Context 不暴露，用户只通过 `useClient` 访问
4. **命名一致**: `withEndpoint`、`withInterceptors` 与 Vue/Angular 完全一致
5. **无 endpoint fallback**: 默认 endpoint 为 `''`，避免 SSR 环境下读取 `document.location.origin` 崩溃

## API 设计

### 导出 API

@defjs/react 包装器导出 **4 个 API**：

```typescript
// @defjs/react 导出
export function ClientProvider(props: ClientProviderProps): ReactElement
export function useClient(): Client
export function withEndpoint(endpoint: string): ClientOption
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption
```

### 使用方式

```tsx
// App.tsx
import { ClientProvider, withEndpoint, withInterceptors } from '@defjs/react'
import { createAuthInterceptor } from './interceptors'

function App() {
  return (
    <ClientProvider options={[
      withEndpoint('https://api.example.com'),
      withInterceptors(createAuthInterceptor),
    ]}>
      <Router />
    </ClientProvider>
  )
}

// UserList.tsx
import { useClient } from '@defjs/react'
import { getUsers } from './commands'

function UserList() {
  const client = useClient()

  useEffect(() => {
    client.execute(getUsers()).then((result) => {
      // handle result
    })
  }, [client])

  return <div>...</div>
}
```

### ClientProvider Props

```typescript
interface ClientProviderProps {
  options?: ClientOption[]
  children?: ReactNode
}
```

### useClient 行为

- 在 Provider 内部调用：返回 `Client` 实例
- 在 Provider 外部调用：抛出异常

## 数据流设计

### 数据流概述

```
┌─────────────────────────────────────────────────────────┐
│                   React Application                      │
├─────────────────────────────────────────────────────────┤
│  1. 应用启动                                             │
│     ↓                                                    │
│  2. <ClientProvider options={[...]}>                    │
│     ↓                                                    │
│  3. Provider 组件渲染                                    │
│     ↓                                                    │
│  4. useState 初始化器执行 ClientOption 函数              │
│     ↓                                                    │
│  5. createClient(config) 创建 Client 实例               │
│     ↓                                                    │
│  6. Context.Provider 传递 Client 实例                   │
│     ↓                                                    │
│  7. 子组件 useClient() 获取 Client 实例                 │
└─────────────────────────────────────────────────────────┘
```

### Provider 实现要点

```tsx
'use client'

import { createClient, type Client, type ClientOption } from '@defjs/core'
import { createContext, useContext, useState, type ReactNode } from 'react'

const HttpClientContext = createContext<Client | null>(null)

export interface ClientProviderProps {
  options?: ClientOption[]
  children?: ReactNode
}

export function ClientProvider({ options = [], children }: ClientProviderProps) {
  const [client] = useState(() => createClient(...options))

  return (
    <HttpClientContext.Provider value={client}>
      {children}
    </HttpClientContext.Provider>
  )
}

export function useClient(): Client {
  const client = useContext(HttpClientContext)

  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to wrap your app in <ClientProvider>?')
  }

  return client
}
```

## 错误处理设计

### 错误类型

#### 1. 依赖缺失

**场景**: 组件中调用 `useClient()` 但没有被 `ClientProvider` 包裹

**处理方式**: 抛出异常

```typescript
export function useClient(): Client {
  const client = useContext(HttpClientContext)

  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to wrap your app in <ClientProvider>?')
  }

  return client
}
```

#### 2. 运行时错误

**场景**: HTTP 请求失败、网络错误等

**处理方式**: 由 @defjs/core 处理，React 包装器不干预

```tsx
const client = useClient()

try {
  const result = await client.execute(getUsers())
} catch (error) {
  // 错误由 @defjs/core 抛出，React 包装器不干预
  console.error('Request failed:', error)
}
```

### 错误处理策略

| 错误类型   | 处理方式            | 示例                                                           |
| ---------- | ------------------- | -------------------------------------------------------------- |
| 依赖缺失   | 抛出异常            | `throw new Error('No HTTP client provided ...')`               |
| 运行时错误 | 由 @defjs/core 处理 | `catch (error) { ... }`                                        |

## 测试设计

### 测试策略概述

@defjs/react 包装器使用真实浏览器 + Hono 服务器测试：

- **测试框架**: Vitest
- **浏览器测试**: `@vitest/browser-playwright`（Chromium + Firefox）
- **渲染**: React `createRoot` + 真实 DOM
- **后端**: Hono 测试服务器
- **覆盖率**: istanbul，阈值 100%

### 测试文件

- `src/core.browser.spec.ts`：单元/集成测试
- `src/e2e.browser.spec.ts`：完整 React 应用端到端测试

`src/core.browser.spec.ts`：

1. **withEndpoint 单元测试**
   - 返回 `ClientOption` 函数
   - 调用后设置 `config.endpoint`

2. **withInterceptors 单元测试**
   - 返回 `ClientOption` 函数
   - 调用后实例化拦截器并设置 `config.interceptors`

3. **ClientProvider 集成测试**
   - 渲染 Provider，子组件通过 `useClient` 获取 client
   - 带 `withEndpoint` 时 client 配置正确
   - 带 `withInterceptors` 时拦截器注册
   - 无 options 时 client 使用默认配置

4. **useClient 错误测试**
   - 在 Provider 外部调用 `useClient` 抛出描述性错误

5. **真实 HTTP 请求测试**
   - 使用 Hono 测试服务器
   - 子组件调用 `client.execute(...)` 并断言响应

6. **重渲染稳定性测试**
   - 触发状态更新
   - 断言 `useClient` 返回的 client 引用稳定

### 端到端测试设计

端到端测试在 Vitest browser 模式下渲染一个完整的 React 应用树，验证真实 React 生命周期中的 wrapper 行为。

#### 测试场景

`src/e2e.browser.spec.ts`：

1. **完整应用渲染**
   - 渲染包含 `ClientProvider` 的根组件
   - 嵌套多层子组件，每层都通过 `useClient` 访问 client
   - 断言所有层获取到的 client 是同一实例

2. **真实 HTTP 请求流程**
   - 子组件在 `useEffect` 中调用 `client.execute(getUsers())`
   - 将响应数据渲染到 DOM
   - 断言页面上显示来自 Hono 测试服务器的数据

3. **Provider 边界测试**
   - 根 Provider 配置 endpoint 为 Hono 服务器
   - 子组件不传入 endpoint 也能正确发起请求
   - 验证 endpoint 通过 Context 正确传递

4. **错误边界测试**
   - 渲染一个故意不在 Provider 内的组件
   - 组件调用 `useClient()` 时应抛出异常
   - 使用 React Error Boundary 捕获并断言错误信息

#### 示例测试结构

```typescript
// src/e2e.browser.spec.ts
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ClientProvider, useClient, withEndpoint } from '../src'
import { defineRequest, array, object, number, string } from '@defjs/core'
import { startHonoServer } from './test/setup'

const UserSchema = object({
  id: number(),
  name: string(),
})

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  response: array(UserSchema),
})

function UserList() {
  const client = useClient()
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    client.execute(getUsers()).then((result) => {
      if (result.ok) {
        setUsers(result.data)
      }
    })
  }, [client])

  return (
    <ul data-testid="user-list">
      {users.map((user) => (
        <li key={user.id} data-testid={`user-${user.id}`}>{user.name}</li>
      ))}
    </ul>
  )
}

function App({ endpoint }: { endpoint: string }) {
  return (
    <ClientProvider options={[withEndpoint(endpoint)]}>
      <div>
        <h1>Users</h1>
        <UserList />
      </div>
    </ClientProvider>
  )
}

describe('React wrapper e2e', () => {
  let server: { port: number; close: () => Promise<void> }

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should fetch and render real data through useClient', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    root.render(
      <App endpoint={`http://127.0.0.1:${server.port}`} />,
    )

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="user-1"]')?.textContent).toBe('John')
      expect(container.querySelector('[data-testid="user-2"]')?.textContent).toBe('Jane')
    })

    root.unmount()
    container.remove()
  })
})
```

#### 覆盖目标

- 真实 React 渲染生命周期：100% 覆盖 Provider 创建、Context 传递、Hook 消费
- 真实 HTTP 请求：100% 覆盖 `client.execute` 从 React 组件发起的完整流程
- 错误边界：100% 覆盖 Provider 缺失时的错误提示

### Mount Helper

```typescript
import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'

function mount(element: ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  return {
    container,
    unmount: () => {
      root.unmount()
      container.remove()
    },
  }
}
```

## 构建配置设计

### 构建工具

- **构建工具**: `tsdown`（与 Vue/Angular 包装器一致）
- **输出格式**: ESM only
- **平台**: `browser`
- **目标**: `esnext`

### package.json

```json
{
  "name": "@defjs/react",
  "version": "0.0.1",
  "license": "MIT",
  "type": "module",
  "module": "src/index.ts",
  "typings": "src/index.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "directory": "dist"
  },
  "scripts": {
    "build": "tsdown",
    "pub": "pnpm publish",
    "test": "vitest run --config vitest.config.ts --coverage",
    "typecheck": "tsgo --project tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/browser": "catalog:",
    "@vitest/browser-playwright": "catalog:",
    "@vitest/coverage-istanbul": "catalog:",
    "playwright": "catalog:",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tsdown": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "peerDependencies": {
    "@defjs/core": "workspace:^",
    "react": ">=18.0.0"
  },
  "engines": {
    "node": ">=26"
  }
}
```

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@defjs/core": ["../core/src"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "exclude": ["test", "src/**/*.spec.ts", "src/**/*.type.test.ts"]
}
```

### tsdown.config.ts

与 Vue/Angular 包装器模式一致：

```typescript
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg: Record<string, unknown> = JSON.parse(raw)

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: './dist',
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  dts: true,
  clean: true,
  minify: false,
  sourcemap: false,
  tsconfig: './tsconfig.build.json',
  deps: {
    neverBundle: ['react', 'react-dom', '@defjs/core'],
  },
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(options.outDir)
    },
  },
})
```

### vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config'
import { coverageConfig } from './test/shared'

export default defineConfig({
  test: {
    coverage: { ...coverageConfig },
    projects: ['./vitest.config.browser.ts'],
  },
})
```

### vitest.config.browser.ts

```typescript
import { resolve } from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './test/shared'

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@defjs/core': resolve(packageRoot, '../core/src'),
    },
  },
  test: {
    name: 'react-browser',
    globalSetup: globalSetupPath,
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
        },
      ],
    },
  },
})
```

## 文件结构设计

```
packages/react/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsdown.config.ts
├── vitest.config.ts
├── vitest.config.browser.ts
├── README.md
├── src/
│   ├── index.ts             # 导出入口
│   ├── public_api.ts        # 统一导出
│   ├── core.ts              # ClientProvider, useClient, withEndpoint, withInterceptors
│   ├── core.browser.spec.ts # 浏览器单元/集成测试
│   └── e2e.browser.spec.ts  # 完整 React 应用端到端测试
└── test/
    ├── shared.ts            # coverageConfig, packageRoot, globalSetupPath
    └── setup.ts             # Hono 测试服务器
```

### 文件职责

| 文件                       | 职责                                              |
| -------------------------- | ------------------------------------------------- |
| `src/core.ts`              | 实现 Provider、Hook、withEndpoint、withInterceptors |
| `src/public_api.ts`        | 统一导出公共 API                                   |
| `src/index.ts`             | 包入口，转发 public_api                            |
| `src/core.browser.spec.ts` | 浏览器单元/集成测试                                |
| `src/e2e.browser.spec.ts`  | 完整 React 应用端到端测试                          |
| `test/shared.ts`           | 测试共享配置                                       |
| `test/setup.ts`            | Hono 测试服务器 global setup                       |

## 与 Vue/Angular 包装器的对比

### 功能对比

| 功能             | Angular | Vue | React |
| ---------------- | ------- | --- | ----- |
| provideClient    | ✅      | ✅  | ✅（组件形式） |
| injectClient     | ✅      | ✅  | ✅（useClient Hook） |
| withEndpoint     | ✅      | ✅  | ✅ |
| withInterceptors | ✅      | ✅  | ✅ |

### API 对比

| API              | Angular                                           | Vue                            | React                                      |
| ---------------- | ------------------------------------------------- | ------------------------------ | ------------------------------------------ |
| provideClient    | `provideClient(...feature): EnvironmentProviders` | `provideClient(...): Plugin`   | `<ClientProvider options={[...]}>`         |
| injectClient     | `injectClient(): Client`                          | `injectClient(): Client`       | `useClient(): Client`                      |
| withEndpoint     | `withEndpoint(endpoint): EnvironmentProviders`    | `withEndpoint(endpoint): ClientOption` | `withEndpoint(endpoint): ClientOption` |
| withInterceptors | `withInterceptors(...fns): EnvironmentProviders`  | `withInterceptors(...fns): ClientOption` | `withInterceptors(...fns): ClientOption` |

### 实现对比

| 实现         | Angular                       | Vue                    | React                        |
| ------------ | ----------------------------- | ---------------------- | ---------------------------- |
| 依赖注入     | InjectionToken + 环境 Provider | InjectionKey + provide | React Context + useContext   |
| 初始化时机   | APP_INITIALIZER（异步）        | Plugin install（同步）  | 组件首次渲染 useState 初始化器 |
| SSR 安全     | 依赖 Angular 平台抽象          | Vue 3 SSR 需额外注意    | `"use client"` + useState    |
| 构建工具     | tsdown                        | tsdown                 | tsdown                       |

## 待确认问题

1. **README 内容**: 是否需要同步提供 @defjs/react 的使用示例 README？
2. **changeset**: 新包首次发布是否需要创建 changeset？
3. **CI 集成**: 是否需要将 `packages/react` 的测试加入根目录 `pnpm test`？

---

**文档版本**: 1.0
**最后更新**: 2026-06-17
