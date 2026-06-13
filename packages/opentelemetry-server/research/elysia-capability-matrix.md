# @elysia/opentelemetry 能力矩阵

> 源码版本：v1.4.12
> 分析日期：2026/06/06
> 源码文件：`packages/opentelemetry/research/elysia-source.ts`

---

## 1. Tracing 能力

### 1.1 生命周期 Instrumentation

| 生命周期          | Span 名称       | 触发时机             | MVP 必须 | 复杂度 | 框架无关          |
| ----------------- | --------------- | -------------------- | -------- | ------ | ----------------- |
| `wrap`            | `Root`          | 请求进入时（最外层） | **是**   | 低     | 是                |
| `onRequest`       | `Request`       | 请求解析开始         | **是**   | 低     | 否（Elysia 特有） |
| `onParse`         | `Parse`         | Body 解析阶段        | 否       | 低     | 否                |
| `onTransform`     | `Transform`     | 数据转换阶段         | 否       | 低     | 否                |
| `onBeforeHandle`  | `BeforeHandle`  | 前置处理阶段         | 否       | 低     | 否                |
| `onHandle`        | `Handle`        | 主处理逻辑           | **是**   | 低     | 否                |
| `onAfterHandle`   | `AfterHandle`   | 后置处理阶段         | 否       | 低     | 否                |
| `onError`         | `Error`         | 错误处理阶段         | **是**   | 中     | 否                |
| `onMapResponse`   | `MapResponse`   | 响应映射阶段         | 否       | 低     | 否                |
| `onAfterResponse` | `AfterResponse` | 响应发送后           | **是**   | 中     | 否                |

### 1.2 Span 命名与属性

**Root Span**

- 初始名称：`"Root"`
- 在 `onTransform` 阶段更新为：`"${method} ${route}"`（如 `"GET /users/:id"`）
- `SpanKind.SERVER`

**生命周期 Span**

- 名称：生命周期名（如 `"Request"`、`"Parse"` 等）
- `SpanKind`：未显式设置，默认 `INTERNAL`

**子 Span（每个生命周期内的事件）**

- 当 `total > 1`（同一生命周期有多个 hook）时创建子 span
- 名称：hook 的 `name` 属性
- 通过 `createContext(rootSpan)` 建立 parent context

### 1.3 Parent-Child 关系建立

```
Root (SpanKind.SERVER)
├── Request (SpanKind.INTERNAL)
│   └── hook1, hook2... (子 span)
├── Parse
│   └── hook1, hook2...
├── Transform
├── BeforeHandle
├── Handle
├── AfterHandle
├── Error (仅在出错时)
├── MapResponse
└── AfterResponse
```

**实现机制**：

- 使用 `propagation.extract()` 从请求头提取 parent context
- Root span 通过 `tracer.startActiveSpan()` 创建，传入提取的 context
- 生命周期 span 使用 `createContext(rootSpan)` 包装一个 fake context，使 `trace.setSpan()` 生效
- 通过 `setParent()` 函数在 span 间切换 active context
- 使用 `otelContext.with(spanContext, fn)` 执行用户代码

**关键代码**：

```typescript
const createContext = (parent: Span) => ({
  getValue() {
    return parent
  },
  setValue() {
    return otelContext.active()
  },
  deleteValue() {
    return otelContext.active()
  },
})
```

> **注意**：`createContext` 返回的是一个 fake context 对象，仅实现了 `getValue()` 返回 parent span。这不是标准的 OTel context，是一种简化的 parent 传递方式。

---

## 2. Metrics 能力

### 2.1 指标列表

| 指标名称                       | 类型      | 单位      | 描述                    | MVP 必须 | 复杂度 | 框架无关 |
| ------------------------------ | --------- | --------- | ----------------------- | -------- | ------ | -------- |
| `http.server.request.duration` | Histogram | `s`（秒） | HTTP 服务器请求持续时间 | **是**   | 低     | 是       |

### 2.2 Histogram 配置

```typescript
meter.createHistogram('http.server.request.duration', {
  description: 'Duration of HTTP server requests.',
  unit: 's',
  advice: {
    explicitBucketBoundaries: [0.005, 0.01, 0.025, 0.05, 0.075, 0.1, 0.25, 0.5, 0.75, 1, 2.5, 5, 7.5, 10, 30, 60, 120, 300, 600, 900, 1800],
  },
})
```

