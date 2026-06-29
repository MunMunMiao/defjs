# 文档对齐硬切换设计

日期：2026-06-29
状态：待用户审核

## 背景

分支 `feat/up` 正在对 `@defjs/core` 进行一系列破坏性重构，包括：

- `Schema/schema` 重命名为 `Struct/struct`。
- `tag` 系统删除，改为 `.alias(name)` 唯一字段 wire-name 机制。
- 类型链内联（type inlining）。
- SSE 与 request builder 重构。
- `struct.request(...)` 作为默认 request shape 描述。
- `build(ctx, input)` 作为显式 request plan 编排入口。

这些变更导致多份文档出现事实不一致：

1. `doc/core/commands.md` 示例仍使用 `@mobily/ts-belt` 的 `object / string / number / optional`。
2. `doc/core/sse.md` 示例使用旧版 `build: ({ roomId }) => ({ params: { roomId } })`。
3. `packages/core/README.md` 过度简略，未反映当前 API。
4. `packages/core/design.md` 已较详细，但与用户文档存在口径差异。
5. `docs/superpowers/specs/` 与 `plans/` 中部分文档假设的 API 与当前代码不完全一致。

当前代码尚未上线，允许硬切换，不允许保留兼容或回退描述。

## 目标

建立一套与当前代码事实、已确认设计完全一致的文档体系：

1. 设计文档（specs/plans）是最高层事实来源。
2. 内部文档（README/design.md/plan.md）面向核心维护者，反映当前实现边界。
3. 用户文档（VitePress）面向库使用者，提供一致、可运行的示例。

## 范围

本次完善覆盖三类文档：

### A. superpowers 设计文档

路径：`docs/superpowers/specs/`、`docs/superpowers/plans/`

- 审查与代码当前状态一致的 spec/plan。
- 删除或修正仍引用旧 API（`Schema`、`tag.*`、`requireTag`）的段落。
- 对未完成的计划补充明确的下一步或删除过时条目。

### B. packages/core 内部文档

路径：

- `packages/core/README.md`
- `packages/core/design.md`
- `packages/core/core-minimalism-implementation-plan.md`
- `packages/core/research/*.md`

- `README.md` 重写为当前 API 的快速入门。
- `design.md` 统一 build ctx、struct、request shape、transport 差异的表述。
- 清理 research 文档中已失效的假设。

### C. VitePress 用户文档

路径：`doc/**`

- `doc/core/commands.md`
- `doc/core/sse.md`
- `doc/core/struct.md`
- `doc/core/http.md`
- `doc/core/client.md`
- `doc/core/context.md`
- `doc/core/web-socket.md`
- `doc/guide/*.md`
- 多语言翻译版本同步更新（优先保证英文/中文，其他语言标记待同步或移除过期内容）。

## 设计原则

1. **硬切换**：文档只描述当前代码事实，不保留旧 API 用法，不添加"旧版兼容"说明。
2. **代码即真相**：当文档与代码冲突时，以当前代码和已确认 spec 为准修改文档，不反过去迁就文档改代码。
3. **单一事实来源**：
   - 设计决策只出现在 specs。
   - 实现边界只出现在内部文档。
   - 用法示例只出现在用户文档。
   - 同一条规则不跨文档重复表述；必要时通过链接引用。
4. **示例可运行**：用户文档中所有 TypeScript 代码片段必须能在当前 public API 下通过类型检查。
5. **多语言分级处理**：
   - 英文（`doc/core/*`、`doc/guide/*`）为基准，优先完整更新。
   - 简体中文（`doc/zh-Hans/*`）紧跟基准同步。
   - 其他翻译版本在本次任务中仅做最低限度的硬切换标记（删除明显过时的 tag/Schema 段落，不深度重写）。

## 推进方案

采用三阶段推进，每阶段完成后验证再继续下一阶段。

### 阶段一：superpowers 设计文档对齐

1. 扫描 `docs/superpowers/specs/` 和 `plans/`，列出引用旧 API 的文档清单。
2. 对每个文档做最小必要修正：
   - `Schema` → `Struct`
   - `schema` → `struct`
   - `tag.json(...)` / `tag.header(...)` → `.alias(...)`
   - `requireTag` → 删除相关描述
   - 旧 `build: (input) => ({ params })` → `build(ctx, input)`
3. 删除明显过时的计划条目或标记为"已废弃"。
4. 验证：无残留的 `Schema`、`tag.`、`requireTag` 引用（保留历史记录除外）。

### 阶段二：packages/core 内部文档重写

1. 重写 `packages/core/README.md`：
   - 一句话定位。
   - 安装命令。
   - 最小可运行示例（createClient + defineRequest + struct.request + execute）。
   - 核心概念索引链接。
