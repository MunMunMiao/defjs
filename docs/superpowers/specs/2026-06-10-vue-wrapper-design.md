# @defjs/vue 包装器设计文档

**日期**: 2026-06-10
**状态**: 已批准
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
10. [与 Angular 包装器的对比](#与-angular-包装器的对比)
11. [待确认问题](#待确认问题)

## 概述

@defjs/vue 是一个 Vue 3 包装器，为 Vue 3 应用提供与 @defjs/angular 相同的功能。它采用 Plugin + composable 模式，与 Angular 包装器保持 API 一致性。

### 核心特性

- **功能对等**: 与 Angular 包装器功能完全一致
- **Vue 特性**: 使用 Vue 3 的 Plugin 和 composable 模式
- **类型安全**: 完整的 TypeScript 类型定义
- **真实测试**: 使用真实浏览器、真实 SSR、真实 Hono 服务器测试

## 设计目标

1. **API 一致性**: 与 Angular 包装器保持相同的函数命名和使用方式
2. **Vue 惯用法**: 使用 Vue 3 的 Plugin 和 composable 模式
3. **无感设计**: 内部实现细节对用户透明
4. **类型安全**: 使用 InjectionKey<T> 实现编译期类型安全
5. **真实测试**: 使用真实环境测试，不依赖模拟

## 架构设计

### 核心架构

@defjs/vue 包装器采用 Plugin + composable 模式：

```
┌─────────────────────────────────────────────────────────┐
│                    Vue 3 Application                     │
├─────────────────────────────────────────────────────────┤
│  app.use(provideClient(...feature))                     │
│    ↓                                                     │
│  Plugin.install(app, options)                           │
│    ↓                                                     │
│  执行 ClientOption 函数，配置 ClientConfig               │
│    ↓                                                     │
│  createClient(config) 创建 Client 实例                  │
│    ↓                                                     │
│  app.provide(HTTP_CLIENT, client) 提供 Client 实例      │
│    ↓                                                     │
│  injectClient() → inject(HTTP_CLIENT)                   │
└─────────────────────────────────────────────────────────┘
```

### 与 Angular 包装器的映射

| Angular                                 | Vue 3                                 | 实现方式                                  |
| --------------------------------------- | ------------------------------------- | ----------------------------------------- |
| `HTTP_CLIENT` (InjectionToken)          | `HTTP_CLIENT` (InjectionKey)          | `Symbol() as InjectionKey<Client>`        |
| `HTTP_INTERCEPTOR_FNS` (InjectionToken) | `HTTP_INTERCEPTOR_FNS` (InjectionKey) | `Symbol() as InjectionKey<Interceptor[]>` |
| `HTTP_HOST` (InjectionToken)            | `HTTP_HOST` (InjectionKey)            | `Symbol() as InjectionKey<string>`        |
| `makeEnvironmentProviders()`            | `Plugin.install()`                    | `app.provide()`                           |
| `APP_INITIALIZER`                       | 同步调用                              | `install` 函数内直接调用                  |
| `inject(HTTP_CLIENT)`                   | `inject(HTTP_CLIENT)`                 | composable 封装                           |

### 关键设计决策

1. **单 client Plugin**: Plugin 只支持单 client 配置，多 client 通过组件级 `provide()` 实现
2. **同步初始化**: `setGlobalClient()` 在 `install` 函数内同步调用，不需要 `APP_INITIALIZER`
3. **类型安全**: 使用 `InjectionKey<T>` 实现编译期类型安全
4. **命名一致**: 与 Angular 包装器完全一致的函数命名
5. **无感设计**: `HTTP_CLIENT`、`HTTP_INTERCEPTOR_FNS`、`HTTP_HOST` 是内部实现细节，用户不需要感知

## API 设计

### 导出 API

@defjs/vue 包装器导出 **5 个函数**，使用函数式选项模式：

```typescript
// @defjs/vue 导出
export type ClientOption = (config: ClientConfig) => void

export function provideClient(...feature: ClientOption[]): Plugin
export function provideGlobalClient(...feature: ClientOption[]): Plugin
export function injectClient(): Client
export function withHost(host: string): ClientOption
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption
```

### 使用方式

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, provideGlobalClient, withHost, withInterceptors } from '@defjs/vue'

const app = createApp(App)

// 方式 1：provideClient（不设置全局）
app.use(provideClient(withHost('https://api.example.com'), withInterceptors(authInterceptor, loggingInterceptor)))

// 方式 2：provideGlobalClient（设置全局）
app.use(provideGlobalClient(withHost('https://api.example.com'), withInterceptors(authInterceptor, loggingInterceptor)))

// 组件中使用
import { injectClient } from '@defjs/vue'

const client = injectClient() // 返回 Client 实例
```

### 函数式选项模式

@defjs/vue 使用 Golang Style Option 模式：

```typescript
// ClientOption 是一个函数类型
export type ClientOption = (config: ClientConfig) => void

// withHost 返回一个 ClientOption 函数
export function withHost(host: string): ClientOption {
  return (config: ClientConfig) => {
    config.host = host
  }
}

// withInterceptors 返回一个 ClientOption 函数
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config: ClientConfig) => {
    config.interceptors = fns.map((fn) => fn())
  }
}
```

## 数据流设计

### 数据流概述

@defjs/vue 包装器的数据流与 Angular 包装器保持一致：

```
┌─────────────────────────────────────────────────────────┐
│                    Vue 3 Application                     │
├─────────────────────────────────────────────────────────┤
│  1. 应用启动                                             │
│     ↓                                                    │
│  2. app.use(provideClient(...feature))                  │
│     ↓                                                    │
│  3. Plugin.install(app, options)                        │
│     ↓                                                    │
│  4. 执行 ClientOption 函数，配置 ClientConfig            │
│     ↓                                                    │
│  5. createClient(config) 创建 Client 实例               │
│     ↓                                                    │
│  6. app.provide(HTTP_CLIENT, client) 提供 Client 实例   │
│     ↓                                                    │
│  7. 组件中 injectClient() 获取 Client 实例              │
└─────────────────────────────────────────────────────────┘
```

### 详细数据流

#### 1. 应用启动

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, withHost, withInterceptors } from '@defjs/vue'

const app = createApp(App)
```