**Bucket 边界**：21 个桶，覆盖 5ms 到 30 分钟，遵循 OpenTelemetry HTTP 语义约定。

### 2.3 记录属性（Labels）

```typescript
{
  'http.request.method': method,     // GET, POST, etc.
  'url.scheme': scheme,              // http, https
  'http.response.status_code': statusCode,
  'http.route': route,               // /users/:id
  'error.type': String(statusCode)   // 仅当 status >= 500
}
```

### 2.4 记录时机

- 在 `onError` 和 `onAfterResponse` 的 `onStop` 回调中记录
- 使用 `performance.now()` 计算持续时间
- 有防重复记录标志 `durationRecorded`

---

## 3. Context Propagation

### 3.1 提取（Extract）

**实现**：

```typescript
const headers = headerHasToJSON
  ? request.headers.toJSON() // Bun 特有优化
  : Object.fromEntries(request.headers.entries())

const ctx = propagation.extract(otelContext.active(), headers)
```

**细节**：

- 从 incoming request headers 提取 W3C Trace Context（`traceparent`、`tracestate`）
- 使用 `@opentelemetry/api` 的 `propagation.extract()`
- 支持 Bun 的 `Headers.toJSON()` 优化（Bun 特有方法）
- 提取的 context 作为 Root span 的 parent context

### 3.2 注入（Inject）

**未实现**。Elysia 插件不向 response headers 注入 trace context。

> 这意味着如果 Elysia 服务调用下游服务，需要手动传播，或者依赖其他 instrumentation 库。

### 3.3 Context 管理

```typescript
// 自动设置全局 ContextManager（如果未设置）
if (!otelContext._getContextManager?.() && contextManager) {
  contextManager.enable()
  otelContext.setGlobalContextManager(contextManager)
}
```

---

## 4. Configuration 选项

### 4.1 完整配置表

| 参数                      | 类型                                        | 默认值           | 描述                   | MVP 必须 | 复杂度 |
| ------------------------- | ------------------------------------------- | ---------------- | ---------------------- | -------- | ------ |
| `serviceName`             | `string`                                    | `"Elysia"`       | 服务名称               | **是**   | 低     |
| `instrumentations`        | `Instrumentation[]`                         | `undefined`      | OTel instrumentations  | 否       | 低     |
| `contextManager`          | `ContextManager`                            | `undefined`      | 自定义 context manager | 否       | 低     |
| `checkIfShouldTrace`      | `(req: Request) => boolean`                 | `undefined`      | 是否追踪该请求         | **是**   | 低     |
| `spanUrlRedaction`        | `false \| object`                           | `{}`（默认脱敏） | URL 脱敏配置           | **是**   | 中     |
| `recordBody`              | `boolean \| {request?, response?}`          | `false`          | 记录请求/响应 body     | 否       | 中     |
| `headersToSpanAttributes` | `{request?: string[], response?: string[]}` | `undefined`      | 捕获的 header 白名单   | 否       | 低     |
| `...options`              | `OpenTeleMetryOptions`                      | -                | NodeSDK 的其他配置     | 否       | 低     |

### 4.2 `spanUrlRedaction` 详细

```typescript
spanUrlRedaction?: false | {
  stripCredentials?: boolean   // 默认 true
  sensitiveQueryParams?: string[]  // 额外敏感 key
}
```

- `false`：完全禁用脱敏，记录原始 URL
- `undefined`：使用默认脱敏（内置敏感 key 列表 + credentials 剥离）
- `object`：自定义配置，可扩展敏感 key 列表

### 4.3 `recordBody` 详细

```typescript
recordBody?: boolean | {
  request?: boolean   // 记录请求 body
  response?: boolean  // 记录响应 body
}
```

- `true`：同时记录请求和响应
- `{ request: true }`：仅记录请求
- `{ response: true }`：仅记录响应
- `false` / `undefined`：不记录

### 4.4 `headersToSpanAttributes` 详细

```typescript
headersToSpanAttributes?: {
  request?: string[]   // 请求头白名单（大小写不敏感）
  response?: string[]  // 响应头白名单
}
```

- 使用 `"*"` 捕获所有 headers（开发/调试用途，可能包含敏感信息）
- 包含 `"cookie"` 时，额外记录 `http.request.cookie` 属性

---

## 5. SDK 管理

### 5.1 自动启动 NodeSDK

**判断条件**：`shouldStartNodeSDK()`

