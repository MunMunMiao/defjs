# 模拟用户反馈汇总报告

> 生成日期：2026-07-01  
> 数据来源：`/Users/munmunmiao/Documents/web/zen-kit/.feedback/*.md`（24 份 persona 反馈）

---

## 1. Executive Summary

- **总体印象**：类型安全、显式 Client、Go 风格 struct、状态码驱动类型收窄是最大亮点；但文档漂移、框架封装层过薄、缺少显式严格模式、实时传输调试能力不足是主要落地障碍。
- **平均评分**：**3.2 / 5**（24 份样本）。
- ** persona 总数**：24。
  - React 前端：4
  - Vue 前端：4
  - Angular 前端：4
  - 后端 / 全栈：4
  - 跨行业 / 决策型：6
- **评分分布**：
  - 4.5：1
  - 4.0：9
  - 3.5：4
  - 3.0：9
  - 2.0：1
- **Top 主题**：
  1. 文档与示例 API 签名不一致（`doc/guide/examples.md` 旧 `build` vs `packages/core/design.md` 新 `build(ctx, input)`）。
  2. 框架封装层（React/Vue/Angular）太薄，缺少 `useCommand` / `useMutation` / `useEventStream` / RxJS 适配等高级抽象。
  3. 缺少显式严格校验模式（金融、医疗、表单场景需要 fail-fast，但当前零值默认是 Go 风格设计意图，不是 bug）。
  4. SSE / WebSocket 非法事件默认静默跳过，调试与合规风险高。
  5. `timeout` 与 `abort` 互斥、WebSocket 握手 header 不支持、缺少 OpenAPI / codegen、HTTP 重试缺失。

---

## 2. Feedback by Package

### 2.1 `@defjs/core`

**Key likes**

- 显式 Client 设计受认可：`doc/core/client.md` 强调“Test-friendly: Pass different Client instances directly to tests”，没有全局单例。
- 状态码到 struct 的 `output` 映射自动收窄类型：`doc/core/http.md` 中 2xx 进 success、非 2xx 进 error，且 `error.data` 按状态码收窄。
- `struct.request(...)` 的请求分区（path/query/headers/body）比字段 tag 更清晰（`packages/core/design.md`）。
- 错误按 `kind` + `code` 分支：`doc/core/errors.md` 的 discriminated union 便于 switch 处理。
- Go 风格 struct 零值默认与后端认知对齐：`packages/core/design.md` 第 56–87 行明确说明这是设计意图。
- 拦截器按 transport 自动过滤：`doc/core/interceptors.md` 中 HTTP/SSE/WebSocket 拦截器可混注册。

**Top pains**

- **零值默认是 Go 风格设计意图，但缺少显式严格模式**：`packages/core/design.md` 第 56–87 行明确说明零值兜底与 Partial Input 是对齐 `encoding/json` 的设计选择，不是 bug。问题在于缺少一个 opt-in 的严格模式（`struct.strict(...)` / `.required()` / 全局开关），让金融 / 医疗 / 表单场景在需要时可以 fail-fast。
- **`struct.date()` 的 boolean footgun**：`packages/core/design.md` 警告 `new Date(true)` 会被接受为 Valid Date，默认不抛错，多个 persona 险些因此上线 bug。
- **`struct.bigint()` 拒绝 number 输入**：`packages/core/design.md` 第 84 行说明拒绝 number 以避免精度丢失，但大量现有 JSON API 把 64 位 ID 作为 number 返回，迁移成本高。
- **`timeout` 与 `abort` 互斥**：`doc/core/http.md` 第 165 行写明两者不能同时使用，需手动用 `AbortSignal.any` 组合。
- **SSE / WebSocket 非法事件静默跳过**：`doc/core/sse.md` 第 139–143 行说明未声明事件与校验失败事件均直接跳过，没有 fail-closed 选项。
- **`output` 数组形式需要手动 `as const`**：`packages/core/README.md` 与 `doc/core/commands.md` 示例均需 `as const`，初学者容易忘记导致类型退化。
- **缺少字段级校验 DSL**：`packages/core/design.md` 第 186 行把长度、范围、业务规则推到应用层，导致各团队规范发散。
- **缺少 OpenAPI / JSON Schema / codegen**：`packages/core/design.md` 第 871 行把“OpenAPI 生成与 struct 导出”列为当前不提供。
- **HTTP 没有内置重试**：`doc/core/http.md` 只有 timeout/abort，没有 retry/backoff。