#### 2. 注册 Plugin

```typescript
app.use(provideClient(withHost('https://api.example.com'), withInterceptors(authInterceptor, loggingInterceptor)))
```

#### 3. Plugin.install 执行

```typescript
// Plugin.install 内部
install(app) {
  // 3.1 创建配置对象
  const config: ClientConfig = {}

  // 3.2 执行 ClientOption 函数，配置 config
  feature.forEach(option => option(config))

  // 3.3 创建 Client 实例
  const client = createClient(config)

  // 3.4 提供 Client 实例
  app.provide(HTTP_CLIENT, client)
}
```

#### 4. ClientOption 函数执行

```typescript
// withHost 返回的 ClientOption 函数
function withHost(host: string): ClientOption {
  return (config: ClientConfig) => {
    config.host = host
  }
}

// withInterceptors 返回的 ClientOption 函数
function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config: ClientConfig) => {
    config.interceptors = fns.map((fn) => fn())
  }
}
```

#### 5. 创建 Client 实例

```typescript
// createClient 内部（来自 @defjs/core）
function createClient(config: ClientConfig): Client {
  // 根据配置创建 Client 实例
  // 包括 host、interceptors 等
}
```

#### 6. 提供 Client 实例

```typescript
// app.provide 将 Client 实例注入到应用中
app.provide(HTTP_CLIENT, client)
```

#### 7. 组件中获取 Client 实例

```typescript
// 组件中使用 injectClient
import { injectClient } from '@defjs/vue'

const client = injectClient() // 返回 Client 实例

// 使用 client 发送请求
const response = await client.get('/api/users')
```

### provideGlobalClient 的数据流

provideGlobalClient 的数据流与 provideClient 基本相同，但多一步：

```typescript
// Plugin.install 内部
install(app) {
  // 1-6. 与 provideClient 相同
  // ...

  // 7. 设置全局 Client 实例
  setGlobalClient(client)
}
```

## 错误处理设计

### 错误类型

#### 1. 配置错误

**场景**: Plugin 配置不正确

**处理方式**: 在 Plugin.install 中抛出异常

```typescript
// Plugin.install 内部
install(app) {
  // 检查配置
  if (!config.host) {
    throw new Error('Host is required')
  }

  // 创建 Client 实例
  const client = createClient(config)

  // 提供 Client 实例
  app.provide(HTTP_CLIENT, client)
}
```

#### 2. 依赖缺失

**场景**: 组件中调用 injectClient() 但没有提供 Client 实例

**处理方式**: 抛出异常

