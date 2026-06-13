# 代码可复用性评估报告

## 背景

| 项目     | 当前                                                            | 目标                                            |
| -------- | --------------------------------------------------------------- | ----------------------------------------------- |
| 包名     | `@defjs/opentelemetry`                                          | `@defjs/opentelemetry-server`                   |
| 定位     | HTTP 客户端 instrumentation（interceptor 挂载到 `@defjs/core`） | 服务端 instrumentation（类似 Elysia 插件）      |
| 核心差异 | extract → create CLIENT span → inject                           | extract → create SERVER span → execute → record |

---

## 逐个文件评估

### 1. `src/propagation/carrier.ts`（54 行）

**当前功能**

- `headersSetter` / `headersGetter`: Headers 对象的 TextMapSetter / TextMapGetter 适配
- `queryStringSetter` / `queryStringGetter`: URLSearchParams 的 TextMapSetter / TextMapGetter 适配

**服务端需求**

- 服务端需要从 incoming request headers 中提取 trace context（propagator.extract），需要 `headersGetter`
- 服务端不需要向 outgoing headers 注入 trace context（没有 outbound 请求），不需要 `headersSetter`
- 服务端场景下 WebSocket/SSE 的 query string propagation 不再需要（服务端是接收端，不是发起端）

**建议：修改**

- `headersGetter`：保留，服务端 extract 需要它
- `headersSetter`：删除，服务端不需要 inject
- `queryStringSetter` / `queryStringGetter`：删除，服务端场景下无 outbound query string propagation 需求

**可复用率：~30%（16/54 行）**

---

### 2. `src/telemetry/trace.ts`（57 行）

**当前功能**

| 函数                  | 当前行为                                         |
| --------------------- | ------------------------------------------------ |
| `createHttpSpan`      | 创建 `SpanKind.CLIENT` 的 HTTP span              |
| `createSseSpan`       | 创建 `SpanKind.CLIENT` 的 SSE span               |
| `createWebSocketSpan` | 创建 `SpanKind.CLIENT` 的 WebSocket span         |
| `setSpanHttpResponse` | 设置 response status_code、span status、end span |
| `setSpanError`        | 记录 exception、设置 ERROR status、end span      |
| `endSpan`             | 设置 OK status、end span                         |

**服务端需求**

- HTTP 服务端需要 `SpanKind.SERVER` 的 span，不是 CLIENT
- 服务端 span 的属性更丰富：`http.route`、`server.address`、`url.scheme`、`url.path`、`url.query` 等
- SSE/WebSocket 服务端是否需要？如果 `@defjs/core` 服务端支持 SSE/WebSocket，则需要；否则不需要
- `setSpanHttpResponse` / `setSpanError` / `endSpan`：通用逻辑，可以复用

**建议：修改**

- `createHttpSpan`：修改 → 新增 `createServerSpan` 或重命名参数支持 kind 配置
- `createSseSpan` / `createWebSocketSpan`：暂时保留（如服务端支持这些协议），但改为 SERVER kind
- `setSpanHttpResponse`：保留，通用
- `setSpanError`：保留，通用
- `endSpan`：保留，通用

**可复用率：~60%（34/57 行，3 个工具函数完全复用，3 个创建函数需修改）**

---

### 3. `src/telemetry/metrics.ts`（30 行）

**当前功能**

- 创建客户端指标：`http.client.request.count`、`http.client.request.error`、`http.client.request.duration`

**服务端需求**

- 服务端指标名应改为：`http.server.request.duration`、`http.server.active_requests` 等
- OTel 语义约定中，服务端推荐使用 `http.server.request.duration`（histogram），不再单独拆分 count/error
- 结构（Meter、Counter、Histogram 的创建模式）完全复用

**建议：修改**

- 指标名全部替换
- 可新增 `http.server.active_requests`（UpDownCounter）用于并发追踪
- 结构保留

**可复用率：~50%（15/30 行，结构复用，指标名全改）**

---

### 4. `src/telemetry/logs.ts`（24 行）

**当前功能**

- Stub 实现：`@opentelemetry/api` v1.x 无 Logs API，所有方法为空函数

**服务端需求**

- 服务端场景下 Logs API 仍然不可用（v1.x 限制）
- 但服务端可以通过 `console.log` 或结构化日志库输出，不一定要绑定 OTel Logs
- 如果保持 OTel 统一风格，继续 stub 是合理的

**建议：保留（或删除）**

- 保留理由：保持与客户端包结构一致，未来 v2.x 升级时同步启用
- 删除理由：服务端 stub 没有实际价值，不如直接删除减少噪音
- **倾向：删除**。服务端 instrumentation 的核心价值在 trace/metrics，logs 不是重点。等 OTel Logs API 成熟后再统一添加。

**可复用率：0%（建议删除）**

---

### 5. `src/interceptor/http.ts`（86 行）

**当前功能**

- 客户端 interceptor：extract from incoming headers → create CLIENT span → inject to outgoing headers → next → record response

**服务端需求**

- 服务端不是 interceptor 模式，是 middleware / hook / plugin 模式
- 服务端逻辑：extract from incoming headers → create SERVER span → execute handler → record response
- 不需要 `createHttpInterceptor`，不需要 `next(req)` 调用模式
- 不需要 inject outgoing headers

**建议：完全重写**

- 当前代码没有任何一行可以直接复用
- 逻辑参考：
  1. 从 request headers extract context（用 `headersGetter`）
  2. `tracer.startActiveSpan` 创建 SERVER span
  3. 在 span context 中执行 handler
  4. 根据 response 设置 attributes / status / end
  5. 异常时 `setSpanError`

**可复用率：0%**

---

### 6. `src/interceptor/sse.ts`（79 行）