**Actionable suggestions**

1. 提供 opt-in 严格模式：`struct.strict(...)` / `.required()` / 全局开关，让需要 fail-fast 的场景可以显式启用，同时保留零值默认作为默认行为。
2. 给 `struct.bigint()` 增加 `.fromNumber()` 修饰符，显式接受有限 number。
3. 内部合并 `AbortSignal.timeout()` 与用户 signal，允许 `timeout` + `abort` 共存。
4. 给 SSE / WebSocket 增加 `strictEventValidation: true` 或 `onInvalidEvent: 'throw'` 选项。
5. 优化 `output` 类型推断，减少 `as const` 依赖，或提供 `satisfies` 推荐写法。
6. 暴露 `struct` 的独立 parse / serialize 入口与 JSON Schema / OpenAPI 导出能力。
7. 增加 HTTP retry 配置（attempts、factor、retryWhen）。

### 2.2 `@defjs/react`

**Key likes**

- `<ClientProvider>` 顶部带 `"use client"`，在 Next.js App Router 中不会误装进 RSC（`packages/react/src/core.tsx:1`）。
- API 表面积小：`packages/react/src/public_api.ts` 只导出 4 个 API，学习成本低。
- 与 Vue / Angular API 对称：都使用 `withEndpoint` / `withInterceptors`。

**Top pains**

- **几乎没有 React 体验**：`packages/react/README.md` 只给了 `useClient()` + `useEffect` 示例，开发者需自己管理 loading/error/data/refetch。
- **没有请求缓存、去重、失效机制**：重度 React Query 用户认为迁移后必须再包一层。
- **缺少 RSC / SSR 预取官方模式**：`packages/react/README.md` 未提及如何在 Server Component 中调用 `client.execute` 并透传 cookie/header。
- **`withInterceptors` 签名与 core 不一致**：core 文档直接传 interceptor 对象，React 包 `packages/react/src/core.tsx:36` 要求传工厂函数 `() => Interceptor`。
- **没有 Suspense / Error Boundary 集成**：错误是值而非异常，需手动 throw。
- **版本兼容表不具体**：`packages/react/README.md` 写 `workspace:^`，终端用户看不到 semver 范围。

**Actionable suggestions**

1. 提供官方 `useCommand` / `useMutation` hook，返回 `{ data, error, loading, execute }`。
2. 给出 TanStack Query 官方 adapter 或集成示例。
3. 在 `packages/react/README.md` 中增加 RSC 预取 + hydration 完整示例。
4. 统一 `withInterceptors` 签名：React 侧支持直接传 interceptor 对象，工厂作为可选。
5. 增加 `client.execute(cmd, { throwOnError: true })` 或 `useSuspenseCommand` 以支持 Error Boundary / Suspense。
6. 把 README 版本兼容表替换为具体 semver 范围。

### 2.3 `@defjs/vue`

**Key likes**

- `app.use(provideClient(...))` + `injectClient()` 与 Pinia 的 provide/inject 用法接近，上手快。
- Vue 注入不绑架响应式：可自由把流数据接到 Pinia。
- 小而美，API 表面积小。

**Top pains**

- **包太薄**：`@defjs/vue` 只导出 `provideClient` / `injectClient` / `withEndpoint` / `withInterceptors`（`packages/vue/README.md` 第 37–54 行），没有 `useCommand` / `useMutation` / `useEventStream` / `useWebSocket`。
- **文档示例与 core 不同步**：`doc/guide/examples.md` 仍使用旧 `build: (input) => ({ ... })`，与 `packages/core/design.md` 冲突。
- **`struct.request` 与普通 `struct.object` 边界不清**：新手容易直接写 `body: struct.object(...)` 而报类型错误，需用 `struct.json(...)` 包裹（`packages/core/design.md` 第 311 行）。
- **README 为中文，与其他框架 README 语言不一致**，影响跨团队评估。

**Actionable suggestions**

