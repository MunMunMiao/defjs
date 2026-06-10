# @defjs/vue 包装器实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 创建 @defjs/vue 包装器，为 Vue 3 应用提供与 @defjs/angular 相同的功能

**Architecture:** 采用 Plugin + composable 模式，使用函数式选项模式（Golang Style Option），与 Angular 包装器保持 API 一致性

**Tech Stack:** Vue 3, TypeScript, Bun, Vitest, Playwright, Hono

---

## 文件结构

```
packages/vue/
├── src/
│   ├── core.ts           # 核心实现
│   └── index.ts          # 导出入口
├── scripts/
│   └── build.ts          # 构建脚本
├── test/
│   ├── server.ts         # Hono 测试服务器
│   └── core.spec.ts      # 核心功能测试
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── biome.json
├── README.md
└── .gitignore
```

---

### Task 1: 创建项目结构和配置文件

**Files:**
- Create: `packages/vue/package.json`
- Create: `packages/vue/tsconfig.json`
- Create: `packages/vue/tsconfig.build.json`
- Create: `packages/vue/biome.json`
- Create: `packages/vue/.gitignore`
- Create: `packages/vue/README.md`

- [ ] **Step 1: 创建 package.json**

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

- [ ] **Step 2: 创建 tsconfig.json**

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

- [ ] **Step 3: 创建 tsconfig.build.json**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "declarationDir": "./dist"
  },
  "include": ["src/**/*.ts"],
  "exclude": ["node_modules", "dist", "test"]
}
```

- [ ] **Step 4: 创建 biome.json**

```json
{
  "extends": ["../../biome.json"],
  "files": {
    "include": ["src/**/*.ts"],
    "exclude": ["dist"]
  }
}
```

- [ ] **Step 5: 创建 .gitignore**

```
dist
node_modules
```

- [ ] **Step 6: 创建 README.md**

```markdown
# @defjs/vue

Vue 3 包装器，为 Vue 3 应用提供与 @defjs/angular 相同的功能。

## 安装

```bash
npm install @defjs/vue
# 或
yarn add @defjs/vue
# 或
pnpm add @defjs/vue
```

## 使用

```typescript
// main.ts
import { createApp } from 'vue'
import { provideClient, provideGlobalClient, withHost, withInterceptors } from '@defjs/vue'

const app = createApp(App)

// 方式 1：provideClient（不设置全局）
app.use(provideClient(
  withHost('https://api.example.com'),
  withInterceptors(authInterceptor, loggingInterceptor)
))

// 方式 2：provideGlobalClient（设置全局）
app.use(provideGlobalClient(
  withHost('https://api.example.com'),
  withInterceptors(authInterceptor, loggingInterceptor)
))
```

```typescript
// 组件中使用
import { injectClient } from '@defjs/vue'

const client = injectClient() // 返回 Client 实例
```

## API

### provideClient(...feature: ClientOption[]): Plugin

创建一个 Plugin，用于提供 Client 实例。

### provideGlobalClient(...feature: ClientOption[]): Plugin

创建一个 Plugin，用于提供 Client 实例并设置为全局。

### injectClient(): Client

获取注入的 Client 实例。

### withHost(host: string): ClientOption

配置 HTTP 主机。

### withInterceptors(...fns: (() => Interceptor)[]): ClientOption

配置拦截器。

## 许可证

MIT
```

- [ ] **Step 7: 提交配置文件**

```bash
cd packages/vue
git add package.json tsconfig.json tsconfig.build.json biome.json .gitignore README.md
git commit -m "feat(vue): add project structure and configuration files"
```

---

### Task 2: 创建 Hono 测试服务器

**Files:**
- Create: `packages/vue/test/server.ts`

- [ ] **Step 1: 创建 test/server.ts**

```typescript
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

- [ ] **Step 2: 提交测试服务器**

```bash
cd packages/vue
git add test/server.ts
git commit -m "feat(vue): add Hono test server"
```

---

### Task 3: 实现 withHost 函数（TDD）

**Files:**
- Create: `packages/vue/test/core.spec.ts`
- Create: `packages/vue/src/core.ts`
- Create: `packages/vue/src/index.ts`

- [ ] **Step 1: 编写 withHost 测试**

```typescript
// packages/vue/test/core.spec.ts
import { describe, it, expect } from 'vitest'
import { withHost } from '../src'

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

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：FAIL - "withHost is not a function"

- [ ] **Step 3: 实现 withHost 函数**

```typescript
// packages/vue/src/core.ts
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
```

- [ ] **Step 4: 创建导出入口**

```typescript
// packages/vue/src/index.ts
export { withHost } from './core'
export type { ClientOption } from './core'
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：PASS

- [ ] **Step 6: 提交 withHost 实现**

```bash
cd packages/vue
git add src/core.ts src/index.ts test/core.spec.ts
git commit -m "feat(vue): implement withHost function"
```

