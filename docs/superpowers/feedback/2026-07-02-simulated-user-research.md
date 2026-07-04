# 2026-07-02 模拟用户研究报告

## 执行摘要

- 24 位 persona 的综合均分约为 3.50/5，整体判断是“底层抽象可信、采用配套偏薄”。评价最高的不是某个炫技功能，而是 @defjs/core 的统一 typed transport 心智与 @defjs/opentelemetry-server 的克制默认值。
- 最紧急的 P0 不是扩 API，而是修复信任面：/Users/munmunmiao/Documents/web/zen-kit/README.md 的 roadmap、/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 的 quick start、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的示例口径需要先重新对齐。
- 用户并没有普遍要求把框架包做厚；相反，多数人接受 thin adapter 边界，但希望官方把 React Query / Next.js、Nuxt / Pinia、Angular RxJS / signals / TestBed 这些高频落地路径做成 cookbook 或 companion pattern。
- 第二层 P1 诉求集中在关键链路严模式与实时观测：金融、医疗、平台、安全、SRE persona 都希望看到 opt-in strict profile、消息级 telemetry、allowlist/redaction 以及更明确的隐私与 fail-closed 指南。

- 本轮共组织 **24 位跨行业模拟用户**，覆盖 root `defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`。
- 24 位 persona 的平均评分为 **3.50/5**。总体结论：底层抽象可信，但文档一致性、框架落地 cookbook、strict profile 与实时观测能力决定下一阶段 adoption 上限。

## 方法与边界

本报告是模拟用户研究，不是真实外部用户访谈，也未声明已运行完整应用或命令验证。每位模拟用户的反馈都要求先查阅相关文档、README、指南或公开入口，再提出意见。报告将已文档化或已记录为设计意图的行为标为“设计取舍”或“有文档但不直觉”，不会直接标为 bug。

执行口径：

- 以当前工作区源码包为准，覆盖 `packages/*`、`doc` 和 root package 管理面。
- 不把 `packages/*/dist/package.json`、`doc/.vitepress/cache` 等生成物或缓存当作独立 package。
- root `defjs` 是 private monorepo orchestrator，不是终端用户安装库；本报告将它作为“仓库入口与发布/CI/DX 管理面”覆盖。
- 反馈分类使用：`design-choice`、`documented-but-unintuitive`、`documentation-gap`、`possible-doc-implementation-mismatch`、`missing-capability`。
- 审查结果：通过；已完成只读核验。基于 /private/tmp/claude-501/-Users-munmunmiao-Documents-web-zen-kit/df2ab16d-8649-446f-afe7-7da6f854f2a8/tasks/p01-p18-feedbacks.json 与本轮提供的 P19-P24 合并后，结果为 24 条 feedback（P01-P24）；24/24 都包含 docsConsulted。允许分类仅出现 design-choice、documentation-gap、documented-but-unintuitive、missing-capability、possible-doc-implementation-mismatch。抽查证据与边界来源包括 /Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml、/Users/munmunmiao/Documents/web/zen-kit/README.md、/Users/munmunmiao/Documents/web/zen-kit/doc/index.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md、/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md、/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx、/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts、/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts、/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md、/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts、/Users/munmunmiao/Documents/web/zen-kit/.github/workflows/ci.yml、/Users/munmunmiao/Documents/web/zen-kit/.github/workflows/_checks.yml。按当前反馈文件采用的“7 个审查范围”口径（repo root defjs、doc、@defjs/core、@defjs/angular、@defjs/vue、@defjs/react、@defjs/opentelemetry-server）均已有覆盖；同时未发现把 design-choice 记成 confirmed bug 的条目，P19/P21/P22/P24 的相关批评都被表述为设计边界或能力缺口，而非实现缺陷。

## 模拟用户团队

| ID | 姓名 | 行业 | 角色 | 评分 |
|---|---|---|---|---:|
| P01 | 林若岚 | 金融科技 | 前端负责人 | 3.5/5 |
| P02 | 周启明 | 金融科技 | 合规架构师 | 3.6/5 |
| P03 | 陈知予 | 医疗健康 | 平台工程师 | 3.5/5 |
| P04 | 何安澜 | 医疗健康 | 隐私负责人 | 3.5/5 |
| P05 | 赵明远 | 电商 | 全栈开发者 | 3.5/5 |
| P06 | 苏景行 | 电商 | 增长实验工程师 | 3.5/5 |
| P07 | 孟昭仪 | SaaS | SDK 维护者 | 3.5/5 |
| P08 | 顾清和 | SaaS | DX 负责人 | 3.2/5 |
| P09 | 邵北辰 | 物流 IoT | 实时系统工程师 | 3.5/5 |
| P10 | 唐云帆 | 物流 IoT | SRE | 3.5/5 |
| P11 | 陆星野 | 教育科技 | 小团队全栈开发者 | 3.5/5 |
| P12 | 许一诺 | 教育科技 | 文档新手用户 | 3.0/5 |
| P13 | 沈曜 | 游戏/直播 | 实时消息工程师 | 3.5/5 |
| P14 | 邹瑾 | 政企 | Angular 架构师 | 3.5/5 |
| P15 | 薛承泽 | 传统企业 | 采购技术评审 | 3.0/5 |
| P16 | 叶南枝 | 开源社区 | 独立维护者 | 3.5/5 |
| P17 | 白辰 | 开源社区 | 贡献者 | 3.4/5 |
| P18 | 姜闻溪 | 咨询/外包 | 多框架交付工程师 | 3.5/5 |
| P19 | 任修齐 | AI 数据平台 | observability 工程师 | 4.0/5 |
| P20 | 程见山 | 平台工程 | 平台 owner | 3.6/5 |
| P21 | 傅青岚 | SaaS / Vue 全栈 | Nuxt/Vue 工程师 | 3.9/5 |
| P22 | 韩知白 | Web 平台 | Next.js App Router 工程师 | 3.5/5 |
| P23 | 贺兰舟 | 企业 Angular / enterprise tester | 企业 Angular 测试工程师 / 测试基础设施协作者 | 3.4/5 |
| P24 | 宁远 | 安全工程 | 安全工程师 | 3.8/5 |

## Package 覆盖矩阵

| Package | 主要体验者 | 覆盖人数 | 主要问题类型 | 总体判断 |
|---|---|---:|---|---|
| `defjs root` | P01、P02、P03、P04、P05、P06、P07、P08、P09、P10 等 | 23 | possible-doc-implementation-mismatch、friction、missing-capability | 仓库级工程纪律被认可，但 package 入口承担了过多“对外契约”职责；当前最大的不足是 adoption 叙事而不是构建质量。 |
| `doc` | P01、P02、P03、P04、P05、P06、P07、P08、P09、P10 等 | 24 | possible-doc-implementation-mismatch、missing-capability | doc 是覆盖最广、杠杆最高的包，也是当前最影响采用效率的短板；多数批评都指向“可信度和主路径不够收敛”。 |
| `@defjs/core` | P01、P02、P03、P04、P05、P06、P07、P08、P09、P10 等 | 23 | missing-capability、possible-doc-implementation-mismatch、friction | @defjs/core 是整套仓库最被认可的基础层，但也正因为它足够底座化，大家更强烈地期待围绕它的 strict mode、query key 和 cookbook 体系。 |
| `@defjs/angular` | P01、P03、P04、P05、P06、P07、P08、P09、P10、P11 等 | 18 | missing-capability、friction | @defjs/angular 适合作为最小注入层，但若面向企业 Angular 主流实践，还需要补齐响应式与测试基建示例。 |
| `@defjs/vue` | P01、P03、P04、P05、P06、P07、P08、P09、P10、P11 等 | 18 | missing-capability、friction | @defjs/vue 的生态契合度不错，但目前更像 Vue DI 接线层；要进入 SaaS/Nuxt 主干线，还需要官方给出 SSR 与状态层模板。 |
| `@defjs/react` | P01、P03、P04、P05、P06、P07、P08、P09、P10、P11 等 | 17 | missing-capability、friction | @defjs/react 被认为是干净、克制的注入层，但还不是面向 Next.js 主流生产栈的开箱即用方案。 |
| `@defjs/opentelemetry-server` | P01、P02、P03、P04、P05、P06、P07、P08、P09、P10 等 | 21 | friction、missing-capability | @defjs/opentelemetry-server 的默认姿态在安全与平台团队里口碑不错，但其产品完成度仍偏“基础埋点层”，距离成熟的实时/安全治理方案还有一步。 |

## 分用户反馈

### P01 — 林若岚

- 行业/角色：金融科技 / 前端负责人
- 经验背景：高级 / 团队负责人，负责 React SPA 数据访问层、错误分支审计和前后端契约落地
- 关注 package：`defjs root`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：在 React SPA 中替换团队自维护的 fetch wrapper，并让支付、KYC、账户资料等接口的成功/失败状态、响应校验、拦截器链路和审计分支都有可读、可追踪、可培训的标准写法。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 27 个相关入口/文档
- 第一印象：底层方向很对：显式 client、状态码驱动的 output、运行时 struct 校验、错误作为返回值，都适合金融前端把“每个失败分支怎么处理”落成代码规范。但如果目标是替换 React SPA 里的 fetch wrapper，现在还需要团队再写一层 React 数据获取与审计模板，直接推广到多业务线会有阻力。
- 喜欢的点：
- `@defjs/core` 的 `[error, data] = await client.execute(...)` 返回形式让错误分支显式存在，比散落的 try/catch 更适合审计检查。
- `output` 按 HTTP 状态码映射 struct，文档说明 2xx 进入成功数据、非 2xx 进入错误数据；这对 400/401/403/422/500 的合规分支检查很有价值。
- `createClient(withEndpoint(...), withInterceptors(...))` 的显式 client 模型便于按环境、租户、测试场景替换，不像全局 fetch wrapper 那样容易形成隐式状态。
- `@defjs/react` 的 API 表面积很小，`ClientProvider` / `useClient` / `withEndpoint` / `withInterceptors` 容易培训，且 `packages/react/src/core.tsx` 顶部标记了 `'use client'`，对 Next.js/RSC 场景至少不会误导为服务端组件。
- 最大阻碍：
- React 包目前只是注入层，`/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md` 只展示 `useClient()` + `useEffect`，没有 loading/error/data/refetch、缓存去重、取消、重试、Suspense/Error Boundary 或 TanStack Query/SWR 的官方模板；替换 fetch wrapper 时必须另建团队级封装。
- 严格校验能力在当前公开入口中没有清晰落点：`/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts` 只导出 `struct` 等模块，已知零值默认是 Go 风格设计选择，但金融 KYC/支付 payload 对缺失字段通常需要 opt-in fail-fast，否则审计口径会要求额外解释。
- 文档示例存在 API 写法漂移：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 的 REST CRUD 仍使用 `build: (input) => ({ body, params })`，而 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 写的是 `build(ctx, input)`；对想复制示例迁移 fetch wrapper 的团队，这是高风险 onboarding 摩擦。
- `withInterceptors` 入口在 core 文档和框架包之间不一致：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 的 core 示例直接传 interceptor，对 React/Vue/Angular 包的源码和 README 则要求工厂函数 `() => Interceptor`；鉴权、审计日志、trace id 注入正是金融迁移的第一批代码，签名差异会造成培训成本。
- 分类判断：
- **missing-capability / React thin adapter 与数据获取能力**：这不是框架适配层 bug；React 包按 thin adapter 设计只提供 client 注入。但以金融 React SPA 替换 fetch wrapper 的场景，缺少官方 `useCommand` / `useMutation` / TanStack Query/SWR / Suspense/Error Boundary 示例会阻碍生产推广。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 仅导出 `ClientProvider, useClient, withEndpoint, withInterceptors`；/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 第 38-52 行仅展示 `useClient()` 后在 `useEffect` 中手动 `client.execute(...)`。）
- **missing-capability / 零值默认与金融严格校验**：零值默认和 Partial Input 是既有反馈中明确保护的 Go 风格设计选择，不能称为 bug；但金融 payload 需要 opt-in 严格缺失字段失败模式，当前重点入口和快速开始没有给出这种能力或推荐写法。（依据：/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 第 27、48、60 行把零值默认列为设计选择并建议 opt-in 严格模式；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 仅导出 `client/error/http/interceptor/sse/struct/web_socket`，/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 没有面向严格模式的说明。）
- **possible-doc-implementation-mismatch / 文档示例 build 签名漂移**：复制粘贴路径上的文档仍展示旧式 `build: (input) => ({ ... })`，而 core README 已提示 `build(ctx, input)`；这会直接影响从 fetch wrapper 迁移时的示例可信度。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 第 40-42、63-65、80-83、96-98、259-261 行使用 `build: (input) => ({ body/params })`；/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 第 43 行写明 `Build lets you manually map parsed input to request parts via build(ctx, input)`。）
- **possible-doc-implementation-mismatch / withInterceptors 跨入口签名差异**：core 文档里 `withInterceptors(...authInterceptor(...))` 直接传 interceptor，而 React/Vue/Angular 包源码和 README 均要求 `() => Interceptor` 工厂；对于金融团队最先封装的鉴权与审计拦截器，这个差异会让示例迁移不顺。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 第 352-355 行使用 `withInterceptors(...authInterceptor(...))`；/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx 第 36-39 行、/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 第 29-32 行、/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts 第 20-27 行都声明 `withInterceptors(...fns: (() => Interceptor)[])`。）
- 生产可用性判断：可作为核心 HTTP/SSE/WebSocket 类型化执行层进入金融前端试点；不建议直接作为 React 生产数据访问完整方案替换现有 wrapper，除非同时补一层团队自研 hook、错误分支规范、严格校验策略、审计日志和 TanStack Query/SWR 集成模板。
- 行业特有风险：
- 金融审计会追问“缺失字段、错误状态、响应校验失败、网络失败、权限失败分别走了哪个分支”；如果只有底层能力、没有 React 层官方审计模板，每个业务团队会各写各的 wrapper，最终分支覆盖不可比较。
- KYC、支付、账户、风控接口不能默认把关键缺失字段兜成零值后继续渲染；即便这是已记录的 Go 风格设计选择，也需要可选严格模式或文档化的金融推荐配置。
- 拦截器签名和示例不一致会影响统一鉴权、trace id、x-request-id、幂等键、审计日志的封装落地。
- React 生产链路通常依赖缓存、去重、并发取消、refetch、SSR/RSC 预取和错误边界；缺少官方模式会让 Defjs 只替换 fetch 的底层调用，无法替换团队现有数据访问规范。
- 建议：
- 优先补一份“React SPA 金融合规 cookbook”：包含 `useDefjsCommand` 或 TanStack Query adapter、loading/error/data/refetch、Abort、retry、401/403/422/5xx 分支、审计日志、Error Boundary/Suspense 接法。
- 在 `@defjs/core` 文档中增加“金融/表单/合规推荐模式”：明确零值默认是 Go 风格默认，并给出 opt-in fail-fast/required/strict 的规划或替代写法。
- 统一并锁定 docs 中 `defineRequest` 的推荐写法：`build(ctx, input)`、`struct.request`、`output` 对象/数组形式、`withInterceptors` 的直接对象与工厂函数差异；最好让文档示例进入类型检查。
- 让 React/Vue/Angular 的 `withInterceptors` 支持直接传 interceptor，同时保留工厂函数；或者在所有文档中显式说明为什么框架包必须用工厂。
- React README 增加 RSC/SSR 章节：Server Component 中如何创建 client、透传 cookie/header、如何把预取结果交给 Client Component、哪些场景不能用 `ClientProvider`。
- 评分：3.5/5

### P02 — 周启明

- 行业/角色：金融科技 / 合规架构师
- 经验背景：12 年金融科技与支付合规架构经验，负责支付、KYC、审计追踪、可观测性和第三方依赖准入评估。
- 关注 package：`root defjs (/Users/munmunmiao/Documents/web/zen-kit/package.json, /Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml, /Users/munmunmiao/Documents/web/zen-kit/.npmrc, /Users/munmunmiao/Documents/web/zen-kit/README.md)`、`doc (/Users/munmunmiao/Documents/web/zen-kit/doc/package.json, /Users/munmunmiao/Documents/web/zen-kit/doc/index.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md, /Users/munmunmiao/Documents/web/zen-kit/doc/core/errors.md, /Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md, /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md, /Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md, /Users/munmunmiao/Documents/web/zen-kit/doc/core/commands.md)`、`@defjs/core (/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/client/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/error/types.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/http/http.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/sse/sse.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/facade.ts)`、`@defjs/opentelemetry-server (/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts)`、`framework adapters spot-check (/Users/munmunmiao/Documents/web/zen-kit/packages/react/*, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/*, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/*)`
- 使用场景：评估 defjs 在受监管金融链路中的 fail-closed 能力、审计证据可获得性、错误分类可操作性，以及默认 trace/metric 采集边界是否满足最小化采集与事故复盘要求。
- 先查阅：
- `docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- `doc/core/errors.md`
- `doc/core/http.md`
- `doc/core/sse.md`
- ……另查阅 3 个相关入口/文档
- 第一印象：底层方向对金融科技是有吸引力的：显式 Client、状态码驱动的输出类型、错误 discriminated union、保守的 OTel 默认采集，都符合合规架构的基本口味。但我不会把它直接放进支付/KYC 主链路，主要因为 fail-closed 策略需要靠使用方自己拼，审计证据链和默认观测粒度还不够制度化，且入门文档里仍有旧 build 写法会削弱我对文档可靠性的信任。
- 喜欢的点：
- 错误模型按 `kind` + `code` 分层，`/Users/munmunmiao/Documents/web/zen-kit/doc/core/errors.md` 明确推荐按 `kind` 和 `code` 分支；对合规系统来说，这比靠异常 message 分类更适合落审计规则。
- HTTP `output` 以状态码映射 struct，`/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md` 说明 2xx 进入 success、非 2xx 进入 error data；这让 400/409/422 等业务拒绝可以进入类型化处理，而不是散落在调用方。
- `@defjs/opentelemetry-server` 默认不采集 body、全部 headers、raw query、payload size 等敏感或高基数字段；`/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md` 第 124 行附近写得很清楚，这是金融环境的加分项。
- OTel 包不初始化 SDK，只要求外部传入 `Tracer`/`Meter`，减少与企业统一 OTel 初始化、采样和导出策略冲突的概率。
- 最大阻碍：
- 缺少可选的全局或端点级 fail-closed 策略包：HTTP response validation、SSE invalid event、WebSocket runtime error、队列 overflow、OTel hook failure 目前各自有不同默认行为，金融主链路需要一页明确的“严格合规模式”配置和示例。
- SSE 未声明事件和校验失败默认继续消费，虽然文档已说明且有 `onInvalidEvent` observer，但 observer 抛错会被吞掉；对交易/风控事件流来说，这不能作为默认审计策略，只能作为非关键通知流。
- WebSocket 文档显示 `onRuntimeError` 可观察运行时错误，但没有等价于 SSE `onInvalidEvent` 的结构化上下文和 fail-closed 选项；如果服务端推送了不合规报文，我很难用统一策略决定“断链、告警、隔离还是跳过”。
- `@defjs/opentelemetry-server` 对 SSE/WebSocket 只做连接级 telemetry，不记录 message-level spans、payload size、backpressure、reconnect queue、missed events；这符合隐私默认，但事故复盘证据不足，需要官方 opt-in 且带采样/脱敏/白名单边界的方案。
- 分类判断：
- **documentation-gap / fail-closed 策略缺少统一合规 profile**：我不把这称为 bug；单项行为大多有说明。问题是合规落地需要可复用的策略组合，而不是让各团队在每条链路上自行拼装。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/errors.md 定义了 `kind: 'http' | 'transport' | 'definition'` 与精确 `code`，/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md 对 undeclared status 和 response validation 会返回 definition error；但 /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 的 invalid event 是 observer 且继续流，/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 只描述 `onRuntimeError`，没有一处文档说明如何配置统一的金融级 fail-closed profile。）
- **documented-but-unintuitive / SSE invalid event observer 默认不中断流**：这是已记录的设计选择，不应叫 bug；但金融风控事件流需要 opt-in `strictInvalidEvent: 'close' | 'error'` 或 `onInvalidEvent` 可返回 close/abort 决策，否则审计上只能接受在非关键通知流使用。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 第 33-36 行说明没有 `default` 时 unknown events are silently discarded；第 152-176 行说明 `onInvalidEvent` 是 observer，即使内部抛错也会被静默忽略且 stream continues。实现侧 /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/sse/sse.ts 的 `notifyInvalidEvent` catch 后忽略异常，并在 missing struct 或 validation failed 时返回 `undefined`。）
- **documentation-gap / WebSocket 运行时解析错误缺少结构化审计上下文与 fail-closed 指南**：对交易通知/风控指令这类 WebSocket 场景，运行时错误不能只作为 unknown error callback；至少需要文档化错误上下文、建议告警字段、以及 fail-closed wrapper 示例。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 第 106-118 行列出 `onRuntimeError(listener)`，第 156 行说明 receive iterator 在 terminal state 结束；但未说明 incoming message validation failure 的 context 字段、是否包含原始 type、是否关闭连接、如何与 `queue.overflow: 'error'`、reconnect、heartbeat 组成审计策略。）
- **documented-but-unintuitive / WebSocket queryPropagation 默认开启**：文档没有隐瞒风险，但在金融默认安全策略里我会期望默认 false，或提供 `withOpenTelemetryServerStrictSecurity`/安全 profile；当前默认更偏兼容性。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 80-87 行写明 `webSocket.queryPropagation` 默认 `true`；第 171-184 行解释浏览器 WebSocket 不能设置任意 header，所以保留将 trace context 注入 URL query 的行为，并警告 query strings 可能出现在 access logs、proxy logs、APM URL fields，baggage 可能包含敏感数据。/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 也显示 `queryPropagation?: boolean` 透传给 WebSocket interceptor，未在 options 层改成默认 false。）
- 生产可用性判断：适合在中低风险前端/服务端 outbound 调用、内部运营后台、非资金账务实时通知中试点；暂不建议直接作为支付/KYC/AML 主链路的默认通信层。若要进入生产主链路，我需要看到官方 strict profile、stream invalid event fail-closed 策略、WebSocket query propagation 安全默认或安全 profile、message-level 观测的 opt-in 合规模板，以及文档示例 API 全面刷新。
- 行业特有风险：
- 支付、KYC、AML、账户冻结等链路通常要求 fail-closed；默认静默跳过 invalid stream event 会造成“实际收到过异常事件但业务无感”的审计缺口。
- trace context 或 baggage 进入 WebSocket URL query 后，可能被网关、WAF、APM、访问日志、浏览器 devtools 长期保存，增加敏感租户标识、会话上下文或风控标签外泄风险。
- 默认不采集 payload/body 是正确的隐私基线，但如果没有官方的低风险审计字段白名单策略，团队可能自行在 hooks 里记录过多 headers/body，反而导致合规漂移。
- 旧文档示例导致错误实现时，金融团队往往会在业务层补 wrapper；多个团队各自 wrapper 会造成审计口径、错误分类和重试/熔断行为不一致。
- 建议：
- 新增官方“regulated / strict profile”文档页：展示 HTTP undeclared status、response validation、SSE invalid event、WebSocket runtime error、queue overflow、OTel hook failure 的推荐 fail-closed 配置组合。
- 为 SSE 增加 opt-in 严格模式，例如 invalid event 时 close stream、返回 definition error、或让 `onInvalidEvent` 的返回值决定 `continue | close | throw`；保留当前静默跳过作为默认设计。
- 为 WebSocket incoming validation 增加结构化 invalid-message hook，包含 reason、type、message id/sequence（如有）、cause，并支持 opt-in close/error 行为。
- 为 `@defjs/opentelemetry-server` 增加安全 profile：默认 `webSocket.queryPropagation: false`，提供 header/attribute 白名单、低基数字段建议、baggage 禁用示例。
- 提供 message-level telemetry cookbook：默认关闭，但展示如何采集 event/message count、invalid count、queue overflow count、reconnect attempt count、last-event-id hash、payload size bucket，避免采集 payload 原文。
- 评分：3.6/5

### P03 — 陈知予

- 行业/角色：医疗健康 / 平台工程师
- 经验背景：中高级平台工程师；负责多前端医疗平台的 API runtime validation、schema 稳定性、前端框架接入规范和合规审计协作。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/vue`、`@defjs/react`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：为医院端、医生端、运营后台等多前端统一 @defjs/core command/schema 定义，并在 Vue 为主、兼容 React/Angular 的平台中复用 runtime validation、SSE/WebSocket 实时消息和 Client 注入模式。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 35 个相关入口/文档
- 第一印象：底层方向很适合医疗平台：显式 Client、状态码驱动输出类型、HTTP/SSE/WebSocket 统一 command、Vue provide/inject 接入都能帮助我们把前端 API 合同收敛起来。但作为医疗场景的统一平台底座，当前最大顾虑不是类型推导，而是 fail-fast/审计可观测性选项和文档示例稳定性还不够。
- 喜欢的点：
- 显式 `Client` 没有全局单例，便于多租户、多医院、多环境并存，也便于测试替换；依据见 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md`。
- HTTP `output` 按状态码映射 struct，2xx 走 success、非 2xx 走 error data 的模型，对医疗平台常见的 400/401/403/409/422 业务错误分支很友好；依据见 `/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md`。
- Vue 接入的 `provideClient` / `injectClient` 表面积很小，和 Vue 3 Composition API 习惯接近，适合作为平台默认注入方式；依据见 `/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts` 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md`。
- SSE/WebSocket 被纳入同一套 command 与 runtime validation 心智模型，对医嘱状态、检查结果、告警通知这类实时前端很有吸引力；依据见 `/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md`。
- 最大阻碍：
- 对临床、用药、患者身份等关键 payload，目前缺少 opt-in 严格校验模式，无法让缺失字段在指定 command/schema 上 fail-fast。零值默认是文档明确说明的 Go 风格设计选择，不应当称为 bug，但医疗平台需要可选择的更严格合同。
- 文档中仍有多处可复制示例与当前 build/SSE JSON 语义不一致；这会直接影响平台推广，因为各前端团队会从 guide/README 复制模板生成 API 层。
- Vue 包作为 thin adapter 可以接受，但医疗多前端平台至少需要官方 cookbook 级别的 `useCommand`、`useEventStream`、错误映射、取消请求、卸载关闭流等组合式示例，否则每个业务团队都会重复封装并产生不一致行为。
- 分类判断：
- **missing-capability / 严格校验与零值默认**：这不是 bug，而是医疗高风险 payload 需要额外 opt-in 能力：例如 command/schema 级 `strict`、字段级 required、或客户端策略开关，使患者 ID、医嘱状态、剂量等缺失字段可以 fail-fast。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md` 明确说明 struct 对齐 Go `encoding/json`，缺字段走零值，并写明“struct 不提供额外严格校验入口”；prior feedback `/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md` 也将零值默认标为设计意图。）
- **possible-doc-implementation-mismatch / guide 中 build 示例与当前设计边界不一致**：这是平台落地的高优先级文档稳定性问题；业务团队最容易复制 guide 示例，如果示例签名漂移，会直接造成迁移失败或形成多套历史写法。（依据：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md` 的完整示例仍使用 `build: (input) => ({ body, headers })`；`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 多处 REST/WebSocket 示例也使用返回对象式 `build`。但 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md` 描述当前合同为 `build(ctx, input)` 并通过 `ctx.setPathParams`、`ctx.setJson` 等设置 request。）
- **possible-doc-implementation-mismatch / SSE JSON 事件示例未统一使用 `struct.json`**：医疗实时通知通常是 JSON 事件；示例如果不统一，会让团队误以为对象 struct 会自动 JSON.parse，运行时遇到校验失败后又因为默认继续消费而更难排查。（依据：`/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md` 说明 SSE `data:` 是文本，plain `struct.object(...)` 不会解析 JSON-looking text，JSON 事件应使用 `struct.json(struct.object(...))`；但 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 的 SSE notification 示例和 `/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md` 的 SSE 示例仍直接用 `struct.object(...)`。）
- **missing-capability / Vue thin adapter 与平台级 composable**：我不把没有 `useCommand` / `useEventStream` 直接称为适配器 bug；但医疗平台要统一 loading、error、abort、组件卸载关闭 SSE/WebSocket、审计日志，至少需要官方 cookbook 或独立高级包，避免每个团队自行封装。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts` 只导出 `HTTP_CLIENT`、`injectClient`、`provideClient`、`withEndpoint`、`withInterceptors`；`/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md` 也主要停留在注入 Client 后手写 `client.execute`。prior feedback 已将 thin adapter 作为设计选择护栏。）
- 生产可用性判断：适合作为医疗平台的试点底座，尤其是新建 Vue 3 应用和统一 outbound API 定义；但在临床关键链路全面推广前，需要补齐严格校验开关、实时事件 fail-closed/观测策略和文档示例一致性。
- 行业特有风险：
- 患者身份、医嘱、检查结果等 payload 如果缺字段被零值兜底，在非严格场景下可能造成界面显示为“空值/0/false”而不是阻断，平台需要按风险等级选择 fail-fast。
- SSE/WebSocket 非法事件默认继续消费是已记录的设计选择，但医疗告警/床旁监测类链路需要可观测、可审计、可升级为 fail-closed 的选项。
- 文档示例漂移会导致各团队生成的 command/build 写法不一致，进而削弱 schema 稳定性和平台治理。
- Node 引擎要求 `>=26` 且 `.npmrc` 开启 `engine-strict=true`，对医院私有化或政企环境的运行时升级节奏可能是采纳门槛；依据见 `/Users/munmunmiao/Documents/web/zen-kit/package.json` 与 `/Users/munmunmiao/Documents/web/zen-kit/.npmrc`。
- 建议：
- 为 `@defjs/core` 增加 opt-in 严格校验能力：schema/field/command/client 任一层可配置即可，默认继续保留 Go 风格零值语义；医疗高风险 endpoint 可以强制缺失字段报错。
- 刷新 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`，统一为 `build(ctx, input)`、`struct.request(...)` 和 SSE `struct.json(...)` 的当前写法，并加入文档示例 typecheck 防漂移。
- 在 `/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md` 或 `/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md` 增加平台级 Vue cookbook：`useCommand`、`useEventStream`、`useWebSocketMessages`、组件卸载时 close/abort、错误 flatten 到表单、请求 loading/error/data/refetch 模式。
- 为 SSE/WebSocket 增加可选 fail-closed 和可观测策略：invalid event 计数、onInvalidEvent hook 的错误上报示例、按 command 开 strict、队列溢出和重连指标示例。
- 将 `@defjs/opentelemetry-server` 文档中的医疗/隐私推荐配置显式化，例如 WebSocket 默认示例使用 `webSocket: { queryPropagation: false }`，并说明如何在 hook 中只采集低基数字段。
- 评分：3.5/5