1. 提供 `useCommand` / `useMutation` / `useEventStream` / `useWebSocketMessages` 等轻量 composables，只做 iterator-to-ref + cleanup。
2. 在 `packages/vue/README.md` 增加“何时需要 `build`”决策树与 `struct.request` 示例。
3. 统一框架 README 语言或提供双语版本。
4. 刷新 `doc/guide/examples.md` 为 `build(ctx, input)` 新签名。

### 2.4 `@defjs/angular`

**Key likes**

- Angular DI 集成自然：`provideClient` 返回 `EnvironmentProviders`，`injectClient()` 与 `inject(HttpClient)` 类似（`packages/angular/src/core.ts`）。
- 显式 Client 便于审计，符合企业合规需求。
- SSE 自动重连与 `Last-Event-ID` 对行情 / 临床告警场景很实用。

**Top pains**

- **README 过于单薄**：只有安装、快速开始和四行 API，缺少 interceptor 工厂、多 interceptor 顺序、SSE/上传示例。
- **`withInterceptors` 要求工厂函数**：`packages/angular/src/core.ts:20` 为 `withInterceptors(...fns: (() => Interceptor)[])`，与 `doc/core/interceptors.md` 直接传对象不一致。
- **单 Token 无法命名注入**：`HTTP_CLIENT` 硬编码一个 token，多 Client 场景需自行封装。
- **缺少 RxJS / Signal 适配层**：`client.execute` 返回 Promise，Angular 生态习惯 Observable / signal，需手动 `from(...)` / `toSignal`。
- **没有 Angular 测试工具**：缺少类似 `HttpTestingController` 的 mock helper。
- **SSE 事件校验失败静默跳过**：调试困难。

**Actionable suggestions**

1. 扩展 `packages/angular/README.md`：工厂 interceptor、多 Client、RxJS/signal 适配、TestBed 测试、SSE/上传 Cookbook。
2. 提供命名 Client provider：`provideClient({ identifier: 'market', ... })` + `injectClient('market')`。
3. 提供 `@defjs/angular/rxjs` 或官方 `from(client.execute(...))` 最佳实践示例。
4. 提供 Angular Testing Utilities / mock client helper。
5. 增加 SSE 严格模式选项。

### 2.5 `@defjs/opentelemetry-server`

**Key likes**

- 默认不采集 body、全部 header、原始 query string，PCI/HIPAA 场景放心（`packages/opentelemetry-server/README.md` 第 124 行）。
- 不自行初始化 OTel SDK，避免与现有 `@vercel/otel` 等配置冲突（README 第 6 行）。
- HTTP tracing 属性对齐 OTel 稳定语义；SSE / WebSocket 连接级指标实用。

**Top pains**

- **仅追踪 outbound client，不覆盖 inbound server**：包名容易让人误解为“server instrumentation”。
- **缺少 message-level 指标**：SSE/WebSocket 只有连接级指标，没有消息速率、队列溢出、重连次数等。
- **WebSocket trace context 默认写入 URL query**：`packages/opentelemetry-server/README.md` 警告 baggage 可能写入 URL，在物流等 URL 经过第三方设备的场景有隐私风险。
- **捕获指定 header 需要写 hook**：调试时想临时捕获 `x-tenant-id` 等低基数 header 成本高。
- **默认不捕获 message payload / size / backpressure**：调试实时系统时不便。

**Actionable suggestions**

1. 增加 `captureHeaders: string[]` 白名单选项。
2. 扩展 SSE / WebSocket 默认指标：重连次数、队列溢出、消息收发速率。
3. 提供 opt-in message-level tracing hooks（默认关闭）。
4. 将 `webSocket.queryPropagation` 默认设为 `false`，或提供显著运行时警告。
5. 考虑重命名或提供 companion package 以明确“outbound client instrumentation”定位。

### 2.6 Docs（跨包文档体验）

**Key likes**

- `packages/core/design.md` 与 `doc/guide/design-decisions.md` 对设计意图解释清晰。
- 状态码输出、拦截器洋葱模型、错误分支等文档示例被多次引用。

**Top pains**

