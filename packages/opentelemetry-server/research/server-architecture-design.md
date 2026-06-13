# 服务端 OpenTelemetry Instrumentation 架构设计

## 目标

设计 `@defjs/opentelemetry-server` 的架构，使其：

- 能力对齐 `@elysia/opentelemetry`
- 框架无关（核心不绑定任何服务端框架）
- 只依赖 `@opentelemetry/api`（不依赖 SDK）
- 支持 Elysia（第一优先级）、Hono、Express 等框架通过 adapter 接入

---

## 1. 核心抽象

### 1.1 服务端请求处理流程

所有服务端框架的 HTTP 请求处理可以抽象为同一个流程：

```
Request Incoming
    ↓
Extract Trace Context from Headers
    ↓
Create Root Span (SpanKind.SERVER)
    ↓
Execute Handler
    ↓
Record Response
    ↓
End Span + Record Metrics
```

### 1.2 通用接口

```typescript
// 核心需要的最小 request 信息
interface ServerRequest {
  method: string
  url: string
  headers: Headers
}

// 核心需要的最小 response 信息
interface ServerResponse {
  status: number
  headers?: Headers
}

// 处理结果
interface HandlerResult {
  response?: ServerResponse
  error?: Error
}

// 框架 adapter 需要实现的最小接口
interface FrameworkAdapter {
  // 从框架请求对象提取标准信息
  getRequest(req: unknown): ServerRequest

  // 获取路由模式（如 /users/:id）
  getRoute?(req: unknown): string | undefined

  // 在响应发送前执行回调
  onResponse?(req: unknown, callback: () => void): void
}
```

---

## 2. 核心模块设计

### 2.1 `ServerInstrumentation` 类

```typescript
import { trace, metrics, context as otelContext, propagation, SpanKind, SpanStatusCode } from '@opentelemetry/api'
import type { ServerRequest, ServerResponse, FrameworkAdapter } from './adapter'

export interface ServerInstrumentationOptions {
  serviceName: string
  /** 是否启用 URL 脱敏 */
  urlRedaction?:
    | {
        stripCredentials?: boolean
        sensitiveQueryParams?: string[]
      }
    | false
  /** 是否记录 body */
  recordBody?: boolean | { request?: boolean; response?: boolean }
  /** 要记录的 headers */
  headersToSpanAttributes?: {
    request?: string[]
    response?: string[]
  }
}

export class ServerInstrumentation {
  private tracer = trace.getTracer(this.options.serviceName)
  private meter = metrics.getMeter(this.options.serviceName)
  private durationHistogram = this.meter.createHistogram('http.server.request.duration', {
    unit: 's',
    description: 'Duration of HTTP server requests',
  })

  constructor(private options: ServerInstrumentationOptions) {}

  /**
   * 处理一个请求
   * 这是框架无关的核心逻辑
   */
  async handleRequest<T>(request: ServerRequest, handler: () => Promise<T>, adapter?: FrameworkAdapter): Promise<T> {
    const startTime = performance.now()

    // 1. Extract trace context
    const parentContext = propagation.extract(
      otelContext.active(),
      request.headers,
      headersGetter, // 复用 carrier.ts 的 getter
    )

    // 2. 创建 SERVER span
    return this.tracer.startActiveSpan(
      `${request.method}`, // span name: "GET", "POST", etc.
      {
        kind: SpanKind.SERVER,
        attributes: this.buildInitialAttributes(request),
      },
      parentContext,
      async (span) => {
        try {
          // 3. 在 span context 中执行 handler
          const result = await otelContext.with(trace.setSpan(otelContext.active(), span), handler)

          // 4. 记录成功
          this.endSuccess(span, startTime)
          return result
        } catch (error) {
          // 5. 记录错误
          this.endError(span, error, startTime)
          throw error
        }
      },
    )
  }

  private buildInitialAttributes(req: ServerRequest): Record<string, string | number> {
    const url = new URL(req.url)
    const attrs: Record<string, string | number> = {
      'http.request.method': req.method,
      'url.path': url.pathname,
      'url.full': this.redactUrl(req.url),
    }
    if (url.search) attrs['url.query'] = url.search.slice(1)
    attrs['url.scheme'] = url.protocol.slice(0, -1)
    return attrs
  }

  private endSuccess(span: Span, startTime: number): void {
    const duration = (performance.now() - startTime) / 1000
    span.end()
    this.durationHistogram.record(duration, {
      'http.request.method': span.attributes['http.request.method'],
    })
  }

  private endError(span: Span, error: unknown, startTime: number): void {
    const err = error instanceof Error ? error : new Error(String(error))
    span.recordException(err)
    span.setStatus({ code: SpanStatusCode.ERROR })
    span.end()
    const duration = (performance.now() - startTime) / 1000
    this.durationHistogram.record(duration, {
      'http.request.method': span.attributes['http.request.method'],
    })
  }

  private redactUrl(url: string): string {
    // URL redaction 逻辑（复用 Elysia 的 redactQueryString）
    // ...
    return url
  }
}
```