### P04 — 何安澜

- 行业/角色：医疗健康 / 隐私负责人
- 经验背景：医疗健康隐私与合规负责人，重点关注最小化采集、敏感字段默认关闭、跨系统 trace propagation 泄露面、以及审计可解释性。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：检查隐私默认值、body/header/raw query 采集边界和 trace propagation 风险，重点审阅 @defjs/core 与 @defjs/opentelemetry-server。
- 先查阅：
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 39 个相关入口/文档
- 第一印象：从隐私负责人的视角看，@defjs/opentelemetry-server 的默认采集边界总体偏保守，这是医疗健康场景里最重要的好信号；但 WebSocket query propagation 默认开启、默认 CompositePropagator 包含 baggage、span 属性记录 url.full 这三点组合起来，会让我在任何含患者上下文或租户上下文的 WebSocket 链路上先要求安全评审再上线。@defjs/core 的 request 分区模型很适合审计，但文档示例仍在展示旧 build 返回对象写法，且缺少一页式“哪些数据会进 path/query/header/body/telemetry”的隐私边界说明。
- 喜欢的点：
- OpenTelemetry 包明确声明只做 outbound client tracing/metrics，不初始化 SDK，便于接入已有院内或云厂商 OTel 管线，路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 3-6 行。
- 默认不采集 request/response bodies、全部 headers、raw query strings、payload sizes、network event details，这与医疗健康最小化采集原则对齐，路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 124 行。
- SSE 与 WebSocket 默认只做连接级 telemetry，不捕获每条事件或消息 payload；文档还说明这些数据可能高基数或敏感，路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 147 行和第 169 行。
- @defjs/core 的 struct.request 将 path/query/headers/body 分区表达，比在普通 object 里混字段更利于隐私审计和 DPA 评审；入口可见 request builder 支持 setHeaders、setPathParams、setQueryParams、setJson 等显式边界，路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal/request_builder.ts 第 109-123 行。
- 最大阻碍：
- WebSocket trace context 默认注入 URL query string，且默认 propagator 是 W3C TraceContext + Baggage；医疗健康环境中 URL 会进入代理、网关、浏览器工具和 APM URL 字段，这会让我阻止在含 PHI、患者 ID、就诊上下文或敏感租户上下文的 WebSocket 流量中默认启用该配置。路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 58 行、第 85 行、第 171-184 行，/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 第 65-67 行、第 98-108 行，/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/interceptor/web_socket.ts 第 27-50 行。
- 默认 span 属性记录 url.full；README 同时说默认不采集 raw query strings，但源码中的 resolveUrl/resolveHttpUrl 使用 parsed.toString() 并传给 createHttpSpan/createSSESpan/createWebSocketSpan 的 url.full。若 endpoint 或 baseEndpoint 已含查询串，url.full 可能包含 query。这个点需要明确是 OTel 语义要求下的可接受行为、已过滤 query，还是文档与实现边界不一致。路径依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 110-124 行，/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/trace.ts 第 11-44 行，/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/url.ts 第 1-26 行。
- 文档缺少医疗/隐私部署建议：如何禁用 baggage、如何配置只用 W3CTraceContextPropagator、如何把 webSocket.queryPropagation 设为 false、如何审查 hook 不写入 PHI。当前 README 提供了风险提醒，但没有给出合规基线配置模板。
- 分类判断：
- **documented-but-unintuitive / WebSocket query propagation 默认开启**：不是隐藏行为，文档已有说明；但从医疗隐私默认值看，兼容性优先于 fail-closed，默认值不符合我对敏感 WebSocket 链路的直觉。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 82-87 行写明 webSocket.queryPropagation 默认 true；第 171-184 行明确说明 query string 可能出现在 access logs、proxy logs、browser/network tooling、APM URL fields，并提示敏感场景设为 false。/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/interceptor/web_socket.ts 第 29 行默认 queryPropagation = true，第 44-50 行向 URL query 注入传播字段。）
- **documented-but-unintuitive / 默认 CompositePropagator 包含 baggage**：在普通服务追踪里 baggage 默认可理解，但医疗场景里 baggage 经常承载业务上下文，建议给出隐私安全默认模板，甚至考虑在 WebSocket query propagation 开启时默认不注入 baggage。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 58 行把 propagator 默认列为 W3C TraceContext + Baggage；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 第 65-67 行实际创建 CompositePropagator，包含 W3CTraceContextPropagator 与 W3CBaggagePropagator；README 第 175 行提示 baggage values may also be written into the URL and can contain sensitive data。）
- **possible-doc-implementation-mismatch / url.full 与 raw query string 采集边界**：如果 url.full 会包含查询串，则“不会默认采集 raw query strings”需要改成“不会额外解析/单独采集 raw query，但 url.full 可能包含查询串”，或实现应改为只记录 scheme/host/path。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第 110-124 行列出默认 HTTP span 属性包括 url.full，同时第 124 行说不默认捕获 raw query strings。/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/trace.ts 第 16-19 行、第 29-32 行、第 39-42 行把 url.full 写进 span；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/url.ts 第 17-20 行使用 parsed.toString() 作为 url。）
- **design-choice / HTTP/SSE 传播通过 header 注入**：对 HTTP/SSE 来说 header propagation 是合理设计；医疗场景需要的是文档提醒不要把敏感业务上下文塞进 baggage，并提供跨组织边界禁用或替换 propagator 的示例。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/interceptor/http.ts 第 29-46 行从 req.headers 提取并向 headers 注入 trace context；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/interceptor/sse.ts 第 42-49 行同样通过 headers 注入；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/propagation/carrier.ts 第 3-25 行定义 header getter/setter。）
- 生产可用性判断：谨慎试点。@defjs/core 的数据分区和 @defjs/opentelemetry-server 的保守默认让我愿意在非敏感 outbound HTTP 调用先试点；但涉及 WebSocket、baggage、带查询串 URL 或跨供应商 OTel 管线时，需要先调整配置并补文档基线。医疗健康生产环境不能接受默认 WebSocket query propagation 在没有安全模板和运行时保护的情况下直接推广。
- 行业特有风险：
- HIPAA/医疗隐私：baggage 或 trace context 若包含患者标识、就诊 ID、租户 ID，默认写入 WebSocket URL query 后可能被代理日志、浏览器网络面板、APM URL 字段和外部监控系统持久化。
- 数据最小化与目的限制：requestHook/responseHook 能任意写 span 属性，文档没有给出 PHI denylist/allowlist 或 header 捕获白名单模式，团队可能为了排障把 Authorization、Cookie、patient-id、encounter-id 等写入 telemetry。
- 审计可解释性：@defjs/core 的 path/query/header/body 分区模型对隐私审计有帮助，但 doc guide 示例和 README 的 build 写法不一致，会让审计人员难以判断真实请求边界。
- 跨边界传播：默认 W3C TraceContext + Baggage 适合分布式追踪，但医疗机构常常需要限制跨供应商、跨租户、跨 BAA 范围传播；当前缺少“跨组织传播关闭/降级”说明。
- 建议：
- 把 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 增加一个“Privacy baseline for regulated environments”小节：示例包括 webSocket: { queryPropagation: false }、只使用 W3CTraceContextPropagator、不使用 baggage、requireParentSpan 的取舍、hook 中禁止写入 PHI/PII 的清单。
- 重新评估 WebSocket queryPropagation 默认值：医疗/隐私视角建议默认 false；如果为了浏览器兼容继续默认 true，至少在 README Quick Start 附近加醒目警告，而不只放在后文风险章节。
- 澄清或修正 url.full 行为：若保留 url.full，应明确可能包含 query，并建议不要把敏感数据放入 URL；若要与“raw query strings 不默认采集”保持强一致，则改为记录去 query 的 URL 或新增 sanitizeUrl 选项。
- 为 @defjs/opentelemetry-server 增加 captureHeaders/redactAttributes 之类的显式白名单能力，避免团队用 requestHook/responseHook 随意采集 Authorization、Cookie、x-patient-id 等敏感 header。
- 在 @defjs/core 文档增加一页“请求数据边界与隐私审计”：path/query/header/body 分别如何构建、哪些会进入 URL、哪些可能被 OTel url.full 或 queryPropagation 间接采集、WebSocket 为什么不能传 header/body。
- 评分：3.5/5

### P05 — 赵明远

- 行业/角色：电商 / 全栈开发者
- 经验背景：中高级，全栈，熟悉 TypeScript、Node/Next.js、Spring/Java 后端接口协作和电商订单/商品/用户域 API
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：快速定义 HTTP command，并在业务代码里清楚地区分 200 成功、404 业务未找到、请求/响应 validation error、transport/network error。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 23 个相关入口/文档
- 第一印象：核心方向很对：用状态码驱动类型、用 tuple 返回错误、用显式 client 执行 command，适合电商里大量 REST API 的日常开发。但当前入门文档和 README 的写法不够收敛，我很难在 10 分钟内确定团队应该采用哪一种 command 定义风格。
- 喜欢的点：
- `@defjs/core` 的 `defineRequest` + `output` 状态码映射很贴近电商 API：200/201 走成功分支，400/404 走 typed error data，比手写 fetch wrapper 更容易约束前后端契约。
- `client.execute(command)` 返回 `[error, data]` 的模式对全栈开发者友好，不需要用异常控制普通业务状态，404 可以自然作为 error 分支处理。
- 显式 `createClient(withEndpoint(...))` 适合电商多环境、多租户和 BFF 场景，测试时也更容易替换 client。
- `struct` 让请求和响应都有运行时校验，对商品详情、购物车、订单确认这类接口能减少线上脏数据进入 UI。
- 最大阻碍：
- 缺少一条单一、权威、可复制的 HTTP command 入门路径来覆盖我的主场景：200 success、404 typed error、request validation、response validation、transport error。`doc/guide/getting-started.md`、`doc/guide/examples.md`、`packages/core/README.md` 的示例风格不统一，会拖慢团队落地。
- 文档没有明确告诉我在电商 CRUD 里什么时候用普通 `struct.object` input，什么时候用 `struct.request({ path/query/headers/body })`，什么时候再写 `build`。这会导致每个开发者定义 command 的风格不一致。
- OpenAPI/codegen 还只是路线图能力，不是当前 manifest 暴露的能力。电商接口数量大，如果需要手写上百个商品、订单、营销、库存 command，会成为推广阻力。
- 严格校验能力不是默认行为，这一点作为 Go 风格设计我不把它当 bug；但电商下单、支付前校验、库存锁定等关键链路需要 opt-in fail-fast，否则必须在外层再补一层校验策略。
- 分类判断：
- **documentation-gap / HTTP command 入门路径不收敛**：这些写法可能都各有用途，但对想快速定义商品/订单 HTTP command 的电商全栈开发者来说，缺少一个明确的推荐路径和决策表。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 使用 `input: struct.request({ path: ... })` 和 `output: [{ status, body }] as const`；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 使用 `input: struct.object({ id })` 和对象形式 `output: { '200': ..., '404': ... }`；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 又展示 `build: (input) => ({ params/body })`。）
- **documentation-gap / 200/404/validation/transport 的错误分支示例不足**：我需要一份官方推荐的分支方式，明确 404 typed data、请求校验失败、响应校验失败、网络错误分别怎么写，避免团队里同时出现按 kind、按 code、按 status 的多套风格。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的执行示例只展示 `if (error)` 后打印 `error.code`，完整示例按 `error.code` 区分 HTTP_STATUS、REQUEST_VALIDATION_FAILED、RESPONSE_VALIDATION_FAILED、TRANSPORT_ERROR；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 REST CRUD `handleError` 则按 `error.kind` 区分 transport、definition、http。）
- **design-choice / Go 风格零值默认需要关键链路严格模式**：我不把零值默认称为 bug；但电商订单、支付、库存链路需要 opt-in strict/fail-fast 能力或官方封装范式。（依据：/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 已记录“零值默认与 Partial Input 是 Go 风格设计意图，不是 bug”；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的完整示例展示 REQUEST_VALIDATION_FAILED/RESPONSE_VALIDATION_FAILED，但未在入门路径解释缺失字段、零值兜底和严格模式策略。）
- **missing-capability / OpenAPI/CLI/codegen 尚未落地**：这不是破损 CLI，而是成熟度缺口。电商系统接口多，纯手写 command 会影响规模化采用。（依据：/Users/munmunmiao/Documents/web/zen-kit/README.md 的 Roadmap 写有 CLI Tool、Generate API from OpenAPI、Generate Full SDK Package；/Users/munmunmiao/Documents/web/zen-kit/package.json 和 /Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json 当前 scripts/exports 未显示 CLI 入口。）
- 生产可用性判断：适合在电商后台、BFF 内部工具、低风险 REST API 上试点；不建议立即作为订单/支付/库存等关键链路的唯一 API 契约层，除非团队先补齐严格校验策略、统一 command 模板、错误分支规范和 OpenAPI/codegen 工作流。
- 行业特有风险：
- 电商接口数量多、迭代快，如果没有 OpenAPI/codegen 或至少清晰的 command 模板，定义成本会随着业务线扩张快速上升。
- 404 在电商里既可能是商品下架、订单不存在，也可能是路由/权限/灰度错误；如果文档没有展示按 status/code/kind 的最佳分支方式，业务代码容易把不同错误揉成一个 toast。
- 促销、下单、库存、支付前置校验不能接受缺失字段被静默兜底成零值；即使这是 Go 风格设计，也需要项目级显式严格模式。
- transport error 和 HTTP 业务错误需要不同监控口径；如果官方示例不强调二者分离，电商大促排障时会影响告警归因。
- 建议：
- 在 `doc/guide/getting-started.md` 增加一个电商风格的完整 HTTP 示例：`getProduct({ id })` 同时声明 200、404、400，并展示 `error.kind === 'http'`、`error.status === 404`、`REQUEST_VALIDATION_FAILED`、`RESPONSE_VALIDATION_FAILED`、`TRANSPORT_ERROR` 的推荐分支。
- 统一文档中的推荐 command 写法：明确 `input: struct.request({ path, query, headers, body })` 是否是主推风格；如果普通 `struct.object` 也支持，请给出两者边界和迁移建议。
- 在 README 顶部给出“电商 CRUD 最小模板”：GET 商品、POST 创建购物车项、404 商品不存在、400 validation error、transport retry/timeout 处理。
- 提供 opt-in 严格校验能力或官方模式示例，例如 `struct.required`、`struct.strict`、client-level strict mode，保留当前 Go 风格默认但让关键链路可 fail-fast。
- 把 OpenAPI/codegen 从 roadmap 细化成当前建议路径：哪怕 CLI 未落地，也可以先提供如何从后端 OpenAPI 半自动生成 command 的脚本示例或约定。
- 评分：3.5/5

### P06 — 苏景行

- 行业/角色：电商 / 增长实验工程师
- 经验背景：中高级，常年在 React 电商增长团队里维护实验分流、埋点、服务端状态缓存和活动页高峰期降级策略。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：把 defjs command 接入 TanStack Query/SWR，用同一份 command 定义生成稳定 cache key、配置 retry/backoff、处理 A/B 实验日志与曝光/转化事件的请求观测。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 24 个相关入口/文档
- 第一印象：底层 command 定义和状态码驱动类型收窄很适合电商 API 合同治理；但如果我的目标是把它马上接进 TanStack Query/SWR，并在实验维度做缓存、重试、日志归因，React 层给我的官方路径还停在 useClient + useEffect，需要团队自己补一层约定。
- 喜欢的点：
- @defjs/core 的 command 是显式对象，`defineRequest`、`defineEventStream`、`defineWebSocket` 都从 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts` 暴露，适合把 API 定义集中放在 `api/commands` 下复用。
- HTTP `output` 按状态码映射 struct，`/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md` 明确 2xx 进入成功数据、非 2xx 进入错误数据；这对活动页接口的 409/422/429 分支很实用。
- 拦截器按 HTTP/SSE/WebSocket 自动过滤，`/Users/munmunmiao/Documents/web/zen-kit/doc/core/interceptors.md` 展示了 auth、logging、retry 示例；增长实验场景可以统一注入 experiment-id、variant-id、trace-id。
- SSE/WebSocket 有 reconnect、queue、heartbeat 等配置入口，适合库存、价格、活动倒计时等实时场景，不需要把实时传输重新抽象一遍。
- 最大阻碍：
- 缺少官方 TanStack Query/SWR cookbook 或 adapter：`@defjs/react` README 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/react.md` 只展示 `useClient()` + `useEffect`，没有 queryKey、queryFn、mutationFn、retry、staleTime、invalidateQueries 的推荐做法。
- 缺少稳定 cache key 的官方约定：command 内部包含 definition/input，但 public API 没有导出 `getCommandKey(command)` 或序列化规范；电商增长实验会把 userId、experiment bucket、locale、channel、priceGroup 混入 key，没有官方规范容易导致缓存穿透或错误复用。
- HTTP retry/backoff 主要以拦截器示例呈现，而不是 command/execute 级一等配置；TanStack Query 自身 retry 可以处理 queryFn 重试，但我还需要明确哪些错误来自 transport、HTTP 429/5xx、响应校验失败，文档没有给增长流量高峰的推荐策略。
- React 层没有 Suspense/Error Boundary、SSR/RSC 预取与 hydration 的官方模式；`/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md` 明确 ClientProvider 是 client component 安全的，但没有给 Server Component 里如何预取 command、透传 cookie/header、再交给 TanStack Query hydrate 的路径。
- 分类判断：
- **missing-capability / TanStack Query/SWR 集成**：这是能力/示例缺口，不是 thin adapter bug。React 包按已知 guardrail 是薄适配器；问题在于面向 React 生产团队缺少官方 cookbook 或可选 companion adapter。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 只导出 ClientProvider、useClient、withEndpoint、withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md:36-53 和 /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/react.md:51-83 展示的是 useClient + useEffect，没有 TanStack Query/SWR 的 queryKey/queryFn/mutationFn 示例；prior feedback /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:78-89 已把 React Query 集成归为示例/能力诉求。）
- **missing-capability / 稳定 command cache key**：command 定义具备集中化潜力，但 public API 没有稳定 key 生成器或序列化规范；对增长实验而言这是接入缓存层前必须自建的约定。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 只汇总 client/error/http/interceptor/sse/struct/web_socket；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/client/public_api.ts 暴露 createClient 与 client options，没有 `getCommandKey` 类 API；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/http/http.ts:116-126 的 command 由 definition/input 组成，但文档 /Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/react.md 未说明如何把 command 标准化成缓存 key。）
- **documented-but-unintuitive / abort、signal、timeout 组合**：文档说 abort 和 timeout 不能一起用，但又说 signal 会合并、timeout 也参与 AbortSignal.timeout；从 TanStack Query 的 queryFn 接收 signal 再叠加业务 timeout 的角度看，这个组合规则不够直觉。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md:163-195 写明 abort 和 timeout 不能一起用，同时 signal 是 abort alias 且会合并；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal/abort.ts:4-27 实现冲突校验；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/http/http.ts:144-147 在发送前返回 validation error。）
- **documentation-gap / 增长实验日志与重试策略**：拦截器能力足够做日志和 retry，但文档没有说明在 command + React Query/SWR 场景下如何分类错误、避免重复埋点、按 429/5xx/校验失败制定重试策略。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/interceptors.md:180-215 提供 retryInterceptor 示例，/Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md:119-126 展示 transport/definition/http 错误分支；但 /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/react.md:87-110 只说明 option helpers 和 withInterceptors factory，没有把 retry、A/B 实验日志、React Query retry 之间的边界讲清楚。）
- 生产可用性判断：我会把 @defjs/core 用在新实验接口定义和拦截器日志统一上，但暂时不会直接让 @defjs/react 成为团队数据获取层；生产落地需要先在项目内封装 `commandKey`、`queryFn`、`mutationFn`、retry policy 和实验日志 interceptor，再用小流量活动页试点。
- 行业特有风险：
- A/B 实验缓存 key 如果没有官方稳定规则，可能把不同实验桶、渠道或价格组的数据缓存到同一个 key，直接影响转化率分析和价格展示正确性。
- 活动页峰值流量下，如果 retry/backoff、429 处理、abort+timeout 组合没有清晰模式，容易造成请求风暴或用户切页后仍继续消耗资源。
- 实验日志通常要求至少可解释、可追踪；如果只靠团队自写 interceptor，缺少推荐字段和失败分类，后续分析“曝光已记但商品接口失败”会很难归因。
- 多端团队可能同时用 React、Vue、Angular，框架包都是 thin adapter 是可以接受的设计选择，但官方集成模式不一致会导致各端缓存和日志语义发散。
- 建议：
- 新增 `doc/plugins/react-query.md` 或 React README 章节：展示 `queryKey: commandKey(getUser(input))`、`queryFn: ({ signal }) => client.execute(getUser(input), { signal })`、HTTP error 到 retry predicate 的映射、mutation 后 invalidateQueries 的完整例子。
- 在 @defjs/core 暴露稳定的 `commandKey(command, options?)` 或文档化序列化协议，支持加入 experimentId、variantId、tenant、locale 等维度，并说明哪些字段不应进入 key（如 auth token、trace id）。
- 提供官方 `createQueryFn(client)` / `createMutationFn(client)` cookbook：把 `[error, data]` 转成 TanStack Query 期望的 throw/return 形式，同时保留 `RequestError.kind/code/status/data` 供 retry 和 UI 分支。
- 给增长/观测场景补一篇 interceptor cookbook：统一注入 `x-experiment-id`、`x-variant-id`、`x-request-id`，并说明成功、HTTP 错误、transport 错误、definition validation 失败时如何避免重复打曝光/转化日志。
- 把 `abort + timeout` 的推荐做法写清楚：如果仍保持互斥，给出 TanStack Query `signal` + `AbortSignal.timeout()`/外部组合的示例；如果未来改 API，则允许 signal 与 timeout 同时传入。
- 评分：3.5/5