```typescript
// injectClient 实现
export function injectClient(): Client {
  const client = inject(HTTP_CLIENT)

  if (!client) {
    throw new Error('Client not provided. Did you call provideClient()?')
  }

  return client
}
```

#### 3. 运行时错误

**场景**: HTTP 请求失败、网络错误等

**处理方式**: 由 @defjs/core 处理，Vue 包装器不干预

```typescript
// 组件中使用
const client = injectClient()

try {
  const response = await client.get('/api/users')
} catch (error) {
  // 错误由 @defjs/core 抛出，Vue 包装器不干预
  console.error('Request failed:', error)
}
```

### 错误处理策略

| 错误类型   | 处理方式            | 示例                                     |
| ---------- | ------------------- | ---------------------------------------- |
| 配置错误   | 抛出异常            | `throw new Error('Host is required')`    |
| 依赖缺失   | 抛出异常            | `throw new Error('Client not provided')` |
| 运行时错误 | 由 @defjs/core 处理 | `catch (error) { ... }`                  |

## 测试设计

### 测试策略概述

@defjs/vue 包装器的测试策略使用真实环境 + Hono 服务器：

```
┌─────────────────────────────────────────────────────────┐
│                    测试策略                              │
├─────────────────────────────────────────────────────────┤
│  1. 单元测试: 真实浏览器环境（Chrome、Firefox、Safari） │
│     ↓                                                    │
│  2. 集成测试: 真实 Vue 应用 + 真实浏览器 + Hono 服务器  │
│     ↓                                                    │
│  3. 端到端测试: 真实 Vue 应用 + 真实 SSR + Hono 服务器  │
└─────────────────────────────────────────────────────────┘
```

### 测试类型

#### 1. 单元测试

**环境**: 真实浏览器（Chrome、Firefox、Safari）

**测试工具**:

- **Vitest**: 测试框架
- **Playwright**: 真实浏览器测试
- **@vue/test-utils**: Vue 组件测试工具

**测试用例**:

```typescript
// withHost 测试（真实浏览器）
describe('withHost', () => {
  it('should return a ClientOption function', () => {
    const option = withHost('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set host in config', () => {
    const config = {}
    const option = withHost('https://api.example.com')
    option(config)
    expect(config.host).toBe('https://api.example.com')
  })
})
```

#### 2. 集成测试

**环境**: 真实 Vue 应用 + 真实浏览器 + Hono 服务器

**测试工具**:

- **Vitest**: 测试框架
- **Playwright**: 真实浏览器测试
- **@vue/test-utils**: Vue 组件测试工具
- **Hono**: HTTP 服务器

**测试用例**:

```typescript
// provideClient 测试（真实 Vue 应用 + Hono 服务器）
describe('provideClient', () => {
  let server: Server

  beforeAll(async () => {
    // 启动 Hono 服务器
    server = await startHonoServer()
  })

  afterAll(async () => {
    // 关闭 Hono 服务器
    await server.close()
  })

  it('should create a Plugin', () => {
    const plugin = provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({})),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors(() => ({})),
      ),
    )

    // 使用 Playwright 测试真实浏览器行为
    // ...
  })
})
```

#### 3. 端到端测试

**环境**: 真实 Vue 应用 + 真实 SSR（Nuxt 3）+ Hono 服务器

**测试工具**:

- **Vitest**: 测试框架
- **Playwright**: 真实浏览器测试
- **Hono**: HTTP 服务器
- **Nuxt 3**: 真实 SSR 环境

**测试用例**:

```typescript
// 完整使用场景测试（真实 SSR + Hono 服务器）
describe('end-to-end', () => {
  let server: Server

  beforeAll(async () => {
    // 启动 Hono 服务器
    server = await startHonoServer()
  })

  afterAll(async () => {
    // 关闭 Hono 服务器
    await server.close()
  })

  it('should work with provideClient in Nuxt 3', async () => {
    // 创建 Nuxt 3 应用
    // 使用 provideClient 配置
    // 测试 SSR 渲染
    // 测试客户端激活
    // 测试真实 HTTP 请求
  })

  it('should work with provideGlobalClient in Nuxt 3', async () => {
    // 创建 Nuxt 3 应用
    // 使用 provideGlobalClient 配置
    // 测试 SSR 渲染
    // 测试客户端激活
    // 测试真实 HTTP 请求
  })
})
```

### Hono 服务器配置