```typescript
export const shouldStartNodeSDK = (provider: TracerProvider) => {
  return provider instanceof ProxyTracerProvider && provider.getDelegateTracer('check') === undefined
}
```

**逻辑**：

- 如果 `trace.getTracerProvider()` 返回的是 `ProxyTracerProvider` 且没有 delegate tracer
- 说明用户没有预先配置 OTel SDK
- 此时自动创建并启动 `NodeSDK`

**自动启动代码**：

```typescript
if (shouldStartNodeSDK(trace.getTracerProvider())) {
  const sdk = new NodeSDK({
    ...options,
    serviceName,
    instrumentations,
  })
  sdk.start()
  tracer = trace.getTracer(serviceName)
}
```

### 5.2 TracerProvider 委托检测

- 通过检查 `ProxyTracerProvider` 是否有 delegate 来判断是否已有外部 SDK 配置
- 这是一种轻量级的"是否已经初始化"检测
- 避免了重复启动 SDK 导致的问题

---

## 6. 安全特性

### 6.1 URL Redaction

#### 6.1.1 敏感 Query Key 列表（内置）

```typescript
const SENSITIVE_QUERY_KEYS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'password',
  'passwd',
  'pwd',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'api-key',
  'authorization',
  'credential',
  'credentials',
  'code',
  'nonce',
])
```

**共 17 个内置敏感 key**，覆盖常见的认证/授权/凭证参数。

#### 6.1.2 Credentials 剥离

- 默认启用（`stripCredentials !== false`）
- 检测 URL 中是否包含 `@`（userinfo 分隔符）
- 使用 `new URL()` 解析并清空 `username` 和 `password`

```typescript
if (stripCreds && urlFull.indexOf('@') > 0) {
  const u = new URL(urlFull)
  if (u.username || u.password) {
    u.username = ''
    u.password = ''
    urlFull = u.href
  }
}
```

#### 6.1.3 Query String 脱敏实现

**实现方式**：逐字符扫描（非 URL 解析）

```typescript
const redactQueryString = (query: string, keys: Set<string>): string => {
  let out = ''
  let partStart = 0
  let keyEnd = -1

  for (let i = 0; i <= query.length; i++) {
    const ch = i === query.length ? 38 : query.charCodeAt(i)

    if (ch === 61 && keyEnd === -1) {
      // '='
      keyEnd = i
      continue
    }

    if (ch !== 38) continue // '&'

    const rawKey = query.slice(partStart, keyEnd === -1 ? partEnd : keyEnd)

    out += keys.has(rawKey.toLowerCase()) ? rawKey + '=[REDACTED]' : query.slice(partStart, partEnd)
  }
}
```

**特点**：

- 纯字符串操作，无正则，无 URL 解析 API
- 性能优于 `URLSearchParams` 或正则方案
- 支持无 `=` 的 flag 参数（如 `?debug`）
- key 匹配大小写不敏感

---

## 7. Body 处理

### 7.1 序列化策略

```typescript
const serializeBody = (body: unknown): { text: string; size: number } => {
  if (body instanceof Uint8Array) return { text: '', size: body.length }
  if (body instanceof ArrayBuffer) return { text: '', size: body.byteLength }
  if (body instanceof Blob) return { text: '', size: body.size }

  let text: string
  try {
    text = typeof body === 'object' ? JSON.stringify(body) : String(body)
  } catch {
    text = '[Unserializable]'
  }

  return { text, size: text.length }
}
```

| Body 类型     | text                 | size         | 说明               |
| ------------- | -------------------- | ------------ | ------------------ |
| `Uint8Array`  | `''`                 | `length`     | 二进制，不记录内容 |
| `ArrayBuffer` | `''`                 | `byteLength` | 二进制，不记录内容 |
| `Blob`        | `''`                 | `size`       | 二进制，不记录内容 |
| `object`      | `JSON.stringify`     | 字符串长度   | 序列化为 JSON      |
| 其他          | `String()`           | 字符串长度   | 转字符串           |
| 序列化失败    | `'[Unserializable]'` | 18           | 兜底               |

### 7.2 大小限制

**无显式大小限制**。所有 body 都会被完整序列化后记录到 span attributes。

> **风险**：大文件上传/下载可能导致 span attributes 过大，影响性能和存储。

### 7.3 记录属性

```typescript
// 请求 body
attributes['http.request.body'] = text // 序列化后的内容
attributes['http.request.body.size'] = size // 字节数

// 响应 body
attributes['http.response.body'] = text
attributes['http.response.body.size'] = size
```