### P07 — 孟昭仪

- 行业/角色：SaaS / SDK 维护者
- 经验背景：资深 SDK / typed client 维护者，长期负责 public API 稳定性、semver 治理、OpenAPI/codegen SDK 替代方案评估。
- 关注 package：`root defjs`、`@defjs/core`、`@defjs/angular`、`@defjs/react`、`@defjs/vue`、`@defjs/opentelemetry-server`、`doc`
- 使用场景：评估 defjs 是否能作为 SaaS 平台的 typed client 基础设施，覆盖 public API 设计、版本治理、跨框架适配一致性，以及是否可替代现有 OpenAPI/codegen SDK。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/index.md`
- `doc/guide/getting-started.md`
- ……另查阅 22 个相关入口/文档
- 第一印象：我会把 defjs 看成一个有潜力的 typed client 内核，而不是今天就能替代成熟 codegen SDK 的完整 SDK 平台。@defjs/core 的 public API 入口很克制，HTTP/SSE/WebSocket 统一 command 模型和状态码类型收窄对 SDK 维护者很有吸引力；但版本治理、文档一致性、OpenAPI/codegen 路径、框架高级用法 cookbook 还不足以支撑我把大型 SaaS 公共 API 全量迁过去。
- 喜欢的点：
- @defjs/core 的入口非常清楚：/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts 只 re-export public_api，/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 明确导出 client/error/http/interceptor/sse/struct/web_socket，作为 public API 边界容易审查。
- root 与 packages manifest 都采用 ESM、exports 与 publishConfig.directory=dist，配合 Changesets 配置，说明项目已经有发布治理意识。
- typed command 模型覆盖 HTTP、SSE、WebSocket，/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 把定位写成 Typed APIs Across Transports，这比只生成 fetch wrapper 更适合现代 SaaS 的实时能力。
- React/Vue/Angular 的 API 名称基本对称，provideClient/injectClient/useClient 的心智成本低，适合多框架 SaaS 控制台或被收购团队并行迁移。
- 最大阻碍：
- 缺少已落地的 OpenAPI/codegen 互操作能力。目前 /Users/munmunmiao/Documents/web/zen-kit/README.md 仅在 Roadmap 提到 CLI、Generate API from OpenAPI、Generate Full SDK Package；这意味着它还不能直接替代我们现有面向客户的 codegen SDK 管线。
- 版本兼容信息对外部消费者不够可执行。/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 的 Version Compatibility 写 @defjs/core 为 workspace:^，/Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json 与 /Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json 的 peerDependencies 也写 workspace:^；这在仓库内合理，但作为 npm 消费者我需要看到具体 semver 范围。
- 文档与示例风格不统一会影响 SDK 迁移信任。/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 使用 output 对象形式，而 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 使用 output 数组加 as const；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 API Cheat Sheet 还出现 `struct.alias(name)` 这种看起来像独立导出的写法，但前文实际是 `.alias(...)` 链式调用。
- 框架包目前是 thin adapter，这本身是设计选择；但对 SaaS SDK 维护者来说，缺少官方 React Query/SWR、Vue composable、Angular RxJS/signal cookbook，意味着每个产品线会各自封装一套二次 SDK，长期破坏一致性。
- 分类判断：
- **missing-capability / OpenAPI/codegen 替代能力**：不能把它称为 broken CLI，因为当前 manifests 没有暴露 CLI，README 也只是 Roadmap 提及 CLI/OpenAPI/codegen；对我的场景，这是成熟度与能力缺口。（依据：/Users/munmunmiao/Documents/web/zen-kit/README.md Roadmap 列出 “CLI Tool / Generate API from OpenAPI / Generate Full SDK Package”；/Users/munmunmiao/Documents/web/zen-kit/package.json scripts 只有 build/changeset/check/fmt/lint/test/typecheck，没有 CLI 暴露。）
- **design-choice / public API 边界**：核心包通过 index.ts -> public_api.ts 统一出口，导出面很克制；这对 SDK 维护是优点，但也意味着任何未导出的 helper 都不能被下游稳定依赖。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts 仅 `export * from './public_api'`；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 只导出 client/error/http/interceptor/sse/struct/web_socket。）
- **design-choice / 框架包 thin adapter**：React/Vue/Angular 包只提供注入与 client option helper 是有意保持薄适配；我不会把缺少 useQuery/useCommand 叫 bug，但会要求官方 cookbook 或独立高级包来降低组织二次封装分叉。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 只导出 ClientProvider/useClient/withEndpoint/withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts 只导出 HTTP_CLIENT/injectClient/provideClient/withEndpoint/withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts 只导出 injectClient/provideClient/withEndpoint/withInterceptors。）
- **documentation-gap / 版本兼容表与 peer dependency**：仓库内使用 workspace:^ 可以理解，但 README 面向 npm 使用者时应给出具体 @defjs/core semver 范围和支持策略，否则我无法评估升级窗口。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md Version Compatibility 写 `0.x | workspace:^`；/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json peerDependencies 中 @defjs/core 为 `workspace:^`；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json 同样为 `workspace:^`。）
- 生产可用性判断：适合作为内部 typed client 内核或新产品线试点，不建议现在直接替代成熟 OpenAPI/codegen SDK 平台。若目标是内部 TypeScript 单仓、多框架应用，@defjs/core + thin framework adapters 的组合已经很有吸引力；若目标是 SaaS 对外 SDK、长期 semver 合同、客户可审计 OpenAPI 源、自动生成文档和多语言 SDK，还需要补齐 codegen/interop、兼容矩阵、发布治理和高级框架 cookbook。
- 行业特有风险：
- SaaS 公共 API 往往依赖 OpenAPI 作为客户合同、文档、mock、测试和 SDK 生成的共同源；如果 defjs 定义不能导入/导出 OpenAPI，就很难成为组织级唯一事实源。
- 多租户 SaaS SDK 对 semver、peer dependency、兼容矩阵和 deprecation policy 很敏感；当前 workspace:^ 兼容表对外部客户不可读，容易增加升级风险。
- SaaS 客户端常跨 React/Vue/Angular、SSR、edge runtime、browser extension 等环境；thin adapter 若没有官方高级模式示例，会导致不同团队自行封装 loading/error/retry/cache，形成碎片化 SDK 行为。
- 实时 SaaS 场景中的 SSE/WebSocket 如果缺少严格事件校验、调试 hook 或 message-level 可观测性，线上问题可能表现为“客户没有收到更新”而不是显式错误，排障成本高。
- 建议：
- 把 OpenAPI/codegen 定位从 Roadmap 拆成明确的互操作策略：至少提供 “defjs command -> OpenAPI/JSON Schema” 或 “OpenAPI -> defjs command” 的方向说明、限制和预期版本。即使短期不实现，也要让 SDK 维护者知道迁移路径。
- 为每个发布包补上对外 semver 兼容矩阵：@defjs/react/@defjs/vue/@defjs/angular 对应 @defjs/core 的真实范围、React/Vue/Angular peer 范围、Node/runtime 支持范围，以及 breaking change 策略。
- 统一 public API 示例的 canonical style：defineRequest 的 output 推荐对象还是数组、build 是否推荐直接返回对象还是 ctx 模式、interceptor 在 core 与 framework wrapper 中为何有不同签名。
- 保留框架包 thin adapter，但新增官方 cookbook：React + TanStack Query/SWR、Vue composable + Pinia、Angular RxJS/signal/TestBed、多 Client/multi-tenant client、SSR/RSC/edge header forwarding。
- 在 README 顶层增加“能替代什么、不能替代什么”章节：它现在能替代手写 fetch client 和部分 typed wrapper；暂时不能完整替代 OpenAPI 生成的多语言 SDK、客户门户 SDK 发布流水线或 inbound server contract。
- 评分：3.5/5

### P08 — 顾清和

- 行业/角色：SaaS / DX 负责人
- 经验背景：高级；负责新用户路径、文档信息架构、示例可复制性与开发者转化漏斗评估
- 关注 package：`defjs root`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：从新用户路径评估 Getting Started、examples 和术语解释，重点审阅 root defjs、doc、@defjs/core，并横向检查框架适配包与 OpenTelemetry 包对首轮理解的影响。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 27 个相关入口/文档
- 第一印象：价值主张清楚：用 TypeScript 定义 HTTP/SSE/WebSocket typed command，并通过显式 Client 执行。作为 DX 负责人，我会把它列入候选，但目前新用户路径存在明显文档漂移和概念入口分散：同一套核心 API 在首页、Getting Started、Examples、core README 中呈现出不同写法，新用户很难判断哪一种是当前推荐。
- 喜欢的点：
- Landing page 和 Getting Started 很快说明了 Defjs 的定位：typed request APIs、runtime validation、HTTP/SSE/WebSocket、多运行时，适合 SaaS 团队理解其边界。
- `createClient` + `defineRequest` + `struct` 的三步模型易讲解，错误优先 tuple 对不想依赖异常控制流的团队比较友好。
- `doc/guide/getting-started.md` 对 status code 到 success/error 类型分支有 tip 说明，这对 API SDK 教学很有价值。
- `@defjs/core` 的 public API 入口集中导出 client/error/http/interceptor/sse/struct/web_socket，表面积看起来克制，适合做底层 SDK。
- 最大阻碍：
- 新用户入口 API 写法不一致：`/Users/munmunmiao/Documents/web/zen-kit/doc/index.md` 使用 `createClient({ endpoint: 'https://api.example.com' })`，而 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md`、`/Users/munmunmiao/Documents/web/zen-kit/README.md`、`/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 都展示 `createClient(withEndpoint(...))`。这会直接影响首屏复制粘贴信任。
- Examples 页声称 copy-paste-ready，但多处 `build: (input) => ({ body, params, headers })` 与 prior feedback 中已记录的新 `build(ctx, input)` 文档方向冲突；从 DX 视角这是首个试用路径的高风险摩擦点。
- 术语路径缺少一页式解释：command、struct、input、build、params/path/query/body、output、transport、interceptor 的关系分散在 Getting Started、Examples、core README 和后续 core docs 入口中，新用户需要自行拼图。
- root 与 core manifest 写 `node >=26`，且 root `.npmrc` 开启 `engine-strict=true`；对于仍在 Node 20/22 LTS 的 SaaS 团队，这会成为试用前置门槛，但文档首页未解释运行时支持与 Node engine 的关系。
- 分类判断：
- **possible-doc-implementation-mismatch / 首页 Quick Start 与主线 API 不一致**：这不应直接称为运行时 bug，但对新用户路径是严重的“首屏复制粘贴不可信”信号；建议统一首页为当前推荐写法，或明确两种写法均支持及差异。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/index.md:63-77 使用 `createClient({ endpoint: 'https://api.example.com' })`；但 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:48-52、/Users/munmunmiao/Documents/web/zen-kit/README.md:49-57、/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:14-17 都使用 `createClient(withEndpoint(...))`；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts:1-7 只集中导出 core 模块，未在入口层解释对象配置写法。）
- **possible-doc-implementation-mismatch / Examples 页 copy-paste-ready 承诺与 API 演进不同步**：作为 DX 负责人，我会把这列为最高优先级文档修复。用户第一次跑通 CRUD 比完整 API 广度更重要。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:8 宣称 copy-paste-ready；同文件 :40-42、:63-65、:80-83、:96-98 使用 `build: (input) => ({ body/params })`；prior feedback /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:25、:174-184 已记录 examples 旧 `build` 与新 `build(ctx, input)` 冲突。）
- **documentation-gap / `output` 推荐写法在入门材料中不统一**：这类差异会让新用户误以为存在两个版本 API。建议在 Getting Started 明确“推荐写法、兼容写法、何时需要 as const”。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:67-75 使用对象映射且 key 有字符串形式；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:200-215 的 Core API Quick Reference 又示例数组形式 `output: [{ status: 200, body: ... }] as const`；/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:24-27 也使用数组 + `as const`；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:43-46 使用对象映射。）
- **documentation-gap / `struct.request`、普通 `struct.object` 与 `build` 的边界不清**：这不是实现缺陷，而是概念教学缺口。SaaS SDK 文档应给一张决策表：路径参数、query、headers、json body、form/upload 分别怎么定义。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:21-23 使用 `input: struct.request({ path: ... })`；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:64-66 使用普通 `struct.object({ id: ... })`；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:29-42 在普通 object 后通过 build 映射 body；这些入口没有先给出选择规则。）
- 生产可用性判断：核心方向有生产潜力，但文档入口尚未达到“可交给一个新团队自助试点”的成熟度。若用于 SaaS 内部 SDK 试点，我会限定在熟悉 TypeScript 的平台团队；若面向大规模业务团队推广，需要先修正首页/示例/API 速查的一致性，并补齐概念决策树与框架层 cookbook。
- 行业特有风险：
- SaaS 平台通常由多个业务团队共同消费 SDK；如果文档入口不一致，会导致每个团队封装出不同风格，后续迁移和支持成本上升。
- SaaS onboarding 很依赖“5 分钟成功复制示例”；当前首页、Getting Started、Examples、core README 的写法差异会降低转化率。
- 多租户 SaaS 常有审计、可观测性、重试、超时和错误分支规范；文档若没有推荐组合模式，业务团队会把这些横切逻辑散落在应用层。
- 建议：
- 把 `/Users/munmunmiao/Documents/web/zen-kit/doc/index.md` 首页 Quick Start 改成与 Getting Started 一致的 `createClient(withEndpoint(...))`，并在 CI 中对 docs snippet 做 typecheck。
- 优先修复 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`，确保“copy-paste-ready”示例使用当前推荐的 build/output/input 写法；这是新用户路径的最高杠杆。
- 在 Getting Started 前 1/3 增加“概念地图”：Client、Command、Struct、Input、Build、Output、Transport、Interceptor 分别是什么，以及最小心智模型。
- 新增一页“定义请求的决策树”：无 input、path/query/header/body、需要 alias、需要 build、自定义 transport 分别怎么写。
- 统一 `output` 推荐写法；如果对象映射和数组形式都支持，明确哪一个适合新用户、哪一个适合高级类型场景，以及 `as const` 的必要性。
- 评分：3.2/5

### P09 — 邵北辰

- 行业/角色：物流 IoT / 实时系统工程师
- 经验背景：8 年实时事件链路、车载/仓储设备接入、SSE/WebSocket 消费与可观测性经验
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：用 SSE/WebSocket 消费设备事件，重点关注非法事件、断线重连、消息队列溢出和丢弃语义，以及这些语义能否被 OpenTelemetry 暴露出来。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 39 个相关入口/文档
- 第一印象：第一印象是核心实时原语比普通 HTTP SDK 扎实：SSE 有 Last-Event-ID 重连、队列策略，WebSocket 有状态机、心跳、重连和发送队列；但在物流 IoT 的设备事件消费里，我更关心“错了、断了、丢了以后有没有强语义和指标”，这部分现在更多是 observer 或静默策略，适合试点，不足以直接承载调度/告警主链路。
- 喜欢的点：
- @defjs/core 把 HTTP、SSE、WebSocket 都放在同一套 command/client/struct 模型下，减少团队在不同传输间切换时的心智负担。
- SSE 文档明确写了自动携带 Last-Event-ID，且支持 reconnect attempts/delay/factor/jitter/shouldReconnect；这对设备事件断点续传很贴近真实生产需求。
- WebSocket 文档覆盖状态机、心跳、重连、发送队列和手动关闭/abort 行为，比很多只给 send/onmessage 的 SDK 更容易做运行时治理。
- SSE 和 WebSocket 都有队列上限与 overflow 策略，至少承认了慢消费者和背压问题；这是实时系统比 CRUD 更需要的基础设施。
- 最大阻碍：
- 用于调度告警或设备状态主链路前，需要 SSE/WebSocket 非法事件的 opt-in fail-closed 模式，至少能选择关闭流、抛出终止错误或触发业务级熔断。
- 用于生产实时看板前，需要队列溢出、消息丢弃、重连次数、Last-Event-ID/resume 情况和 WebSocket runtime error 的低基数指标或 hook。
- 用于 WebSocket 设备通道前，需要更明确的重连后 token 刷新、重订阅和 beforeConnect 上下文语义，否则断网恢复后的会话一致性要靠应用层大量补丁。
- 如果部署在现有边缘 Node LTS 环境，node >=26 的 engines 约束需要提前确认。
- 分类判断：
- **missing-capability / SSE 非法事件处理是 observer，而不是 fail-closed 控制面**：我不把默认静默跳过称为 bug；它是已记录的设计选择。但物流 IoT 的设备事件需要可选 fail-closed，例如 onInvalidEvent: 'close'、strictEventValidation 或将 invalid event 转成可消费的 dead-letter 事件。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 的“Invalid Event Handling: onInvalidEvent”说明 onInvalidEvent 是 observer，抛错会被忽略且 stream continues；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/sse/sse.ts 中 transformStreamMessage 对 missing-struct 与 validation-failed 调用 notifyInvalidEvent 后返回 undefined。）
- **documentation-gap / WebSocket 对无 type、非法 JSON、未声明 type 的消息缺少显式诊断语义**：这仍可视为默认丢弃策略，但文档没有把“哪些非法消息会静默跳过、哪些会触发 onRuntimeError”讲清楚。对设备协议接入来说，我需要按 reason 分类的 onInvalidMessage 或 dead-letter hook。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 说明 incoming 以 type 匹配，并提到 onRuntimeError 用于 struct failures、heartbeat timeout；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/web_socket/codec.ts 的 transformWebSocketMessage 在 JSON 解析失败、缺少 type 或没有匹配 struct/default 时返回 undefined；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/web_socket/web_socket.ts 只有 catch 到 struct validation failure 时 emitRuntimeError。）
- **missing-capability / 队列溢出有策略，但缺少 drop 计数和 onDrop hook**：有 overflow 策略是好事，但实时系统不能只知道“配置允许丢”，还要知道丢了多少、丢的是哪个方向、哪个 stream/socket、最后一次丢弃原因。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 的 Queue Configuration 描述 drop-newest/drop-oldest/error；/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 的 Send Queue 描述同类 overflow；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal/async_queue.ts 在 drop-newest 时直接 return、drop-oldest 时 shift；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/web_socket/queue.ts 发送队列 drop-newest 直接 return。）
- **missing-capability / WebSocket 重连控制不足以表达设备会话恢复**：对聊天 demo 足够，但对设备通道，重连后通常要刷新 token、重放订阅、带上 last sequence 或确认服务端恢复点。现在这些只能在应用层绕过，缺少官方 cookbook 或 hook。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 的 Reconnect 提供 attempts/delay/factor/jitter/shouldReconnect；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/client/config.ts 中 beforeConnect 类型是 () => void | Promise<void>，没有 attempt、close code、上次 connection、token 刷新结果等上下文。）
- 生产可用性判断：作为类型化实时客户端底座，我会给它进入物流 IoT 内部工具或非关键实时看板的试点资格；但用于车辆调度、告警、冷链温控等主链路前，还需要 fail-closed、丢弃可观测性、重连恢复语义和 OTel 指标补齐。
- 行业特有风险：
- 设备事件错过或被静默丢弃可能导致车辆状态、温控、门磁、AGV 任务等业务事实与前端/调度系统不一致。
- 重连期间如果没有明确 resume、重订阅、token 刷新和丢包可观测性，现场网络抖动会被误判为设备离线或业务空闲。
- SSE/WebSocket 的队列溢出如果只在本地丢弃而没有指标，值班团队无法区分“设备没上报”和“客户端消费不过来”。
- WebSocket trace context 默认写入 query string 时，经过网关、代理、车载盒子日志或第三方网络设备，可能泄露 baggage 中的租户、线路或设备上下文。
- 建议：
- 给 SSE 增加 opt-in 严格模式：例如 withSSEOptions({ invalidEvent: 'skip' | 'notify' | 'close' | 'error' })，并让 close/error 带上 event id、event name、reason、cause。
- 给 WebSocket 增加 onInvalidMessage(reason, raw, cause) 或 dead-letter async iterator，覆盖 invalid-json、missing-type、unknown-type、validation-failed，且允许策略化 close。
- 给 SSE 接收队列和 WebSocket 发送/接收队列增加 onDrop hook 与低基数计数器：stream/socket 名称、方向、overflow 策略、drop count、最新 drop 时间即可，默认不记录 payload。
- 在 @defjs/opentelemetry-server 中补充 opt-in message-level hooks 和指标，而不是默认 span per message：message count、invalid count、drop count、reconnect count、heartbeat timeout count、active streams/connections 已有指标的 labels 约束。
- 为 WebSocket 重连提供 beforeReconnect/onReconnect/open hook 上下文，包含 attempt、close code、reason、wasClean、上一次 connection、computed delay，并在 cookbook 中展示 token refresh 与重订阅。
- 评分：3.5/5

### P10 — 唐云帆

