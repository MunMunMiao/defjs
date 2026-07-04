# 2026-07-02 Feedback Repair Design

## 背景

`docs/superpowers/feedback/2026-07-02-simulated-user-research.md` 汇总了 24 位跨行业模拟用户对当前仓库的体验反馈。最高优先级问题集中在文档可信度和入门路径一致性，而不是底层实现缺陷。

本设计采用用户确认的方案 B：先修复 P0 文档可信度问题，并补充 P1 框架 cookbook 与 thin adapter 边界说明；不进入 API 能力改造。

## 目标

本轮修复要完成：

1. 统一公开入口文档的 onboarding 写法，避免 `createClient`、`struct.request`、`build(ctx, input)`、`output`、`withInterceptors` 示例口径漂移。
2. 重组 root README 的 Packages / Roadmap / adoption note，让已交付能力、计划能力和非目标边界清楚分开。
3. 前置 `@defjs/opentelemetry-server` 的 WebSocket query propagation 安全/隐私提示，并给出 `queryPropagation: false` 的 recommended production baseline。
4. 补充 React / Vue / Angular 的主流 cookbook，说明如何用现有公开 API 接入 Next.js/TanStack Query、Nuxt/Pinia、Angular RxJS/signals/TestBed。
5. 明确 framework packages 是 thin adapter：只提供 client 注入与配置接线，不承诺内置 query/cache/state 框架。

## 非目标

本轮不做：

- 不新增 `@defjs/react-query`、`@defjs/nuxt`、`@defjs/angular-rxjs` 等新包。
- 不新增新的 helper export 或 runtime API。
- 不实现 opt-in strict / regulated profile。
- 不实现 SSE/WebSocket message-level telemetry。
- 不实现 `captureHeaders`、`captureAttributes`、redaction preset。
- 不修改 locale 镜像文档，例如 `doc/zh-Hans`、`doc/fr-FR`、`doc/de-DE`。
- 不新建第二套 docs 校验系统。

## Canonical onboarding style

本设计只定义“入门主路径写法”，不把它描述成唯一合法 API。

主入口示例统一采用：

```ts
const client = createClient(withEndpoint('https://api.example.com'))
```

请求形状能直映 transport parts 时，优先使用：