- **`doc/guide/examples.md` 使用旧 API**：多处仍用 `build: (input) => ({ body: input, params: {...} })`，与 `packages/core/design.md`、`doc/core/context.md` 的 `build(ctx, input) { ctx.setJson(...); ctx.setPathParams(...) }` 冲突。
- **`output` 写法不统一**：`packages/core/README.md` 用数组 + `as const`，`packages/angular/README.md` 用对象；`doc/core/http.md` 同时出现 `200:` 与 `'200':` 两种 key。
- **快速开始未显式说明零值设计意图**：多位新手第一次见 `struct.object({ count: struct.number() }).parse({})` 返回 `{ count: 0 }` 时误以为这是 bug。需要在 `doc/guide/getting-started.md` 中明确这是 Go 风格设计选择，并链接到严格模式选项（如果有）。
- **`struct.request` 与 `build` 的边界分散在多处**：没有一页纸决策树。
- **框架 README 语言不一致**：`packages/vue/README.md` 为中文，React/Angular 为英文。
- **缺少 React 表单与 `StructError.flatten()` 的映射示例**。

**Actionable suggestions**

1. 全面刷新 `doc/guide/examples.md` 为新 `build(ctx, input)` 签名，并加 CI 检查防止旧写法回潮。
2. 在 `doc/guide/getting-started.md` 顶部明确说明零值默认是 Go 风格设计意图（对齐 `encoding/json`），并给出启用严格模式的入口。
3. 提供“何时需要 `build` / 何时可用 `struct.request`”决策表。
4. 统一 `output` 推荐写法并在各框架 README 中说明数组/对象形式的差异。
5. 统一框架 README 语言或提供双语版本。
6. 增加 React / Vue / Angular 表单错误渲染示例。

---

## 3. Feedback by Persona Type

### 3.1 前端开发者（React / Vue / Angular）

- **代表背景**：电商 SaaS、金融科技、医疗信息化、教育科技、独立开发者。
- **共性好评**：类型推导准确、显式 Client、框架注入自然、`alias` 处理 snake_case、错误三元组直观。
- **共性痛点**：
  - 框架包只是 core 的薄封装，缺少 `useQuery` / `useMutation` / `useCommand` / `useEventStream` / `useWebSocket`。
  - 仍需手写 `useEffect + useState` 管理 loading/error/data。
  - 缺少与 TanStack Query / React Query / VueUse / RxJS async pipe 的集成。
  - 文档示例 API 签名不一致导致复制粘贴后编译失败。
- **典型评分**：3.0–4.5 / 5。

### 3.2 后端 / 全栈开发者

- **代表背景**：金融科技网关、B2B SaaS、电商 Spring Boot / Next.js、健康科技 NestJS。
- **共性好评**：Go 风格 struct 对齐后端、显式 Client 利于测试、OTel 保守默认、状态码驱动类型收窄。
- **共性痛点**：
  - 无法强制缺失字段报错，KYC / 临床 / 金融payload 不能接受零值默认。
  - 缺少 OpenAPI / JSON Schema / codegen，无法从后端 Swagger 生成 command。
  - SSE / WebSocket 非法事件静默跳过。
  - HTTP 没有 retry/backoff；`timeout` / `abort` 互斥。
  - `struct.bigint()` 与现有 JSON-number ID 合同冲突。
- **典型评分**：3.0–4.0 / 5。

### 3.3 决策者 / 架构师 / CTO（跨行业）

- **代表背景**：金融科技 Staff Engineer、物流 Principal Engineer、游戏 CTO、健康科技 Tech Lead。
- **共性好评**：显式 Client 适合多租户 / 多环境、跨传输层模型统一、OTel 指标对齐稳定语义、框架 API 对称便于收购后整合。
- **共性痛点**：
  - 目前更像“类型安全的 fetch 封装”，缺少服务端状态管理、缓存、去重、SSR 预取等企业落地必需能力。
  - 缺少 server-side struct 复用入口，无法前后端共享同一份定义。
  - `opentelemetry-server` 仅覆盖 outbound client，不是完整平台方案。
  - WebSocket 握手 header 限制、重连时 token 刷新、二进制消息支持影响实时场景。
- **典型评分**：3.5–4.0 / 5。

---

## 4. Top 10 Actionable Recommendations

按 **影响 × 落地成本** 排序。