- 行业/角色：物流 IoT / SRE
- 经验背景：高级 SRE；长期负责车载网关、仓储边缘节点、调度平台的 HTTP/SSE/WebSocket 可观测性、告警和故障演练。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：评估 defjs 在物流 IoT 场景下对 HTTP 请求、SSE 车队状态流、WebSocket 双向控制通道的 metrics、span 和 stream/session 生命周期建模能力，重点看 @defjs/core 与 @defjs/opentelemetry-server。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 35 个相关入口/文档
- 第一印象：底层方向很对：HTTP/SSE/WebSocket 三种传输的命令模型统一，SSE/WebSocket 文档已经把 reconnect、queue、closed、state change、runtime error 这些生命周期概念讲清楚；@defjs/opentelemetry-server 也明确做 outbound client instrumentation，不强行初始化 OTel SDK，默认不采集敏感 payload。我的顾虑集中在生产排障颗粒度：现在连接级指标够做总体健康面板，但还不够定位车队实时链路里的消息丢失、队列溢出、重连风暴、无效事件比例和 trace 关联断点。
- 喜欢的点：
- @defjs/core 的 `public_api.ts` 明确导出 client、http、sse、web_socket、interceptor、struct，作为 SRE 看起来边界清晰，便于审计实际可用 API。
- SSE 文档在 /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 说明了 `EventStreamHandle.closed`、主动 close、reconnect、Last-Event-ID、queue overflow 与 `onInvalidEvent` observer；这比只给 EventSource 示例更接近生产运维需要。
- WebSocket 文档在 /Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 明确列出 state machine、`receive` async iterable、`closed`、`onStateChange`、`onRuntimeError`、heartbeat、reconnect 和 send queue；这些是实时链路故障定位的基础。
- @defjs/opentelemetry-server 的 README 明确说只做 server-side 环境里的 outbound client tracing/metrics，不初始化 OTel SDK；这避免与我们已有 Collector、resource、sampler、propagator 配置冲突。
- 最大阻碍：
- @defjs/opentelemetry-server 当前主要是连接级指标：HTTP 有 `http.client.request.duration`，SSE/WebSocket 有 connect duration、connection duration、active streams/connections；缺少消息速率、消息错误率、队列溢出、重连次数、Last-Event-ID 断点、WebSocket buffered/backpressure 等生产排障指标。对车队状态流或仓储机器人控制通道，这会让事故中只能看到“连接还在”，看不到“消息已经丢或积压”。
- WebSocket `queryPropagation` 默认 true。README 已经说明 query string 可能进入 access log、proxy log、APM URL 字段，且 baggage 可能写入 URL；物流 IoT 的网关、代理、第三方网络设备很多，我不会在敏感链路接受默认把 trace context/baggage 放进 URL。
- SSE/WebSocket 无效事件默认继续流转是已记录的设计选择，但在告警和控制链路里需要 opt-in fail-closed 或至少内建 invalid-event 计数。仅有 observer hook 时，各团队容易忘记把无效事件接入 metrics，导致 schema 漂移被静默吞掉。
- 文档示例存在 API 漂移迹象：`doc/guide/examples.md` 仍用 `build: (input) => ({ body, params })`，而 `doc/core/http.md`、`doc/core/sse.md` 和 `packages/core/README.md` 展示的是 `build(ctx, input)` / `struct.request` 路径；在生产评估中，复制粘贴示例不一致会降低我对库成熟度的信心。
- 分类判断：
- **missing-capability / SSE/WebSocket message-level observability**：这不是实现 bug，而是当前能力边界；物流 IoT 生产排障需要 opt-in 的消息级 counters/histograms/hooks，例如 received/sent count、invalid count、queue overflow、reconnect count、last-event-id gap、buffered amount/backpressure。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 的 SSE 监控模型只列出 `defjs.client.sse.connect.duration`、`defjs.client.sse.connection.duration`、`defjs.client.sse.active_streams`，并明确不为每个 SSE event 建 span；WebSocket 部分只列出 connect duration、connection duration、active connections，并明确不捕获 message payload、message sizes、backpressure、buffered amount、subprotocol、reconnect queues。/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/metrics.ts 也只创建这些 histogram/updown counter。）
- **documented-but-unintuitive / WebSocket queryPropagation 默认开启**：文档已经提示风险，所以我不把它归为 bug；但对物流 IoT 这种多代理、多边缘网关环境，默认 true 很反直觉，建议安全敏感场景默认 false 或提供显眼 preset。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 的 WebSocket options 表写明 `queryPropagation` 默认 `true`，并在 WebSocket query propagation risk 章节说明 query strings 会出现在 access logs、proxy logs、browser/network tooling 和 APM URL fields，baggage 也可能写入 URL。/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 的 `OpenTelemetryServerWebSocketOptions` 注释也写着默认 true。）
- **design-choice / Invalid SSE/WebSocket event 默认不中断主链路**：这是 fail-open 设计选择，适合容错流；物流告警/控制链路需要 opt-in strict/fail-closed、统一 invalid-event metrics 或 debug hook，而不是把默认行为称为 bug。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 写明 unknown event 没有 `default` 时会 silently discarded，并说明 `onInvalidEvent` 是 observer，即使内部抛错也被忽略且 stream continues。/Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md 提供 `onRuntimeError` 监听 runtime errors，但 receive iterator 仍围绕已验证消息消费。prior feedback /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 也把非法 SSE/WebSocket event 默认静默跳过列为设计选择。）
- **possible-doc-implementation-mismatch / Getting started / examples 的 client 与 build 写法不一致**：这会让评估者误判 API 稳定性；如果旧写法仍兼容，需要文档说明兼容层，否则应统一为当前入口推荐写法。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 的 Quick Start 使用 `createClient({ endpoint: 'https://api.example.com' })`，而 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 多处使用 `createClient(withEndpoint(...))`。/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 CRUD/WebSocket 示例仍使用 `build: (input) => ({ body, params })`，但 /Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md 展示的是 `build(ctx, input) { ctx.setJson(...) / ctx.setPathParams(...) }`。）
- 生产可用性判断：可以在非关键链路或内部服务的 outbound HTTP/SSE/WebSocket client 上试点，尤其适合已有 OTel SDK 的 Node/Bun/Deno 服务；但若要用于车载指令、冷链告警、仓储自动化等实时关键链路，我会要求先补齐 message-level/queue/reconnect 可观测性、WebSocket query propagation 安全默认或强提示、以及更一致的文档示例。
- 行业特有风险：
- IoT 网关和代理层通常会记录完整 URL；WebSocket trace context/baggage 放入 query string 时，可能泄漏租户、车队、路线、设备或调试上下文。
- 车辆、仓储设备和边缘节点网络抖动频繁；如果缺少重连次数、断点恢复、队列溢出和消息延迟指标，事故复盘会无法区分服务端慢、网络抖、客户端消费慢还是 schema 漂移。
- 冷链温控、异常停车、设备告警等事件不能只依赖默认跳过无效事件；需要可配置的 fail-closed、告警阈值或至少统一 metrics，否则业务会误以为链路健康。
- 多租户物流平台通常要求按 hub、fleet、device class 做低基数维度切片；当前 hooks 能自定义 span，但缺少标准化的低基数 attribute 白名单和示例，容易被业务团队加入高基数 deviceId。
- 建议：
- 为 @defjs/opentelemetry-server 增加 opt-in message-level telemetry：SSE event received/invalid/dropped/reconnect/lastEventId gap，WebSocket message sent/received/invalid/send queue overflow/buffered amount/heartbeat timeout；默认关闭，并要求采样和低基数属性。
- 把 WebSocket `queryPropagation` 做成安全 preset：例如 `webSocket: { propagation: 'none' | 'query' | 'protocol' }`，或至少在 README Quick Start 里展示 `queryPropagation: false` 的生产推荐写法。
- 在 @defjs/core 的 SSE/WebSocket 层提供统一的 invalid-event metrics hook 或 `strictEventValidation` / `onInvalidEvent: 'observe' | 'close' | 'throw'` 这类 opt-in fail-closed 选项，保留当前默认 fail-open。
- 统一文档示例：将 /Users/munmunmiao/Documents/web/zen-kit/doc/index.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md、/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 对齐，避免 `createClient({ endpoint })`、旧 `build(input)`、新 `build(ctx,input)` 并存却无说明。
- 补一篇 SRE/observability cookbook：示例包括 HTTP span 低基数属性、SSE stream lifecycle dashboard、WebSocket reconnect/heartbeat dashboard、invalid event 告警、query propagation 隐私风险、以及与现有 OTel SDK/Collector 的集成边界。
- 评分：3.5/5

### P11 — 陆星野

