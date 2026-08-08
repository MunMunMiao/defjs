# Workspace 工具所有权、测试隔离与发布流程优化计划

## 目标

在不改变公开 API、npm 产物格式和既有 workspace 任务模型的前提下，完成四项优化：

1. 让每项开发依赖由真正执行该任务的根项目或 workspace 直接声明，消除依靠根 `node_modules` 偶然解析成功的隐式耦合。
2. 修复 Vue runtime-only 测试告警和 React 测试挂载残留，使浏览器测试真正渲染并在用例后可靠清理。
3. 使用默认 `GITHUB_TOKEN` 创建 Changesets Version Packages PR，明确保留维护者批准其 CI 的人工门禁；同时只允许 `release-*` tag 指向校验时的 `main` tip。
4. 保护当前混合 staged/unstaged/untracked 工作区，不让实现正确但 Git index 不完整的状态被误提交。

## 已确认的基线

截至 2026-07-31，当前工作树已重新验证：

- 83 个 manifest 中，`fmt`、`fmt:check`、`lint`、`lint:fix`、`typecheck` 只存在于根项目；没有递归或过滤执行这些仓库级门禁。
- `pnpm fmt:check`、`pnpm lint`、`pnpm typecheck`、`pnpm install --frozen-lockfile`、`pnpm dedupe --check`、`pnpm test`、`pnpm build` 和 `git diff --check` 均通过。
- 运行时测试共 1,099 个：Core 731、OpenTelemetry 143、React 24、Vue 48、examples 153；四个发布包覆盖率均为 100%。
- 当前没有 `.tsx`、负向探针、`.tgz` 或 `tsconfig.tsbuildinfo` 残留，根 `scripts/` 不存在。
- 当前 Git index 不是可提交快照：暂存版本仍包含旧递归 typecheck、旧 workspace globs 和包级 `pub`/`typecheck`/`test:type`，并缺少 `tsconfig.base.json`、examples 聚合测试和新 React `.ts` 测试等关键文件。

因此本计划解决的是剩余的所有权、测试信噪比、发布可靠性和交付安全问题，不重新设计已经成立的根命令模型。

## 设计原则

### 任务作用域与依赖所有权必须一致

- 仓库级门禁由根持有：Oxfmt、Oxlint、根 TypeScript program。
- workspace 生命周期由该 workspace 持有：tsdown、Vitest、coverage provider、browser provider、对应的 required peers。
- 根只递归调度 `test`/`build`，不因为“负责调度”而复制所有子包工具。
- 直接 import、直接执行 CLI、或必须满足非可选 peer dependency，都构成直接依赖所有权。
- 同一个依赖可以因不同职责在根和包中同时存在；例如根 `playwright` 服务 CI 的全仓浏览器安装，core/react/vue 的 `playwright` 分别满足各自 browser provider 的 peer。这里的重复是明确所有权，不是脚本混乱。

### 优先修真实缺口，不为去重制造新基础设施

- Release workflow 的 checks job 与 publish job 位于不同 runner，没有 artifact 传递；publish job 当前必须重新 build 才能获得四个完整 `dist`。
- 本轮保留 `release = build && changeset publish`，不引入 upload/download artifact，不把 checks 与有发布权限的 job 合并。
- 默认 `GITHUB_TOKEN` 创建或更新 Version Packages PR 时，GitHub 会生成需要维护者批准的 PR CI；本轮接受这一步人工门禁，不为消除一次点击引入额外 App 或 PAT。
- release tag 可以指向旧 main ancestor 才是真正需要修复的发布缺口。

## 阶段 0：工作区保护

实施前和实施后都执行只读状态审查：

- `git status --short --untracked-files=all`
- `git diff --cached --stat`
- `git diff --stat`
- 关键新增文件的 index/working-tree 存在性对比

约束：

- 不执行 `git reset`、`git restore`、`git checkout`、`git clean`。
- 不执行 `git add`，不替用户重排当前 index。
- 不提交、不推送、不创建 tag、不发布。
- 不尝试伪造或恢复此前被删除的未跟踪 `tsconfig.tsbuildinfo`。
- 完成后输出一份按“依赖所有权 / 测试 / CI 发布 / 文档”分组的建议暂存路径清单，由用户决定如何拆分提交。

## 阶段 1：收敛工具依赖所有权

### 根 `package.json`

保留以下根级依赖：

- `@changesets/cli`：根 `changeset` 和 `release` 直接执行。
- `@changesets/changelog-github`：`.changeset/config.json` 直接引用。
- `@types/node`、`typescript`：根 TypeScript program 所有。
- `oxfmt`、`oxlint`、`oxlint-tsgolint`：仓库级格式和 lint 门禁所有。
- `@hono/node-server`、`hono`：根 `test/hono-test-server.ts` 直接 import，并被 React、Vue、OpenTelemetry 测试 setup 复用。
- `playwright`：`_checks.yml` 从根执行 `pnpm exec playwright` 获取版本、安装 Chromium/Firefox，是仓库测试环境引导工具。

