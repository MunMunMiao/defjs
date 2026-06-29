# VitePress Twoslash 文档类型检查设计文档

**日期**: 2026-06-17
**状态**: 待用户复核
**作者**: Claude Code

## 目录

1. [概述](#概述)
2. [设计目标](#设计目标)
3. [现状与问题](#现状与问题)
4. [方案选择](#方案选择)
5. [架构设计](#架构设计)
6. [配置设计](#配置设计)
7. [文档写法设计](#文档写法设计)
8. [类型检测设计](#类型检测设计)
9. [测试设计](#测试设计)
10. [CI 设计](#ci-设计)
11. [性能与缓存设计](#性能与缓存设计)
12. [文件结构设计](#文件结构设计)
13. [实施边界](#实施边界)
14. [风险与应对](#风险与应对)

## 概述

defjs 的文档站点使用 VitePress 构建，当前 TypeScript 示例主要以普通 fenced code block 写在 Markdown 中。这些示例不会被 TypeScript 编译器检查，也不会在文档页面中暴露推断类型，因此代码容易与实际 API 脱节。

本设计选择 **VitePress Native + Shiki Twoslash**：保留 Markdown 内联代码的写作方式，在需要类型追踪的代码块上使用 `typescript twoslash`，由 Twoslash 调用真实 TypeScript 编译器生成类型信息与诊断结果。与此同时，新增文档类型检测、文档测试与 CI 检查，使文档示例错误能在 pull request 阶段被拦截。

## 设计目标

1. **内联写作**: 文档作者继续在 `.md` 文件中直接书写 TypeScript 示例，不强制迁移到外部 snippet 文件。
2. **真实类型追踪**: `twoslash` 代码块使用真实 TypeScript 编译器解析 `@defjs/*` 包类型。
3. **读者可见类型**: 文档页面支持悬停查看类型信息，并展示 Twoslash 诊断。
4. **CI 可失败**: 文档中被标记为 `twoslash` 的示例存在类型错误时，CI 必须失败。
5. **测试覆盖配置**: 文档测试需要验证 Twoslash 既能通过正确示例，也能捕获故意制造的错误。
6. **根脚本联动**: 根目录 `pnpm typecheck` 通过 workspace 自动包含 `doc` 的类型检测。
7. **渐进迁移**: 初期只给关键 TypeScript 示例加 `twoslash`，普通、不完整或伪代码示例继续使用普通 `typescript`。

## 现状与问题

### 当前文档结构

- 文档目录：`doc/`
- VitePress 配置：`doc/.vitepress/config.ts`
- VitePress 版本：`2.0.0-alpha.17`
- 文档脚本：`docs:dev`、`docs:build`、`docs:preview`
- locale：root、`zh-Hans`、`zh-Hant-TW`、`zh-Hant-HK`、`de-DE`、`ja-JP`、`ko-KR`、`ar`、`es-ES`、`ru-RU`、`fr-FR`

### 当前问题

1. Markdown 中的 TypeScript 代码块只被高亮，不参与类型检查。
2. `doc/` 没有独立 `tsconfig.json`，Twoslash 或自定义检测工具无法可靠解析 monorepo 包。
3. 现有 CI 的 `changes` filter 排除了 `**.md` 与 `docs/**`，纯文档变更不会触发检查。
4. 根 `pnpm typecheck` 只会运行 workspace 包中已有的 `typecheck`，当前 `doc` 不在 workspace 中，也没有 `typecheck` 脚本。
5. 文档示例与 `@defjs/core`、`@defjs/vue`、`@defjs/react`、`@defjs/angular` 的实际 API 可能发生漂移。

## 方案选择

### 采用方案：VitePress Native + Shiki Twoslash

VitePress 已经支持在 Markdown 中使用 Vue 组件和 Shiki 高亮。Shiki Twoslash 可以接入 VitePress 的 Markdown code transformer，让 `typescript twoslash` 代码块在渲染时经过 TypeScript 编译器分析。

### 不采用完整 MDX

本项目不需要把 VitePress 迁移到完整 MDX：

- VitePress Markdown 本身已经具备 Vue SFC 能力。
- 需求核心是 TypeScript 示例跟随真实类型，而不是 JSX/MDX 组件语法。
- 完整 MDX 会增加 Markdown pipeline 复杂度，并可能影响 VitePress alpha 版本兼容性。

### 保留外部 snippet 作为替代方案

如果 Twoslash 在多语言站点中导致明显 OOM 或启动过慢，可以切换到“外部 `.ts` snippets + 自定义类型检测脚本”。该替代方案不作为第一阶段实现目标。

## 架构设计

````text
Markdown 文档
  └─ ```typescript twoslash 代码块
       └─ VitePress Markdown pipeline
            └─ Shiki Twoslash transformer
                 └─ TypeScript compiler API
                      ├─ 类型信息 → 页面悬停浮层
                      └─ 诊断结果 → 页面内联错误 / CI 类型检测失败

CI / 本地类型检测
  └─ doc/scripts/typecheck-docs.ts
       ├─ 扫描 doc/**/*.md
       ├─ 提取 twoslash 代码块
       ├─ 使用与 VitePress 相同的 Twoslash/TypeScript 配置检查
       └─ 任意 error 级诊断 → exit 1
````

核心原则：**页面渲染与 CI 类型检测共享同一套解析目标**。页面负责读者体验，脚本负责把错误变成失败信号。

## 配置设计

### `doc/package.json`

新增脚本：

```json
{
  "scripts": {
    "docs:dev": "vitepress dev",
    "docs:build": "vitepress build",
    "docs:preview": "vitepress preview",
    "typecheck": "tsx scripts/typecheck-docs.ts",
    "test": "vitest run"
  }
}
```

新增开发依赖：

```json
{
  "devDependencies": {
    "@shikijs/twoslash": "catalog:",
    "@shikijs/vitepress-twoslash": "catalog:",
    "@types/node": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "vitepress": "2.0.0-alpha.17",
    "vue": "^3.5.38"
  }
}
```

如果 `@shikijs/*` 不能使用 workspace catalog 管理，则在 `doc/package.json` 中固定实际版本，并在 `pnpm-lock.yaml` 中锁定。

### `pnpm-workspace.yaml`

当前 workspace 只包含 `packages/*`。为了让根 `pnpm -r --if-present run typecheck` 自动包含文档，需要加入 `doc`：

```yaml
packages:
  - 'packages/*'
  - 'doc'
```

catalog 中补充 Twoslash 依赖版本。版本不在设计阶段硬编码，实施时通过 `pnpm add -D @shikijs/twoslash@latest @shikijs/vitepress-twoslash@latest --filter doc` 解析，并把解析到的版本写入 catalog 与 lockfile：

```yaml
catalog:
  '@shikijs/twoslash': '由安装命令解析出的兼容版本'
  '@shikijs/vitepress-twoslash': '由安装命令解析出的兼容版本'
```

### `doc/.vitepress/config.ts`

引入 VitePress Twoslash transformer：

```typescript
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { defineConfig } from 'vitepress'

export default defineConfig({
  markdown: {
    codeTransformers: [transformerTwoslash()],
  },
})
```

如果项目后续已有其他 `markdown` 配置，需要合并而不是覆盖。

### `doc/.vitepress/theme/index.ts`

新增主题入口，注册 Twoslash 浮层组件并导入样式：

```typescript
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import '@shikijs/vitepress-twoslash/style.css'
import DefaultTheme from 'vitepress/theme'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.use(TwoslashFloatingVue)
  },
}
```

如果后续已有自定义主题，需在现有 `enhanceApp` 中追加注册，不覆盖既有逻辑。

### `doc/tsconfig.json`

Twoslash 与文档类型检测使用独立 tsconfig：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "baseUrl": ".",
    "paths": {
      "@defjs/core": ["../packages/core/src/index.ts"],
      "@defjs/vue": ["../packages/vue/src/index.ts"],
      "@defjs/react": ["../packages/react/src/index.ts"],
      "@defjs/angular": ["../packages/angular/src/index.ts"],
      "@defjs/opentelemetry-server": ["../packages/opentelemetry-server/src/index.ts"]
    },
    "types": ["node"]
  },
  "include": ["./.vitepress/**/*.ts", "./scripts/**/*.ts", "./**/*.md"]
}
```

路径以源码入口为准，避免依赖尚未构建的 `dist` 产物。

## 文档写法设计

### 标准用法

只对需要真实类型追踪的示例使用 `twoslash`：

````markdown
```typescript twoslash
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient()

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user] = await client.execute(getUser({ id: 1 }))
```
````

### 不使用 Twoslash 的场景

以下代码块继续保持普通 `typescript` 或其他语言标签：

- 为了讲解概念而故意省略 imports 的片段。
- 无法独立通过类型检查的伪代码。
- shell、JSON、HTTP、日志输出。
- 需要展示错误写法但不希望 CI 失败的示例。

### 展示预期错误

如果文档需要展示错误示例，应使用 Twoslash 支持的错误标注语法，明确告诉 Twoslash 该错误是预期结果。没有预期标注的 error 级诊断视为文档错误。

## 类型检测设计

### `doc/scripts/typecheck-docs.ts`

新增脚本，职责是把 Twoslash 诊断转换为 CI 失败信号：

1. 递归扫描 `doc/**/*.md`。
2. 忽略 `node_modules`、`.vitepress/cache` 等生成目录。
3. 提取 fenced code block 中带有 `twoslash` meta 的 TypeScript / TSX / Vue 代码块。
4. 使用与 VitePress transformer 一致的 Twoslash 配置执行检查。
5. 输出文件路径、代码块序号、诊断位置和诊断文本。
6. 任意非预期 error 级诊断时以 exit code 1 退出。

### CLI 行为

成功输出示例：

```text
Checked 18 twoslash code blocks in 7 markdown files.
No Twoslash type errors found.
```

失败输出示例：

```text
doc/guide/getting-started.md block #3
  TS2322: Type 'string' is not assignable to type 'number'.

Checked 18 twoslash code blocks in 7 markdown files.
Found 1 Twoslash type error.
```

### 与 `docs:build` 的关系

`docs:build` 保持专注于 VitePress 构建，不隐式运行类型检测。CI 和根 `pnpm check` 通过单独 `typecheck` 脚本执行文档类型检测，这样失败原因更清晰。

如后续希望发布前强制校验，可再新增：

```json
{
  "scripts": {
    "docs:check": "pnpm typecheck && pnpm test && pnpm docs:build"
  }
}
```

## 测试设计

### 测试目标

文档测试不重复覆盖 TypeScript 编译器本身，而是保护本项目的 Twoslash 集成方式：

1. 正确的 defjs 示例可以通过 Twoslash 检查。
2. 故意错误的 defjs 示例会被 Twoslash 捕获。
3. Markdown 代码块提取逻辑能识别 `typescript twoslash`，并忽略普通 `typescript`。

### 测试文件

新增：`doc/scripts/typecheck-docs.test.ts`

测试点：

````typescript
import { describe, expect, it } from 'vitest'

import { extractTwoslashBlocks } from './typecheck-docs'

describe('extractTwoslashBlocks', () => {
  it('extracts typescript twoslash blocks', () => {
    const blocks = extractTwoslashBlocks('```typescript twoslash\nconst value = 1\n```')
    expect(blocks).toHaveLength(1)
  })

  it('ignores plain typescript blocks', () => {
    const blocks = extractTwoslashBlocks('```typescript\nconst value = 1\n```')
    expect(blocks).toHaveLength(0)
  })
})
````

新增：`doc/scripts/twoslash.test.ts`

测试点：

- `createClient` / `defineRequest` / `struct` 的最小示例没有 error 级诊断。
- 一个明确的错误示例能产生 error 级诊断。

如果 `@shikijs/twoslash` 的直接 API 不稳定，则测试改为执行 `typecheck-docs.ts` 的内部检查函数，而不是直接依赖 Twoslash 低层 API。

## CI 设计

### 当前 CI 问题

`.github/workflows/ci.yml` 当前的 paths filter 排除了 Markdown 和 `docs/**`：

```yaml
any:
  - '**'
  - '!**.md'
  - '!docs/**'
  - '!**/*.drawio'
  - '!LICENSE'
```

这会导致纯文档变更不触发检查。由于本设计让文档代码参与类型安全，文档变更必须触发至少文档检查。

### 推荐结构：独立 docs job

在 `.github/workflows/ci.yml` 中拆分变更检测：

```yaml
filters: |
  packages:
    - 'packages/**'
    - 'package.json'
    - 'pnpm-lock.yaml'
    - 'pnpm-workspace.yaml'
    - 'tsconfig.json'
    - '.github/**'
  docs:
    - 'doc/**'
    - 'docs/**'
    - 'package.json'
    - 'pnpm-lock.yaml'
    - 'pnpm-workspace.yaml'
    - '.github/**'
```

保留现有 package checks，并新增 docs checks：

```yaml
docs:
  needs: changes
  if: ${{ needs.changes.outputs.docs == 'true' }}
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-pnpm-deps
    - name: Typecheck docs
      run: pnpm --filter doc run typecheck
    - name: Test docs
      run: pnpm --filter doc run test
    - name: Build docs
      run: pnpm --filter doc run docs:build
```

### 为什么不合并到现有 quality matrix

文档检查建议独立 job，原因：

1. 文档检查失败信息更清晰。
2. 文档变更无需触发所有 package 测试。
3. package checks 继续复用 `.github/workflows/_checks.yml`，不改变现有职责。
4. 后续可以给 docs job 添加缓存或更严格策略，而不影响 package CI。

### 根 `check` 的联动

根 `package.json` 当前为：

```json
{
  "scripts": {
    "check": "pnpm lint && pnpm fmt:check && pnpm typecheck",
    "typecheck": "pnpm -r --if-present run typecheck"
  }
}
```

加入 `doc` workspace 后，`pnpm typecheck` 会自动运行 `doc` 的 `typecheck`。根 `test` 也会自动运行 `doc` 的 `test`，因为根脚本是 `pnpm -r run test`。

## 性能与缓存设计

### VitePress dev/build

Twoslash 会对每个 `twoslash` 代码块调用 TypeScript 编译器。为了避免所有代码块都拖慢 dev server：

- 初期只迁移关键代码块。
- 不完整示例保留普通 `typescript`。
- 启用 Shiki Twoslash 的文件系统缓存能力。

### 缓存目录

推荐缓存目录：

```text
doc/.vitepress/cache/twoslash
```

该目录应加入 `.gitignore`，不提交到仓库。

### CI 性能

CI 中 docs job 只在 `doc/**`、`docs/**`、依赖配置或 workflow 变化时运行。这样纯 package 变更不必构建文档，纯文档变更也不必跑完整 package 测试矩阵。

## 文件结构设计

```text
doc/
  .vitepress/
    config.ts                 # 增加 Twoslash transformer
    theme/
      index.ts                # 注册 TwoslashFloatingVue
    cache/
      twoslash/               # 本地缓存，不提交
  scripts/
    typecheck-docs.ts         # 文档 Twoslash 类型检测 CLI
    typecheck-docs.test.ts    # Markdown 提取与 CLI 行为测试
    twoslash.test.ts          # Twoslash 集成正反例测试
  tsconfig.json               # 文档类型检测配置
  package.json                # 增加 typecheck/test 与依赖
  guide/
    getting-started.md        # 关键示例改为 typescript twoslash
```

仓库根部：

```text
pnpm-workspace.yaml           # 加入 doc workspace 与 Twoslash catalog
.github/workflows/ci.yml      # 拆分 docs 变更检测与 docs job
.gitignore                    # 忽略 doc/.vitepress/cache/
```

## 实施边界

第一阶段只实现 Twoslash 基础设施，并迁移少量关键示例用于验证：

1. `doc/guide/getting-started.md` 的核心 TypeScript 示例。
2. 一个 core 页面中的代表性示例。
3. 一个 plugin 页面中的代表性示例。

不在第一阶段批量迁移 11 个 locale 的所有代码块，避免一次性引入大量类型错误与性能风险。

## 风险与应对

| 风险                                                  | 应对                                                                   |
| ----------------------------------------------------- | ---------------------------------------------------------------------- |
| Twoslash 直接 API 与 VitePress transformer API 不一致 | 将共享逻辑封装在 `typecheck-docs.ts`，测试只依赖本项目封装             |
| `createTwoslasher` 无法直接读取 `doc/tsconfig.json`   | 使用 TypeScript compiler API 构造等价检查，或显式传递 compiler options |
| VitePress dev/build 明显变慢                          | 只对关键代码块启用 `twoslash`，并启用文件系统缓存                      |
| 多 locale 重复代码导致检查时间过长                    | 第一阶段只迁移 root 文档关键示例，后续按页面推进                       |
| CI 纯文档变更跑太多任务                               | 独立 docs job，通过 paths filter 精确触发                              |
| Twoslash 出现 OOM                                     | 切换到外部 snippet + 自定义 `tsc` 校验方案                             |
| 展示错误示例导致 CI 失败                              | 使用 Twoslash 预期错误标注，或保持普通 `typescript` 代码块             |

## 最终判断

该设计保留了用户希望的“直接插入 TS 代码、类似 MDX 格式”的写作体验，同时让关键示例进入真实类型系统，并通过 `typecheck`、`test`、`docs:build` 和独立 CI job 形成完整防线。第一阶段以小范围试点为主，后续可以按页面逐步扩大 `twoslash` 覆盖范围。