- 行业/角色：教育科技 / 小团队全栈开发者
- 经验背景：中级偏全栈；需要同时维护课程、学员、作业与实时通知接口，倾向复制官方示例快速落地。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/vue`、`@defjs/react`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：希望复制文档示例完成一个低学习成本的课程 API client，重点评估 doc、@defjs/core、@defjs/vue。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 27 个相关入口/文档
- 第一印象：核心理念很适合小团队：一个显式 client、用 struct 定义请求和响应、HTTP/SSE/WebSocket 都走同一套 command 模型。对教育科技的课程 API 来说，我能想象把课程列表、课程详情、作业提交和课堂通知都定义成可复用 command。但按“复制文档示例低成本落地”的路径走，doc 示例的新旧写法混杂、Vue README 太薄、框架层没有课程列表常见的 loading/error/refetch composable 模板，会让我在第一天就需要自己补一层约定。
- 喜欢的点：
- @defjs/core 的 public_api 只导出 client、error、http、interceptor、sse、struct、web_socket，概念边界清楚，适合小团队逐步学习。
- /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 用 struct.request 的 path 分区定义 GET /users/:id，这比把 id 混在普通 body object 里更适合课程详情、章节详情这类 REST API。
- 显式 createClient(withEndpoint(...)) 对多环境很友好：教育平台通常有学生端、教师端、管理后台和不同 API host，显式 client 比全局单例更容易测试和切换。
- doc 首页把 HTTP、SSE、WebSocket 放在同一套 typed command 下，对直播课堂通知、作业批改推送、在线课堂聊天这类 EdTech 实时场景有吸引力。
- 最大阻碍：
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的 Complete Example 仍使用 build: (input) => ({ body, headers })，而 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 写 Build 通过 build(ctx, input) 映射请求部分；prior feedback 也记录 doc/guide/examples.md 旧 build 与新 build(ctx, input) 冲突。对我这种复制示例做课程 API client 的用户，这是最大阻塞。
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md REST CRUD、WebSocket Chat Room 仍大量展示 build: (input) => ({ params/body })；如果当前实现期望 ctx.setJson/ctx.setPathParams，新手会复制后卡在类型或运行时行为上。
- /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md 只展示 provideClient、injectClient 和 execute，没有课程列表页常见的 useCourseList/useCommand 模板，也没有 loading/error/refetch、取消请求、组件卸载处理示例。thin adapter 是设计选择，但对低学习成本目标仍是采用阻力。
- Vue README 的 withInterceptors 签名写为 (() => Interceptor)[]，但使用示例传 withInterceptors(authInterceptor, loggingInterceptor)，没有说明 authInterceptor 是对象还是工厂；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 的实现会调用 fn()。复制时如果我按 core interceptor 对象写法传入，容易踩坑。
- 分类判断：
- **possible-doc-implementation-mismatch / doc 示例 build 签名与当前 core 文档/既有反馈不一致**：对 P11 的主场景“复制文档示例完成课程 API client”来说，这是最直接的失败点；应优先统一 getting-started/examples/core README 的推荐写法。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:150-153 使用 build: (input) => ({ body, headers })；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:40-42、63-65、80-83、96-98、259-261 也使用 build: (input) 返回 params/body；而 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:43 明确描述 Build 通过 build(ctx, input) 映射 parsed input；/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:25、174 也记录 examples.md 旧 build 与新 build(ctx, input) 冲突。）
- **documentation-gap / Vue 缺少可复制的数据获取 composable 示例**：这不是 thin adapter 的 bug，而是文档缺少官方模板。教育科技小团队更需要从 README 直接复制 useCourse/useCommand 这类组合式函数，避免每个页面重复写 loading/error/data/refetch。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md:28-35 只展示 injectClient 后直接 await client.execute(getUser())；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts:1 只导出 HTTP_CLIENT、injectClient、provideClient、withEndpoint、withInterceptors。prior feedback 在 /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:102-105 已把框架包 thin adapter 归为设计定位。）
- **possible-doc-implementation-mismatch / Vue withInterceptors 示例没有清楚体现工厂函数要求**：如果 authInterceptor 在用户项目里按 core 文档写成 interceptor 对象，Vue README 的调用形式会诱导复制失败；建议 README 显式写 withInterceptors(() => authInterceptor) 或支持对象与工厂双形态。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md:24-25 示例传 withInterceptors(authInterceptor, loggingInterceptor)，/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md:51-53 API 写 withInterceptors(...fns: (() => Interceptor)[])；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts:29-32 实现为 fns.map((fn) => fn())。相比之下 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:352-355 的 core 示例 withInterceptors(...authInterceptor(...)) 是直接传 interceptor 列表。）
- **documented-but-unintuitive / output 推荐写法在不同文档中不统一**：两种写法可能都被支持，但对低学习成本用户不直观。课程 API client 文档最好选一个主推写法，并解释对象形式与数组形式何时使用。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:24-27 使用 output 数组并要求 as const；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:67-75 和 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:43-46 使用状态码对象；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:200-206 的 API Quick Reference 又回到数组 as const。）
- 生产可用性判断：适合小团队在内部管理台、课程内容后台或新模块中试点；如果要作为全站课程 API client 标准，需要先修正文档签名漂移，并补齐 Vue 侧常见 composable/cookbook。@defjs/core 的类型安全和运行时校验是生产加分项，但当前入门示例一致性不足会增加复制粘贴失败概率。
- 行业特有风险：
- 教育产品通常由少数全栈同时维护前端和接口定义，文档示例一旦不可复制，会直接转化为迁移成本和上线延迟。
- 课程、作业、考试结果接口经常涉及学生个人信息；虽然本次重点不是 OTel，但 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 默认不捕获 body/header/query 的保守策略是好事，后续示例也应避免鼓励把学生数据打进日志。
- 课堂通知、直播互动、作业批改推送依赖实时链路；如果 SSE/WebSocket 事件校验失败默认静默跳过，虽然这是已知设计选择，但教育场景需要文档展示如何观测或调试丢消息，否则老师端会很难定位“学生没收到通知”。
- 小团队常以 OpenAPI/Swagger 作为后端事实来源；当前 Roadmap 提到 CLI/OpenAPI/codegen 但 manifest 没有 CLI 暴露，不能当成已有能力依赖。
- 建议：
- 优先统一 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 build 写法；如果 build(ctx, input) 是当前推荐，应把所有 CRUD、SSE、WebSocket 示例改成同一签名，并在 CI 文档类型检查中防回归。
- 在 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 增加一个教育科技示例：CourseStruct、listCourses、getCourse、submitAssignment、courseNotificationStream，从定义到 Vue 页面调用完整闭环。
- 在 /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md 增加一个官方 composable cookbook，例如 useDefCommand/useCourseList，展示 data、error、loading、execute/refetch、组件卸载取消和错误分支。能力可只是示例，不一定内置到 thin adapter。
- 把 Vue withInterceptors 示例改成明确的工厂函数写法，或让 withInterceptors 同时接受 Interceptor 与 () => Interceptor；至少要在 README 中说明与 @defjs/core 直接传 interceptor 的差异。
- 统一 output 文档主推写法：为入门用户首选对象形式或数组 as const 形式之一，并在 Core API Quick Reference 解释另一种形式的用途。
- 评分：3.5/5

### P12 — 许一诺

- 行业/角色：教育科技 / 文档新手用户
- 经验背景：初中级前端/文档新手用户；熟悉 REST、表单和 TypeScript 基础，但第一次接触 typed request DSL
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：第一次接触 typed request DSL，按文档从首页、Getting Started、Examples 和 @defjs/core README 走一遍，判断术语、导航和示例能否支撑教育科技后台的课程、学生、作业接口接入。
- 先查阅：
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 24 个相关入口/文档
- 第一印象：首页定位很清楚，'Typed APIs Across Transports' 和三步上手让我愿意继续读；但作为第一次接触 DSL 的文档新手，走到完整示例和 examples 页时会被 build、struct.request、command、request 这些概念切换打断，且部分示例写法与 core README/context 文档不一致，降低复制粘贴信心。
- 喜欢的点：
- 首页和 Getting Started 的入口短，能快速看出 createClient、defineRequest、struct、client.execute 的主线。
- @defjs/core README 的 struct.request 示例把 path/body/query 分区写得更像真实接口，对新手理解“请求结构”很有帮助。
- doc/core/struct.md 明确说明 Go 风格零值默认和 Partial Input，并给出 zero value 表；这避免我把该行为直接误判为 bug。
- 状态码驱动 output 的成功/错误分支对教育科技后台很实用，例如学生不存在、作业提交失败、权限不足都可以按状态码收窄。
- 最大阻碍：
- 复制路径不稳：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的 Complete Example 仍使用 build: (input) => ({ body, headers })，而 /Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md 和 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 说明的是 build(ctx, input)。新手很难判断该复制哪一个。
- 术语跳转不够顺：Getting Started 先用 struct.object + build，core README 又推荐 struct.request 自动分区，doc/core/context.md 才解释 Auto Build 规则；第一次读时不知道什么时候该用 build，什么时候该用 struct.request。
- Examples 页声称 copy-paste-ready，但 REST、SSE、WebSocket 示例仍混用旧 build 返回对象写法；作为文档新手，我会担心示例不是当前版本。
- 教育科技常见表单场景缺少完整示例：虽然 doc/core/struct.md 有 StructError.flatten()，但没有从请求校验失败到课程/学生表单字段错误渲染的端到端例子。
- 分类判断：
- **possible-doc-implementation-mismatch / Getting Started 完整示例的 build 签名**：这不是 typed DSL 本身的问题，而是入门文档示例与当前入口/核心概念文档不一致；新手会在第一次复制完整示例时失去信心。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:150 使用 `build: (input) => ({ body, headers })`；/Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md:76-78 说明执行流程调用 `build(ctx, parsedInput)`；/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:43 也写明 Build 通过 `build(ctx, input)` 映射请求部分。）
- **possible-doc-implementation-mismatch / Examples 页 copy-paste-ready 承诺**：对文档新手来说，Examples 页是最可能被复制的页面；这里的签名漂移比深层 API 文档更影响上手。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:8 宣称 copy-paste-ready；同页 REST 示例在 :40、:63、:80、:96 使用 `build: (input) => ({ params/body })`，WebSocket 示例 :259 也使用旧返回对象风格；/Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md:92-94 展示当前 `build(ctx, input) { ctx.setJson(...) }` 风格。）
- **documentation-gap / struct.request 与 build 的决策路径**：文档已经有关键材料，但分散在多个页面；建议在 Getting Started 加一张“普通 input + build / struct.request 自动分区”的选择表。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:21-23 用 `struct.request({ path })`，且无需 build；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:61-76 先用普通 `struct.object`；/Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md:119-138 才解释 Auto Build 和 `build`/`input` 规则。）
- **documented-but-unintuitive / 零值默认与 Partial Input**：作为教育科技用户，我不会把它称为 bug；但在成绩、学时、题目分值等场景，缺失 number 自动变 0 非常反直觉，需要在入门页更早提醒并链接严格校验/手动检查方式。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/core/struct.md:219-240 明确说明缺失字段会填零值、Partial Input 被允许，并写明 'This is by design, not a bug'；/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:48 也将其归为 Go 风格设计意图。）
- 生产可用性判断：作为教育科技文档新手，我会愿意在内部工具或低风险页面试用 @defjs/core，但暂不建议直接作为全团队默认接入方式。原因不是核心理念差，而是入门文档和示例同步性会让新人卡住；修复 Getting Started/Examples 后，生产试点信心会明显提高。
- 行业特有风险：
- 成绩、学时、题目分值等教育数据里，缺失字段被零值补齐可能导致错误数据看起来合法；虽然这是已说明的设计选择，但入门路径需要更强提醒。
- 学校客户常要求可审计、可复现的错误处理；如果表单校验失败到 UI 字段错误没有官方示例，各团队可能自行封装出不一致体验。
- 教育科技团队经常依赖后端 OpenAPI/Swagger 合同；没有 codegen 会增加手写 DSL 与后端合同漂移的风险。
- 教师端和学生端需求迭代快，新手文档若示例签名不同步，会直接增加接入时间和培训成本。
- 建议：
- 优先刷新 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 和 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md，统一为当前 `build(ctx, input)` 写法，并补一条 CI 文档检查防止旧 `build: (input) => ({ ... })` 回潮。
- 在 Getting Started 的 Step 2 后增加“选择哪种输入建模方式”：简单 path/query/header/body 用 `struct.request`，需要重命名/合并/条件逻辑时用普通 input + `build(ctx, input)`。
- 在 doc 首页或 Getting Started 加一个小型教育科技例子：`getStudent`、`createAssignment` 或 `submitQuizAnswer`，覆盖 path params、JSON body、404/400 output、表单错误展示。
- 把 zero-value 默认提前到入门页的显眼 tip：明确“缺失 number 会变 0，这是设计选择”，并链接到严格检查建议或 build 中手动检查示例。
- 为 StructError.flatten() 增加 React/Vue/Angular 各一个最小字段错误渲染片段；不需要做高级 hooks，但要让新手知道怎么接 UI。
- 评分：3.0/5

### P13 — 沈曜

- 行业/角色：游戏/直播 / 实时消息工程师
- 经验背景：中高级，长期负责直播间 WebSocket/SSE 消息流、弹幕/礼物/房间状态实时链路、降级与观测体系
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：WebSocket 消息流、队列/丢弃语义和直播房间实时观测；重点关注 @defjs/core 的 SSE/WebSocket 原语、doc 示例可复制性，以及 @defjs/opentelemetry-server 的连接级与消息级观测能力。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 27 个相关入口/文档
- 第一印象：我第一眼会把它看成“类型化实时传输客户端定义层”：HTTP、SSE、WebSocket 放在同一套 command/client/struct 模型里，这对直播房间的状态、弹幕、礼物、告警流很有吸引力。真正让我犹豫的是，文档首页宣称有 message queueing 和 backpressure control，但我在快速示例、public_api 入口和 OTel README 里看到的生产观测主要还是连接级，缺少直播业务最关心的消息级丢弃、队列深度、缓冲区、重连补偿与采样观测入口。
- 喜欢的点：
- @defjs/core 把 HTTP、SSE、WebSocket 统一成 defineRequest / defineEventStream / defineWebSocket，再由 createClient 执行；对直播间“拉配置 + 订阅房间状态 + WebSocket 双向消息”的组合很顺。
- doc/guide/examples.md 有 SSE Real-Time Notifications 和 WebSocket Chat Room 示例，能直接展示 for await 消费流、onStateChange、onRuntimeError、heartbeat、reconnect 这些实时工程常用入口。
- @defjs/opentelemetry-server 明确不初始化 OTel SDK，而是接收外部 tracer/meter；这适合已有自建观测平台的游戏/直播后端，不会抢全局 SDK 配置。
- OTel 默认不采集 body、全部 header、raw query、payload size，隐私默认值比较保守，适合直播业务里用户 ID、房间 ID、主播 ID、风控标签混在消息里的场景。
- 最大阻碍：
- 文档首页声称 Streaming 支持 automatic reconnect、heartbeat、message queueing、backpressure control，但公开快速入口和示例没有解释队列容量、满队列策略、丢弃事件、buffered amount、背压阈值或可观测 hook；直播间消息洪峰下我无法仅凭文档判断“礼物不能丢、弹幕可采样丢”的策略如何落地。
- @defjs/opentelemetry-server 的 SSE/WebSocket 明确不默认创建每条消息 span，也不采集 event payload、message size、backpressure、buffered amount、reconnect queues；这不是错误，但对实时消息平台意味着上线前必须自建消息级指标层，否则只能看到连接还活着，看不到消息是否堆积或被丢。
- WebSocket queryPropagation 默认 true，README 已说明 trace context/baggage 可能进入 URL query；直播长连接 URL 经常出现在 CDN、边缘网关、接入层日志、APM 面板里，这个默认值在包含 baggage 的链路里会让我要求团队统一关闭。
- doc/guide/examples.md 的 WebSocket Chat Room 示例展示 heartbeat/reconnect/receive/send，但没有展示 auth token 刷新、断线恢复后的房间游标/last sequence、重复消息去重和乱序处理；这些是直播间观测和消息一致性的核心生产问题。
- 分类判断：
- **possible-doc-implementation-mismatch / Streaming 文案与公开入口的队列/背压能力落差**：作为直播实时消息工程师，我不会直接判定实现没有这些能力，但文档首页把 message queueing/backpressure control 当成卖点，而指南没有给出可操作 API 或语义说明，会造成评估落差。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/index.md:27-28 写明 Native SSE and WebSocket support with automatic reconnect, heartbeat, message queueing, and backpressure control；但 /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts:1-7 只导出 client/error/http/interceptor/sse/struct/web_socket，/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:236-320 的 WebSocket 示例只展示 reconnect、heartbeat、onStateChange、onRuntimeError、send 和 receive，没有说明队列大小、满队列丢弃策略、backpressure 阈值或相关配置入口。）
- **documented-but-unintuitive / @defjs/opentelemetry-server 是 outbound client instrumentation，不是完整 server/inbound 观测**：包名里的 server 容易让我第一眼期待服务端入口、房间网关 inbound 连接和消息处理 span；文档其实有说明，所以这是命名/定位不直觉，不是实现 bug。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:3-5 明确写 Server-side OpenTelemetry integration for @defjs/core HTTP/SSE/WebSocket clients，并说明 provides outbound tracing and metrics；/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:141-153 也已把“仅追踪 outbound client，不覆盖 inbound server”记录为既有痛点。）
- **missing-capability / SSE/WebSocket 缺少官方消息级实时观测能力**：这个默认值从敏感数据和高基数角度合理，但直播平台至少需要 opt-in 的低基数 message-level metrics hooks，例如每房间类型采样、消息大小桶、receive/send rate、drop count、queue depth、buffered amount。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:147 明确不为每个 SSE event 创建 span，不采集 event IDs、Last-Event-ID、delivery latency、missed events、reconnect queues；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:169 明确不为每条 WebSocket sent/received message 创建 span，不采集 message sizes、backpressure、buffered amount、subprotocol、reconnect queues。）
- **documented-but-unintuitive / WebSocket trace context 默认写入 URL query**：文档说明充分，但在游戏/直播接入链路里，URL 被多层基础设施记录太常见；我会把默认 true 视为需要安全评审的兼容性选择。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:82-86 写 webSocket.queryPropagation 默认 true；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:171-183 说明浏览器 WebSocket 不能设任意 header，因此默认把 trace context 注入 query string，并警告 query/baggage 可能出现在 access logs、proxy logs、browser/network tooling、APM URL fields。）
- 生产可用性判断：适合作为类型化实时客户端定义层的小范围试点，尤其是 HTTP + SSE/WebSocket API 统一、连接级 OTel 和显式 client 管理；但若要承载大型直播房间消息流，我会要求团队先补一层消息级缓冲/丢弃/重连恢复/观测封装，并关闭或审计 WebSocket queryPropagation。
- 行业特有风险：
- 直播间流量具有强突发性：开播、抽奖、连麦、打榜时弹幕/礼物/状态消息会瞬时放大；如果队列和丢弃语义不可见，业务会把“体验降级”误判成“连接正常”。
- 游戏/直播业务常把 trace baggage、灰度桶、房间/主播/用户维度塞进上下文；WebSocket URL query 传播可能被 CDN、WAF、网关、浏览器工具或日志系统持久化。
- 消息级观测如果完全交给应用层，各团队会自行定义低基数标签、采样、payload 脱敏和错误分类，平台统一排障成本会上升。
- SSE/WebSocket 非法事件默认静默跳过虽是既有设计选择，但在直播房间状态机里可能导致客户端少一个关键状态变更却没有告警，需要 opt-in debug/fail-closed 或 invalid-event 指标。
- 建议：
- 在 doc/guide/examples.md 或新增实时系统 cookbook 中补齐 WebSocket 房间生产示例：token 刷新、last sequence/offset、重连补拉、重复消息去重、乱序处理、关闭码分类、房间切换清理。
- 把 doc/index.md 的 message queueing/backpressure control 链接到明确 API 文档：队列容量、满队列策略、drop oldest/drop newest/block、bufferedAmount 阈值、onDrop/onBackpressure hooks；如果当前尚未公开，则降低首页卖点表述。
- 为 @defjs/opentelemetry-server 增加 opt-in message-level metrics hooks，默认关闭但提供低基数模板：message.type、direction、size bucket、drop reason、queue depth bucket、buffered amount bucket、reconnect attempt。
- 为 invalid SSE/WebSocket event 提供 opt-in observability/debug 方案：onInvalidEvent、strictEventValidation、invalid_event_count metric、灰度环境采样日志；保持默认静默跳过也可以。
- 将 WebSocket queryPropagation 的安全建议提前到 Quick Start 附近，并提供游戏/直播推荐配置：webSocket: { queryPropagation: false } + 只传播 traceparent、不传播 baggage 的示例。
- 评分：3.5/5

### P14 — 邹瑾

- 行业/角色：政企 / Angular 架构师
- 经验背景：高级 / 架构负责人，长期维护 Angular 18–22 企业级单体与微前端项目，关注 DI、TestBed、合规审计和跨团队 API 标准化
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/angular`、`@defjs/react`、`@defjs/vue`、`@defjs/opentelemetry-server`
- 使用场景：在 Angular 18–22 企业项目中通过 DI 注入 typed client，并在服务、组件和 TestBed 中验证 typed request、拦截器与多环境 endpoint 配置。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 12 个相关入口/文档
- 第一印象：核心 typed request 与 Angular DI 的方向是对的：`provideClient` / `injectClient` 足够贴近 Angular 原生习惯，版本范围也明确覆盖 Angular 18–22。但从政企架构落地看，当前 Angular 包更像最小 DI 桥接层，缺少 TestBed、命名 client、多环境、多拦截器顺序说明和 RxJS/signal cookbook，会让平台组不得不先二次封装再推广。
- 喜欢的点：
- Angular 包明确支持 Angular 18–22，`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/package.json` 的 peerDependencies 写到 `@angular/common` 与 `@angular/core` 为 `>=18.0.0 <=22.0.0`，这对政企长期版本跨度比较友好。
- `provideClient(...features)` 返回 `EnvironmentProviders`，`injectClient()` 使用 Angular `inject()`，从 `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 看集成方式符合 standalone application config 时代的 Angular 风格。
- 显式 `Client` 而不是全局单例，配合 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 中 typed command / struct / output 状态码收窄，对政企审计、灰度环境和网关迁移都比较清楚。
- Angular README 在 `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 明确说明 interceptor 工厂函数会通过 Angular `useFactory` 调用并获得 DI context，这点适合注入 token service、tenant service、审计上下文。
- 最大阻碍：
- 缺少 Angular TestBed 官方测试路径是我在政企项目引入前的最大阻碍：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 只导出 `injectClient`、`provideClient`、`withEndpoint`、`withInterceptors`，没有 testing provider、mock client、spy helper 或类似 `HttpTestingController` 的说明；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 也没有 TestBed 示例。
- 单一 client token 难覆盖政企多系统场景：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 内部只有一个 `HTTP_CLIENT` InjectionToken，`injectClient()` 不接收 name/token 参数，多个后端域、多个租户 endpoint、内外网网关切换都需要平台组自行封装。
- 文档中 `build` 示例存在漂移风险：`/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 写核心思想是 `build(ctx, input)`，但 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md` 和 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 仍展示 `build: (input) => ({ body, params })` 风格；对大型团队来说，这会直接影响复制粘贴示例的可信度。
- 分类判断：
- **design-choice / Angular 包是 thin adapter，而不是完整 Angular data layer**：我不会把没有 `useQuery` / `Observable` 状态管理层直接判为 bug；从入口看它刻意保持很薄，只提供 DI 和 client option 桥接。但政企落地仍需要官方 cookbook 或 companion utilities 来降低二次封装分歧。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 仅导出 `injectClient`、`provideClient`、`withEndpoint`、`withInterceptors`；`/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md` 已把框架包 thin adapter 记录为设计选择而非 core adapter bug。）
- **documented-but-unintuitive / Angular `withInterceptors` 要求工厂函数**：README 已经说明每个 interceptor function 会经 Angular `useFactory` 调用并获得 DI context，这对 Angular DI 是合理的；但它和 core / examples 中直接传 interceptor 的直觉不同，企业团队会希望文档明确“为什么 Angular 必须/推荐 factory”以及迁移写法。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 的 API 段写 `withInterceptors(...fns: (() => Interceptor)[])` 并说明 receives DI context；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 第 20 行实现同样要求 `(() => Interceptor)[]`，第 22–25 行通过 `useFactory` 注册。）
- **documentation-gap / 缺少 TestBed 测试示例**：对我的主要场景来说，README 只覆盖 app.config 和组件内 `injectClient()`，没有展示 TestBed 中如何 override client、如何断言 command 输入、如何模拟 tuple error/success、如何测试 interceptor 注入服务。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 只有 Installation、Quick Start、API、Version Compatibility；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 未导出任何 testing utility。）
- **missing-capability / 缺少命名 Client / 多 Client 注入能力**：政企 Angular 应用经常同时访问统一门户、流程平台、主数据、审计网关等多个 endpoint。当前单一 `HTTP_CLIENT` 足够 demo，但不够平台化；需要 `provideClient(tokenOrName, ...)`、`injectClient(tokenOrName)` 或暴露可组合的 InjectionToken 模式。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 内部定义单个 `HTTP_CLIENT = new InjectionToken<Client>('HTTP_CLIENT')`，`injectClient(): Client` 固定 `inject(HTTP_CLIENT)`；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 也未导出 `HTTP_CLIENT` 或命名 provider API。）
- 生产可用性判断：适合在政企 Angular 项目中做 typed client 的底座试点，尤其是新模块或平台组可控的 SDK 层；暂不建议直接作为全集团 Angular API 标准下发。上线前我会要求平台组先补一层命名 client、TestBed mock provider、RxJS/signal 约定和 interceptor 顺序规范，并等待官方文档修正 `build` 示例漂移。
- 行业特有风险：
- 政企项目通常存在统一身份认证、租户隔离、审计流水和多网关 endpoint，单 token client 与缺少命名注入会导致每个业务线各自包一层，形成新的平台碎片。
- TestBed 路径不清会降低治理可控性：组件和服务一旦直接调用真实 client 或临时 mock tuple，后续做契约测试、错误分支覆盖和审计抽样会变得不一致。
- Angular 生态大量使用 Observable、async pipe、signal 与 zone-less 配置；当前 README 只演示 Promise `client.execute`，容易让团队在服务层各自写 `from(...)`、`toSignal(...)` 包装，形成隐性规范成本。
- 文档 API 漂移在政企内训和代码模板中会被放大：一旦脚手架或知识库采纳旧 `build` 写法，后续升级成本会高于普通互联网项目。
- 建议：
- 在 `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 增加一个“Enterprise Angular”章节，至少覆盖 TestBed override provider、mock `Client.execute` success/error tuple、service 层测试、interceptor factory 注入 Angular service 的测试。
- 提供命名 client 能力，形式可以是 `provideClient(MY_API_CLIENT, withEndpoint(...))` + `injectClient(MY_API_CLIENT)`，或官方推荐用户自定义 `InjectionToken<Client>` 的模式；关键是不要让多 endpoint 政企项目各自发明封装。
- 补一个 `@defjs/angular/testing` 或 README-only 的 `provideMockClient` 模板，帮助团队统一 mock 行为、错误分支和类型断言。
- 为 Angular 增加 RxJS / signal cookbook：`from(client.execute(command))`、`map` tuple、`toSignal`、取消请求、组件销毁时的 abort 组合，明确哪些是 core 负责、哪些是 Angular 层建议。
- 统一 docs 中 `build` 推荐签名，优先修正 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md` 与 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`，并在示例页标明何时用 `struct.request`、何时用 `build(ctx, input)`。
- 评分：3.5/5

### P15 — 薛承泽

- 行业/角色：传统企业 / 采购技术评审
- 经验背景：企业级采购/技术准入评审，关注运行时门槛、包发布成熟度、Roadmap 兑现可信度和供应链可控性
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：评估 defjs 是否能进入传统企业 Node 平台技术白名单：重点审查 Node >=26、pnpm 11、发布成熟度、CLI/codegen Roadmap 可信度，以及 defjs/doc/@defjs/core 的采购风险。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 23 个相关入口/文档
- 第一印象：核心库设计方向清楚，显式 Client、类型化 command、跨 HTTP/SSE/WebSocket 的统一模型对企业标准化有价值；但从采购技术评审角度看，当前更像早期平台能力，而不是可直接列入集团级默认白名单的成熟依赖。
- 喜欢的点：
- 根目录 /Users/munmunmiao/Documents/web/zen-kit/package.json 明确写出 engines.node >=26 和 packageManager pnpm@11.6.0，配合 /Users/munmunmiao/Documents/web/zen-kit/.npmrc 的 engine-strict=true，至少没有隐瞒运行时约束，便于准入评审做硬性拦截。
- 各发布包 manifest 普遍包含 bugs、repository、license、exports、publishConfig，例如 /Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json 和 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json，对采购审计比只有 README 的项目更友好。
- /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 把 command、struct、build、client 四个核心概念压得很清楚，适合进入技术评审会的架构说明材料。
- 最大阻碍：
- Node >=26 与 pnpm 11.6.0 是当前最大采购门槛：/Users/munmunmiao/Documents/web/zen-kit/package.json 写 engines.node >=26、packageManager pnpm@11.6.0，/Users/munmunmiao/Documents/web/zen-kit/.npmrc 写 engine-strict=true；但 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 只给 npm/yarn/pnpm/bun 安装命令，没有解释最低 Node/pnpm、CI 迁移影响或企业升级策略。
- CLI/OpenAPI/codegen 仍停留在 Roadmap：/Users/munmunmiao/Documents/web/zen-kit/README.md 的 Roadmap 写 CLI Tool、Generate API from OpenAPI、Generate Full SDK Package；但已查阅的根 package 和各 packages manifest 只暴露库 exports/scripts，没有 bin 或独立 CLI 包。对传统企业来说，没有 codegen 就很难从既有 OpenAPI/Swagger 资产低成本迁移。
- 发布成熟度信号不稳定：root defjs 是 private 且 version 0.0.0，/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json 是 0.4.0，React/Vue 是 0.0.1，OpenTelemetry 是 0.2.0，Angular 是 19.0.0；这种版本节奏不一致会让采购方难以判断整体平台是否已进入稳定支持期。
- 文档成熟度仍有漂移：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 写 Build 通过 build(ctx, input) 映射请求部分，而 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 多处仍使用 build: (input) => ({ body/params })；采购评审会把这类复制即失败风险视为上线支持成本。
- 分类判断：
- **documented-but-unintuitive / Node >=26 与 pnpm 11 的准入门槛**：这不是隐藏问题，反而是清楚写明的技术选择；但对传统企业采购来说仍然非常不直觉，因为它把采用门槛从库级别提升到了集团 Node 基线和包管理器基线。（依据：/Users/munmunmiao/Documents/web/zen-kit/package.json 明确写 engines.node >=26 和 packageManager pnpm@11.6.0；/Users/munmunmiao/Documents/web/zen-kit/.npmrc 写 engine-strict=true。）
- **documentation-gap / 安装文档未解释运行时和包管理器要求**：建议在 Getting Started 顶部增加 Requirements/Enterprise adoption note，说明最低 Node、推荐 pnpm、engine-strict 行为、浏览器/CDN使用与构建期 Node 要求的边界。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的 Installation 只列 npm/yarn/pnpm/bun 命令；/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 宣称 Universal Runtime；但这些页面没有同步说明 package manifest 中的 Node >=26、pnpm@11.6.0、engine-strict=true 对本地开发和 CI 的影响。）
- **missing-capability / CLI/OpenAPI/codegen Roadmap 尚未落地**：按既有 guardrail，这不是 broken CLI，而是 Roadmap/成熟度缺口；采购侧需要看到 milestone、设计草案、兼容 OpenAPI 版本范围和生成物稳定性承诺。（依据：/Users/munmunmiao/Documents/web/zen-kit/README.md Roadmap 写 CLI Tool、Generate API from OpenAPI、Generate Full SDK Package；但 /Users/munmunmiao/Documents/web/zen-kit/package.json、/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json、/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json、/Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json、/Users/munmunmiao/Documents/web/zen-kit/packages/angular/package.json、/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json 均未暴露 bin 或 CLI 包入口。）
- **possible-doc-implementation-mismatch / build 示例签名在 core README 与 doc examples 间不一致**：这会直接影响采购试用：评审人员通常会复制 examples.md 验证 PoC，文档漂移会被放大成支持与培训成本风险。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 的 Core ideas 写 Build 通过 build(ctx, input) 映射请求部分；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 在 REST CRUD 与 WebSocket 示例中仍使用 build: (input) => ({ body/params })。既有反馈 /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 也把 examples.md 旧 build 写法列为 Top 主题。）
- 生产可用性判断：建议作为受控试点依赖，不建议现在直接进入传统企业集团级默认白名单。@defjs/core 的设计基础可评审，OpenTelemetry 默认也较稳健；但 Node/pnpm 基线过新、CLI/codegen 未落地、版本成熟度不均、文档漂移仍会阻碍采购签字。
- 行业特有风险：
- 传统企业往往有统一 Node 基线和长期维护窗口，Node >=26 + engine-strict=true 会直接触发平台准入审批，而不是单个项目组自行决定。
- pnpm 11.6.0 与 catalog、minimumReleaseAgeExclude、@typescript/native-preview 等配置对研发效率有吸引力，但也增加供应链白名单、二进制包审查和离线制品库同步压力。
- 缺少已落地 CLI/OpenAPI/codegen 时，采购价值主张容易从“统一 API 合同平台”退化为“手写 TypeScript 客户端库”，ROI 难以覆盖传统企业存量接口迁移成本。
- 0.x/0.0.x 多包版本会被部分企业自动归类为试点依赖，需要额外承诺 semver、LTS、迁移指南和安全响应 SLA。
- 建议：
- 在 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 增加 Requirements：Node >=26、pnpm 11.6.0、engine-strict=true、npm/yarn/bun 安装与仓库开发的差异、CI 镜像建议、传统企业迁移注意事项。
- 为 /Users/munmunmiao/Documents/web/zen-kit/README.md 增加 Release maturity 表：每个包的当前版本、稳定等级、适用场景、兼容 core 范围、是否建议生产、破坏性变更策略。
- 把 CLI/OpenAPI/codegen 从一句 Roadmap 拆成可评审计划：目标 OpenAPI 版本、输入/输出示例、生成 SDK 包结构、与 struct 的映射边界、预计 milestone；在未实现前明确标注“not available yet”。
- 修正 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 中旧 build: (input) => ({ ... }) 示例，统一到 core README 所描述的 build(ctx, input) 或当前推荐写法，并给文档示例加类型检查。
- 补全 /Users/munmunmiao/Documents/web/zen-kit/README.md 的 Packages 表，至少纳入 @defjs/react、@defjs/vue、@defjs/opentelemetry-server，并标出各包版本和成熟度。
- 评分：3.0/5

### P16 — 叶南枝

- 行业/角色：开源社区 / 独立维护者
- 经验背景：长期维护 TypeScript/前端基础设施项目，关注包边界、发布契约、贡献路径、生态采用成本和文档一致性。
- 关注 package：`defjs root: /Users/munmunmiao/Documents/web/zen-kit/package.json, /Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml, /Users/munmunmiao/Documents/web/zen-kit/.npmrc, /Users/munmunmiao/Documents/web/zen-kit/README.md`、`doc: /Users/munmunmiao/Documents/web/zen-kit/doc/package.json, /Users/munmunmiao/Documents/web/zen-kit/doc/index.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`、`@defjs/core: /Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts`、`@defjs/react: /Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx`、`@defjs/vue: /Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts`、`@defjs/angular: /Users/munmunmiao/Documents/web/zen-kit/packages/angular/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts`、`@defjs/opentelemetry-server: /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts`
- 使用场景：评估 defjs 是否适合被开源生态采用：重点看 root defjs、doc、@defjs/core 的 API 表面积、纯 ESM/运行时承诺、monorepo 贡献门槛、文档可复制性，以及框架包和 OpenTelemetry 包作为生态拼图的成熟度。
- 先查阅：
- `README.md`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- `packages/core/README.md`
- `packages/core/src/public_api.ts`
- ……另查阅 1 个相关入口/文档
- 第一印象：作为独立维护者，我第一眼会喜欢这个项目的克制感：core 是纯 ESM、零运行时依赖承诺写在 doc 首页，public_api 只是一层清晰导出，命令式 API 比大型客户端生成器更容易审查。但继续看下去，生态采用阻力主要不在核心思路，而在发布/文档契约的锐边：Node >=26、源码路径 exports、workspace:^ 兼容表、首页 Quick Start 与实际 createClient 选项风格不一致、examples 仍有旧 build 签名，这些都会让外部维护者在推荐前犹豫。
- 喜欢的点：
- @defjs/core 的入口非常透明：/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 只导出 client、error、http、interceptor、sse、struct、web_socket，API 表面积可审计，适合开源生态做二次封装。
- 纯 ESM 定位明确：root 和各 package manifest 都有 "type": "module"，README 也标出 ESM；这对现代工具链、CDN 使用和跨 runtime 叙事是加分项。
- core 的功能边界完整但不膨胀：README 聚焦 defineRequest/createClient/struct，doc 首页覆盖 HTTP、SSE、WebSocket、interceptors、framework integrations，开源维护者能快速判断项目不是只做 fetch wrapper。
- 显式 Client 而非全局单例，配合 React/Vue/Angular 的 provider/inject/useClient 模式，对测试、插件生态和多实例场景友好。
- 最大阻碍：
- 对外采用的最大硬阻力是运行时和发布契约过于前沿：root 与所有重点包 manifest 都标注 engines.node >=26，doc 首页却说 browsers、Node.js、Bun、Deno 且 no polyfills；对于开源生态里仍大量使用 Node 20/22 LTS 的项目，我不能轻易推荐作为基础依赖。
- 包 manifest 的 exports/module/typings 指向 src/index.ts，publishConfig.directory 指向 dist，但只读材料里没有看到 dist 后的 exports 形态说明；这会让外部维护者担心 npm 包是否依赖消费者直接处理 TypeScript 源码。
- 文档 Quick Start 存在可复制性风险：doc/index.md 使用 createClient({ endpoint: ... })，而 core README 和 getting-started 使用 createClient(withEndpoint(...))；doc/guide/examples.md 仍有 build: (input) => ({ body, params }) 旧式示例。开源生态采用时，复制粘贴失败会迅速消耗信任。
- 贡献门槛偏高：root package.json 使用 pnpm@11.6.0、Node >=26、@typescript/native-preview/tsgo、oxfmt/oxlint、VitePress 2 alpha；这些选择可以理解，但 README 没有贡献路径、开发环境说明或新贡献者检查清单，会劝退偶发贡献者。
- 分类判断：
- **possible-doc-implementation-mismatch / 首页 Quick Start 的 createClient 选项风格与 core README/实现入口不一致**：doc 首页示例使用 createClient({ endpoint: 'https://api.example.com' })，而 core README 与 getting-started 均通过 createClient(withEndpoint(...)) 配置；从公开入口看 @defjs/core 只从 public_api 导出 client/http 等模块，root README 也使用 withEndpoint。对复制粘贴用户来说，这属于文档与当前推荐入口疑似不一致。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/index.md:63-67 使用 createClient({ endpoint: ... })；/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:14-17 和 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:48-52 使用 createClient(withEndpoint(...))；/Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts:1-7 公开导出 client/http 等入口。）
- **possible-doc-implementation-mismatch / examples 中旧 build 签名仍存在**：示例页自称 copy-paste-ready，但 REST/WebSocket 示例仍写 build: (input) => ({ body/params })；core README 明确说 Build 通过 build(ctx, input) 手动映射，prior feedback 也已记录 examples 旧 build 与新签名冲突。这会直接影响贡献者判断 API 稳定性。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:40-42、63-65、80-83、259-261 使用 build: (input) => 返回对象；/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:41-44 写 Build lets you manually map parsed input via build(ctx, input)；/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md:24-26、172-184 已记录该文档漂移。）
- **documentation-gap / 发布包 exports 指向 src/index.ts 但缺少 dist 后契约说明**：各包 package.json 的 module、typings、exports 都指向 src/index.ts，同时 publishConfig.directory 是 dist。也许构建工具会在 dist 中重写 manifest，但只读文档没有说明 npm 包最终是否导出 JS 与 d.ts。开源维护者评估依赖时需要明确 published artifact 形态。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json:12-19、/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json:12-20、/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json:12-19 均显示源码入口与 dist 发布配置并存；/Users/munmunmiao/Documents/web/zen-kit/README.md 与 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 未解释发布产物契约。）
- **documented-but-unintuitive / 纯 ESM 与 universal runtime 叙事下的 Node >=26 要求**：纯 ESM 是明确设计选择，我不把它视为 bug；但 Node >=26 的 engine-strict 对生态采用非常激进，而 doc 首页同时宣称浏览器、Node、Bun、Deno、no polyfills。需要支持矩阵解释：库本身、源码开发、测试、已发布产物分别要求什么。（依据：/Users/munmunmiao/Documents/web/zen-kit/package.json:40-43、/Users/munmunmiao/Documents/web/zen-kit/.npmrc:6、/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json:40-42 标注 Node >=26 且 engine-strict=true；/Users/munmunmiao/Documents/web/zen-kit/doc/index.md:29-31 写 Works in browsers, Node.js, Bun, and Deno、Pure ESM with zero runtime dependencies。）
- 生产可用性判断：核心抽象已经有生产化潜力，尤其适合愿意接受现代 ESM、显式 Client、运行时校验和多 transport 统一模型的团队。但从开源生态广泛采用角度，我会评为“可试点、暂不建议作为通用推荐默认项”：在发布契约、文档一致性、贡献指南、支持矩阵和 roadmap 落地说明补齐前，更像一个设计扎实但社区入口还偏窄的基础库。
- 行业特有风险：
- 开源生态采用依赖保守兼容区间；Node >=26 和 TypeScript native preview 会显著限制下游库、模板和框架插件的可采用范围。
- 文档漂移会被包管理器、starter、blog、AI 代码生成快速放大；一旦错误示例进入生态，维护成本会转移到 issue 和社区答疑。
- workspace:^ 出现在已发布包的 README 兼容表中，会让外部用户无法判断真实 semver 关系，影响自动升级和安全审计。
- 纯 ESM 是现代方向，但缺少明确的 Node/browser/Deno/Bun 支持矩阵、bundler 条件和 CJS 不支持说明时，容易在传统工具链用户中形成重复 issue。
- 建议：
- 先把文档作为发布契约修好：统一 doc/index.md、doc/guide/getting-started.md、doc/guide/examples.md、packages/core/README.md 的 createClient、withEndpoint、output、build(ctx,input) 写法，并给 examples 加可编译检查。
- 在 root README 增加 Support Matrix：Node/browser/Bun/Deno 支持范围、纯 ESM/CJS 策略、最低 Node 版本为什么是 >=26、已发布包是否包含 JS/d.ts、是否需要消费者转译 TS。
- 补一页 Contributing/Development：pnpm 版本、Node 版本、corepack、安装、build/test/typecheck/docs 命令、changesets 发布流程、如何新增 package 和文档示例。
- 更新 root README Packages 表，列出 core、react、vue、angular、opentelemetry-server、doc，并标注成熟度或 intended scope，避免 Roadmap 与现实包状态互相打架。
- 在每个已发布包 README 的 Version Compatibility 中用真实 semver 替代 workspace:^，尤其 React/Vue 的 @defjs/core 兼容范围。
- 评分：3.5/5

### P17 — 白辰

- 行业/角色：开源社区 / 贡献者
- 经验背景：中高级 TypeScript / 前端生态开源贡献者；习惯从 workspace manifest、README、public_api、adapter core 和测试脚本判断如何提交新 framework adapter。
- 关注 package：`defjs root: /Users/munmunmiao/Documents/web/zen-kit/package.json, /Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml, /Users/munmunmiao/Documents/web/zen-kit/.npmrc, /Users/munmunmiao/Documents/web/zen-kit/README.md`、`doc: /Users/munmunmiao/Documents/web/zen-kit/doc/package.json, /Users/munmunmiao/Documents/web/zen-kit/doc/index.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`、`@defjs/core: /Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts`、`@defjs/react: /Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx`、`@defjs/vue: /Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts`、`@defjs/angular: /Users/munmunmiao/Documents/web/zen-kit/packages/angular/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts`、`@defjs/opentelemetry-server: /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts`
- 使用场景：从源码入口和脚本理解如何贡献 framework adapter 和测试，重点评估 defjs 根仓库、@defjs/core、@defjs/react、@defjs/vue、@defjs/angular，并顺带核对文档站与 @defjs/opentelemetry-server 的入口一致性。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `CODE_OF_CONDUCT.md`
- `doc/package.json`
- ……另查阅 23 个相关入口/文档
- 第一印象：作为想贡献 framework adapter 的开源贡献者，我能快速看出这是 pnpm workspace、每个包有 build/test/typecheck、adapter API 表面积很小且对称；但贡献路径主要靠我自己从 package scripts、src/public_api.ts 和已有 adapter 推断，缺少 CONTRIBUTING、adapter 模板、测试矩阵说明和发布/版本策略说明，导致第一次贡献需要大量逆向阅读。
- 喜欢的点：
- 根 package.json 把 build、test、typecheck、lint、fmt:check 聚合得很清楚，/Users/munmunmiao/Documents/web/zen-kit/package.json:6-17 对贡献者来说是好入口。
- pnpm-workspace.yaml 明确包含 packages/* 和 doc，catalog 统一依赖版本，/Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml:1-32 方便理解 monorepo 边界。
- @defjs/core README 明确核心概念：Commands、Struct、Build、Client，并指向 packages/core/design.md，/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:39-46 对贡献新 adapter 前理解 core 很有帮助。
- React、Vue、Angular adapter 的 public_api.ts 都很小，基本只导出 provider/inject/useClient、withEndpoint、withInterceptors；这降低了新 adapter 的模仿成本。
- 最大阻碍：
- 缺少 /Users/munmunmiao/Documents/web/zen-kit/CONTRIBUTING.md 或等价贡献指南；我只能从 package.json、pnpm-workspace.yaml、各 package scripts 和 README 推断贡献流程。
- 没有官方 adapter 贡献模板或 checklist：新增 Svelte/Solid/Qwik 等 adapter 时，哪些 API 必须保持 thin adapter、哪些测试必须覆盖、README 需要哪些章节，目前没有一页说明。
- 文档示例存在入口层面的 API 写法不一致，尤其 doc/guide/getting-started.md 和 doc/guide/examples.md 的 withInterceptors/build 示例与 core README、adapter README 的写法混在一起，贡献者难判断新文档应跟哪种风格。
- root README 的 Packages 与 Roadmap 信息滞后：包表只列 core/angular，Roadmap 仍写 Vue wrapper package 和 React wrapper package，但仓库已有 packages/vue 与 packages/react。
- 分类判断：
- **documentation-gap / 缺少贡献指南和 adapter 贡献合约**：仓库有 Code of Conduct、根 scripts、包级 scripts 和 README，但没有 CONTRIBUTING.md 或 adapter authoring guide。作为贡献者，我能推断怎么 build/test，却不知道 PR 前必须跑哪些命令、如何新增 package、adapter API 边界、测试命名规范和 changeset 要求。（依据：/Users/munmunmiao/Documents/web/zen-kit/package.json:6-17 定义根 build/check/test/typecheck；/Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml:1-3 定义 workspace；只读查找贡献类文件时仅发现 /Users/munmunmiao/Documents/web/zen-kit/CODE_OF_CONDUCT.md，没有发现 CONTRIBUTING.md。）
- **possible-doc-implementation-mismatch / root README 包清单与 Roadmap 滞后**：根 README 的 Packages 表只列 @defjs/core 与 @defjs/angular，Roadmap 仍把 Vue wrapper package 和 React wrapper package 当作待办；但 workspace 和 packages 目录已经存在 @defjs/vue 与 @defjs/react。贡献者会误判哪些 adapter 已经存在、哪些是欢迎贡献的新方向。（依据：/Users/munmunmiao/Documents/web/zen-kit/README.md:90-105 只列 core/angular 且 Roadmap 写 Vue/React wrapper package；/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json:1-17 与 /Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json:1-17 显示两个包已经存在并导出入口。）
- **possible-doc-implementation-mismatch / 文档示例的 build 签名与 core README 不一致**：core README 说 Build 用 build(ctx, input) 手动映射请求部分，但 getting-started 和 examples 仍展示 build: (input) => ({ body, params }) 风格。作为要补文档或 adapter 示例的贡献者，我不知道应该复制哪一种。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md:41-44 写 Build lets you manually map parsed input via build(ctx, input)；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:150-153 与 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:40-42、63-65、80-83、96-98 使用 build: (input) => ({ ... })。）
- **documented-but-unintuitive / withInterceptors 示例与导出签名存在多种形态**：core/doc 中有数组、展开、直接传 interceptor 等多种写法；React/Vue/Angular adapter 的 README/API 又要求工厂函数。这个差异可能是框架 adapter 为 DI 或实例隔离做出的设计，但贡献者需要明确规则，否则新 adapter 很容易实现出第三种风格。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md:133-138 使用 withInterceptors([async ...])；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md:352-355 使用 withInterceptors(...authInterceptor(...))；/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md:69-85 和 /Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md:69-80 明确是 (...fns: (() => Interceptor)[])；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md:24-25 示例却传 authInterceptor, loggingInterceptor，API 文本 /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md:51-53 又写工厂函数。）
- 生产可用性判断：从贡献者视角看，核心包和 adapter 的源码入口清晰，适合小范围贡献和维护者引导下的 PR；但对开放社区自助贡献还未完全 ready。最大差距不是核心实现，而是贡献文档、adapter 合约、测试矩阵、文档示例一致性和社区治理信息。未运行应用或测试，仅基于只读源码与文档入口审阅。
- 行业特有风险：
- 开源贡献者第一次提交 adapter 时容易复制旧示例或不一致签名，导致 PR review 成本高、贡献热情下降。
- 缺少贡献指南和测试矩阵会让外部贡献者不知道该跑根 check、包内 test、doc typecheck 还是 browser config；这会增加 CI 红灯和维护者反复指导的负担。
- root README Roadmap 与实际 workspace 不同步，会让社区误判项目成熟度，甚至以为 React/Vue adapter 尚未实现。
- CODE_OF_CONDUCT.md 的举报邮箱为空，/Users/munmunmiao/Documents/web/zen-kit/CODE_OF_CONDUCT.md:61-63 对开放社区治理是明显信任缺口。
- 建议：
- 新增 /Users/munmunmiao/Documents/web/zen-kit/CONTRIBUTING.md：包含 pnpm 版本、Node >=26、安装、常用命令、PR 前检查、changeset 规则、包目录约定、文档站检查、CI 期望。
- 新增 docs 或 packages 下的 adapter authoring guide：列出 thin adapter 合约、public_api 导出要求、README 必备章节、withEndpoint/withInterceptors 规则、provider/inject 命名约定、测试样例和新框架 adapter checklist。
- 同步 root README：Packages 表补齐 @defjs/react、@defjs/vue、@defjs/opentelemetry-server；Roadmap 把已完成的 React/Vue wrapper 移出待办，改成高级 hooks/cookbook 或独立 integration package。
- 统一文档里的 build 写法，明确当前推荐是 struct.request 还是 build(ctx, input)，并把 doc/guide/examples.md 与 doc/guide/getting-started.md 的旧 build: (input) => ({ ... }) 示例刷新或标注迁移。
- 统一 withInterceptors 文档：分别说明 core 直接接收 Interceptor、framework adapter 接收工厂函数的原因；如果 Vue README 示例继续传 authInterceptor，应说明它本身必须是 () => Interceptor。
- 评分：3.4/5

### P18 — 姜闻溪

- 行业/角色：咨询/外包 / 多框架交付工程师
- 经验背景：高级，长期在客户现场交付 React/Vue/Angular 混合项目，需要把同一套 API 契约、模板和培训材料复用到不同技术栈。
- 关注 package：`root defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 使用场景：跨 React/Vue/Angular 项目复用一套 API 定义和交付模板，并能让不同客户团队按同一心智模型接入、调试、验收。
- 先查阅：
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `README.md`
- `doc/package.json`
- `doc/index.md`
- ……另查阅 27 个相关入口/文档
- 第一印象：核心 API 的“定义一次，多端执行”很适合咨询交付：@defjs/core 统一 HTTP/SSE/WebSocket 契约，React/Vue/Angular 都只暴露 provider/inject/useClient 级入口，确实方便我做跨框架培训。但文档和包入口之间还有几处口径不齐，导致我很难把它直接做成客户项目的标准模板。
- 喜欢的点：
- 显式 Client 和 command 定义很适合外包交付的多客户、多环境、多框架模板：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 展示 defineRequest + createClient + client.execute，框架包只负责注入 Client，便于把 API 定义放到共享包。
- React/Vue/Angular 入口足够对称，培训成本低：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts、/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts、/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts 都围绕 provide/inject/useClient、withEndpoint、withInterceptors 展开。
- Angular 适配的 DI 方式贴近企业客户现有习惯：/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts 使用 InjectionToken、makeEnvironmentProviders、injectClient，客户现场迁移阻力小。
- OpenTelemetry 包明确是 outbound client instrumentation，并且默认不捕获 body、全量 header、raw query、payload size，/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 的保守默认有利于把模板交给多个客户复用。
- 最大阻碍：
- 跨框架交付模板最怕复制粘贴后编译失败；当前 doc 首页、getting-started、examples、core README 对 createClient、build、output 的示例口径不一致，会显著增加客户项目培训和答疑成本。
- React/Vue/Angular 的 thin adapter 可以接受，但缺少官方“交付模板层”示例：同一份 API 定义如何分别接 React Query/SWR、Vue composable/Pinia、Angular Observable/signal，没有模板就会让每个客户团队各包一层，最终交付资产不可复用。
- 框架包版本口径不够适合客户验收清单：React README 的兼容表写 @defjs/core 为 workspace:^，Vue README 没有版本兼容表，Angular README 有 ^0.4.0；外包交付需要能写进 package policy 的明确范围。
- 分类判断：
- **possible-doc-implementation-mismatch / doc examples 与 core build API 口径不一致**：这会直接影响跨客户模板的可信度，建议优先统一为当前实现推荐写法，并给旧写法迁移说明。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 在 Core ideas 明确写 Build 通过 build(ctx, input) 手动映射；但 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 的 Complete Example 使用 build: (input) => ({ body, headers })，/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 多处使用 build: (input) => ({ body/params })。对咨询交付来说这是高频复制粘贴路径的不一致。）
- **possible-doc-implementation-mismatch / doc 首页 createClient 示例与包 README 写法不一致**：如果 createClient 对对象配置仍兼容，应在快速开始说明两种写法；如果不兼容，首页示例会成为第一个失败点。（依据：/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 使用 createClient({ endpoint: 'https://api.example.com' })；/Users/munmunmiao/Documents/web/zen-kit/README.md、/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 和框架 README 均使用 withEndpoint(...) 作为 ClientOption。）
- **design-choice / 三套框架包是 thin adapter**：我不把缺少 useCommand/useQuery/RxJS helper 直接称为 bug；问题是交付模板需要官方 cookbook 或独立高级包来保证各项目封装一致。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 只导出 ClientProvider/useClient/withEndpoint/withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts 只导出 provideClient/injectClient/withEndpoint/withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts 只导出 injectClient/provideClient/withEndpoint/withInterceptors。既有反馈 /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 也把 thin adapter 归为设计选择。）
- **documented-but-unintuitive / 框架 wrapper 的 withInterceptors 签名与 core 文档心智不完全一致**：Angular 需要工厂可理解，但 React/Vue 也强制工厂会让三端培训时多讲一层；建议文档解释为什么统一采用工厂，或支持对象/工厂两种输入。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 和 /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx 要求 withInterceptors(...fns: (() => Interceptor)[])；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md 与 /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 也写工厂函数；/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md 说明工厂函数会通过 Angular useFactory 获取 DI context。与此同时 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 core 示例直接 withInterceptors(...authInterceptor(...))。）
- 生产可用性判断：我会把 @defjs/core 用作共享 API 定义的试点底座，但暂时不会把三套框架 wrapper 直接定义为公司级交付标准。原因不是核心能力不可用，而是文档示例和框架模板层还不足以支撑多个客户、多个框架团队稳定复用。
- 行业特有风险：
- 咨询/外包项目常由不同团队按文档复制模板落地；如果 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的旧 build 写法和 /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 的 build(ctx,input) 说明并存，项目初期会出现大量非业务性返工。
- 客户验收通常要求版本矩阵和升级边界；workspace:^ 这类仓库内部协议出现在 /Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 与 peerDependencies 中，不利于交付文档锁定兼容范围。
- 多框架交付强调“同一能力，同一培训材料”；Vue README 是中文而 React/Angular README 是英文，且 API 示例深度不同，容易让客户误判三个框架包成熟度不一致。
- @defjs/opentelemetry-server 的包名在客户评审中可能被误读为 inbound server instrumentation；README 已说明 outbound tracing，但报价/方案文档里仍需要额外澄清，否则容易形成范围误解。
- 建议：
- 把 /Users/munmunmiao/Documents/web/zen-kit/doc/index.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md、/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 的 createClient/build/output 写法统一成一套推荐模板，并用文档 typecheck 防止旧写法回潮。
- 新增“跨框架交付模板”章节：同一份 shared api.ts 在 React、Vue、Angular 三端分别如何创建 client、注入、执行、处理错误、取消请求、接入认证 interceptor。
- 在 thin adapter 定位不变的前提下，提供官方 cookbook 或 examples：React Query/SWR、Vue composable/Pinia、Angular RxJS Observable/signal；这些可以是文档模板，不一定进入运行时包。
- 统一 React/Vue/Angular README 的语言、章节和示例深度；至少包含 Installation、Quick Start、Interceptors、Multi-client、Testing、Version Compatibility、Common Patterns。
- 把终端用户文档中的 workspace:^ 替换为明确 semver 范围，并在 root README 的 Packages 表补齐 React/Vue/OpenTelemetry server 当前状态，避免 Roadmap 仍显示 Vue/React wrapper package 像是未完成。
- 评分：3.5/5