**当前功能**

- SSE 客户端 interceptor：创建 CLIENT span，inject headers，追踪 stream lifecycle

**服务端需求**

- 服务端是否支持 SSE？取决于 `@defjs/core` 服务端能力
- 如果支持：服务端 SSE 是 outbound stream，需要 SERVER span（客户端连接进来）
- 如果不支持：无需此文件

**建议：删除（或延后）**

- 当前 `@defjs/core` 服务端能力未明确支持 SSE
- 即使支持，逻辑与 HTTP 服务端类似，不需要单独的 interceptor 文件
- 建议先删除，等 SSE 服务端需求明确后再实现

**可复用率：0%（建议删除）**

---

### 7. `src/interceptor/web_socket.ts`（87 行）

**当前功能**

- WebSocket 客户端 interceptor：创建 CLIENT span，inject query string，追踪 session lifecycle

**服务端需求**

- 服务端是否支持 WebSocket？同样取决于 `@defjs/core`
- WebSocket 服务端逻辑：upgrade 请求进来 → extract context → create SERVER span → 追踪 connection lifecycle

**建议：删除（或延后）**

- 与 SSE 同理，当前不明确需要
- WebSocket 服务端 instrumentation 更复杂（需要追踪 message 级别的 span）
- 建议先聚焦 HTTP，后续迭代添加

**可复用率：0%（建议删除）**

---

### 8. `src/option.ts`（89 行）

**当前功能**

- `withOpenTelemetry(options)`：返回 `ClientOption`，用于 `@defjs/core` 客户端配置
- 内部组装 tracer、metrics、logger，创建三种 interceptor

**服务端需求**

- 服务端不需要 `ClientOption` 概念
- 服务端需要的是一个 plugin / middleware 工厂函数
- 例如 Elysia 风格：`opentelemetryPlugin(options)` 返回 Elysia plugin
- 或通用风格：`createOpenTelemetryMiddleware(options)` 返回 handler wrapper

**建议：完全重写**

- 接口设计完全改变
- 保留部分：propagator 默认配置（W3C TraceContext + Baggage）、serviceName 默认逻辑

**可复用率：~20%（18/89 行，默认 propagator 配置和 option 接口结构可参考）**

---

### 9. `src/index.ts`（1 行）+ `src/public_api.ts`（2 行）

**当前功能**

- 导出 `withOpenTelemetry` 和 `OpenTelemetryOptions`

**服务端需求**

- 需要重新设计导出结构
- 可能导出：plugin 工厂函数、middleware 函数、carrier getter、span 工具函数等

**建议：重写**

- 入口文件本身无逻辑，但导出结构需要重新设计

**可复用率：0%**

---

### 10. `src/interceptor/http.spec.ts`（174 行）

**当前功能**

- 测试客户端 HTTP interceptor 的完整行为：inject headers、span 创建、attributes、status、error handling

**服务端需求**

- 服务端测试策略完全不同：需要 mock request/response 对象，测试 middleware/plugin 行为
- 需要测试 extract（而不是 inject）
- 需要测试 SERVER span kind

**建议：重写**

- 测试框架（vitest）复用
- Mock 策略和断言逻辑需要全部重写

**可复用率：~10%（17/174 行，测试框架和基本结构）**

---

## 总结

### 代码量统计

| 文件                        | 行数    | 建议     | 可复用率 | 可复用行数 |
| --------------------------- | ------- | -------- | -------- | ---------- |
| `carrier.ts`                | 54      | 修改     | 30%      | 16         |
| `trace.ts`                  | 57      | 修改     | 60%      | 34         |
| `metrics.ts`                | 30      | 修改     | 50%      | 15         |
| `logs.ts`                   | 24      | **删除** | 0%       | 0          |
| `interceptor/http.ts`       | 86      | **重写** | 0%       | 0          |
| `interceptor/sse.ts`        | 79      | **删除** | 0%       | 0          |
| `interceptor/web_socket.ts` | 87      | **删除** | 0%       | 0          |
| `option.ts`                 | 89      | **重写** | 20%      | 18         |
| `index.ts`                  | 1       | **重写** | 0%       | 0          |
| `public_api.ts`             | 2       | **重写** | 0%       | 0          |
| `interceptor/http.spec.ts`  | 174     | **重写** | 10%      | 17         |
| **总计**                    | **683** | —        | **~15%** | **~100**   |

### 关键结论

1. **可复用代码极少**：约 15%（100/683 行），主要集中在 `trace.ts` 的通用工具函数和 `carrier.ts` 的 getter
2. **需要删除的文件**：`logs.ts`、`interceptor/sse.ts`、`interceptor/web_socket.ts`（共 190 行）
3. **需要重写的文件**：`interceptor/http.ts`、`option.ts`、`index.ts`、`public_api.ts`、测试文件（共 352 行）
4. **需要修改的文件**：`carrier.ts`、`trace.ts`、`metrics.ts`（共 141 行）
5. **服务端核心新增**：
   - HTTP server middleware / plugin（~80-100 行）
   - 服务端指标（`http.server.request.duration` 等）
   - 服务端测试（mock request/response，测试 extract 行为）
   - 可能的框架适配层（Elysia plugin、Hono middleware、原生 http 等）

### 建议的实施路径

1. **新建包**优于**改造现有包**：现有 `@defjs/opentelemetry` 客户端包仍有价值，建议保留
2. 新建 `packages/opentelemetry-server/`，仅复用以下部分：
   - `carrier.ts` 中的 `headersGetter`
   - `trace.ts` 中的 `setSpanHttpResponse`、`setSpanError`、`endSpan`
   - `metrics.ts` 中的结构模式
3. 其余全部重新实现，避免客户端和服务端代码耦合
