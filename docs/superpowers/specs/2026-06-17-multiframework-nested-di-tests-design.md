# 多框架多层组件依赖注入测试设计文档

**日期**: 2026-06-17  
**状态**: 待用户复核  
**作者**: Claude Code

## 概述

`@defjs/react`、`@defjs/vue`、`@defjs/angular` 都为 `@defjs/core` 的 `Client` 提供框架生态内的依赖注入入口。当前 React 与 Vue 已有基础测试；Angular 包已有实现和文档，但缺少本地测试入口。

本设计为三套框架分别增加多层组件依赖注入测试，验证在真实框架组件树中：

- 单个 provider 子树内的多层组件拿到同一个 `Client` 实例。
- 嵌套 provider 时，最近的 provider 生效。
- outer subtree 与 inner subtree 的 `Client`、`withEndpoint()`、`withInterceptors()` 互不串层。
- 注入结果能驱动真实请求，而不只是“拿到了一个对象”。

重要约束：**每个包都使用各自独立的测试，不做共享测试抽象或共享 contract adapter。** Vue、Angular、React 的使用场景和测试惯用法不同，测试应保留各自生态的自然写法。

## 目标

1. 在 React、Vue、Angular 三个包中分别覆盖多层组件依赖注入行为。
2. 正式确认 nested provider 的语义为：**最近 provider 生效**。
3. React 与 Vue 复用现有 Vitest browser 测试体系。
4. Angular 新增独立测试基础设施和 `test` 脚本，使根级 `pnpm -r run test` 能覆盖 Angular 包。
5. 测试只依赖公开 API：`ClientProvider` / `useClient`、`provideClient` / `injectClient`、`withEndpoint`、`withInterceptors`。
6. 避免新增共享测试层、共享 adapter 或跨框架测试 DSL。

## 非目标

1. 不抽象跨框架共享测试契约代码。
2. 不改造 `@defjs/core`。
3. 不把 React/Vue/Angular 的测试风格统一成同一种测试 harness。
4. 不直接导出或测试 Angular/Vue/React 内部私有 DI token。
5. 不在本轮重构已有测试目录结构，除非 Angular 补测试入口必须新增配置文件。

## 现状

### React

- 包路径：`packages/react`
- DI 实现：`packages/react/src/core.tsx`
- 现有测试：
  - `packages/react/src/core.browser.spec.tsx`
  - `packages/react/src/e2e.browser.spec.tsx`
- 测试框架：Vitest browser + Playwright + React Testing Library。
- 当前已有单 provider 下 nested consumer 测试，但没有 outer/inner provider 分层覆盖测试。
- README 中存在“nested `ClientProvider` 不支持”的旧表述，与 React Context 的自然语义和当前实现不一致，需要同步更新为支持最近 provider 生效。

### Vue

- 包路径：`packages/vue`
- DI 实现：`packages/vue/src/core.ts`
- 现有测试：
  - `packages/vue/src/core.browser.spec.ts`
  - `packages/vue/test/core.spec.ts`
- 测试框架：Vitest browser + Playwright + Vue `createApp`。
- `pnpm test` 当前通过 browser project 运行 `src/**/*.browser.spec.ts`。
- 现有测试覆盖 plugin install、根组件注入和真实请求，但没有多层组件树，也没有嵌套 provider 分层覆盖。

### Angular

- 包路径：`packages/angular`
- DI 实现：`packages/angular/src/core.ts`
- 当前没有 `test` 脚本、Vitest 配置或测试文件。
- 实现使用 Angular `InjectionToken`、`makeEnvironmentProviders`、`inject()`。
- 需要新增 Angular 自己的测试基础设施，验证 hierarchical injector 下的公开 API 行为。

## 采用方案

采用“行为语义一致，测试实现独立”的方案：

- 三个包验证同一组 DI 行为语义。
- 每个包都写在自己的测试文件中。
- 每个框架使用自己的生态工具和组件模型。
- 不共享测试代码，不共享 fixture adapter，不设计跨框架 DSL。

理由：

1. React Context、Vue provide/inject、Angular hierarchical injector 的生命周期、渲染方式和常见使用场景不同。
2. 强行共享测试会引入额外抽象，降低测试可读性。
3. 本轮目标是补行为覆盖，不是建立跨框架测试平台。
4. 用户明确要求每个包单独测试，不做共享。

## 统一行为契约

虽然不共享测试代码，但三个包应分别覆盖以下行为：

### 1. 无 provider 负例

调用公开注入 API 时，如果当前组件树没有提供 client，应失败：