### P19 — 任修齐

- 行业/角色：AI 数据平台 / observability 工程师
- 经验背景：高级；长期负责平台侧 tracing、metrics 与 collector 接入治理。
- 关注 package：`@defjs/core`、`@defjs/opentelemetry-server`
- 使用场景：把 outbound client 请求、SSE stream 和 WebSocket 连接纳入既有 OpenTelemetry collector，要求既能快速接入，又不能无意引入高基数、敏感字段或难治理的自定义语义。
- 先查阅：
- `README.md`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- `packages/core/package.json`
- `packages/core/README.md`
- ……另查阅 11 个相关入口/文档
- 第一印象：不像“再包一层 fetch”的玩具库，尤其是 outbound HTTP/SSE/WebSocket 都有统一 client 语义和 OTel 扩展点，这点很对平台工程胃口。
- 喜欢的点：
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:5-6 明确不初始化 OTel SDK，而是复用外部 tracer/meter，这和已有 collector/SDK 体系很好对接，不会强行接管平台标准。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:124-125 对 body、全部 headers、原始 query string 默认不采集，平台侧更容易控制高基数和敏感信息扩散。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:130-169 以及对应 interceptor 代码把 SSE/WebSocket span 保持到 closed/error，这比只记录握手时长更接近真实实时链路健康度。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts:72-110 按 transport 分开挂 interceptor 与 hooks，HTTP、SSE、WebSocket 能分别定制，适合渐进式纳入既有 collector。
- 最大阻碍：
- SSE / WebSocket 目前只有连接级 span 与指标；对 AI 数据平台常见的消息吞吐、重连次数、背压/缓冲区压力仍需平台侧自补，Collector 很难直接给出实时链路 SLO。
- WebSocket trace context 默认写入 query string；如果现有 OTel collector 前面还有网关、WAF、访问日志或第三方代理，需要先审计 baggage/trace 参数泄露面再敢默认开启。
- 缺少声明式的低基数标签/headers 捕获白名单；像 tenant、model、workspace 这类平台维度只能通过 hook 手写，团队间容易出现属性命名漂移。
- 分类判断：
- **documented-but-unintuitive / @defjs/opentelemetry-server 的定位**：文档已经明确它是 server-side 环境里的 outbound client instrumentation，不是 inbound server instrumentation；对 observability 平台团队来说定位是清楚的，但包名第一次看仍容易误判。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:3-5 明确写着 “Server-side OpenTelemetry integration for @defjs/core HTTP/SSE/WebSocket clients” 且 “does not initialize an OpenTelemetry SDK”；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts:1-7 也只暴露 withOpenTelemetryServer 与 option types，没有任何 inbound server adapter 入口。）
- **missing-capability / SSE / WebSocket 可观测性深度**：当前流式传输埋点更偏连接生命周期，不覆盖消息级 telemetry；这对已有 collector 的基础接入是够用的，但对实时 AI 平台常见的消息速率、重连、背压分析还不够。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:137-169 仅列出 SSE/WebSocket 的 connect duration、connection duration、active streams/connections，并明确不采集 message payload、message sizes、backpressure、reconnect queues；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/metrics.ts:33-68 也只创建这三类 SSE/WebSocket metrics。）
- **documented-but-unintuitive / WebSocket trace propagation 默认值**：默认把 trace context 注入 WebSocket query string 兼容浏览器限制，这个选择能提升可接入性，但对经过多层日志与代理的生产链路来说安全/隐私直觉偏反。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:171-178 明确警告 query strings 可能出现在 access logs、proxy logs、browser/network tooling 和 APM URL 字段，且 baggage 也可能进入 URL；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts:27-35,98-108 显示 webSocket.queryPropagation 存在且默认启用。）
- **missing-capability / 自定义平台维度采集方式**：库提供了 requestHook/responseHook 这类低层扩展点，但没有更高层的 captureHeaders / captureAttributes allowlist；对于多租户 observability 平台，这会把常见维度治理工作下放到每个接入方。（依据：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md:64-88 的 HTTP/SSE/WebSocket 配置都只有 enabled、requestHook、responseHook 等钩子；/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts:9-52 的 option types 也没有声明式 header/attribute allowlist。）
- 生产可用性判断：适合作为 outbound client 基础埋点层进入生产试点，尤其适合先把 HTTP 与连接生命周期纳入统一追踪；但若目标是做 AI 实时链路的成熟运营观测，还需要在 message-level telemetry、维度治理和安全默认值上继续二次封装。
- 行业特有风险：
- AI 推理与控制面常依赖长连接和事件流；如果只有连接级指标，collector 很难定位消息积压、重连风暴或模型侧慢消费。
- 多租户 AI 平台常把 tenant、model、workspace 当作核心观测维度；缺少声明式 allowlist 会导致不同服务用 hook 各自打点，增加属性基数与命名治理成本。
- WebSocket query propagation 若未经审计直接启用，trace/baggage 可能经由 URL 出现在网关日志和第三方链路中，带来隐私与合规风险。
- 建议：
- 新增可选的消息级 telemetry 能力，哪怕默认关闭：例如 SSE/WebSocket message in/out counter、reconnect attempts、queue/backpressure 指标，让 collector 至少能做实时链路 SLO。
- 在 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 增加“接入既有 OTel Collector”的 cookbook，示例化 tracer/meter、推荐 attributes、以及何时只开 HTTP vs 同时开 SSE/WebSocket。
- 补一个声明式 allowlist 配置，例如 captureHeaders / captureAttributes，专门服务低基数平台维度采集，减少每个团队手写 hook 的治理成本。
- 把 webSocket.queryPropagation 的风险提示前置到 Usage 或 Configuration 首屏，并给出更明确的“服务端 Node/Bun/Deno 可优先走 header propagation，浏览器端再评估 query propagation”的建议。
- 补充 telemetry hook 失败的监控建议，例如推荐计数器或日志模式，避免 hook 静默降级后平台团队只能靠人工排查。
- 评分：4.0/5

### P20 — 程见山