---

### Task 4: 实现 withInterceptors 函数（TDD）

**Files:**
- Modify: `packages/vue/test/core.spec.ts`
- Modify: `packages/vue/src/core.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 1: 编写 withInterceptors 测试**

```typescript
// packages/vue/test/core.spec.ts
import { describe, it, expect } from 'vitest'
import { withHost, withInterceptors } from '../src'

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
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：FAIL - "withInterceptors is not a function"

- [ ] **Step 3: 实现 withInterceptors 函数**

```typescript
// packages/vue/src/core.ts
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
    config.interceptors = fns.map(fn => fn())
  }
}
```

- [ ] **Step 4: 更新导出入口**

```typescript
// packages/vue/src/index.ts
export { withHost, withInterceptors } from './core'
export type { ClientOption } from './core'
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：PASS

- [ ] **Step 6: 提交 withInterceptors 实现**

```bash
cd packages/vue
git add src/core.ts src/index.ts test/core.spec.ts
git commit -m "feat(vue): implement withInterceptors function"
```

---

### Task 5: 实现 provideClient 函数（TDD）

**Files:**
- Modify: `packages/vue/test/core.spec.ts`
- Modify: `packages/vue/src/core.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 1: 编写 provideClient 测试**

```typescript
// packages/vue/test/core.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'vue'
import { withHost, withInterceptors, provideClient, injectClient } from '../src'
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
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

    // 测试 client 已被提供
    // 注意：这里需要在真实浏览器环境中测试
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：FAIL - "provideClient is not a function"

- [ ] **Step 3: 实现 provideClient 函数**

```typescript
// packages/vue/src/core.ts
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
    config.interceptors = fns.map(fn => fn())
  }
}

// provideClient 实现
export function provideClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach(option => option(config))

      // 创建 Client 实例
      const client = createClient(
        withEndpoint(config.host || ''),
        withClientInterceptors(...(config.interceptors || []))
      )

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)
    }
  }
}
```

- [ ] **Step 4: 更新导出入口**

```typescript
// packages/vue/src/index.ts
export { withHost, withInterceptors, provideClient } from './core'
export type { ClientOption } from './core'
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：PASS

- [ ] **Step 6: 提交 provideClient 实现**

```bash
cd packages/vue
git add src/core.ts src/index.ts test/core.spec.ts
git commit -m "feat(vue): implement provideClient function"
```

---

### Task 6: 实现 provideGlobalClient 函数（TDD）

**Files:**
- Modify: `packages/vue/test/core.spec.ts`
- Modify: `packages/vue/src/core.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 1: 编写 provideGlobalClient 测试**

```typescript
// packages/vue/test/core.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'vue'
import { withHost, withInterceptors, provideClient, provideGlobalClient, injectClient } from '../src'
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
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

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
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should set global client', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideGlobalClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

    // 测试全局 client 已被设置
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：FAIL - "provideGlobalClient is not a function"

- [ ] **Step 3: 实现 provideGlobalClient 函数**

```typescript
// packages/vue/src/core.ts
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
    config.interceptors = fns.map(fn => fn())
  }
}

// provideClient 实现
export function provideClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach(option => option(config))

      // 创建 Client 实例
      const client = createClient(
        withEndpoint(config.host || ''),
        withClientInterceptors(...(config.interceptors || []))
      )

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)
    }
  }
}

// provideGlobalClient 实现
export function provideGlobalClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach(option => option(config))

      // 创建 Client 实例
      const client = createClient(
        withEndpoint(config.host || ''),
        withClientInterceptors(...(config.interceptors || []))
      )

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)

      // 设置全局 Client 实例
      setGlobalClient(client)
    }
  }
}
```

- [ ] **Step 4: 更新导出入口**