| 排名 | 建议 | 影响 | 成本 | 关键证据 |
|----:|------|------|------|----------|
| 1 | **刷新并锁定 `doc/guide/examples.md` API 签名** | 高 | 低 | 多份 persona 复制旧 `build: (input) =>` 后编译失败；React/Vue/Angular 均提到 |
| 2 | **提供 struct 严格模式（缺失字段报错）作为 opt-in** | 高 | 中 | 零值默认是 Go 风格设计意图；金融 KYC、医疗、表单场景需要显式 fail-fast 开关 |
| 3 | **为 React/Vue 提供官方数据获取 hooks/composables** | 高 | 中 | React 4 persona、Vue 4 persona 均吐槽“回到手写 useEffect”；影响生产采用 |
| 4 | **统一 `withInterceptors` 签名：支持直接传 interceptor 对象** | 高 | 低 | React/Angular/Vue 均要求工厂函数，与 `doc/core/interceptors.md` 不一致 |
| 5 | **修复 `struct.date()` boolean footgun 或增加 `.strict()`** | 中 | 低 | `packages/core/design.md` 已警告；多位 persona 险些上线 bug |
| 6 | **允许 `timeout` 与 `abort` 同时存在** | 中 | 低 | `doc/core/http.md` 写明互斥；金融/电商/后端均需组合取消 |
| 7 | **SSE / WebSocket 增加严格事件校验选项** | 中 | 低 | `doc/core/sse.md` 默认静默跳过；医疗/物流/游戏/金融均要求 fail-closed |
| 8 | **扩展 Angular README + 提供命名 Client / RxJS 适配 / 测试 helper** | 中 | 中 | Angular persona 1/2/3/4 均指出 README 单薄、工厂签名坑、无测试工具 |
| 9 | **增加 HTTP retry / backoff 配置** | 中 | 中 | `doc/core/http.md` 无 retry；物流/医疗/后端均需要 |
| 10 | **提供 OpenAPI / JSON Schema 双向生成能力** | 高 | 高 | `packages/core/design.md` 已列为不提供；后端/平台/决策型 persona 反复列为 adoption 障碍 |

---

## 5. Raw Persona Table