- 行业/角色：平台工程 / 平台 owner
- 经验背景：资深，负责平台标准化、CI 门禁与内部推广落地。
- 关注 package：`defjs`、`doc`、`@defjs/core`、`@defjs/opentelemetry-server`
- 使用场景：评估 monorepo scripts、CI 门禁、Roadmap 与平台推广风险。
- 先查阅：
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `.npmrc`
- `.github/workflows/ci.yml`
- `.github/workflows/_checks.yml`
- ……另查阅 28 个相关入口/文档
- 第一印象：仓库骨架很像一个对平台团队友好的 monorepo：pnpm workspace、统一 checks、docs 独立包、Node/engine 约束明确、跨框架入口对称，说明作者有平台化意识。但一旦切到 adoption 视角，最先暴露的问题不是底层 API，而是 roadmap、示例与门禁之间没有形成闭环。
- 喜欢的点：
- 根目录 scripts 很克制，`build/check/test/typecheck/fmt/lint` 语义清晰，适合做平台模板和 CI 基线。证据：`/Users/munmunmiao/Documents/web/zen-kit/package.json`。
- CI 分层思路不错：先 paths-filter，再按 packages/docs 分流，再有 dependency review，对 monorepo 成本控制是加分项。证据：`/Users/munmunmiao/Documents/web/zen-kit/.github/workflows/ci.yml`。
- 框架入口足够对称，React/Vue/Angular 都把表面积控制在注入与 client option 这一层，降低了跨栈认知切换成本。证据：各框架 `src/public_api.ts` 与 README。
- `@defjs/opentelemetry-server` 的默认保守策略对平台团队友好：不抢 SDK 初始化，不默认抓 body/header/query，能降低合规与高基数指标风险。证据：`/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md`。
- 最大阻碍：
- 根目录 README 的 Roadmap 仍把“CLI Tool”“Vue wrapper package”“React wrapper package”写成未来项，但仓库内已经存在 `packages/react`、`packages/vue`，且未见 CLI manifest；对平台 owner 来说，这会直接制造能力边界和成熟度判断噪音。证据：`/Users/munmunmiao/Documents/web/zen-kit/README.md`、`/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json`、`/Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json`。
- 文档示例 API 漂移会卡住平台推广，因为 `getting-started` 与 `examples` 仍大量展示 `build: (input) => ({ ... })` / `params` 旧写法，而 design/context 文档已经明确新心智是 `build(ctx, input)` 与 `ctx.setPathParams(...)`。这类复制即错的问题会让 CI 示例校验和 enablement 成本上升。证据：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md`、`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`、`/Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md`、`/Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md`。
- 当前 CI 更像“代码质量门禁”而不是“平台采用门禁”：有 lint/typecheck/test/build、docs build、dependency review，但没有针对 README/doc 示例与 roadmap 一致性的专门守门。对平台 owner 来说，这意味着最影响推广的认知漂移未被自动拦截。证据：`/Users/munmunmiao/Documents/web/zen-kit/.github/workflows/ci.yml`、`/Users/munmunmiao/Documents/web/zen-kit/.github/workflows/_checks.yml`、`/Users/munmunmiao/Documents/web/zen-kit/doc/package.json`。
- 分类判断：
- **possible-doc-implementation-mismatch / Roadmap 与仓库现状不一致**：根 README 的 Roadmap 把 React/Vue wrapper 仍列为未来项，但工作区里已经发布了对应 package；CLI 仍只停留在路线图。对评估人来说，这会混淆“已交付能力”和“计划中能力”。（依据：`/Users/munmunmiao/Documents/web/zen-kit/README.md` 第 97-105 行将 “CLI Tool / Vue wrapper package / React wrapper package” 列为 Roadmap；但 `@defjs/react` 与 `@defjs/vue` 的 package manifest 已存在于 `/Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json`、`/Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json`。）
- **possible-doc-implementation-mismatch / 示例签名漂移**：getting-started/examples 仍以旧 `build(input)` 返回对象为主，而 design/context 已说明 request 构建应使用 `build(ctx, input)` 与 `ctx.setPathParams/setHeaders`。这不是直觉问题，而是文档之间存在可复制的签名冲突。（依据：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md` 第 150-153 行、`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 第 40-42、63-65、80-83、96-98、259-261 行仍用旧写法；`/Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md` 第 74-78 行与 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md` 第 315-338 行说明新构建流程和 `ctx.setPathParams(...)`。）
- **missing-capability / 框架包是 thin adapter，缺少更高层平台抽象**：从平台 owner 视角，React/Vue/Angular 目前更像统一注入层而非可直接推广的数据访问平台层。缺少官方 query/cache/SSR/RxJS 等高级模式会增加各业务线二次封装成本，但按护栏这应归为能力缺口，不是框架包 bug。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts` 只导出 `ClientProvider/useClient/withEndpoint/withInterceptors`；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 只导出 `provideClient/injectClient/withEndpoint/withInterceptors`；`/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts` 只导出 `HTTP_CLIENT/provideClient/injectClient/withEndpoint/withInterceptors`。）
- **documented-but-unintuitive / Node 26 + engine-strict 带来较高接入门槛**：仓库对 Node 版本和 engine 检查很强硬，这对内部平台统一有利，但会抬高试点团队、外部贡献者和部分 CI 环境的接入成本。它有明确声明，所以更适合归为有文档但不直觉。（依据：根 manifest `/Users/munmunmiao/Documents/web/zen-kit/package.json` 与重点包 manifest `/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json`、`/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json` 都要求 `node >=26`；`/Users/munmunmiao/Documents/web/zen-kit/.npmrc` 第 6 行启用 `engine-strict=true`；CI setup `/Users/munmunmiao/Documents/web/zen-kit/.github/actions/setup-pnpm-deps/action.yml` 第 10-15 行固定 `node-version: 26` 并以 frozen lockfile 安装。）
- 生产可用性判断：底层工程质量和 monorepo 纪律感达到“可试点”水平，但从平台 owner 视角仍未到“可规模推广”。要进入组织级 adoption，我最想先看到三件事：1）修正文档/roadmap 漂移；2）给关键示例建立自动校验；3）明确哪些能力是 intentionally thin adapter、哪些会进入产品路线图。
- 行业特有风险：
- 平台推广会被“文档可信度”拖慢：示例签名漂移会让 enablement、培训材料和模板仓库难以稳定复用。
- 统一 Node 26 与 engine-strict 虽有利于内部基线收敛，但会压缩试点团队和外部生态的兼容窗口，增加组织推进阻力。
- 框架层目前偏 thin adapter，平台团队若要推广到多个前端栈，需要自己补 query/cache/SSR/RxJS 等二次封装，造成平台产品化成本上移。
- 可观测性叙事存在命名歧义：`@defjs/opentelemetry-server` 若被误读成完整 server instrumentation，会在平台评审阶段造成错误预期。
- 建议：
- 先把根 README 的 Roadmap 改成“已交付能力 vs 计划中能力”两栏，明确 React/Vue 已存在、CLI/OpenAPI/codegen 尚未落地，减少评审噪音。
- 为 `doc/guide/getting-started.md`、`doc/guide/examples.md` 建立示例漂移防线：至少统一到 `build(ctx, input)` / `struct.request` 当前模型，并在 CI 中增加可执行或静态校验。
- 给平台采用者补一页“adoption matrix”：Node 26、pnpm 11、engine-strict、支持的框架版本、推荐接入姿势、非目标能力（如 CLI 尚未提供、framework packages 是 thin adapter）。
- 围绕 thin adapter 策略补官方平台化 cookbook，而不是直接扩大框架包职责：例如 React + TanStack Query、Angular + RxJS/signal、Vue + composable 模板。
- 给 `@defjs/opentelemetry-server` 在 README 顶部再强化一句“outbound client instrumentation only”，并提供与 inbound server OTel 组合的推荐架构图，避免平台评审误解。
- 评分：3.6/5

### P21 — 傅青岚

- 行业/角色：SaaS / Vue 全栈 / Nuxt/Vue 工程师
- 经验背景：高级 Nuxt/Vue 全栈，长期维护 SaaS 后台、Pinia 状态层和 SSR 登录链路。
- 关注 package：`doc`、`@defjs/core`、`@defjs/vue`
- 使用场景：在 Nuxt 3 + Vue 3 项目里，把 defjs Client 通过 provide/inject 注入页面、composable 和 Pinia store，并在 SSR 阶段安全传递认证上下文，同时接入 SSE/WebSocket 实时状态。
- 先查阅：
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- ……另查阅 11 个相关入口/文档
- 第一印象：第一眼很顺：core 的 typed command + Vue 的 provide/inject 非常贴合 Composition API 心智，像是一个克制、干净、不会绑架我架构的底座。
- 喜欢的点：
- /Users/munmunmiao/Documents/web/zen-kit/doc/index.md 和 /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 展示的 provideClient / injectClient 模式很符合 Vue 生态直觉，接入门槛低。
- /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 中 provideClient 在 install(app) 时创建 Client，再通过 app.provide 注入，边界清楚；我可以把真正的业务状态继续放在 Pinia，而不是被 SDK 反向控制。
- /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 与 /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts 的组合很干净：Vue 包不重复发明请求抽象，HTTP/SSE/WebSocket 能力都仍来自同一个 core 心智模型。
- /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 暴露了 HTTP_CLIENT 自定义 InjectionKey 的入口，这对多 client、分后端域、或在复杂应用里做自定义注入层级是加分项。
- 最大阻碍：
- /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 与 /Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md 只覆盖 app 级 provide/inject 与组件内调用，没有 Nuxt 3 SSR 请求级 header/cookie 透传示例；对我这种要处理服务端上下文的 Vue 全栈来说，这是首个落地阻塞点。
- /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts 仅导出 HTTP_CLIENT、injectClient、provideClient、withEndpoint、withInterceptors，没有官方 useCommand / useEventStream / useWebSocketMessages / Pinia 绑定层；团队若要统一 loading/error/cancel 策略，需要自己再包一层。
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 提供了 Vue 组件内最小示例，但没有展示在 Pinia store、Nuxt plugin、路由切换清理 SSE/WebSocket 订阅时的推荐模式，导致实时场景的状态收敛方式需要自行摸索。
- 分类判断：
- **design-choice / @defjs/vue 的轻适配定位**：Vue 包的表面积非常薄，更像把 core Client 接到 Vue DI 上的轻适配层；这不是 bug，而是明确的设计边界。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts 只导出 HTTP_CLIENT、injectClient、provideClient、withEndpoint、withInterceptors；/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 将 Vue 集成描述为 provideClient / injectClient 模式。）
- **missing-capability / 缺少官方 Vue/Nuxt composable 层**：对 Nuxt + Pinia 团队最缺的是官方 composable/store 协作层，这应归类为能力尚未覆盖，而不是实现错误。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts 没有任何 useCommand / useMutation / useEventStream / useWebSocket* 导出；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md API 段也只列出 provideClient、injectClient、withEndpoint、withInterceptors。）
- **documentation-gap / Nuxt SSR / Pinia 使用文档不足**：围绕 Nuxt SSR、请求级认证头转发、Pinia store 注入的关键路径缺少文档，属于文档覆盖不足。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 的 Quick Start 只展示 main.ts 和组件内 injectClient；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/README.md 的使用示例同样停留在 main.ts 与组件调用，没有 Nuxt plugin、SSR 请求级上下文、Pinia store 用法。）
- **documented-but-unintuitive / withInterceptors 的工厂函数语义**：这个行为是有文档和实现支撑的，但对习惯直接传 interceptor 实例的 Vue 工程师并不直觉，尤其在 Nuxt SSR 下需要额外考虑不要闭包到错误的运行时状态。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 明确写了 withInterceptors 接收 factory functions；/Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/core.ts 中 withInterceptors(...fns) 通过 fns.map((fn) => fn()) 在插件安装时实例化拦截器。）
- 生产可用性判断：如果团队本身熟悉 Nuxt plugin、SSR request scope 和 Pinia 规范，我认为它可以作为生产底座试点；但要进入大规模 SaaS 后台主干线，最好先补一层内部 composable/Pinia 适配，并明确 SSR 安全接线规范。
- 行业特有风险：
- 在 Nuxt SSR 中，如果团队没有官方示例指引，很容易把携带 cookie 或租户头的 Client 做成模块级单例，进而引入请求间状态串味或认证头泄漏风险。
- 缺少官方 Pinia/composable 层后，列表请求、重试、取消、错误归一化会在各页面各写一套，SaaS 后台项目很快出现状态管理风格分裂。
- SSE/WebSocket 接到 Pinia 时若没有推荐的生命周期模式，路由切换或 layout 复用场景容易出现订阅清理不一致，导致重复连接或幽灵状态。
- 建议：
- 补一篇 Nuxt 3 官方 cookbook：至少覆盖 plugins/defjs.server.ts、plugins/defjs.client.ts、服务端 header/cookie 透传、以及如何避免模块级单例污染请求上下文。
- 提供官方但可选的 Vue/Nuxt composable 示例或独立包，例如 useCommand、useEventStream、useWebSocketSession、usePagedCommand；即使保持 thin adapter，也应给出推荐模板。
- 在 /Users/munmunmiao/Documents/web/zen-kit/doc/plugins/vue.md 增加 Pinia store 用法，展示如何在 action 中调用 client.execute、如何统一 error/loading、以及如何在 store 或 composable 中清理流式连接。
- 给 withInterceptors 的文档补一段 SSR 安全说明：强调工厂函数何时执行、适合读取哪些运行时值、以及在 Nuxt 里如何避免闭包到过期 token 或跨请求状态。
- 评分：3.9/5

### P22 — 韩知白

- 行业/角色：Web 平台 / Next.js App Router 工程师
- 经验背景：资深；长期在 Next.js App Router / RSC / TanStack Query 体系里做鉴权、服务端预取、hydration 和缓存边界设计。
- 关注 package：`/Users/munmunmiao/Documents/web/zen-kit/doc`、`/Users/munmunmiao/Documents/web/zen-kit/packages/core`、`/Users/munmunmiao/Documents/web/zen-kit/packages/react`
- 使用场景：在 Next.js App Router 中同时处理 Server Component 的 cookie/header 透传、客户端 hydration，以及与 TanStack Query 的服务端预取和缓存整合。
- 先查阅：
- `README.md`
- `package.json`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- `packages/core/package.json`
- ……另查阅 9 个相关入口/文档
- 第一印象：核心抽象很干净，React 包也足够克制；但一旦把视角切到 Next.js App Router，官方材料对 cookie/header、server prefetch 和 hydration 这条主路径支撑明显不够。
- 喜欢的点：
- `/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx` 顶部显式使用 `"use client"`，至少把 React 包的运行边界说清楚了，不会把 `useClient()` 误带进 RSC。
- `/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts` 的 API 面很小，作为基础注入层很易懂；对已经有自己数据层的团队，接入成本可控。
- `@defjs/core` 在 `/Users/munmunmiao/Documents/web/zen-kit/doc/index.md` 和 `/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md` 展示出的统一 HTTP/SSE/WebSocket 模型，对同时做 REST 与实时消息的 App Router 产品很有吸引力。
- 最大阻碍：
- 缺少官方 Next.js App Router 落地路径：我没在已查阅的 React README、doc 首页或 getting-started 里看到 RSC 中如何创建 per-request client、怎样透传 cookie/header、以及如何把服务端预取结果交给客户端 hydration。
- 没有 React Query / TanStack Query 官方适配层或 cookbook。对我这种默认用 prefetch + dehydrate/hydrate 的团队来说，采用 defjs 需要自己补 queryFn、cache key、错误桥接和 suspense 边界。
- `withInterceptors` 在 core 文档示例与 React 入口里的参数形态不一致；当团队想复用一套 server/client 配置时，容易先复制示例再发现不能直接共用。
- `ClientProvider` 的 client 生命周期对 App Router 登录态切换不够透明。源码显示它只在首次挂载时创建 client，但 README 没提醒 options 变化时不会自动重建。
- 分类判断：
- **design-choice / React 包保持 thin adapter 而不内建数据获取层**：所以缺少 `useQuery` / `useMutation` / `useCommand` 不能直接算实现缺陷，更准确的反馈是：当前能力边界太薄，App Router 团队还需要官方 cookbook 或 companion package 才容易落地。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 只导出 `ClientProvider`、`useClient`、`withEndpoint`、`withInterceptors`；/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 第 2-4 行将其定位为 `dependency injection helpers`；/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md 也已把 framework package 的 thin adapter 定位记录为设计边界。）
- **documentation-gap / App Router 中 cookie/header 透传与服务端预取文档缺位**：对 Next.js App Router 工程师来说，这会直接放大鉴权、租户隔离和 request-scoped header 传递的心智负担，尤其是在 Server Component 和 Client Component 混用时。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 仅展示 `ClientProvider` + `useClient()` + `useEffect`；/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 的 React 介绍只提 `ClientProvider`、`useClient` 和 option helpers；/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 都未出现 Next.js、RSC、`cookies()`、`headers()` 或 server-side prefetch/hydration 示例。）
- **missing-capability / React Query / hydration 适配缺失**：这不是 bug，但它让 defjs 在 Next.js 主流生产栈里更像“传输层基础件”而不是可直接替代现有数据获取方案的完整答案。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts 没有 query/hydration 相关导出；/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 也没有 TanStack Query、`dehydrate` / `hydrate`、Suspense 或 Error Boundary 集成示例。）
- **possible-doc-implementation-mismatch / `withInterceptors` 同名 API 的参数心智不一致**：当我想把一套拦截器策略同时放到 RSC 侧的 `@defjs/core` client 和客户端 `@defjs/react` provider 时，这个同名但不同形态的 API 很容易造成复制示例后才暴露的问题。（依据：证据：/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 第 131-139 行示例使用 `withInterceptors([ async (request, next) => ... ])`；而 /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/core.tsx 第 36-39 行的 React 版本签名是 `withInterceptors(...fns: (() => Interceptor)[])`，/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md 第 69-91 行也按工厂函数方式说明。）
- 生产可用性判断：我会把 `@defjs/core` 视为可以进入生产的传输层底座；但 `@defjs/react` 目前更像轻量注入层，而不是面向 Next.js App Router 的完整工程化方案。若团队愿意自己补齐 RSC + React Query + hydration 模式，可以试点；若希望开箱即用，当前资料和能力还偏薄。
- 行业特有风险：
- 如果没有官方 request-scoped 示例，团队容易把浏览器侧 provider 误当成完整的 SSR/RSC 方案，最终在 cookie/header 透传上形成各自为政的封装。
- 缺少 React Query 官方桥接时，常见结果是服务端预取、客户端再拉取、错误边界和 cache key 策略各写一套，导致重复请求与 hydration 偏差。
- `ClientProvider` 生命周期说明不足会放大登录态切换或多租户切换时的陈旧配置风险，尤其是把 endpoint/token 当作 props 传入时。
- 建议：
- 在 `/Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md` 或 docs 中新增一篇完整的 Next.js App Router cookbook：Server Component 中创建 per-request `@defjs/core` client、从 `cookies()` / `headers()` 注入鉴权信息、服务端 prefetch、客户端 hydrate。
- 提供一个轻量 companion 包或官方示例（例如 `@defjs/react-query`、`createQueryOptions`、`createMutationOptions`），不用把 React 包做厚，但至少把 queryFn、错误桥接、dehydrate/hydrate 路径官方化。
- 在 React README 明确写出 `ClientProvider` 的生命周期语义：`options` 只在首次挂载时生效；若需要响应登录态/租户变化，应 remount provider 或在拦截器内部懒读取 token。
- 收敛 `withInterceptors` 的跨包心智差异：要么在 React README 明确标注“这是 React 专用工厂签名，和 core 示例不同”，要么考虑支持更接近 core 的共享配置写法，减少 server/client 双栈配置分叉。
- 评分：3.5/5

### P23 — 贺兰舟

- 行业/角色：企业 Angular / enterprise tester / 企业 Angular 测试工程师 / 测试基础设施协作者
- 经验背景：资深企业前端测试与平台协作经验，熟悉 Angular TestBed、RxJS、signals、依赖注入测试替身和大型团队 mock 约定。
- 关注 package：`doc`、`@defjs/core`、`@defjs/angular`
- 使用场景：评估如何在企业 Angular 项目中把 defjs 的 Promise tuple 结果映射到 RxJS / signals，并为 TestBed 设计 mock client / helper。
- 先查阅：
- `README.md`
- `package.json`
- `doc/package.json`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `doc/guide/examples.md`
- ……另查阅 10 个相关入口/文档
- 第一印象：第一感觉是 core 的 typed command 和 Angular 的 DI 接入很干净，适合企业代码审计；但作为 tester，我很快发现 Angular 包停在“能注入 client”这一步，离可复用的 Observable/signal facade、可维护 mock client、TestBed helper 还有明显距离。
- 喜欢的点：
- `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 的 `provideClient(...feature)` + `injectClient()` 很符合 Angular 原生 DI 心智，作为最小接入层非常顺手。
- `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/package.json` 把 peer range 写到 Angular 18–22，对企业维护多版本 monorepo 比较友好。
- `/Users/munmunmiao/Documents/web/zen-kit/README.md` 与 `doc/guide/examples.md` 把 Promise tuple 返回模式讲得足够直接，测试里手写 stub client 的成本不高，至少没有被全局单例绑死。
- 最大阻碍：
- /Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md 没有覆盖 Promise tuple 到 RxJS / signals 的官方适配路径，也没有 TestBed / mock client helper 章节；对企业 Angular 测试团队来说，落地时需要自行定义 from(client.execute(...))、toSignal 包装和测试替身约定。
- /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts 与 /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts 只暴露 provideClient / injectClient / withEndpoint / withInterceptors 这层 DI 薄适配，没有命名 client、RxJS helper、signal helper、testing utility 等官方入口；这更像能力缺口而不是实现缺陷。
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 的 Angular 示例停在组件里直接 await client.execute(...)，缺少企业测试语境最常见的 facade/service + Observable 或 signal 桥接示例，也没有 mock provider / TestBed cookbook。
- 分类判断：
- **missing-capability / Angular 薄适配导致缺少 RxJS/signal/helper**：从企业 Angular tester 视角，当前包更像 DI 入口，不提供 Promise tuple 到 Observable/signal 的现成桥接，也没有测试工具；这属于能力尚未覆盖，不能算 adapter bug。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts` 仅导出 `injectClient, provideClient, withEndpoint, withInterceptors`；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 也只实现这四类能力，没有 RxJS / signal / testing 入口。结合 prior feedback `/Users/munmunmiao/Documents/web/zen-kit/docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md` 第 126-139 行已将框架包定位为 thin adapter，并要求把这类诉求归为 capability / documentation request。）
- **documentation-gap / Angular README 对测试与响应式桥接说明不足**：文档已经能说明如何注入 client，但没有继续回答企业团队最关心的“如何把 tuple 接进 Observable/signal 以及如何在 TestBed 中 mock”。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 第 15-81 行只覆盖 provideClient、injectClient、withEndpoint、withInterceptors 和一个简单组件例子；没有 `from(...)`、`toSignal(...)`、facade service、TestBed provider override、mock client helper 等章节。）
- **documentation-gap / Angular 示例对企业测试场景覆盖不足**：示例页展示了 Angular DI 的最小用法，但没有展示在 service/facade 中桥接 RxJS 或 signal，也没给出测试写法，导致企业测试团队需要自行摸索最佳实践。（依据：`/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 第 380-427 行的 Angular Integration 示例仅在 `UserComponent.loadUser()` 中直接 `await this.client.execute(getUser())`；未提供 Observable / signal / TestBed 版本。）
- **documented-but-unintuitive / withInterceptors 工厂函数写法**：对 Angular 开发者来说，拦截器通常习惯直接传对象或 class provider；这里改成工厂函数是为了进入 Angular DI 上下文，文档有写，但第一次看仍不够直觉。（依据：`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/core.ts` 第 20-27 行签名为 `withInterceptors(...fns: (() => Interceptor)[])`；`/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 第 69-79 行明确说明“Each function is called via Angular's useFactory and receives DI context.”）
- 生产可用性判断：我会给出“可作为底层传输定义层试点，但不建议直接作为企业 Angular 团队开箱即用方案”的判断。底层能力和 DI 接入是可用的，但 Angular 生态化配套仍偏薄，尤其缺少官方响应式桥接和测试 cookbook。
- 行业特有风险：
- 大型 Angular 团队通常要求 service/facade 输出 Observable 或 signal 以便 async pipe、computed 和统一测试策略；如果官方没有桥接示例，各组会各自封装，导致测试风格分裂。
- 企业测试基建常依赖 TestBed override provider、统一 mock client factory、fixture 稳定性约定；缺少官方 helper 会提高 onboarding 成本，也让回归测试中的 tuple 解构样板蔓延。
- 受监管或多团队协作场景里，文档若只展示组件中直接 await Promise 的写法，容易让团队低估后续在状态管理、取消、重试、错误映射和观测性上的封装成本。
- 建议：
- 在 `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 新增“RxJS and Signals”章节，至少给出 `from(client.execute(cmd))`、`defer(() => from(...))`、`toSignal(...)`、error tuple 到 view-model 的官方推荐封装。
- 在 `/Users/munmunmiao/Documents/web/zen-kit/packages/angular/README.md` 或 docs 中补一节 “Testing with TestBed”，展示如何 override `provideClient(...)`、如何提供一个 typed mock client factory，以及如何断言 tuple/error 分支。
- 如果坚持 thin adapter 边界，建议在 `/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md` 增加 facade/service 风格示例，并明确写出“官方不提供 query/mutation/rxjs helpers，需要应用层自行封装”的能力边界，减少预期落差。
- 考虑提供一个独立可选包或 cookbook，例如 `@defjs/angular/rxjs` 或 `@defjs/angular/testing`，让企业团队能选择性接入，而不必把主包做厚。
- 评分：3.4/5

### P24 — 宁远