从根删除没有根级真实使用的：

- `@hono/node-ws`
- `@vitest/browser`
- `@vitest/browser-playwright`
- `@vitest/coverage-istanbul`
- `tsdown`
- `tsx`
- `vite`
- `vitest`

根 `scripts` 保持不变，不新增 `test:setup`、`build:all` 或依赖检查 helper。

### `packages/core/package.json`

- 新增 `typescript`：tsdown 启用 `dts: true`，不能继续借用根的 TypeScript 来满足声明生成。
- 新增 `vite`：`test/vite-xsrf-plugin.ts` 直接 import `Plugin`，同时满足 Vitest 的 required peer。
- 删除直接 `@vitest/browser`：`@vitest/browser-playwright` 已把它声明为普通 dependency；Core 直接所有的是 provider。
- 保留 `tsdown`、`vitest`、Istanbul coverage、browser provider、Playwright、Hono server/WebSocket 测试依赖。

### `packages/opentelemetry-server/package.json`

- 新增 `vite`，显式满足 Vitest required peer。
- 删除未使用的 `tsx`；构建使用 `tsdown --config-loader native`，没有 `tsx` CLI/import。
- 保留 `@hono/node-server`：虽然包源码没有直接 import，但包直接使用的 `@hono/node-ws` 将它声明为 required peer；不能依靠根安装碰巧满足。
- 保留 `typescript`、`tsdown`、Vitest/Istanbul、`hono`、`@hono/node-ws`。

### `packages/react/package.json`

- 新增 `hono`：`test/setup.ts` 直接 import `hono` 和 `hono/cors`，当前依赖根解析属于明确泄漏。
- 新增 `vite`，显式满足 Vitest required peer。
- 删除未使用的 `tsx`。
- 删除直接 `@vitest/browser`，保留 `@vitest/browser-playwright` 和它的 required peer `playwright`。
- 保留 React、React DOM、Testing Library、types、TypeScript、tsdown、Vitest/Istanbul。

### `packages/vue/package.json`

- 新增 `vite`，显式满足 Vitest required peer。
- 删除未使用的 `tsx`。
- 删除直接 `@vitest/browser`，保留 browser provider 和 Playwright。
- 在删除未引用的 `test/server.ts` 后删除 `@hono/node-server`；活跃 Vue setup 通过根共享 helper 使用 Node server，Vue 自身不再直接 import。
- 保留 `hono`，因为 `test/setup.ts` 直接 import。

### `examples/package.json` 与 76 个 example 子包

- 聚合 workspace 保留 `vitest`，新增 `vite` 以满足 Vitest required peer。
- 从聚合 workspace 删除 `typescript`：examples 类型检查属于根 TypeScript program。
- 从聚合 workspace 删除 `tsx`：参数化测试在每个 example 的 cwd 中启动 `node --import tsx`。
- 76 个 example manifest 各自保留 `tsx`；它们拥有独立 `start: tsx src/index.ts`，这不是应被去除的重复。

### `doc/package.json`

不改。`vitepress` 由 doc workspace 直接持有，VitePress 自己管理其 Vite 依赖；根不再替 doc 声明 Vite。

### 删除死代码

删除 `packages/vue/test/server.ts`：

- `startHonoServer()` 在全仓没有引用。
- 当前 Vue 测试已统一使用根 `test/hono-test-server.ts`。
- 删除后同时消除 Vue 对 `@hono/node-server` 的直接依赖理由。

### 更新 lockfile

运行 `pnpm install` 更新 `pnpm-lock.yaml`，随后用 frozen install 和 importer 审查证明：

- 根 importer 不再包含已移走工具。
- Core importer 直接包含 `typescript`、`vite`。
- React importer直接包含 `hono`、`vite`。
- OTel/Vue/examples importer 直接包含 `vite`。
- 76 个 example importer 仍各自包含 `tsx`。
- 全仓仍只有预期的单一工具版本。

## 阶段 2：修复浏览器测试隔离与失真

### Vue runtime-only 测试

修改 `packages/vue/test/core.spec.ts`：

- 四个成功挂载的 `provideClient` 测试不再返回 setup state + 字符串 `template`，改为 `setup()` 返回 `() => h('div')`。
- 不把 Vue alias 到 compiler build；库本身不依赖 runtime template compilation，测试应覆盖常见 runtime-only 消费环境。
- 为成功挂载的 app 建立局部挂载/清理机制，并在 `afterEach` 中 `app.unmount()`；失败于 setup 的 missing-provider 用例不强行 unmount。
- 对挂载容器增加一个最小渲染断言，证明 render function 确实执行，而不是仅因 setup 修改了闭包变量就通过。
- 删除四个没有 `await` 的无意义 `async`。
- 不扩大重构 `src/core.browser.spec.ts`；其现有 `mountRuntime` + `afterEach` 清理已经正确。