### 7.4 记录时机

| 时机              | 记录内容              | 触发点          |
| ----------------- | --------------------- | --------------- |
| `onParse`         | 请求 body             | body 解析完成后 |
| `onMapResponse`   | 请求 body + 响应 body | 响应映射阶段    |
| `onAfterResponse` | 请求 body             | 响应发送后      |

> **注意**：请求 body 在多个阶段重复记录，后面的值会覆盖前面的。

---

## 8. Header 捕获

### 8.1 白名单机制

```typescript
const spanRequestHeaderSet = toHeaderNameSet(headersToSpanAttributes?.request)
const spanResponseHeaderSet = toHeaderNameSet(headersToSpanAttributes?.response)
const requestHeaderWildcard = spanRequestHeaderSet.has('*')
const responseHeaderWildcard = spanResponseHeaderSet.has('*')
```

- 大小写不敏感（统一转小写比较）
- `"*"` 通配符支持捕获所有 headers
- 默认不捕获任何 header

### 8.2 请求 Header 处理

**数据来源优先级**：

1. `context.headers`（Elysia 解析后的 headers）
2. `request.headers.toJSON()`（Bun 优化）
3. `request.headers.entries()`（标准迭代器）

**属性命名**：`http.request.header.${key}`

**特殊处理**：

- `Set-Cookie` 数组值：`JSON.stringify(value)`
- `undefined` 值：跳过

### 8.3 响应 Header 处理

**数据来源**：

1. `context.set.headers instanceof Headers` → `entries()` 或 `toJSON()`
2. 否则 → `Object.entries(context.set.headers)`

**属性命名**：`http.response.header.${key}`

### 8.4 Cookie 特殊处理

当请求头白名单包含 `"cookie"` 或通配符 `*`，且 `context.cookie` 存在时：

```typescript
const _cookie = <Record<string, string>>{}
for (const [key, { value }] of Object.entries(cookie)) _cookie[key] = JSON.stringify(value)

attributes['http.request.cookie'] = JSON.stringify(_cookie)
```

- 将 cookie 对象序列化为 JSON 字符串
- 记录到 `http.request.cookie` 属性

---

## 9. Error 处理

### 9.1 Status Code 映射

```typescript
let status = context.set.status

if (typeof status === 'string') {
  status = StatusMap[status] // Elysia 状态码字符串映射
} else if (typeof status !== 'number' && typeof error?.status === 'number') {
  status = error.status // 从 error 对象提取
}
```

**Elysia 特有**：`StatusMap` 将字符串状态（如 `"Not Found"`）映射为数字（如 `404`）。

### 9.2 异常记录方式

**生命周期 span 中的错误**：

```typescript
span.setAttributes({
  'error.type': error.constructor?.name ?? error.name,
  'error.stack': error.stack,
})
```

**Root span 中的错误**：

```typescript
// onHandle 阶段
if (error) {
  span.recordException(error)
  rootSpan.recordException(error)
}

// onError 阶段
if (status >= 500) {
  rootSpan.setStatus({ code: SpanStatusCode.ERROR })
}
```

**Active span 中的错误**（`createActiveSpanHandler`）：

```typescript
span.setStatus({
  code: SpanStatusCode.ERROR,
  message: error instanceof Error ? error.message : JSON.stringify(error ?? 'Unknown error'),
})
span.recordException(rejectResult)
```

### 9.3 Abort 信号处理

```typescript
context.request.signal.addEventListener('abort', () => {
  const active = trace.getActiveSpan()
  if (active && !(active as any).ended) active.end()

  if ((rootSpan as any).ended) return

  rootSpan.setStatus({
    code: SpanStatusCode.ERROR,
    message: 'Request aborted',
  })
  recordDuration()
  rootSpan.end()
})
```

- 监听 `request.signal` 的 `abort` 事件
- 结束当前 active span
- Root span 标记为 ERROR，message 为 `"Request aborted"`
- 记录 metrics duration
- 结束 Root span

---

## 10. Span Attributes 完整列表

### 10.1 请求级属性