- React：`useClient()` 抛出 `No HTTP client provided`。
- Vue：`injectClient()` 抛出 `No HTTP client provided`。
- Angular：`injectClient()` 在没有 `provideClient()` 的 injector 中失败。若 Angular 默认 DI 错误信息与 React/Vue 不同，测试以公开 API 当前错误语义为准；若实现需要统一错误信息，应在实现计划中单独评估。

### 2. 单 provider 多层组件

构造三层组件树：root/outer → middle → leaf。

断言：

- middle 和 leaf 都能注入 client。
- 同一 provider 子树内注入到的是同一个 `Client` 实例。
- 组件层级不会阻断注入。

### 3. 多 provider 分层覆盖

构造 outer provider 内嵌 inner provider，并保留 outer sibling：

```text
outer provider
├─ outer consumer
├─ inner provider
│  └─ inner leaf consumer
└─ outer sibling consumer
```

断言：

- outer consumer 与 outer sibling 拿到同一个 outer client。
- inner leaf 拿到 inner client。
- inner client 与 outer client 不是同一个实例。
- inner subtree 的 `withEndpoint()` / `withInterceptors()` 不影响 outer sibling。
- outer provider 的 options 不泄漏到 inner provider，除非对应框架语义明确支持继承；本轮按“provider 边界独立创建 client”测试。

### 4. 请求行为验证

至少一个测试应执行真实 `client.execute(...)` 请求，证明注入 client 能实际工作。

- React/Vue 复用现有 Hono test server 与 `testServerHost`。
- Angular 新增同等 test setup，或使用 Angular 测试中可控的 local server。
- 断言请求结果、endpoint 命中或 interceptor 副作用，避免只做实例存在性断言。

## React 测试设计

### 文件

- 修改：`packages/react/src/e2e.browser.spec.tsx`
- 修改：`packages/react/README.md`

### 测试形状

在现有 e2e browser spec 中新增一个 nested provider 场景：

1. 使用 outer `<ClientProvider options={[withEndpoint(outerEndpoint), withInterceptors(outerInterceptor)]}>`。
2. 在 outer provider 下渲染：
   - `OuterConsumer`
   - inner `<ClientProvider options={[withEndpoint(innerEndpoint), withInterceptors(innerInterceptor)]}>`
   - `OuterSiblingConsumer`
3. `InnerConsumer` 位于 inner provider 的更深层，例如 `InnerShell → InnerLeaf`。
4. 每个 consumer 调用 `useClient()` 并记录实例。
5. 断言 outer consumer 与 outer sibling 是同一实例，inner leaf 是不同实例。
6. 用真实请求或可观察 interceptor 断言 outer/inner options 分别生效。

### README 更新

把“不支持嵌套 `ClientProvider`”改为支持 nested provider，并说明最近 provider 生效。文档应提醒用户：如果嵌套 provider，inner subtree 会拿到新的 client 实例，不会复用 outer client。

## Vue 测试设计

### 文件

- 修改：`packages/vue/src/core.browser.spec.ts`

### 测试形状

在 browser spec 中新增 Vue 原生组件树：

1. 使用 `createApp` 创建 root 组件。
2. root 通过 `app.use(provideClient(...outerOptions))` 提供 outer client。
3. 在组件树中定义 `Middle` 与 `Leaf`，二者都调用 `injectClient()`。
4. 单 provider 测试断言 middle 与 leaf 拿到同一实例。
5. 多 provider 测试在中间组件内使用 Vue 的 `provide(HTTP_CLIENT, innerClient)` 不合适，因为 `HTTP_CLIENT` 是公开导出的 token 但会绕过 `provideClient()` 的公开 API 行为；优先使用应用/子树层面符合 Vue 生态的 provider 写法。
6. 如果 Vue plugin 无法自然挂到子组件子树，则实现计划应选择最贴近 Vue 语义的方式：在子组件 `setup()` 内调用 Vue `provide(HTTP_CLIENT, createClient(...innerOptions))` 并清楚标注这是 Vue provide/inject 的分层语义测试；同时继续用 `provideClient()` 覆盖 app 级 provider 行为。
7. 执行真实请求，断言 deepest consumer 的 client 可用。

### Vue 特别说明

`HTTP_CLIENT` 在 Vue 包中是公开导出的 `InjectionKey<Client>`。测试可以使用该公开 key 构造 Vue 子树层级 provider，但不应导入或依赖非公开内部实现。若实现计划发现 `provideClient()` 只能作为 app plugin 使用，则子树覆盖测试可使用 `HTTP_CLIENT` + `createClient()`，并把 app 级 provider 测试保留给 `provideClient()`。