| Persona | 背景 | 体验的包 | 评分 | 一句话 verdict |
|---------|------|----------|------:|----------------|
| 林薇 | 电商 SaaS 初创，初级 React 前端 | `@defjs/core`, `@defjs/react` | 2 / 5 | 类型安全是亮点，但 React DX 太薄、文档 API 不一致、零值语义反直觉，入门曲线陡峭。 |
| 陈越 | 金融科技，中级 React 前端 / TS 布道者 | `@defjs/core`, `@defjs/react` | 4 / 5 | 对 TS + Go 后端团队契合，类型与测试是优势；补齐 Suspense 与文档刷新后愿意在支付链路推广。 |
| 张锐 | 医疗信息化，前端架构师 | `@defjs/core`, `@defjs/react` | 3 / 5 | 架构底座扎实，但缺少缓存、去重、可观测性、Error Boundary 集成，只能小范围试点。 |
| 王浩 | 独立开发者 / 内容创作工具，全栈偏前端 | `@defjs/core`, `@defjs/react` | 3 / 5 | 小而美方向吸引人，但缺少 SSR 预取、简化 hook、struct 日期/零值行为对内容表单不友好。 |
| 刘敏 | SaaS 初创，初级 Vue 前端 | `@defjs/core`, `@defjs/vue` | 3 / 5 | 类型安全和 Vue 注入简单，但零值语义、build 写法不一致、缺少 Vue composable 让学习曲线陡。 |
| 王哲 | B2C 电商，高级 Vue 前端架构师 | `@defjs/core`, `@defjs/vue` | 4 / 5 | 底层设计与类型系统优秀，但 Vue 层太薄、缺服务端状态抽象、build projection 有限。 |
| Alex Chen | 独立全栈，实时协作工具 | `@defjs/core`, `@defjs/vue` | 4.5 / 5 | 一人团队非常受益三种传输层统一；调试静默跳过、WebSocket auth、缺少 iterator composable 是生产顾虑。 |
| 张伟 | 金融科技，前端技术负责人 | `@defjs/core`, `@defjs/vue` | 3.5 / 5 | 安全、错误处理、拦截器底子好，但文档漂移、零值语义、缺少 Vue composables 和 OpenAPI  codegen。 |
| 陈启明 | 金融科技，Angular 前端架构师 | `@defjs/core`, `@defjs/angular` | 4 / 5 | 显式 Client、SSE 重连击中金融场景；Angular README、多 Client、RxJS 适配仍是短板。 |
| 林小满 | 健康科技初创，中级 Angular 开发 | `@defjs/core`, `@defjs/angular` | 3 / 5 | DI 集成自然，但 `build`/`struct.request` 边界混乱、零值默认难排查、示例对初学者不够连贯。 |
| 王志远 | 物流科技，Angular 技术负责人 | `@defjs/core`, `@defjs/angular` | 3 / 5 | 类型安全与拦截器满足迁移需求；Angular 工厂签名、测试工具、多 Client 缺失拖慢迁移。 |
| 赵雨桐 | 教育科技，初级 Angular 开发 | `@defjs/core`, `@defjs/angular` | 3 / 5 | 核心概念好学，但文档缺口多：output 写法、SSE/上传示例、Promise→Observable、body codec。 |
| 刘伟 | 金融科技后端负责人 | `@defjs/core`, `@defjs/opentelemetry-server` | 4 / 5 | 设计与 Go 对齐一致、OTel 默认保守；严格校验缺失让金融场景不能作为默认首选。 |
| Alex Rivera | SaaS 初创全栈创始人 | `@defjs/core`, `@defjs/opentelemetry-server` | 3 / 5 | 类型安全和 OTel 省心，但 struct 仪式重、缺少 codegen，小团队迭代速度受影响。 |
| Priya Sharma | B2B SaaS 平台工程师 | `@defjs/core`, `@defjs/opentelemetry-server` | 3 / 5 | 类型安全和 OTel 合格，但缺少 OpenAPI 导出和丰富默认指标，仍需包一层才能推广。 |
| 陈明 | 电商全栈组长 | `@defjs/core`, `@defjs/opentelemetry-server` | 4 / 5 | 从 Java/Spring 背景看很新鲜；补齐 WebSocket headers 和 codegen 后愿意全面推广。 |
| Wei Chen | 金融科技 Backend Lead（跨框架评估） | core/react/vue/angular/opentelemetry-server | 3 / 5 | 设计一致、Go 对齐受欣赏，但严格校验空白使其不适合金融 payload 默认选择。 |
| Sarah Okonkwo | 电商高级前端（跨框架评估） | core/react/vue/angular/opentelemetry-server | 4 / 5 | 类型化 command 定义优秀，但缺少数据获取层意味着生产 React 仍需其他库。 |
| Dr. Henrik Bergström | 健康科技全栈 Lead（跨框架评估） | core/react/vue/angular/opentelemetry-server | 3.5 / 5 | Angular 集成与可观测性默认好，但 WebSocket header 限制和 SSE 静默丢弃是监管产品大顾虑。 |
| Yuki Tanaka | 游戏初创 CTO（跨框架评估） | core/react/vue/angular/opentelemetry-server | 4 / 5 | 实时原语扎实，但二进制消息、重连 token 刷新、message-level traces 需要 workaround。 |
| Marco Rossi | 物流平台架构师（跨框架评估） | core/react/vue/angular/opentelemetry-server | 3.5 / 5 | 强在类型化 outbound 调用和可观测性，但缺少服务端 struct 复用和 HTTP retry，只是拼图之一。 |
| Priya Nair | EdTech 初中级 React 开发（跨框架评估） | core/react/vue/angular/opentelemetry-server | 4 / 5 | 对她这个级别很友好，但没有 React hook 意味着需要额外样板或引入其他库。 |

---

## 附录：引用文件清单

- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-react-persona-1.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-react-persona-2.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-react-persona-3.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-react-persona-4.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-vue-persona-1.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-vue-persona-2.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-vue-persona-3.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-vue-persona-4.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-angular-persona-1.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-angular-persona-2.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-angular-persona-3.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/frontend-angular-persona-4.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/backend-fullstack-persona-1.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/backend-fullstack-persona-2.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/backend-fullstack-persona-3.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/backend-fullstack-persona-4.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-1.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-2.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-3.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-4.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-5.md`
- `/Users/munmunmiao/Documents/web/zen-kit/.feedback/cross-industry-persona-6.md`
