# @defjs/vue 设计方案

## 背景和目标

### 背景

当前 `@defjs/core` 已经提供了核心的 HTTP 客户端功能，并且已经有了 Angular 的包装器 `@defjs/angular`。为了支持更广泛的前端框架生态，需要为 Vue 3 创建一个官方的包装器。

### 目标

1. 为 Vue 3+ 提供 `@defjs/core` 的官方集成
2. 保持与 Angular 版本相似的 API 设计风格
3. 充分利用 Vue 3 Composition API 的特性
4. 提供完整的 TypeScript 类型支持
5. 支持 Vue 3 的依赖注入机制（provide/inject）

## 技术方案详细设计

### 1. 包结构设计

```
packages/vue/
├── src/
│   ├── index.ts              # 主入口文件
│   ├── plugin.ts             # Vue 插件定义
│   ├── composable.ts         # Composition API hooks
│   └── types.ts              # TypeScript 类型定义
├── dist/                     # 构建输出目录
├── scripts/
│   └── build.ts              # 构建脚本
├── package.json              # 包配置
├── tsconfig.json             # TypeScript 配置
├── tsconfig.build.json       # 构建专用 TypeScript 配置
├── biome.json                # 代码风格配置
└── README.md                 # 文档
```

### 2. 核心模块设计

#### 2.1 plugin.ts - Vue 插件定义

```typescript
import type { App, InjectionKey } from 'vue'
import { createClient, setGlobalClient, withInterceptors as withClientInterceptors, withEndpoint } from '@defjs/core'
import type { Client, Interceptor } from '@defjs/core'

// InjectionKey 定义
export const ClientKey: InjectionKey<Client> = Symbol('defjs-client')
export const InterceptorsKey: InjectionKey<Interceptor[]> = Symbol('defjs-interceptors')
export const HostKey: InjectionKey<string> = Symbol('defjs-host')

// 插件选项接口
export interface DefjsPluginOptions {
  host?: string
  interceptors?: (() => Interceptor)[]
  global?: boolean
}

// Vue 插件
export const DefjsPlugin = {
  install(app: App, options: DefjsPluginOptions = {}) {
    const { host = '', interceptors = [], global = false } = options

    // 创建拦截器实例
    const interceptorInstances = interceptors.map((fn) => fn())

    // 提供拦截器
    app.provide(InterceptorsKey, interceptorInstances)

    // 提供主机地址
    if (host) {
      app.provide(HostKey, host)
    }

    // 创建客户端
    const client = createClient(withEndpoint(host), withClientInterceptors(...interceptorInstances))

    // 提供客户端
    app.provide(ClientKey, client)

    // 如果需要全局客户端
    if (global) {
      setGlobalClient(client)
    }
  },
}
```

#### 2.2 composable.ts - Composition API hooks

```typescript
import { inject } from 'vue'
import type { Client, Interceptor } from '@defjs/core'
import { ClientKey, InterceptorsKey, HostKey } from './plugin'

/**
 * 获取 defjs 客户端实例
 * 必须在 setup() 或 <script setup> 中使用
 */
export function useClient(): Client {
  const client = inject(ClientKey)
  if (!client) {
    throw new Error('useClient() 必须在 DefjsPlugin 安装后使用。' + '请确保在应用中使用 app.use(DefjsPlugin)')
  }
  return client
}

/**
 * 获取当前配置的拦截器列表
 */
export function useInterceptors(): Interceptor[] {
  const interceptors = inject(InterceptorsKey, [])
  return interceptors
}

/**
 * 获取当前配置的主机地址
 */
export function useHost(): string {
  const host = inject(HostKey, '')
  return host
}
```

#### 2.3 types.ts - TypeScript 类型定义

```typescript
import type { InjectionKey } from 'vue'
import type { Client, Interceptor } from '@defjs/core'

// 插件选项类型
export interface DefjsPluginOptions {
  host?: string
  interceptors?: (() => Interceptor)[]
  global?: boolean
}

// InjectionKey 类型
export type ClientInjectionKey = InjectionKey<Client>
export type InterceptorsInjectionKey = InjectionKey<Interceptor[]>
export type HostInjectionKey = InjectionKey<string>

// Composable 返回类型
export interface UseClientReturn {
  client: Client
}

export interface UseInterceptorsReturn {
  interceptors: Interceptor[]
}

export interface UseHostReturn {
  host: string
}
```

#### 2.4 index.ts - 主入口文件

```typescript
// 插件导出
export { DefjsPlugin, ClientKey, InterceptorsKey, HostKey } from './plugin'
export type { DefjsPluginOptions } from './plugin'

// Composable 导出
export { useClient, useInterceptors, useHost } from './composable'

// 类型导出
export type {
  ClientInjectionKey,
  InterceptorsInjectionKey,
  HostInjectionKey,
  UseClientReturn,
  UseInterceptorsReturn,
  UseHostReturn,
} from './types'

// 从 core 导出常用类型
export type { Client, Interceptor } from '@defjs/core'
```