预期结果：Chromium/Firefox 都不再输出 “runtime compilation is not supported” 警告，且原有注入行为仍通过。

### React Testing Library cleanup

修改 `packages/react/src/e2e.browser.spec.ts`：

- 从 Testing Library 导入 `cleanup`。
- 从 Vitest 导入 `afterEach`。
- 注册 `afterEach(cleanup)`，与 `core.browser.spec.ts` 保持一致。

原因：Vitest browser 配置没有启用 globals，不能依赖 Testing Library 自动发现全局 `afterEach`；当前 e2e 的 React roots 和 effects 有跨测试残留风险。

## 阶段 3：使用默认 token 创建 Version Packages PR

用户已选择默认 `GITHUB_TOKEN` 方案，不创建额外 GitHub App 或 PAT。

### `.github/workflows/ci.yml`

- `version-packages` job 为默认 `GITHUB_TOKEN` 单独授予 `contents: write`、`pull-requests: write`，并将它传给 `changesets/action@v1`。
- 默认 token 创建或更新 PR 后，GitHub 会生成 approval-required 的 `pull_request` CI；维护者批准运行后再合并。
- `version-packages` job 仍只在 `push main` 上运行，因此 PR CI 不会形成循环。
- CI 顶层显式设置 `permissions: contents: read`；dependency review 和 Version Packages job 各自只提升必需权限。
- checkout 不持久化不需要的写凭据，避免后续步骤误用默认 token。

### `_checks.yml` 与 setup action

- reusable checks 顶层显式设置 `permissions: contents: read`。
- `setup-pnpm-deps` 只打印通用 Node/pnpm/TypeScript 版本，移除在 quality/build job 中没有意义的 Playwright 版本输出。
- Playwright 版本、缓存和安装仍只存在于 `_checks.yml` 的 test job；根保留 Playwright 正是为了这个仓库级测试环境引导职责。

## 阶段 4：收紧 release 控制 tag

用户已选择只允许当前 `main` tip。

修改 `.github/workflows/release.yml`：

- 顶层显式设置默认 `permissions: contents: read`，publish job 再提升为 `contents: write`、`id-token: write`。
- fetch 后将 `GITHUB_SHA` 与 `git rev-parse origin/main` 做精确比较；不再接受任意 main ancestor。
- 错误信息明确打印 tagged SHA 和 current main SHA，并提示必须在当前 Version Packages PR 合并后的 main tip 创建控制 tag。
- 保留“`.changeset/` 不得存在未消费 changeset”检查。
- 保留 checks 与 publish 的权限分层。
- 保留 publish job 内第二次 `pnpm run build`：checks runner 的 `dist` 不会自动传到 publish runner；本轮不引入 artifact 链路。
- 保留 `commitMode: github-api`、`NPM_TOKEN`、provenance 和 package tags 行为。

严格 tip 语义的预期代价：若控制 tag 创建后、workflow 校验前 `main` 已前进，发布会失败，需要在新的 main tip 上重新确认并创建新控制 tag。这是用户选择的保护行为。

## 阶段 5：同步文档

### 根 `README.md`

在现有 Repository tasks 规则后补充依赖所有权原则：

- 根持有仓库级门禁、根共享测试源码和 CI test bootstrap 工具。
- workspace 直接持有自己的 build/test 工具及 required peers。
- “同版本被多个 workspace 声明”不等于错误重复，关键是所有者是否真实使用。

### `.changeset/README.md`

更新 release flow：

- Version Packages PR 由默认 `GITHUB_TOKEN` 创建/更新，不需要额外 App、PAT、variable 或 secret。
- 记录维护者必须批准该自动 PR 的 workflow runs，并在检查通过后合并。
- 控制 tag 示例改用当前日期或中性占位符，并明确 tag 只能指向当时的 `origin/main` tip。
- 说明 release checks 与 publish 是不同 runner，因此 publish 会在同一有权限 job 中重新 build，避免贡献者误删这个门禁。

## 预计修改文件

- `package.json`
- `pnpm-lock.yaml`
- `packages/core/package.json`
- `packages/opentelemetry-server/package.json`
- `packages/react/package.json`
- `packages/vue/package.json`
- `examples/package.json`
- `packages/vue/test/core.spec.ts`
- 删除 `packages/vue/test/server.ts`
- `packages/react/src/e2e.browser.spec.ts`
- `.github/actions/setup-pnpm-deps/action.yml`
- `.github/workflows/_checks.yml`
- `.github/workflows/ci.yml`
- `.github/workflows/release.yml`
- `README.md`
- `.changeset/README.md`