## Angular 测试设计

### 文件

新增：

- `packages/angular/vitest.config.ts`
- `packages/angular/vitest.config.browser.ts`
- `packages/angular/test/shared.ts`
- `packages/angular/test/setup.ts`
- `packages/angular/src/core.browser.spec.ts`

修改：

- `packages/angular/package.json`

### 测试基础设施

Angular 包应获得独立测试入口：

- `package.json` 增加 `test` script：`vitest run --config vitest.config.ts --coverage`。
- `vitest.config.ts` 聚合 browser project 并配置 coverage。
- `vitest.config.browser.ts` 与 React/Vue 保持项目级一致：Playwright provider、Chromium/Firefox、`src/**/*.browser.spec.ts` include。
- `test/shared.ts` 提供 packageRoot、globalSetupPath、coverageConfig。
- `test/setup.ts` 提供 local test server host，尽量复用 React/Vue setup 的结构但不共享文件。

### Angular 测试形状

使用 Angular standalone components 和 TestBed：

1. 定义 root component，`providers` 中使用 `provideClient(withEndpoint(outerEndpoint), withInterceptors(outerInterceptor))`。
2. root template 包含 outer consumer、inner subtree、outer sibling。
3. middle/leaf components 调用 `injectClient()`。
4. inner subtree component 的 `providers` 中再次使用 `provideClient(withEndpoint(innerEndpoint), withInterceptors(innerInterceptor))`。
5. 断言：
   - root/outer/sibling 拿到 outer client。
   - inner leaf 拿到 inner client。
   - inner 与 outer client 不同。
   - inner provider 的 endpoint/interceptors 不影响 outer sibling。
6. 执行真实请求验证 client 可用。

### Angular 特别说明

Angular 的 `EnvironmentProviders` 与 component `providers` 的兼容性需要在实现时用实际编译结果验证。如果 standalone component `providers` 不能直接接受 `EnvironmentProviders`，实现计划应改用 Angular 推荐的 `bootstrapApplication`、`TestBed.configureTestingModule({ providers: [...] })`、route/environment injector 或其他官方层级 injector 方式，目标不变：必须验证层级 injector 下最近 `provideClient()` 生效。

测试不直接导入 `HTTP_CLIENT`、`HTTP_ENDPOINT`、`HTTP_INTERCEPTOR_FNS`，因为这些 token 当前不是公开 API。

## 验证计划

完成实现后运行：

```bash
pnpm --dir packages/react test
pnpm --dir packages/react typecheck
pnpm --dir packages/vue test
pnpm --dir packages/vue typecheck
pnpm --filter @defjs/angular test
pnpm --filter @defjs/angular typecheck
pnpm test
pnpm typecheck
```

如果 Playwright 浏览器依赖缺失导致测试无法启动，应报告环境失败原因，不把环境失败写成代码失败或通过。

## 风险与处理

### React README 与实现语义冲突

风险：README 旧文档声称 nested provider 不支持。

处理：以用户批准的语义为准，更新 README；测试锁定“最近 provider 生效”。

### Vue 子树 provider 方式

风险：`provideClient()` 是 app plugin，未必能直接表达子组件内的第二层 provider。

处理：使用 Vue 公开 `HTTP_CLIENT` key 与 `provide()` 表达子树层级覆盖，同时保留 `provideClient()` 的 app 级测试。该方式符合 Vue 生态，不引入共享测试抽象。

### Angular EnvironmentProviders 层级使用

风险：`EnvironmentProviders` 不一定能直接放入 component `providers`。

处理：实现阶段先用失败测试确认 Angular 官方可行写法，再选择 TestBed/environment injector/bootstrapApplication 的最小方案。测试目标保持公开 API 行为，不测试私有 token。

### Coverage 100% 阈值

React/Vue 已有 100% coverage 配置；Angular 新增 coverage 后可能要求覆盖所有分支。

处理：Angular 测试应覆盖 `withEndpoint`、`withInterceptors`、默认 endpoint 行为、`provideClient`、`injectClient` 的主要路径。若 coverage 报告暴露未覆盖分支，优先补行为测试，不降低阈值。

## 完成标准

1. React、Vue、Angular 三个包都有各自独立的多层 DI 测试。
2. 不存在共享测试 adapter、共享 DSL 或共享 contract runner。
3. Nested provider 行为被测试锁定为“最近 provider 生效”。
4. Angular 包新增 `test` 脚本，并能被 workspace 递归测试发现。
5. React README 与测试语义一致。
6. 验证命令按计划运行；若失败，失败原因被清楚记录。