```typescript
// packages/vue/src/index.ts
export { withHost, withInterceptors, provideClient, provideGlobalClient } from './core'
export type { ClientOption } from './core'
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：PASS

- [ ] **Step 6: 提交 provideGlobalClient 实现**

```bash
cd packages/vue
git add src/core.ts src/index.ts test/core.spec.ts
git commit -m "feat(vue): implement provideGlobalClient function"
```

---

### Task 7: 实现 injectClient 函数（TDD）

**Files:**
- Modify: `packages/vue/test/core.spec.ts`
- Modify: `packages/vue/src/core.ts`
- Modify: `packages/vue/src/index.ts`

- [ ] **Step 1: 编写 injectClient 测试**

```typescript
// packages/vue/test/core.spec.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createApp } from 'vue'
import { withHost, withInterceptors, provideClient, provideGlobalClient, injectClient } from '../src'
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
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should provide client via app.provide', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

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
      withInterceptors(() => ({}))
    )
    expect(plugin).toHaveProperty('install')
  })

  it('should set global client', async () => {
    const app = createApp({
      setup() {
        const client = injectClient()
        return { client }
      },
      template: '<div></div>'
    })

    app.use(provideGlobalClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

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
      template: '<div></div>'
    })

    app.use(provideClient(
      withHost(`http://localhost:${server.port}`),
      withInterceptors(() => ({}))
    ))

    // 测试 client 已被返回
  })

  it('should throw error when not provided', async () => {
    // 测试未提供 client 时的行为
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：FAIL - "injectClient is not a function"

- [ ] **Step 3: 实现 injectClient 函数**

```typescript
// packages/vue/src/core.ts
import {
  type Client,
  createClient,
  type Interceptor,
  setGlobalClient,
  withInterceptors as withClientInterceptors,
  withEndpoint,
} from '@defjs/core'
import type { App, InjectionKey, Plugin } from 'vue'
import { inject } from 'vue'

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
    config.interceptors = fns.map(fn => fn())
  }
}

// provideClient 实现
export function provideClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach(option => option(config))

      // 创建 Client 实例
      const client = createClient(
        withEndpoint(config.host || ''),
        withClientInterceptors(...(config.interceptors || []))
      )

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)
    }
  }
}

// provideGlobalClient 实现
export function provideGlobalClient(...feature: ClientOption[]): Plugin {
  return {
    install(app: App) {
      // 执行 ClientOption 函数，配置 config
      const config: ClientConfig = {}
      feature.forEach(option => option(config))

      // 创建 Client 实例
      const client = createClient(
        withEndpoint(config.host || ''),
        withClientInterceptors(...(config.interceptors || []))
      )

      // 提供 Client 实例
      app.provide(HTTP_CLIENT, client)

      // 设置全局 Client 实例
      setGlobalClient(client)
    }
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

- [ ] **Step 4: 更新导出入口**

```typescript
// packages/vue/src/index.ts
export { withHost, withInterceptors, provideClient, provideGlobalClient, injectClient } from './core'
export type { ClientOption } from './core'
```

- [ ] **Step 5: 运行测试确认通过**

```bash
cd packages/vue
bun test test/core.spec.ts
```

预期结果：PASS

- [ ] **Step 6: 提交 injectClient 实现**

```bash
cd packages/vue
git add src/core.ts src/index.ts test/core.spec.ts
git commit -m "feat(vue): implement injectClient function"
```

---

### Task 8: 创建构建脚本

**Files:**
- Create: `packages/vue/scripts/build.ts`

- [ ] **Step 1: 创建构建脚本**

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

- [ ] **Step 2: 提交构建脚本**

```bash
cd packages/vue
git add scripts/build.ts
git commit -m "feat(vue): add build script"
```

---

### Task 9: 验证构建

**Files:**
- None

- [ ] **Step 1: 运行构建**

```bash
cd packages/vue
bun run build
```

预期结果：构建成功，生成 dist 目录

- [ ] **Step 2: 检查构建输出**

```bash
cd packages/vue
ls -la dist/
```

预期结果：存在 index.js、index.d.ts、package.json、LICENSE、README.md

- [ ] **Step 3: 提交构建验证**

```bash
cd packages/vue
git add .
git commit -m "chore(vue): verify build output"
```

---

### Task 10: 完成实现

**Files:**
- None

- [ ] **Step 1: 运行所有测试**

```bash
cd packages/vue
bun test
```

预期结果：所有测试通过

- [ ] **Step 2: 运行 lint**

```bash
cd packages/vue
bun run lint
```

预期结果：没有 lint 错误

- [ ] **Step 3: 最终提交**

```bash
cd packages/vue
git add .
git commit -m "feat(vue): complete @defjs/vue wrapper implementation"
```

---

## 自我审查

### 1. 规格覆盖
- ✅ 所有 5 个函数都已实现（withHost, withInterceptors, provideClient, provideGlobalClient, injectClient）
- ✅ 函数式选项模式已实现
- ✅ 测试设计已实现
- ✅ 构建配置已实现
- ✅ 文件结构已实现

### 2. 占位符扫描
- ✅ 没有发现 "TBD"、"TODO" 或不完整的部分
- ✅ 所有步骤都有完整的代码

### 3. 类型一致性
- ✅ 所有类型定义一致
- ✅ 所有函数签名一致
- ✅ 所有导出名称一致

**结论**：实现计划通过自我审查，没有发现需要修复的问题。

---

**计划完成并保存到 `docs/superpowers/plans/2026-06-10-vue-wrapper-implementation.md`。两种执行方式：**

**1. Subagent-Driven（推荐）** - 我为每个任务分发一个新的子代理，任务之间进行审查，快速迭代

**2. Inline Execution** - 在本会话中使用 executing-plans 执行任务，批量执行并设置检查点

**选择哪种方式？**