不修改 76 个 example manifest，不修改根 scripts，不恢复 helper script 目录，不改变发布包源码 API。

## 验证矩阵

### 1. 依赖图与干净解析

- `pnpm install`
- `pnpm install --frozen-lockfile`
- `pnpm dedupe --check`
- 审查六个关键 importer 和 76 个 example importer。
- 从每个 owner 的目录执行 `import.meta.resolve`/CLI 解析断言：
  - 根：TypeScript、Oxfmt、Oxlint、Changesets、Hono server、Playwright 可解析。
  - Core：tsdown、TypeScript、Vite、Vitest、browser provider、Playwright、Hono 依赖可解析。
  - OTel：tsdown、TypeScript、Vite、Vitest、Hono、node-ws 及其 required node-server peer 可解析。
  - React：Hono、Vite、Vitest、browser provider、Playwright、Testing Library 可解析。
  - Vue：Vite、Vitest、browser provider、Playwright、Hono 可解析，不再需要包级 node-server。
  - examples 聚合：Vitest、Vite 可解析；任一 example 子包能从自身 cwd 解析 `tsx`。
- 静态审计根不再直接声明无所有权工具，各包没有重新出现包级 fmt/lint/typecheck。

现有 `node_modules` 可能掩盖缺失声明，因此 CI/干净 checkout 的 frozen install 是最终证明；本地解析检查只作为提前反馈。

### 2. 针对性测试

- `pnpm --filter @defjs/vue test`
  - 48 tests 通过。
  - Chromium/Firefox 均无 runtime compilation warning。
  - 无未挂载 app 的额外 unmount warning。
- `pnpm --filter @defjs/react test`
  - 24 tests 通过。
  - e2e 用例后 Testing Library roots 被清理。
- `pnpm --filter @defjs/core test`
- `pnpm --filter @defjs/opentelemetry-server test`
- `pnpm --filter @defjs/examples test`
  - 153 tests，76 个 scenario 全部通过。

### 3. 构建与发布产物

- 分别执行四包 `build`，证明每个包不借用根 tsdown/TypeScript/Vite。
- `pnpm build`，确认根 typecheck 后按拓扑先构建 Core，再构建三个依赖包和 doc。
- 检查四个 `dist/package.json`、React `'use client'` 和 dist-only 内容。
- 对四包执行 publish dry-run / npm pack dry-run；不执行真实 publish。

TypeScript 7 的 tsdown experimental warning 仍可能存在，它是已知非阻塞上游告警；不得把它与本轮消除的 Vue runtime compiler warning 混为一谈。

### 4. 全仓门禁

- `pnpm fmt`
- `pnpm fmt:check`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`（预期仍为 1,099 tests）
- `pnpm build`
- `git diff --check`

### 5. Workflow 静态验证

解析所有变更 YAML，并断言：

- reusable checks 和默认 workflow 权限为 `contents: read`。
- Version Packages job 只为默认 `GITHUB_TOKEN` 提升 contents/PR write，Changesets 使用该 token。
- Version Packages job仍只在 main push + checks success 后运行。
- Version Packages PR 的 pull_request 事件不会重新进入 Version Packages job；其 CI 需要维护者批准。
- release 只匹配 `release-*`。
- release 对 tag SHA 与 `origin/main` tip 做精确相等检查。
- publish 等待完整 checks，并保留未消费 changeset guard。
- package tags不匹配 `release-*`，不会递归发布。
- 不真实创建 PR、批准 workflow、推送 tag 或连接 npm publish；branch protection、npm token/provenance 只能列为待仓库环境验证项。

### 6. 最终交付审查

- 再次读取完整 `git status --short --untracked-files=all`。
- 分别审查 staged、unstaged、untracked，不把当前工作树通过误报成 index 可提交。
- 确认没有新临时文件、产物 tarball、TSX、探针或缓存残留。
- 输出建议暂存路径清单，但不执行任何 index 写操作。

## 本轮明确不做

- 不使用 artifact 在 checks/publish 间传递 dist；只有 CI 数据证明双 build 成本值得时再单独设计。
- 不把 checks 与 publish 合并到同一个持有发布凭据的 job。
- 不在未确认 npm Trusted Publishing 配置前移除 `NPM_TOKEN`。
- 不在本轮批量把所有 Actions major tag改成 commit SHA；这是独立供应链加固任务，可由 Dependabot管理。
- 不为 Version Packages PR 创建额外 GitHub App 或 PAT。
- 不擅自配置 branch protection、Environment 或 npm trusted publisher；这些是外部共享状态，需要仓库管理员执行。
- 不清理、恢复或重新暂存用户现有的其他文档、SSE、examples 和发布改动。