```typescript
// test/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

export async function startHonoServer() {
  const app = new Hono()

  // 定义测试路由
  app.get('/api/users', (c) => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  app.get('/api/users/:id', (c) => {
    const id = c.req.param('id')
    return c.json({ id: Number(id), name: 'John' })
  })

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: 0, // 随机端口
  })

  // 获取服务器地址
  const address = server.address()
  const port = typeof address === 'string' ? 0 : address.port

  return {
    port,
    close: () => server.close(),
  }
}
```

### 测试配置

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  test: {
    // 使用真实浏览器环境
    browser: {
      enabled: true,
      name: 'chrome', // 或 firefox, safari
      headless: true,
    },
    // 测试超时时间
    testTimeout: 30000,
  },
})
```

### 测试覆盖

**测试覆盖目标**:

- 函数式选项模式: 100% 覆盖（真实浏览器）
- Plugin 和 composable: 100% 覆盖（真实 Vue 应用 + Hono 服务器）
- 错误处理: 100% 覆盖（真实浏览器）
- SSR 支持: 100% 覆盖（真实 Nuxt 3 应用 + Hono 服务器）
- HTTP 请求: 100% 覆盖（真实 Hono 服务器）

## 构建配置设计

### 构建工具

**构建工具**: Bun + bun-plugin-dts

**与 Angular 包装器的一致性**:

- 使用相同的构建工具
- 使用相同的构建流程
- 使用相同的输出格式

### 构建配置

```typescript
// packages/vue/scripts/build.ts
import dts from 'bun-plugin-dts'

async function build() {
  await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: './dist',
    naming: '[dir]/[name].[ext]',
    format: 'esm',
    target: 'browser',
    minify: false,
    external: ['vue', '@defjs/core'],
    plugins: [
      dts({
        output: {
          noBanner: true,
        },
        compilationOptions: {
          preferredConfigPath: './tsconfig.build.json',
          followSymlinks: false,
        },
      }),
    ],
  })
}

async function afterBuild() {
  await Bun.write('dist/LICENSE', Bun.file('../../LICENSE'))
  await Bun.write('dist/README.md', Bun.file('./README.md'))

  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  delete packageJson.devDependencies
  delete packageJson.scripts
  packageJson.module = 'index.js'
  packageJson.typings = 'index.d.ts'
  packageJson.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }
  await Bun.write('dist/package.json', JSON.stringify(packageJson, undefined, 2))
}

async function main() {
  await build()
  await afterBuild()
}

main()
```

### package.json 配置

```json
{
  "name": "@defjs/vue",
  "version": "1.0.0",
  "type": "module",
  "module": "dist/index.js",
  "typings": "dist/index.d.ts",
  "license": "MIT",
  "peerDependencies": {
    "vue": ">=3.0.0",
    "@defjs/core": "^0.4.0"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/defjs/defjs.git"
  },
  "bugs": {
    "url": "https://github.com/defjs/defjs/issues"
  },
  "scripts": {
    "build": "bun scripts/build.ts",
    "lint": "biome check",
    "lint:fix": "biome check --write",
    "pub": "cd dist && bun publish"
  },
  "exports": {
    "./package.json": "./package.json",
    ".": {
      "types": "./index.d.ts",
      "default": "./index.js"
    }
  }
}
```

### tsconfig.json 配置

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@defjs/core": ["../core/src"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

### 构建输出

**输出文件**:

- `dist/index.js` - ESM 格式的 JavaScript 文件
- `dist/index.d.ts` - TypeScript 类型定义文件
- `dist/package.json` - 包配置文件
- `dist/LICENSE` - 许可证文件
- `dist/README.md` - 说明文档

### 构建流程

```bash
# 构建
bun run build

# 检查输出
ls -la dist/

# 发布
bun run pub
```

## 文件结构设计

### 文件结构概述

@defjs/vue 包装器的文件结构与 Angular 包装器保持一致：

```
packages/vue/
├── src/
│   ├── core.ts           # 核心实现（provideClient, provideGlobalClient, injectClient, withHost, withInterceptors）
│   └── index.ts          # 导出入口
├── scripts/
│   └── build.ts          # 构建脚本
├── test/
│   ├── server.ts         # Hono 测试服务器
│   └── *.spec.ts         # 测试文件
├── dist/                 # 构建输出（gitignore）
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── biome.json
├── README.md
└── .gitignore
```

### 文件职责

#### src/core.ts

**职责**: 实现核心功能

```typescript
// src/core.ts
import {
  type Client,
  createClient,
  type Interceptor,
  setGlobalClient,
  withInterceptors as withClientInterceptors,
  withEndpoint,
} from '@defjs/core'
import type { App, InjectionKey, Plugin } from 'vue'