### 2.2 设计要点

- **不启动 SDK**：只使用 `trace.getTracer()` / `metrics.getMeter()`，依赖全局注册的 provider
- **不访问私有属性**：全部使用标准 OTel API
- **框架无关**：核心只处理 `ServerRequest` / `ServerResponse`，不依赖任何框架类型

---

## 3. 框架 Adapter

### 3.1 Elysia Adapter

```typescript
import { Elysia } from 'elysia'
import { ServerInstrumentation } from '../core/instrumentation'

export interface ElysiaOpenTelemetryOptions {
  serviceName: string
  // ... 其他选项透传
}

export function opentelemetry(options: ElysiaOpenTelemetryOptions) {
  const instrumentation = new ServerInstrumentation(options)

  return new Elysia({ name: '@defjs/opentelemetry-server' }).onRequest(async ({ request, set }) => {
    // Elysia 的 onRequest 是进入请求时触发
    // 但 Elysia 没有直接提供 wrap 整个 handler 的 hook
    // 需要用 Elysia 的 .derive() 或中间件模式
  })
}
```

**问题**：Elysia 的 `onRequest` hook 不支持包裹 handler 执行（不能 await next()）。需要研究 Elysia 的 `derive` 或 `resolve` 模式，或者使用 `.use()` 配合自定义中间件。

实际上，Elysia 的 `.wrap()` 方法是 Elysia 特有的（在源码中使用了 `new Elysia().wrap()`），这不是标准的 Elysia 公开 API。这意味着 `@elysia/opentelemetry` 可能依赖了 Elysia 的内部实现。

**替代方案**：使用 Elysia 的 `onBeforeHandle` + `onAfterHandle` 组合模拟 wrap：

```typescript
export function opentelemetry(options: ElysiaOpenTelemetryOptions) {
  const instrumentation = new ServerInstrumentation(options)

  return new Elysia({ name: '@defjs/opentelemetry-server' })
    .onBeforeHandle(async ({ request, store }) => {
      // 创建 span，保存到 store
      const span = instrumentation.startRequest(request)
      store._otelSpan = span
    })
    .onAfterHandle(({ store, set }) => {
      // 结束 span
      instrumentation.endRequest(store._otelSpan, set.status)
    })
    .onError(({ store, error }) => {
      // 记录错误
      instrumentation.endRequestWithError(store._otelSpan, error)
    })
}
```

### 3.2 Hono Adapter

```typescript
import { Hono } from 'hono'
import { ServerInstrumentation } from '../core/instrumentation'

export function opentelemetryMiddleware(options: { serviceName: string }) {
  const instrumentation = new ServerInstrumentation(options)

  return async (c: Context, next: Next) => {
    await instrumentation.handleRequest(
      {
        method: c.req.method,
        url: c.req.url,
        headers: c.req.headers,
      },
      async () => {
        await next()
        return {
          status: c.res.status,
          headers: c.res.headers,
        }
      },
    )
  }
}
```

Hono 的 middleware 模式天然支持 `await next()`，完美适配我们的 `handleRequest` 模式。

### 3.3 Express Adapter