```ts
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

只有确实需要手工映射时，才展示：

```ts
build(ctx, input) {
  ctx.setPathParams({ id: input.id })
  ctx.setQueryParams({ preview: input.preview })
  ctx.setJson(input.body)
}
```

`output` 的 array form 作为 onboarding house style。reference 页面可以继续说明 object form 仍受支持。

`withInterceptors` 在公开入口中只保留一种一致写法，避免数组、工厂函数和直接 interceptor 在同一入门路径中混用。框架包如需说明同名 helper 的语义差异，应明确它是 framework-specific provider/client option glue。

## 文件级设计

### `README.md`

保留现有 Introduction 和 Quick Start，但重组 Packages / Roadmap 区域。

新增或调整为：

- Delivered today
  - `@defjs/core`
  - `@defjs/angular`
  - `@defjs/vue`
  - `@defjs/react`
  - `@defjs/opentelemetry-server`
- Planned
  - CLI tool
  - Generate API from OpenAPI
  - Generate full SDK package
- Non-goals / boundaries
  - framework wrappers are not query/cache/state libraries
  - OpenTelemetry integration does not initialize the SDK
  - message/body telemetry is not captured by default
  - CLI/codegen is not delivered yet

补 adoption note：

- Repo development baseline: Node `>=26`, `pnpm@11.6.0`, `engine-strict=true`.
- Package adoption: most shipped packages are pre-1.0; `@defjs/angular` version follows Angular ecosystem versioning; overall APIs may still evolve.

不得伪造稳定性、SLA、兼容性或发布承诺。

### `doc/index.md`

首页 hero snippet 改成当前 onboarding style：

- `createClient(withEndpoint(...))`
- `struct.request(...)`
- array-form `output`
- `client.execute(getUser({ path: { id: 1 } }))`

页面保持短，不在首页解释所有变体；只把读者引向 core README 和 guide。

### `doc/guide/getting-started.md`

作为 P0 主修文档，统一最小教程路径：

- 把旧 `input: struct.object(...)` 改成 `struct.request(...)`。
- 把 onboarding 示例统一为 array-form `output`。
- 把旧 `build: (input) => ({ ... })` 改成 `build(ctx, input)`。
- 如果示例不需要 manual mapping，删除 `build`，改用 `struct.request(...)` 的 auto-build。
- `withInterceptors` 只保留一种一致、可解释的写法。
- 安装附近补 requirements/adoption note，区分 repo development baseline 与 package 使用语境。

### `doc/guide/examples.md`

作为 copy-paste examples 页面，统一到同一套 API 约定：

- 请求形状示例使用 `struct.request(...)`。
- 手工映射示例使用 `build(ctx, input)` 加 `ctx.setPathParams(...)` / `ctx.setQueryParams(...)` / `ctx.setJson(...)`。
- 修正 cheat-sheet 中 `struct.alias(name)` 的错误，改为字段级 `.alias(name)` 用法。
- 不把 array-form `output` 写成唯一合法形式，只在 examples 主路径中统一采用它。

### `doc/core/http.md`

修正“provided input 就必须提供 build”的错误表述。

改成两条路径：

1. `struct.request(...)`：自动映射 `path`、`query`、`headers`、`body`。
2. `build(ctx, input)`：在需要手工映射或复杂转换时使用。

这页应和 `packages/core/README.md`、`doc/core/commands.md` 保持一致。

### `packages/opentelemetry-server/README.md`

将 WebSocket query propagation warning 前移到首次使用/配置附近。

新增推荐基线：

```ts
webSocket: {
  queryPropagation: false,
}
```

使用措辞：`recommended production baseline` 或 `safer production baseline for URL-based propagation`。

避免说成绝对安全。必须说明：

- WebSocket query propagation 默认开启是为了浏览器兼容性。
- query strings 可能被 proxies、browsers、APM tooling、access logs 记录。
- baggage 可能包含敏感值。
- 未经隐私与 cardinality 评审，不要主动加入 raw query strings、bodies、full headers、message payloads。
- OTel package 不初始化 SDK，只接入已有 tracer/meter。

### `doc/plugins/opentelemetry-server.md`

镜像 package README 的 safety-first 结构：

- 顶部附近保留 outbound-only 与 does not initialize SDK 边界。
- 配置表前放 query propagation warning。
- 给出同样的 `queryPropagation: false` recommended production baseline。

### React cookbook

在 `packages/react/README.md` 或文档站对应框架页面中补 cookbook。内容边界：

- React package 是 thin adapter，只负责 `ClientProvider`、`useClient` 和 client option glue。
- Next.js App Router 中 per-request client 的放置方式。
- `headers()` / `cookies()` 如何由应用层转成 request headers。
- TanStack Query `queryFn` 如何调用 `client.execute(...)`。
- prefetch / hydrate / dehydrate 的数据流边界。
- Error Boundary 与 defjs error-first tuple 的关系。
- `ClientProvider` 重挂载和 client 实例生命周期说明。

不得暗示 `@defjs/react` 自带 TanStack Query、SWR、Suspense 或缓存能力。

### Vue cookbook

在 `packages/vue/README.md` 或文档站对应框架页面中补 cookbook。内容边界：

- Vue package 是 thin adapter，只负责 provide/inject client。
- Nuxt server/client plugin 的职责分离。
- 请求级 header/cookie 透传由应用层完成。
- Pinia action 中如何调用 `client.execute(...)`。
- SSE/WebSocket 在组件卸载、路由切换和 store dispose 时如何清理。
- SSR 安全说明：不要把跨请求 client 或敏感 headers 放入全局单例。

不得暗示 `@defjs/vue` 自带 Nuxt module、Pinia plugin 或状态管理能力。

### Angular cookbook

在 `packages/angular/README.md` 或文档站对应框架页面中补 cookbook。内容边界：

- Angular package 是 DI thin adapter。
- facade/service 如何封装 `injectClient()`。
- `from(client.execute(...))` 如何桥接 RxJS。
- `toSignal(...)` 如何桥接 signal。
- `TestBed` 如何 override provider 或 mock typed client。
- typed mock client factory 的最小示例。
- 多 client 场景如何用 provider 边界表达。

不得暗示 `@defjs/angular` 自带 RxJS/state/testing helper。

## 验证策略

自动验证绑定 `/doc` 文档页，复用现有校验链：

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

README 文件不声称已被现有 docs typecheck 自动覆盖。README 验收采用人工一致性复核，重点核对：

- root README 与当前 workspace 包是否一致。
- package README 与 `packages/core/README.md`、`doc/core/commands.md` 的 onboarding style 是否一致。
- OTel README 与 `doc/plugins/opentelemetry-server.md` 的安全提示是否一致。
- cookbook 是否明确 thin adapter 边界，没有承诺不存在的 API。

如果环境不满足 Node `>=26` 或 pnpm `11.6.0`，必须报告无法运行对应验证命令，而不是写成已通过。

## 风险与约束

- 不把 array-form `output` 写成唯一合法写法，只作为 onboarding house style。
- 不把 Node `>=26` / pnpm `11.6.0` / `engine-strict=true` 写成所有消费者前置条件；它们是 repo development baseline。
- 不把所有 package 统一说成 `0.x`；`@defjs/angular` 版本跟随 Angular 生态，整体 API 仍应写成 evolving。
- 不整页重写 README，只最小重组 Packages / Roadmap / adoption note。
- 不新建第二套 docs 校验系统。
- 不把 P1 cookbook 扩展为 API 能力变更。

## 验收标准

完成后应满足：

- Root README 不再把已存在的 React/Vue wrappers 写成未来能力。
- Root README 明确区分 delivered / planned / non-goals。
- 首页、Getting Started、Examples、HTTP reference 的入门写法不再互相冲突。
- `struct.request(...)` 与 `build(ctx, input)` 的关系被清楚解释。
- OTel WebSocket query propagation 风险在首次配置附近可见。
- OTel README 与文档站插件页都给出 `queryPropagation: false` recommended production baseline。
- React/Vue/Angular cookbook 都明确 thin adapter 边界，并只使用现有公开 API。
- `/doc` 校验命令按环境能力运行并报告真实结果。
