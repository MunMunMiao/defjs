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
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'

const app = createApp(App)

// 提供 Client 实例
app.use(provideClient(withEndpoint('https://api.example.com'), withInterceptors(authInterceptor, loggingInterceptor)))
```

```typescript
// 组件中使用
import { injectClient } from '@defjs/vue'
import { getUser } from './api'

const client = injectClient() // 返回 Client 实例
const [error, user] = await client.execute(getUser())
```

## API

### provideClient(...feature: ClientOption[]): Plugin

创建一个 Plugin，用于提供 Client 实例。

### injectClient(): Client

获取注入的 Client 实例。

### withEndpoint(endpoint: string): ClientOption

配置 HTTP endpoint。

### withInterceptors(...fns: (() => Interceptor)[]): ClientOption

配置拦截器。

## 许可证

MIT