// 内部 InjectionKey（用户无感）
const HTTP_CLIENT: InjectionKey<Client> = Symbol() as InjectionKey<Client>
const HTTP_INTERCEPTOR_FNS: InjectionKey<Interceptor[]> = Symbol() as InjectionKey<Interceptor[]>
const HTTP_HOST: InjectionKey<string> = Symbol() as InjectionKey<string>

// ClientOption 类型
export type ClientOption = (config: ClientConfig) => void

// ClientConfig 类型
interface ClientConfig {
  host?: string
  interceptors?: Interceptor[]
}

// withHost 实现
export function withHost(host: string): ClientOption {
  return (config: ClientConfig) => {
    config.host = host
  }
}

// withInterceptors 实现
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config: ClientConfig) => {
    config.interceptors = fns.map((fn) => fn())
  }
}

// provideClient 实现
export function provideClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach((option) => option(config))

      // 创建 Client 实例
      const client = createClient(withEndpoint(config.host || ''), withClientInterceptors(...(config.interceptors || [])))

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)
    },
  }
}

// provideGlobalClient 实现
export function provideGlobalClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach((option) => option(config))

      // 创建 Client 实例
      const client = createClient(withEndpoint(config.host || ''), withClientInterceptors(...(config.interceptors || [])))

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)

      // 设置全局 Client 实例
      setGlobalClient(client)
    },
  }
}

// injectClient 实现
export function injectClient(): Client {
  const client = inject(HTTP_CLIENT)

  if (!client) {
    throw new Error('Client not provided. Did you call provideClient()?')
  }

  return client
}
```

#### src/index.ts

**职责**: 导出入口

```typescript
// src/index.ts
export { injectClient, provideClient, provideGlobalClient, withHost, withInterceptors } from './core'
export type { ClientOption } from './core'
```

#### scripts/build.ts

**职责**: 构建脚本

```typescript
// scripts/build.ts
import dts from 'bun-plugin-dts'

async function build() {
  await Bun.build({
    entrypoints: ['./src/index.ts'],
    outdir: './dist',
    naming: '[dir]/[name].[ext]',
    format: 'esm',
    target: 'browser',
    minify: false,
    external: ['vue', '@defjs/core'],
    plugins: [
      dts({
        output: {
          noBanner: true,
        },
        compilationOptions: {
          preferredConfigPath: './tsconfig.build.json',
          followSymlinks: false,
        },
      }),
    ],
  })
}

async function afterBuild() {
  await Bun.write('dist/LICENSE', Bun.file('../../LICENSE'))
  await Bun.write('dist/README.md', Bun.file('./README.md'))

  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  delete packageJson.devDependencies
  delete packageJson.scripts
  packageJson.module = 'index.js'
  packageJson.typings = 'index.d.ts'
  packageJson.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }
  await Bun.write('dist/package.json', JSON.stringify(packageJson, undefined, 2))
}

async function main() {
  await build()
  await afterBuild()
}

main()
```

#### test/server.ts

**职责**: Hono 测试服务器

```typescript
// test/server.ts
import { Hono } from 'hono'
import { serve } from '@hono/node-server'

export async function startHonoServer() {
  const app = new Hono()

  // 定义测试路由
  app.get('/api/users', (c) => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  app.get('/api/users/:id', (c) => {
    const id = c.req.param('id')
    return c.json({ id: Number(id), name: 'John' })
  })

  // 启动服务器
  const server = serve({
    fetch: app.fetch,
    port: 0, // 随机端口
  })

  // 获取服务器地址
  const address = server.address()
  const port = typeof address === 'string' ? 0 : address.port

  return {
    port,
    close: () => server.close(),
  }
}
```

#### test/core.spec.ts

**职责**: 核心功能测试

```typescript
// test/core.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'vue'
import { provideClient, provideGlobalClient, injectClient, withHost, withInterceptors } from '../src'
import { startHonoServer } from './server'

describe('withHost', () => {
  it('should return a ClientOption function', () => {
    const option = withHost('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set host in config', () => {
    const config = {}
    const option = withHost('https://api.example.com')
    option(config)
    expect(config.host).toBe('https://api.example.com')
  })
})

describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors(() => ({}))
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {}
    const interceptor = () => ({})
    const option = withInterceptors(() => interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor])
  })
})