| 属性名                        | 来源                                  | 条件                 |
| ----------------------------- | ------------------------------------- | -------------------- |
| `http.request.id`             | `context.id`                          | 始终                 |
| `http.request.method`         | `request.method`                      | 始终                 |
| `url.path`                    | `context.path`                        | 始终                 |
| `url.full`                    | `rawUrl`（脱敏后）                    | 始终                 |
| `url.query`                   | `rawUrl.slice(qi + 1)`                | 有 query 时          |
| `url.scheme`                  | `urlFull` 前缀                        | 有协议时             |
| `http.route`                  | `context.route`                       | 有路由时             |
| `http.request_content_length` | `content-length` header               | 可解析为数字时       |
| `user_agent.original`         | `User-Agent` header                   | 存在时               |
| `server.port`                 | `context.server.port`                 | 有 server 时         |
| `server.address`              | `context.server.url.hostname`         | 有 server 时         |
| `client.address`              | `context.ip` / header / `requestIP()` | 存在时               |
| `http.request.header.${key}`  | 请求 headers                          | 白名单匹配时         |
| `http.request.cookie`         | `context.cookie`                      | 白名单包含 cookie 时 |
| `http.request.body`           | `serializeBody(context.body)`         | `recordBody` 启用时  |
| `http.request.body.size`      | `serializeBody` 返回                  | `recordBody` 启用时  |

### 10.2 响应级属性

| 属性名                        | 来源                      | 条件                |
| ----------------------------- | ------------------------- | ------------------- |
| `http.response.status_code`   | `context.set.status`      | 始终                |
| `http.response.header.${key}` | 响应 headers              | 白名单匹配时        |
| `http.response.body`          | `serializeBody(response)` | `recordBody` 启用时 |
| `http.response.body.size`     | `serializeBody` 返回      | `recordBody` 启用时 |

### 10.3 错误属性

| 属性名        | 来源                     | 条件                        |
| ------------- | ------------------------ | --------------------------- |
| `error.type`  | `error.constructor.name` | 生命周期 span 出错时        |
| `error.stack` | `error.stack`            | 生命周期 span 出错时        |
| `error.type`  | `String(statusCode)`     | metrics 中 status >= 500 时 |

---

## 11. 其他工具函数

### 11.1 `parseNumericString`

```typescript
const parseNumericString = (message: string): number | null
```

- 安全解析数字字符串
- 限制 16 位以内（避免 JavaScript 精度丢失）
- 16 位时额外验证 `toString()` 回退一致性
- 用于解析 `content-length` header

### 11.2 `toHeaderNameSet`

```typescript
const toHeaderNameSet = (names: string[] | undefined): Set<string>
```

- 将 header 名称数组转为小写 Set
- 用于大小写不敏感的 header 匹配

### 11.3 `getTracer` / `startSpan` / `startActiveSpan`

- 封装 `@opentelemetry/api` 的 tracer
- `startActiveSpan` 支持 2/3/4 参数重载
- 自动处理 Promise 和同步函数
- 自动捕获异常并设置 span status

### 11.4 `getCurrentSpan` / `setAttributes`

```typescript
export const getCurrentSpan = (): Span | undefined => trace.getActiveSpan()
export const setAttributes = (attributes: Attributes) => !!getCurrentSpan()?.setAttributes(attributes)
```

- 便捷函数供用户代码使用

---

## 12. 总结：MVP 功能清单

### 必须实现（P0）

1. **Root Span**：请求进入时创建，`SpanKind.SERVER`，从 headers 提取 parent context
2. **Span 命名**：`"${method} ${route}"`，如 `"GET /users/:id"`
3. **基本属性**：`http.request.method`、`url.path`、`url.full`、`http.response.status_code`
4. **Metrics**：`http.server.request.duration` histogram，带标准 bucket
5. **自动 SDK 启动**：`shouldStartNodeSDK` 检测逻辑
6. **URL 脱敏**：敏感 query key 替换 + credentials 剥离
7. **Error 处理**：status code >= 500 时标记 ERROR，abort 信号处理
8. **Context Propagation**：从请求头提取 trace context

### 建议实现（P1）

9. **生命周期 Span**：Request、Parse、Transform、BeforeHandle、Handle、AfterHandle、Error、MapResponse、AfterResponse
10. **Header 捕获**：白名单机制 + 通配符支持
11. **Body 记录**：可配置的记录请求/响应 body
12. **Cookie 记录**：cookie 对象序列化
13. **Client IP**：从 headers 或 `requestIP()` 提取

### 可选实现（P2）

14. **自定义 ContextManager**：`contextManager` 配置
15. **Trace 过滤**：`checkIfShouldTrace` 回调
16. **扩展属性**：`user_agent.original`、`server.address`、`server.port` 等