```typescript
import { ServerInstrumentation } from '../core/instrumentation'

export function opentelemetryMiddleware(options: { serviceName: string }) {
  const instrumentation = new ServerInstrumentation(options)

  return async (req: Request, res: Response, next: NextFunction) => {
    await instrumentation.handleRequest(
      {
        method: req.method,
        url: req.url,
        headers: new Headers(Object.entries(req.headers)),
      },
      async () => {
        await new Promise<void>((resolve, reject) => {
          res.on('finish', resolve)
          res.on('error', reject)
          next()
        })
        return {
          status: res.statusCode,
        }
      },
    )
  }
}
```

---

## 4. 依赖策略

### 方案对比

| 维度     | A: 依赖 SDK（Elysia 做法）        | B: 只依赖 API（推荐） |
| -------- | --------------------------------- | --------------------- |
| 包体积   | 大（+sdk-node + instrumentation） | 小（仅 api + core）   |
| 用户配置 | 零配置                            | 需自行配置 SDK        |
| 冲突风险 | 高（与用户 SDK 配置冲突）         | 低                    |
| 灵活性   | 低                                | 高                    |
| 适用场景 | 快速上手                          | 生产环境              |

**推荐方案 B**：

```json
{
  "dependencies": {
    "@opentelemetry/api": "^1.9.0"
  },
  "peerDependencies": {
    "@opentelemetry/sdk-node": "^0.200.0"
  },
  "peerDependenciesMeta": {
    "@opentelemetry/sdk-node": {
      "optional": true
    }
  }
}
```

- `@opentelemetry/api` 是必需依赖（ instrumentation 的核心）
- `@opentelemetry/sdk-node` 是可选 peer dependency（用户需要它但由用户安装）

---

## 5. 文件结构

```
packages/opentelemetry-server/
├── src/
│   ├── index.ts                    # 入口
│   ├── public_api.ts               # 导出
│   ├── core/
│   │   ├── instrumentation.ts      # ServerInstrumentation 核心类
│   │   ├── types.ts                # 接口定义
│   │   └── redaction.ts            # URL 脱敏
│   ├── telemetry/
│   │   ├── trace.ts                # Span 工具函数（复用/修改）
│   │   └── metrics.ts              # Metrics 创建（复用/修改）
│   ├── propagation/
│   │   └── carrier.ts              # headersGetter（复用）
│   └── adapter/
│       ├── elysia.ts               # Elysia adapter
│       ├── hono.ts                 # Hono adapter
│       └── express.ts              # Express adapter
├── src/
│   └── ...                         # 测试文件
├── package.json
├── tsconfig.json
└── README.md
```

---

## 6. 测试策略

服务端 instrumentation 的测试不同于客户端：

### 6.1 单元测试

```typescript
// 测试核心 instrumentation
test('should create SERVER span', async () => {
  const instrumentation = new ServerInstrumentation({ serviceName: 'test' })

  const result = await instrumentation.handleRequest(
    { method: 'GET', url: 'http://localhost:3000/users', headers: new Headers() },
    async () => 'hello',
  )

  // 验证 span 被创建
  // 验证 span kind = SERVER
  // 验证属性
})
```

### 6.2 集成测试

使用真实的测试 HTTP server：

```typescript
// Elysia 集成测试
import { Elysia } from 'elysia'

const app = new Elysia().use(opentelemetry({ serviceName: 'test' })).get('/users', () => 'ok')

const response = await app.handle(new Request('http://localhost/users'))
// 验证 response
// 验证 span 被正确导出到内存 exporter
```

### 6.3 Mock 策略

- 使用 `InMemorySpanExporter` 验证 span 内容
- 使用 `InMemoryMetricExporter` 验证 metrics
- Mock `Headers` 和 `Request` 对象

---

## 7. 实施建议

### Phase 1: MVP（对齐 Elysia 核心能力）

1. `ServerInstrumentation` 核心类
2. `headersGetter`（复用现有 carrier.ts）
3. URL redaction
4. 基础 span 属性（method, path, status）
5. Duration histogram metrics
6. Elysia adapter
7. 单元测试 + Elysia 集成测试

### Phase 2: 扩展

1. Hono adapter
2. Express adapter
3. Header 捕获（白名单）
4. Body 记录
5. 细粒度 hook span（框架特定）

### Phase 3: 高级

1. Logs（等 OTel API v2）
2. 自动 SDK 启动（可选）
3. 更多框架支持