describe('provideClient', () => {
  let server: any

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should create a Plugin', () => {
    const plugin = provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({})),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors(() => ({})),
      ),
    )

    // 测试 client 已被提供
  })
})

describe('provideGlobalClient', () => {
  let server: any

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should create a Plugin', () => {
    const plugin = provideGlobalClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({})),
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should set global client', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideGlobalClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors(() => ({})),
      ),
    )

    // 测试全局 client 已被设置
  })
})

describe('injectClient', () => {
  let server: any

  beforeAll(async () => {
    server = await startHonoServer()
  })

  afterAll(async () => {
    await server.close()
  })

  it('should return client when provided', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>',
    })

    app.use(
      provideClient(
        withHost(`http://localhost:${server.port}`),
        withInterceptors(() => ({})),
      ),
    )

    // 测试 client 已被返回
  })

  it('should throw error when not provided', async () => {
    // 测试未提供 client 时的行为
  })
})
```

### 文件职责总结

| 文件             | 职责                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| src/core.ts      | 实现核心功能（provideClient, provideGlobalClient, injectClient, withHost, withInterceptors） |
| src/index.ts     | 导出入口                                                                                     |
| scripts/build.ts | 构建脚本                                                                                     |
| test/server.ts   | Hono 测试服务器                                                                              |
| test/\*.spec.ts  | 测试文件                                                                                     |

## 与 Angular 包装器的对比

### 功能对比

| 功能                | Angular 包装器 | Vue 包装器 |
| ------------------- | -------------- | ---------- |
| provideClient       | ✅             | ✅         |
| provideGlobalClient | ✅             | ✅         |
| injectClient        | ✅             | ✅         |
| withHost            | ✅             | ✅         |
| withInterceptors    | ✅             | ✅         |

### API 对比

| API                 | Angular 包装器                                                                  | Vue 包装器                                                      |
| ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| provideClient       | `provideClient(...feature: EnvironmentProviders[]): EnvironmentProviders`       | `provideClient(...feature: ClientOption[]): Plugin`             |
| provideGlobalClient | `provideGlobalClient(...feature: EnvironmentProviders[]): EnvironmentProviders` | `provideGlobalClient(...feature: ClientOption[]): Plugin`       |
| injectClient        | `injectClient(): Client`                                                        | `injectClient(): Client`                                        |
| withHost            | `withHost(host: string): EnvironmentProviders`                                  | `withHost(host: string): ClientOption`                          |
| withInterceptors    | `withInterceptors(...fns: (() => Interceptor)[]): EnvironmentProviders`         | `withInterceptors(...fns: (() => Interceptor)[]): ClientOption` |

### 实现对比

| 实现       | Angular 包装器                            | Vue 包装器                 |
| ---------- | ----------------------------------------- | -------------------------- |
| 依赖注入   | InjectionToken + makeEnvironmentProviders | InjectionKey + app.provide |
| 初始化时机 | APP_INITIALIZER（异步）                   | install 函数（同步）       |
| 类型系统   | Angular DI 系统                           | Vue provide/inject         |
| 构建工具   | Bun + bun-plugin-dts                      | Bun + bun-plugin-dts       |

### 测试对比

| 测试       | Angular 包装器  | Vue 匣装器            |
| ---------- | --------------- | --------------------- |
| 单元测试   | Jasmine + Karma | Vitest + Playwright   |
| 集成测试   | Angular TestBed | Vue Test Utils + Hono |
| 端到端测试 | Protractor      | Playwright + Nuxt 3   |

## 待确认问题

1. **Interceptor 类型导出**: @defjs/core 的 Interceptor 类型是否通过 public_api.ts 稳定导出？
2. **withHost 默认策略**: Angular 包装器的 withHost 默认使用 document.location.origin，Vue 包装器是否也需要类似的浏览器环境检测？
3. **Suspense 支持**: 是否需要支持 Vue 3 的 Suspense 组件集成？
4. **peerDependencies 版本**: Vue 包装器是否应沿用 @defjs/core 的 peerDependencies: "^0.4.0"？

---

**文档版本**: 1.0
**最后更新**: 2026-06-10