- 行业/角色：安全工程 / 安全工程师
- 经验背景：资深
- 关注 package：`defjs root: /Users/munmunmiao/Documents/web/zen-kit/README.md, /Users/munmunmiao/Documents/web/zen-kit/package.json, /Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml`、`doc: /Users/munmunmiao/Documents/web/zen-kit/doc/package.json, /Users/munmunmiao/Documents/web/zen-kit/doc/index.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md, /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md`、`@defjs/core: /Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts`、`@defjs/opentelemetry-server: /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/package.json, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/index.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts, /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts`
- 使用场景：审查 header/body/raw query 默认不采集、WebSocket query propagation 与隐私日志风险。
- 先查阅：
- `README.md`
- `package.json`
- `pnpm-workspace.yaml`
- `doc/package.json`
- `doc/index.md`
- `doc/guide/getting-started.md`
- ……另查阅 12 个相关入口/文档
- 第一印象：我第一眼会把 defjs 看成“默认克制、偏安全友好”的 typed transport client：README 和 OTel 包没有鼓励全量抓包式可观测性，而是默认只保留连接级、状态码级和低基数属性，这点对安全审计很加分。真正让我犹豫的是，WebSocket trace context 默认落到 query string，以及安全采集策略主要靠用户自己写 hook，意味着团队若没有成熟 observability guardrail，很容易在接入阶段把隐私日志问题重新引入。
- 喜欢的点：
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 对默认不采集 body、全部 header、raw query、SSE event payload、WebSocket message payload 说得非常直白，这种保守默认值符合最小暴露原则。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 明确指出该包不负责初始化 OTel SDK，而是复用外部 tracer/meter，便于企业把 defjs 接进既有审计与采样体系，而不是再引入一套隐式全局副作用。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts 与 src/option.ts 的公开面很小，安全评审时容易穷尽配置入口；从根 README、doc 首页到包 README，整体都在强调 typed client 与 transport 统一，而不是鼓励粗放埋点。
- 最大阻碍：
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 已说明默认不采集 body、全部 header、raw query，若安全团队需要对特定 header、payload 片段或消息级元数据做审计，只能通过 requestHook/responseHook 自行扩展，缺少官方白名单采集能力。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 将 `webSocket.queryPropagation` 默认设为 `true`，虽然文档明确提示 URL/query 日志与 baggage 泄露风险，但在高敏环境里这仍意味着接入方必须主动关掉而不是默认安全。
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 与 /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md 主要展示功能 happy path，没有把“如何安全记录最小必要字段、如何禁用 WebSocket query propagation、如何避免在 hook 中误记敏感信息”整理成安全落地 cookbook。
- 分类判断：
- **design-choice / HTTP/SSE/WS 默认不采集 header/body/raw query**：这是明显的保守遥测设计，不应作为 bug；从安全工程视角反而是优点，因为默认最小化高基数与敏感数据暴露面。（依据：证据路径：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第124-125行写明“This package does not capture request/response bodies, all headers, raw query strings...” ；第147-148行与第169行继续说明 SSE/WebSocket 默认也不采集 event payload、message payload 等。）
- **documented-but-unintuitive / WebSocket query propagation 默认开启**：文档已经直接说明浏览器兼容性原因与 query/baggage 泄露风险，所以不能报成实现错误；但从安全默认值看仍然反直觉，生产接入时很容易遗漏。（依据：证据路径：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第171-184行明确写出“keeps the existing behavior of injecting trace context into the WebSocket query string by default”，并警告 query strings、APM URL fields、baggage values 可能暴露敏感信息，同时给出 `webSocket: { queryPropagation: false }`。源码入口 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 第27-36行定义 WebSocket 选项，第98-107行把 `options.webSocket?.queryPropagation` 传给拦截器，README 与公开入口口径一致。）
- **documentation-gap / 缺少安全导向的最小采集 cookbook / 白名单采集能力**：当前 README 讲清了默认不采集什么，也给了 requestHook/responseHook，但没有面向安全/合规用户说明如何只采集低风险 header、如何审计 hook 自身不会把敏感字段打进 span。（依据：证据路径：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 第26-49行与第64-87行仅展示 requestHook/responseHook 自定义；第89行说明 hook 抛错只记录 `defjs.otel.hook.error` 且请求继续。/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 虽有 logging interceptor 示例（第360-377行），但未提供安全筛选示例；/Users/munmunmiao/Documents/web/zen-kit/doc/index.md 第24-35行强调 observability 与 framework ready，也未补充隐私日志 guardrail。）
- **missing-capability / 缺少 header 白名单与消息级隐私安全控制**：对于安全审计，常见诉求不是“全量采集”，而是声明式白名单采集少量低敏 header/attribute，以及对 SSE/WS 消息级 telemetry 做显式开关与过滤策略；目前只能手写 hook。（依据：证据路径：/Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 配置表（第52-87行）只暴露 tracer/meter/propagator/transport hooks/queryPropagation，没有 `captureHeaders`、message attribute allowlist、payload redaction 等声明式选项。源码公开入口 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/public_api.ts 与 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts 也只公开这些选项。）
- 生产可用性判断：如果团队已经有成熟的 OTel SDK 初始化、span attribute 审核流程，以及强制禁用高敏 WebSocket query propagation 的平台基线，我会允许它进入受控试点；若希望“开箱即用即默认安全”，目前还差一层更显式的安全 guardrail 与 cookbook。
- 行业特有风险：
- 在高敏环境中，URL query 往往会进入接入层访问日志、WAF/代理日志、浏览器开发者工具、APM URL 聚合字段；若默认携带 trace context 或 baggage，可能造成跨系统扩散。
- 合规审计通常要求“最小必要采集”和可证明的白名单策略；如果只能通过自由度很高的 hook 自定义，团队容易在排障时临时加入敏感 header/body 并长期遗留。
- 实时链路（SSE/WebSocket）一旦缺少清晰的消息级观测和隐私边界说明，安全团队很难判断哪些字段允许进 span/event，哪些必须留在业务侧受控日志中。
- 建议：
- 把 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 中的 WebSocket query propagation 安全警告前移到 Usage 或 Configuration 顶部，并给出“生产默认建议：`queryPropagation: false`，仅在浏览器受限且确认无敏感 baggage 时开启”的醒目指引。
- 为 @defjs/opentelemetry-server 增加声明式白名单能力，例如 `captureHeaders: string[]`、`captureQueryKeys: string[]`、`redactAttributes` 或等价安全 API，让团队不必在 requestHook/responseHook 里手写易失控的采集逻辑。
- 补一页安全/隐私 cookbook，明确展示如何记录最小必要字段、如何避免把 Authorization、Cookie、tenant 标识和 payload 打进 span，以及如何对 SSE/WebSocket 做消息级采样而不是全量内容采集。
- 考虑提供更强的安全默认值或运行时提示：例如当 propagator 含 baggage 且 `webSocket.queryPropagation !== false` 时，在开发环境输出显著 warning，帮助平台团队尽早发现 URL 泄露面。
- 评分：3.8/5

## 按 package 汇总

### `defjs root`

- 覆盖 persona：P01、P02、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P19、P20、P21、P23、P24
- 平均评分：3.46/5
- 总体判断：仓库级工程纪律被认可，但 package 入口承担了过多“对外契约”职责；当前最大的不足是 adoption 叙事而不是构建质量。
- 正向主题：
- /Users/munmunmiao/Documents/web/zen-kit/package.json 的 scripts 语义清晰，适合做平台模板与 monorepo 基线。
- /Users/munmunmiao/Documents/web/zen-kit/.github/workflows/ci.yml 的分层 CI 思路与 dependency review 给平台化印象加分。
- workspace 结构清楚，root README 能让读者快速知道仓库包含 core、framework adapters 与 OTel 集成。
- 摩擦主题：
- 根 README roadmap 与仓库现状不一致，React/Vue 已存在但仍被写成未来项，削弱成熟度判断。
- Node >=26、pnpm 11.6.0、engine-strict=true 对采购、外部采用与试点团队形成较高门槛。
- 缺少 support matrix、release maturity、CONTRIBUTING/adapter authoring 等 adoption contract 文档。

### `doc`

- 覆盖 persona：P01、P02、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P19、P20、P21、P22、P23、P24
- 平均评分：3.47/5
- 总体判断：doc 是覆盖最广、杠杆最高的包，也是当前最影响采用效率的短板；多数批评都指向“可信度和主路径不够收敛”。
- 正向主题：
- 文档覆盖面广，已经尝试把 root、core、framework、OTel 串成一条产品叙事。
- examples 的 ambition 很对，读者普遍喜欢它想提供 copy-paste-ready 的方向。
- plugins 文档让框架接入入口比纯源码阅读更容易上手。
- 摩擦主题：
- /Users/munmunmiao/Documents/web/zen-kit/doc/index.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md 存在示例与当前设计文档口径漂移。
- 缺少高频场景 cookbook：React Query/Next.js、Nuxt/Pinia、Angular RxJS/TestBed、安全/隐私、严格合规模式。
- 没有为 docs snippet、README roadmap、一致性漂移建立明确 CI 守门。

### `@defjs/core`

- 覆盖 persona：P01、P02、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P19、P20、P21、P23、P24
- 平均评分：3.50/5
- 总体判断：@defjs/core 是整套仓库最被认可的基础层，但也正因为它足够底座化，大家更强烈地期待围绕它的 strict mode、query key 和 cookbook 体系。
- 正向主题：
- 统一 HTTP/SSE/WebSocket 的 typed client 心智被反复称赞。
- API 表面积相对克制，适合共享 command/schema 定义与跨框架复用。
- 零值默认、Partial Input、transport 抽象的设计意图清楚，一旦理解后具有一致性。
- 摩擦主题：
- opt-in strict validation / fail-closed profile 缺位，使金融、医疗、实时主链路团队难以直接采用默认 schema/stream 语义。
- struct.request、普通 input、build(ctx, input) 的决策边界仍不够清晰，且被文档漂移进一步放大。
- 稳定 cache key、query integration、部分实时错误控制面仍需应用层自己补。

### `@defjs/angular`

- 覆盖 persona：P01、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P23
- 平均评分：3.42/5
- 总体判断：@defjs/angular 适合作为最小注入层，但若面向企业 Angular 主流实践，还需要补齐响应式与测试基建示例。
- 正向主题：
- provideClient(...)/injectClient() 很符合 Angular 原生 DI 心智。
- peer range 覆盖 Angular 18–22，对企业多版本维护较友好。
- thin adapter 让业务方能自主决定 facade/service 组织方式。
- 摩擦主题：
- 当前仅提供 DI 薄适配，缺少 RxJS/signals bridge、TestBed cookbook、mock helper 与多 client 命名能力。
- withInterceptors 的工厂函数语义对 Angular 习惯并不直觉。
- 首页把它说成 first-class integration，但企业 Angular 团队期待的工程化示例仍然不够。

### `@defjs/vue`

- 覆盖 persona：P01、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P21
- 平均评分：3.44/5
- 总体判断：@defjs/vue 的生态契合度不错，但目前更像 Vue DI 接线层；要进入 SaaS/Nuxt 主干线，还需要官方给出 SSR 与状态层模板。
- 正向主题：
- provideClient/injectClient 与 Composition API 心智高度一致。
- HTTP_CLIENT 自定义 InjectionKey 能支持多 client 与复杂注入层级。
- Vue 包没有重复发明 transport 抽象，延续了 core 的统一语义。
- 摩擦主题：
- 缺少 Nuxt 3 SSR 请求级 header/cookie 透传、Pinia 注入与路由生命周期下的 SSE/WebSocket 管理示例。
- 没有官方 composable/store 层，例如 useCommand、useEventStream 或 Pinia 模板。
- withInterceptors 工厂函数在 SSR 环境中的执行时机与闭包风险解释不足。

### `@defjs/react`

- 覆盖 persona：P01、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18
- 平均评分：3.42/5
- 总体判断：@defjs/react 被认为是干净、克制的注入层，但还不是面向 Next.js 主流生产栈的开箱即用方案。
- 正向主题：
- API 面积极小，学习成本低。
- "use client" 边界明确，至少不会把 useClient() 误带入 RSC。
- 对已有自建数据层的团队来说，它的非侵入性是优点。
- 摩擦主题：
- 缺少 Next.js App Router / RSC / cookie-header 透传 / hydration 的官方主路径。
- 没有 React Query / TanStack Query 官方桥接或 query helper，导致多数团队需要自行包一层。
- ClientProvider 生命周期与 withInterceptors 同名不同形态会在真实项目中带来配置误解。

### `@defjs/opentelemetry-server`

- 覆盖 persona：P01、P02、P03、P04、P05、P06、P07、P08、P09、P10、P11、P12、P13、P14、P15、P16、P17、P18、P19、P20、P24
- 平均评分：3.48/5
- 总体判断：@defjs/opentelemetry-server 的默认姿态在安全与平台团队里口碑不错，但其产品完成度仍偏“基础埋点层”，距离成熟的实时/安全治理方案还有一步。
- 正向主题：
- 不初始化 OTel SDK、复用外部 tracer/meter，非常适合接入既有平台。
- 默认不采集 body/header/raw query/payload 的最小化策略普遍被认为安全友好。
- HTTP/SSE/WebSocket transport 分开配置，且 span 生命周期保持到 close/error，利于渐进式接入。
- 摩擦主题：
- WebSocket queryPropagation 默认开启，对隐私、安全、代理链路复杂的场景不够安心。
- 缺少 message-level telemetry、reconnect/drop/backpressure 指标和 hooks，难以支撑实时运营观测。
- 缺少 captureHeaders/captureAttributes 这类 allowlist/redaction 能力，只能靠 hook 手写治理。

## 跨 package 系统性主题

### P0 — 文档与 roadmap 漂移正在削弱整个仓库的首轮信任感

- 涉及 package：`defjs root`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`
- 分类：possible-doc-implementation-mismatch
- 证据：
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md and /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md still contain older build-style examples, while /Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md and /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md describe the newer build(ctx, input) + ctx.setPathParams(...) mental model.
- /Users/munmunmiao/Documents/web/zen-kit/doc/index.md and /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md present different quick-start shapes for client creation and request construction.
- /Users/munmunmiao/Documents/web/zen-kit/README.md still lists React/Vue wrapper packages in the roadmap, while /Users/munmunmiao/Documents/web/zen-kit/packages/react/package.json and /Users/munmunmiao/Documents/web/zen-kit/packages/vue/package.json already exist.
- /Users/munmunmiao/Documents/web/zen-kit/.github/workflows/ci.yml, /Users/munmunmiao/Documents/web/zen-kit/.github/workflows/_checks.yml, and /Users/munmunmiao/Documents/web/zen-kit/doc/package.json do not show a dedicated docs-snippet or roadmap-drift guard.
- 建议：先把文档与 roadmap 可信度恢复为单一事实源，再给关键示例和 README 建立自动校验；这是 24 份反馈里最高频、最高杠杆的问题。

### P1 — 框架包的 thin adapter 策略被普遍接受，但缺少配套落地模板

- 涉及 package：`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`
- 分类：design-choice-with-adoption-cost
- 证据：
- /Users/munmunmiao/Documents/web/zen-kit/packages/react/src/public_api.ts only exports ClientProvider/useClient/withEndpoint/withInterceptors.
- /Users/munmunmiao/Documents/web/zen-kit/packages/vue/src/public_api.ts only exports HTTP_CLIENT/provideClient/injectClient/withEndpoint/withInterceptors.
- /Users/munmunmiao/Documents/web/zen-kit/packages/angular/src/public_api.ts only exports provideClient/injectClient/withEndpoint/withInterceptors.
- /Users/munmunmiao/Documents/web/zen-kit/packages/react/README.md describes the React package as dependency-injection helpers, and /Users/munmunmiao/Documents/web/zen-kit/doc/index.md frames framework integration around provide/inject/useClient patterns.
- 建议：保持 thin adapter 边界，但必须补官方 cookbook 或 companion patterns，把 React Query、Nuxt/Pinia、Angular RxJS/signals/TestBed 的主路径官方化。

### P1 — 受监管和关键链路需要 opt-in strict profile，但当前只看到分散能力，没有统一接线方式

- 涉及 package：`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`
- 分类：missing-capability
- 证据：
- /private/tmp/claude-501/-Users-munmunmiao-Documents-web-zen-kit/df2ab16d-8649-446f-afe7-7da6f854f2a8/tasks/p01-p18-feedbacks.json contains repeated requests from P01/P02/P03/P09 for opt-in strict validation or fail-closed profiles rather than changing the default schema behavior.
- /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/public_api.ts exposes the main transport/schema surface but no obvious packaged strict-mode profile.
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md documents hook failure as non-fatal and streaming telemetry as lifecycle-oriented, which is operationally safe but not a regulated fail-closed preset.
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md and /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md do not provide a single 'strict/regulated mode' cookbook tying HTTP, SSE, WebSocket, and telemetry behavior together.
- 建议：把严格校验/严格流处理/严格观测失败的组合做成 opt-in profile 或至少做成清晰 cookbook，满足金融、医疗、合规、实时主链路的 fail-closed 需求。

### P1 — 实时与流式场景在消息级可观测性上仍有明显能力空缺

- 涉及 package：`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/opentelemetry-server`
- 分类：missing-capability
- 证据：
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md explicitly limits SSE/WebSocket telemetry to connection-level spans and metrics, not message payload, message size, backpressure, or reconnect-queue detail.
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/telemetry/metrics.ts creates connect duration, connection duration, and active streams/connections metrics, but no message-rate or drop metrics.
- /private/tmp/claude-501/-Users-munmunmiao-Documents-web-zen-kit/df2ab16d-8649-446f-afe7-7da6f854f2a8/tasks/p01-p18-feedbacks.json shows P09/P10/P13 all asking for queue overflow, invalid message, reconnect, and message-level observability hooks or metrics.
- /Users/munmunmiao/Documents/web/zen-kit/doc/index.md markets streaming support strongly, but the public docs do not yet show a production-grade real-time observability cookbook.
- 建议：把消息级 telemetry、drop/backpressure/reconnect 指标与 hook 做成明确的 opt-in 层；否则 defjs 更像“连接层底座”而不是“实时运营观测方案”。

### P1 — 可观测性默认值总体克制，但安全 guardrail 仍不够显式和产品化

- 涉及 package：`defjs root`、`doc`、`@defjs/core`、`@defjs/opentelemetry-server`
- 分类：documented-but-unintuitive-plus-security-gap
- 证据：
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md states that request/response bodies, all headers, raw query strings, SSE event payloads, and WebSocket message payloads are not captured by default.
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md also warns that WebSocket query propagation is enabled by default for compatibility and may leak trace context or baggage through URLs.
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/src/option.ts exposes webSocket.queryPropagation and transport hooks, but no declarative captureHeaders/captureAttributes allowlist.
- /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md and /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md do not package these security choices into a clear privacy-first cookbook.
- 建议：保留保守采集设计，但前移安全警告、补最小采集 cookbook，并增加 allowlist/redaction 类声明式选项，降低接入团队误踩隐私红线的概率。

## 高优先级改进建议

| 优先级 | 类型 | 目标 package | 问题 | 下一步 |
|---|---|---|---|---|
| P0 | docs-only | `defjs root`、`doc`、`@defjs/core` | 首轮试用路径存在 API 口径漂移，多个 persona 把“复制即错”视为最大 adoption blocker。 | 统一 /Users/munmunmiao/Documents/web/zen-kit/README.md、/Users/munmunmiao/Documents/web/zen-kit/doc/index.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md、/Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md、/Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md 的 createClient / withEndpoint / struct.request / build(ctx, input) / output 示例，并让 docs snippet 进入 CI 校验。 |
| P0 | roadmap-clarification | `defjs root`、`doc` | roadmap 与仓库现状、运行时门槛和产品边界没有被讲清楚，平台 owner、采购和开源维护者都会因此放大不确定性。 | 把 /Users/munmunmiao/Documents/web/zen-kit/README.md 重构成“已交付能力 / 计划中能力 / 非目标能力”，并补 support matrix（Node >=26、pnpm 11.6.0、engine-strict=true、发布成熟度、breaking-change 预期）。 |
| P0 | docs-only | `doc`、`@defjs/opentelemetry-server` | 当前安全警告虽已存在，但位置偏后，且没有把保守默认值与安全接线方式打包成一条可复制主路径。 | 把 /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 中关于 webSocket.queryPropagation 的风险警告前移到 Usage/Configuration 顶部，并新增一页安全/隐私 cookbook，明确推荐 queryPropagation: false 的生产基线与最小必要采集策略。 |
| P1 | example-cookbook | `doc`、`@defjs/core`、`@defjs/react` | React 团队认可 thin adapter，但缺少主流生产栈的官方模板，导致每个项目都要重复造 query/hydration 集成。 | 新增 Next.js App Router + TanStack Query 官方 cookbook，覆盖 Server Component per-request client、cookies()/headers() 透传、prefetch、dehydrate/hydrate、ClientProvider 重挂载语义与错误边界。 |
| P1 | example-cookbook | `doc`、`@defjs/core`、`@defjs/vue` | Vue 包已经足够轻，但 Nuxt SSR 与 Pinia 的落地空白让 SaaS 场景必须先自建约定。 | 新增 Nuxt 3 + Pinia 官方 cookbook，覆盖 server/client plugin、请求级 header/cookie 透传、Pinia action 调用、SSE/WebSocket 生命周期清理与 SSR 安全说明。 |
| P1 | example-cookbook | `doc`、`@defjs/core`、`@defjs/angular` | Angular 包的薄适配本身没错，但企业团队缺少官方响应式与测试路径，采用成本过高。 | 新增 Angular enterprise cookbook，覆盖 facade/service 风格、from(client.execute(...))、toSignal(...)、TestBed override provider、typed mock client factory 与多 client 实践。 |
| P1 | api-option | `doc`、`@defjs/core`、`@defjs/opentelemetry-server` | 受监管和关键实时链路用户并不想推翻当前默认，只是缺少一组官方支持的严格模式接线。 | 为 @defjs/core 与相关 streaming/telemetry 场景设计 opt-in strict profile：例如 required/strict schema 模式、SSE invalidEvent close/error 选项、WebSocket invalid message 策略、queue overflow fail-closed 组合，并用文档明确默认仍保持当前 Go 风格与稳态行为。 |
| P1 | api-option | `@defjs/opentelemetry-server`、`@defjs/core`、`doc` | 当前 OTel 集成适合基础埋点，但对平台、安全和实时系统而言，低基数治理与消息级 SLO 仍需大量手工 hook。 | 为 @defjs/opentelemetry-server 增加声明式 allowlist/redaction 与消息级 telemetry 选项，例如 captureHeaders、captureAttributes、message counters、drop/backpressure/reconnect 指标，默认继续关闭。 |
| P2 | api-option | `@defjs/core`、`@defjs/react`、`doc` | 增长、React、平台工程 persona 都提到没有官方 key 规范时，缓存、重试、实验维度和 hydration 很容易各自为政。 | 提供稳定 commandKey 序列化约定，或以 companion helper/package 形式给出 React Query/SWR 等缓存层接线函数。 |
| P2 | docs-only | `defjs root`、`doc`、`@defjs/react`、`@defjs/vue`、`@defjs/angular` | 贡献者、维护者、平台 owner 都缺少一份明确的“如何新增适配层、如何判断文档回归、哪些能力故意不做”的协作契约。 | 补齐 /Users/munmunmiao/Documents/web/zen-kit/CONTRIBUTING.md 或等价 adopter/authoring guide，并在 CI 中新增 docs/roadmap drift guard，明确 thin adapter 贡献边界、README 必备章节和示例校验规则。 |

## 设计取舍与非 bug 说明

- /Users/munmunmiao/.claude/projects/-Users-munmunmiao-Documents-web-zen-kit/memory/schema_go_alignment.md 已把 schema 零值兜底与 Partial Input 对齐到 Go 风格设计意图；反馈应被解读为“需要 opt-in strict mode”，不是把默认行为当 bug。
- @defjs/react、@defjs/vue、@defjs/angular 当前更像依赖注入/适配薄层，而不是完整数据获取框架；P20/P21/P22/P23 的主要诉求是 cookbook、companion package 与边界澄清，而不是指控现有适配器失效。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 明确说明它是 server-side outbound client instrumentation，并且不初始化 OTel SDK；这是一种集成边界选择，不应被写成 inbound server instrumentation 缺陷。
- /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server/README.md 对 body/header/raw query/payload 默认不采集，以及 hook 抛错不打断请求，都是偏安全与偏稳态的取舍；问题在于落地提示和辅助能力不足，不在于隐藏行为。
- WebSocket queryPropagation 默认开启是兼容浏览器限制的 documented-but-unintuitive 选择；更准确的改进方向是更醒目的风险提示、安全 preset 或默认值再评估，而不是把它描述成未文档化 bug。
- thin adapter：作为设计选择保留；反馈集中在 cookbook、集成示例和 escape hatch。
- 零值默认 / Partial Input：按 Go 风格设计处理；反馈集中在迁移心智和文档强调。
- invalid SSE/WebSocket event silent skip：作为默认容错策略；反馈集中在 opt-in strict/fail-closed、debug hook、metrics。
- opentelemetry-server outbound-only：作为边界说明；反馈集中在命名、README 首屏说明和与 inbound instrumentation 的关系。

## 最终结论

defjs 已经具备“可进入试点”的底座素质，尤其是 @defjs/core 的统一传输抽象、framework adapter 的克制边界，以及 @defjs/opentelemetry-server 的保守观测默认值；但它目前更像一套优秀 substrate，而不是已经打磨完 adoption package 的平台产品。若先解决 P0 的文档与 roadmap 可信度，再补齐 P1 的框架 cookbook、strict profile 与 OTel 安全/实时能力，整套仓库的可规模采用性会明显上升。

更具体地说：

- **最适合当前采用的人群**：有能力自建轻封装的平台/SDK 团队、愿意接受 thin adapter 的前端平台团队、需要统一 typed HTTP/SSE/WebSocket 底座的中高级工程团队、已有 OTel SDK/Collector 且重视保守默认值的 SRE/平台团队。
- **暂不适合直接无封装采用的人群**：希望一键获得 React Query/Nuxt/Angular enterprise 完整方案的新手团队、强监管主链路且需要默认 fail-closed 的金融/医疗核心链路、需要成熟 message-level realtime telemetry 的实时运营团队。
- **下一步最值得做**：先修 P0 文档/roadmap/API 示例可信度，再做 P1 cookbook、strict profile 和 OTel 安全/实时能力；不要急着把 thin adapter 改厚。
