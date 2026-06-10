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