2. 更新 `packages/core/design.md`：
   - 统一 `build(ctx, input)` 的 ctx 方法名与行为。
   - 明确 explicit projection key 不被 alias 改写。
   - 明确 whole-source bound value 递归应用 alias。
   - 明确 HTTP / SSE / WebSocket 的 ctx 能力差异。
3. 清理 `core-minimalism-implementation-plan.md` 中已完成项。
4. 验证：`README.md` 示例在当前 public API 下可类型检查通过。

### 阶段三：VitePress 用户文档同步

1. 以 `doc/core/struct.md` 为基准，确认 alias-only 描述已完整。
2. 重写 `doc/core/commands.md`：
   - 全部示例使用 `@defjs/core` 的 `struct`。
   - `input` 与 `build` 关系明确。
   - `IsInputOptional` 规则用 `struct` 示例表达。
3. 修正 `doc/core/sse.md`：
   - `build` 示例改为 `build(ctx, input)` 形式。
   - `input` 使用 `struct.request(...)`。
4. 更新 `doc/core/http.md`、`client.md`、`context.md`、`web-socket.md` 中受影响的示例。
5. 更新 `doc/guide/getting-started.md`、`examples.md`、`design-decisions.md`。
6. 同步 `doc/zh-Hans/*` 版本。
7. 对其他语言版本做最小硬切换清理：删除 tag/Schema 残留段落，必要时加 TODO 注释提示待完整同步。
8. 验证：运行 VitePress 构建或 Markdown 链接检查；对用户文档中的 TypeScript 示例做类型检查抽样。

## 已识别的具体问题

### commands.md

- 示例导入 `@mobily/ts-belt`。
- `defineRequest` 示例中 `input: object({...})` 应为 `input: struct.object({...})`。
- `defineEventStream` 示例中 `events` 值应为 `struct.object(...)` 而非裸 `object(...)`。
- `IsInputOptional` 示例中 `object(...)`、`optional(string())` 等应为 `struct` API。

### sse.md

- `build: ({ roomId }) => ({ params: { roomId } })` 应为 `build(ctx, input) { ctx.setPathParams({ roomId: input.roomId }) }`。
- 需要确认 `input` 是 `struct.object(...)` 还是 `struct.request(...)`，按当前 design.md 应为 `struct.request(...)`。

### README.md

- 当前只有占位内容，需要完整重写。

### design.md

- 已较完整，但与用户文档存在口径差异，需要统一术语（例如 `setPathParams` vs `setPathParam`）。

## 非目标

本次文档完善不做以下事情：

1. 不改代码实现，只改文档。
2. 不为旧 API 写迁移指南（当前代码未上线，无需迁移）。
3. 不新增多语言完整翻译（只保证英文/中文，其他语言最小清理）。
4. 不引入新的公开 API 或设计决策（只同步已确认的设计）。

## 成功标准

1. `docs/superpowers/specs/` 与 `plans/` 中无残留的 `Schema`、`tag.`、`requireTag` 生产性引用（历史记录除外）。
2. `packages/core/README.md` 包含可运行的最小示例，且示例在当前 API 下类型检查通过。
3. `doc/core/commands.md`、`sse.md`、`struct.md` 示例全部使用 `@defjs/core` 的 `struct` 和当前 `build(ctx, input)` API。
4. `doc/zh-Hans/*` 与英文基准口径一致。
5. VitePress 构建成功或 Markdown 链接检查无致命错误。
6. 用户文档中抽样的 TypeScript 示例在当前 public API 下类型检查通过。

## 验证命令

```bash
# 1. 扫描旧 API 残留
rg -n "\bSchema\b|\.tag\(|\btag\.|requireTag|@mobily/ts-belt" doc packages/core/README.md packages/core/design.md docs/superpowers/specs docs/superpowers/plans || true

# 2. core README 示例类型检查（手动放入临时文件后用 tsc --noEmit）
# 3. VitePress 构建
cd /Users/munmunmiao/Documents/web/zen-kit/doc && pnpm run docs:build

# 4. 核心类型检查
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
```

## 风险

### 风险 1：代码仍在变动，文档可能很快再次过时

缓解：本次只同步当前 `feat/up` 已提交的代码事实；若后续代码继续重构，再启动下一轮文档同步。

### 风险 2：多语言文档清理不彻底

缓解：对非中英文版本采用"删除明显过时内容 + TODO 注释"策略，不强求全量重写。

### 风险 3：示例类型检查遗漏

缓解：对每篇修改后的核心文档，至少抽取 1-2 个示例手动做类型检查；条件允许时建立自动化抽取脚本。

## 自审记录

- Placeholder scan：无 TBD/TODO 占位。
- 一致性检查：与已确认的 alias-only、struct-bytecraft-repair、content-codec 等设计一致。
- 范围检查：聚焦文档，不修改代码实现。
- 歧义检查：明确区分设计文档、内部文档、用户文档三级；明确多语言处理策略。