### 3. 构建配置

#### 3.1 package.json

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

#### 3.2 tsconfig.json

```json
{
  "compileOnSave": false,
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "noEmit": false,
    "emitDeclarationOnly": false,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "strict": true,
    "strictNullChecks": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*.ts"]
}
```

#### 3.3 tsconfig.build.json

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src/**/*.ts"]
}
```

#### 3.4 scripts/build.ts

```typescript
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

### 4. 使用示例

#### 4.1 基本使用

```typescript
// main.ts
import { createApp } from 'vue'
import { DefjsPlugin } from '@defjs/vue'
import App from './App.vue'

const app = createApp(App)

app.use(DefjsPlugin, {
  host: 'https://api.example.com',
  interceptors: [
    // 添加拦截器
  ],
  global: true, // 设置为全局客户端
})

app.mount('#app')
```

#### 4.2 在组件中使用

```vue
<script setup lang="ts">
import { useClient } from '@defjs/vue'

const client = useClient()

// 使用客户端
const fetchData = async () => {
  const response = await client.get('/api/data')
  // 处理响应
}
</script>

<template>
  <button @click="fetchData">获取数据</button>
</template>
```

#### 4.3 带拦截器的使用

```typescript
// main.ts
import { DefjsPlugin } from '@defjs/vue'
import { createHttpInterceptor } from '@defjs/core'

// 定义拦截器
const authInterceptor = () =>
  createHttpInterceptor(async (req, next) => {
    const token = localStorage.getItem('token')
    if (token) {
      req.headers.set('Authorization', `Bearer ${token}`)
    }
    return next(req)
  })

app.use(DefjsPlugin, {
  host: 'https://api.example.com',
  interceptors: [authInterceptor],
  global: true,
})
```

## 与 Angular 版本的对比

| 特性       | Angular 版本                | Vue 版本                          |
| ---------- | --------------------------- | --------------------------------- |
| 依赖注入   | Angular DI (InjectionToken) | Vue provide/inject (InjectionKey) |
| 客户端创建 | makeEnvironmentProviders    | Vue 插件 (app.use)                |
| 全局客户端 | APP_INITIALIZER             | 插件选项 global: true             |
| 拦截器     | multi: true 的 provider     | 插件选项数组                      |
| 组件使用   | inject(HTTP_CLIENT)         | useClient() composable            |
| 主机配置   | withHost()                  | 插件选项 host                     |

## 实现步骤

### 阶段一：基础架构搭建

1. 创建 packages/vue 目录结构
2. 配置 package.json, tsconfig.json 等基础文件
3. 实现基本的插件框架

### 阶段二：核心功能实现

1. 实现 plugin.ts（插件定义）
2. 实现 composable.ts（Composition API hooks）
3. 实现 types.ts（类型定义）
4. 实现 index.ts（主入口）

### 阶段三：构建和测试

1. 实现 build.ts 构建脚本
2. 配置 biome.json 代码风格
3. 编写 README.md 文档
4. 测试构建流程

### 阶段四：完善和优化

1. 添加单元测试
2. 优化 TypeScript 类型推断
3. 完善文档和示例
4. 发布到 npm

## 风险评估

### 技术风险

1. **Vue 版本兼容性**：需要支持 Vue 3.0+，包括最新的 Vue 3.4/3.5 特性
2. **TypeScript 类型推断**：InjectionKey 的泛型类型推断可能在某些边缘情况下不准确
3. **构建工具兼容性**：需要确保 bun-plugin-dts 正确生成 Vue 相关的类型定义

### 解决方案

1. 使用 peerDependencies 声明 Vue 版本要求
2. 充分测试 TypeScript 类型推断，参考 Angular 版本的实现
3. 参考 Angular 版本的构建配置，确保一致性

### 时间估算

- 阶段一：1-2 小时
- 阶段二：2-3 小时
- 阶段三：1-2 小时
- 阶段四：2-3 小时
- **总计：6-10 小时**

## 总结

本设计方案为 `@defjs/core` 提供了 Vue 3 的官方包装器，采用了与 Angular 版本相似的设计理念，同时充分利用了 Vue 3 Composition API 的特性。通过提供 Vue 插件和 Composition API hooks，使得在 Vue 3 应用中使用 defjs 变得简单直观。

该方案具有以下优势：

1. **类型安全**：完整的 TypeScript 类型支持
2. **易于使用**：符合 Vue 3 开发习惯的 API 设计
3. **灵活配置**：支持多种配置方式
4. **可扩展性**：易于添加新功能和拦截器

建议按照实现步骤逐步推进，确保每个阶段的质量和稳定性。
