# 模拟用户研究报告 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 生成一份中文模拟用户研究报告：组织不少于 20 位跨行业用户，覆盖当前 workspace 的每个 package，并收集体验意见。

**Architecture:** 使用多代理并行模拟 persona，每个 persona 在反馈前先查阅对应 package 文档、README、入口文件和已有反馈上下文。主流程负责合并、去重、分类和写入最终 Markdown 报告，明确区分既有设计取舍、文档缺口、使用不直觉但非 bug、以及疑似文档/实现不一致。

**Tech Stack:** Claude Code Workflow、多代理模拟、Markdown 文档、当前 pnpm workspace 包结构。

## Global Constraints

- 全程使用简体中文沟通和撰写报告。
- 不修改源码，不把本次任务扩大为代码实现。
- 不强制运行项目命令；报告基于文档、README、源码入口、manifest、已有测试/脚本信息和模拟体验式评审。
- 必须覆盖当前 workspace 源码包：root `defjs`、`doc`、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`。
- 不把 `packages/*/dist/package.json`、`doc/.vitepress/cache` 等生成物或缓存当成独立 package。
- 每位模拟用户在形成反馈前必须先查阅相关文档/README/指南/入口文件。
- 不能把已记录为设计选择的行为直接标成 bug；例如 thin adapter、零值默认、invalid SSE/WebSocket event 默认静默跳过。
- 重要批评必须说明依据来自哪个 package、文档路径或源码入口。
- 最终报告写入 `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`。

---

## File Structure

- Create: `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`
  - 负责承载最终模拟用户研究报告。
  - 包含执行摘要、团队名单、package 覆盖矩阵、分 persona 反馈、按 package 汇总、跨 package 主题、优先级建议、设计取舍说明和边界说明。
- Create: `docs/superpowers/plans/2026-07-02-simulated-user-research.md`
  - 本执行计划。记录如何组织多 persona 研究、审查和写入报告。
- Read-only evidence:
  - `package.json`
  - `pnpm-workspace.yaml`
  - `.npmrc`
  - `README.md`
  - `doc/package.json`
  - `doc/index.md`
  - `doc/guide/getting-started.md`
  - `doc/guide/examples.md`
  - `docs/superpowers/feedback/2026-07-01-simulated-user-feedback.md`
  - `packages/core/README.md`
  - `packages/core/src/index.ts`
  - `packages/core/src/public_api.ts`
  - `packages/react/README.md`
  - `packages/react/src/index.ts`
  - `packages/react/src/public_api.ts`
  - `packages/react/src/core.tsx`
  - `packages/vue/README.md`
  - `packages/vue/src/index.ts`
  - `packages/vue/src/public_api.ts`
  - `packages/vue/src/core.ts`
  - `packages/angular/README.md`
  - `packages/angular/src/index.ts`
  - `packages/angular/src/public_api.ts`
  - `packages/angular/src/core.ts`
  - `packages/opentelemetry-server/README.md`
  - `packages/opentelemetry-server/src/index.ts`
  - `packages/opentelemetry-server/src/public_api.ts`
  - `packages/opentelemetry-server/src/option.ts`

---

### Task 1: 生成 24 位跨行业 persona 反馈

**Files:**
- Read: 上方 File Structure 中的 read-only evidence
- Produce intermediate: Workflow structured output in memory
- No source file modifications

**Interfaces:**
- Consumes: package coverage map from repository exploration
- Produces: `PersonaFeedback[]`

```ts
type PersonaFeedback = {
  id: string
  name: string
  industry: string
  role: string
  experienceLevel: string
  primaryScenario: string
  packagesReviewed: string[]
  docsConsulted: string[]
  firstImpression: string
  liked: string[]
  blockers: string[]
  productionReadiness: string
  industryRisks: string[]
  suggestions: string[]
  score: number
  classificationNotes: Array<{
    topic: string
    type: 'design-choice' | 'documented-but-unintuitive' | 'documentation-gap' | 'possible-doc-implementation-mismatch' | 'missing-capability'
    evidence: string
    note: string
  }>
}
```

- [ ] **Step 1: Dispatch a Workflow with 24 persona agents**

Use one Workflow. Split personas into 4 cohorts of 6 so each agent has focused package coverage and industry context. Every agent prompt must include this mandatory rule:

```text
在提出任何批评前，必须先查阅相关 README、doc guide 或 src public_api/core 入口。不要把文档明确说明的 thin adapter、零值默认、invalid SSE/WebSocket event 默认静默跳过等设计选择直接称为 bug。若不符合直觉但文档有说明，分类为 documented-but-unintuitive；若文档不足，分类为 documentation-gap；只有文档与实现/入口明显不一致时，分类为 possible-doc-implementation-mismatch。
```

Workflow schema should require `feedbacks: PersonaFeedback[]` and reject missing `docsConsulted` or empty `classificationNotes` for substantive criticism.

- [ ] **Step 2: Ensure personas cover every package**

Use this fixed coverage target inside the Workflow prompt:

```text
Coverage target:
- root defjs: at least 6 personas
- doc: at least 8 personas
- @defjs/core: at least 14 personas
- @defjs/react: at least 6 personas
- @defjs/vue: at least 5 personas
- @defjs/angular: at least 5 personas
- @defjs/opentelemetry-server: at least 6 personas
```

Use this persona roster:

```text
1. 金融科技前端负责人：React SPA + 合规审计
2. 金融合规架构师：fail-closed、审计、错误分类
3. 医疗健康平台工程师：runtime validation、隐私、schema 稳定性
4. 医疗隐私负责人：OpenTelemetry 默认采集边界
5. 电商全栈开发者：HTTP command、错误分支、快速集成
6. 电商增长实验工程师：React Query/SWR、重试、缓存 key
7. SaaS SDK 维护者：public API、版本治理、typed client 替代方案
8. SaaS DX 负责人：Getting Started、examples、学习路径
9. 物流 IoT 实时系统工程师：SSE/WebSocket、非法事件、重连可观测性
10. 物流 SRE：metrics、traces、stream 生命周期
11. 教育科技小团队全栈：低学习成本、文档示例可复制
12. 教育文档新手用户：术语、导航、入门阻碍
13. 游戏/直播实时消息工程师：WebSocket message flow、队列/丢弃语义
14. 政企 Angular 架构师：Angular DI、TestBed、多 client
15. 传统企业采购技术评审：Node >=26、pnpm、发布成熟度
16. 开源独立维护者：API 表面积、贡献门槛、包体/ESM
17. 开源贡献者：代码入口、测试脚本、贡献体验
18. 咨询多框架交付工程师：React/Vue/Angular 一致性
19. AI 数据平台 observability 工程师：OTel span/metrics 属性
20. 平台 owner：monorepo scripts、CI 门禁、Roadmap 可信度
21. Nuxt/Vue 全栈工程师：Vue provide/inject、SSR、Pinia
22. Next.js App Router 工程师：React RSC、cookie/header、hydration
23. Angular enterprise tester：RxJS/signals、mock client、测试辅助
24. 安全工程师：header/body/raw query 默认不采集、trace propagation 风险
```

- [ ] **Step 3: Validate generated feedback shape**

After Workflow returns, check:

```text
- feedbacks length is exactly 24
- every feedback has at least one docsConsulted entry
- every substantive blocker has a classification note
- all seven packages appear in aggregate packagesReviewed
- design choices are not labeled as bugs
```

Expected: pass. If any check fails, run a targeted follow-up agent only for missing/invalid personas.

---

### Task 2: 合并、分类并形成 package 汇总

**Files:**
- Read: Workflow output from Task 1
- Produce intermediate: summarized findings in memory
- No source file modifications

**Interfaces:**
- Consumes: `PersonaFeedback[]`
- Produces: `PackageSummary[]` and `CrossPackageTheme[]`

```ts
type PackageSummary = {
  packageName: string
  personas: string[]
  positiveThemes: string[]
  frictionThemes: Array<{
    theme: string
    classification: 'design-choice' | 'documented-but-unintuitive' | 'documentation-gap' | 'possible-doc-implementation-mismatch' | 'missing-capability'
    evidence: string[]
    affectedPersonas: string[]
    priority: 'P0' | 'P1' | 'P2' | 'P3'
  }>
  scoreAverage: number
}

type CrossPackageTheme = {
  theme: string
  packages: string[]
  classification: string
  evidence: string[]
  recommendation: string
  priority: 'P0' | 'P1' | 'P2' | 'P3'
}
```

- [ ] **Step 1: Deduplicate similar comments**

Merge comments that differ only by wording. Keep the strongest evidence path and list all affected personas.

Use these known design-choice guardrails:

```text
- Framework packages are thin adapters by design; missing useCommand/useQuery helper is a capability/documentation request, not a core adapter bug.
- Zero-value default and Partial Input are Go-style schema design choices.
- Invalid SSE/WebSocket event silent skip is a design choice; criticism should ask for opt-in strict/fail-closed or better docs/observability.
- @defjs/opentelemetry-server is outbound client instrumentation, not inbound server instrumentation.
- Current manifests do not expose a CLI; Roadmap mentions CLI/OpenAPI/codegen, so feedback should call this maturity/roadmap gap rather than broken CLI.
```

- [ ] **Step 2: Assign priorities**

Use this priority rubric:

```text
P0: 当前证据显示文档与公开入口明显不一致，足以导致大多数用户照文档失败。
P1: 多个高价值用户群共同受阻，且修复主要是文档、示例或明确 escape hatch。
P2: 影响特定生态或高级场景，但已有可绕行路径。
P3: 偏好型、长期 Roadmap 或低频场景。
```

Expected: most findings should be P1/P2; avoid overusing P0 without clear doc/API mismatch evidence.

- [ ] **Step 3: Produce final recommendation list**

Generate 8–12 recommendations. Each recommendation must include:

```text
- target package(s)
- problem statement
- why it matters
- suggested next action
- priority
- whether it is docs-only, example/cookbook, API option, or roadmap clarification
```

---

### Task 3: 写入最终 Markdown 报告

**Files:**
- Create: `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`

**Interfaces:**
- Consumes: `PersonaFeedback[]`, `PackageSummary[]`, `CrossPackageTheme[]`
- Produces: final Markdown report

- [ ] **Step 1: Write report with exact structure**

Create `docs/superpowers/feedback/2026-07-02-simulated-user-research.md` using this top-level structure:

```markdown
# 2026-07-02 模拟用户研究报告

## 执行摘要

## 方法与边界

## 模拟用户团队

## Package 覆盖矩阵

## 分用户反馈

## 按 package 汇总

## 跨 package 系统性主题

## 高优先级改进建议

## 设计取舍与非 bug 说明

## 最终结论
```

- [ ] **Step 2: Include method boundary text**

The report must state:

```markdown
本报告是模拟用户研究，不是真实外部用户访谈，也未声明已运行完整应用或命令验证。每位模拟用户的反馈都要求先查阅相关文档、README、指南或公开入口，再提出意见。报告将已文档化或已记录为设计意图的行为标为“设计取舍”或“有文档但不直觉”，不会直接标为 bug。
```

- [ ] **Step 3: Include coverage matrix**

Use a matrix with columns:

```markdown
| Package | 主要体验者 | 覆盖人数 | 主要问题类型 | 总体判断 |
```

Ensure all seven packages appear.

- [ ] **Step 4: Include each persona**

For each of the 24 personas, include this subsection:

```markdown
### P01 — 金融科技前端负责人

- 行业/角色：...
- 先查阅：...
- 关注 package：...
- 使用场景：...
- 第一印象：...
- 喜欢的点：...
- 最大阻碍：...
- 分类判断：...
- 生产可用性判断：...
- 建议：...
- 评分：x/5
```

Repeat explicitly for P01 through P24. Do not collapse personas into a generic summary.

- [ ] **Step 5: Include non-bug design choice section**

Explicitly list:

```markdown
- thin adapter：作为设计选择保留；反馈集中在 cookbook、集成示例和 escape hatch。
- 零值默认 / Partial Input：按 Go 风格设计处理；反馈集中在迁移心智和文档强调。
- invalid SSE/WebSocket event silent skip：作为默认容错策略；反馈集中在 opt-in strict/fail-closed、debug hook、metrics。
- opentelemetry-server outbound-only：作为边界说明；反馈集中在命名、README 首屏说明和与 inbound instrumentation 的关系。
```

---

### Task 4: 自审报告并修正

**Files:**
- Read/Modify: `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`

**Interfaces:**
- Consumes: final Markdown report
- Produces: reviewed Markdown report

- [ ] **Step 1: Coverage self-check**

Check the report against this checklist:

```text
- Exactly 24 personas listed
- All seven packages appear in coverage matrix
- Each persona has docs consulted
- Each package has at least one positive and one friction summary
- No design choice is called a confirmed bug
- Method section says this is simulated research and not command-verified
- Recommendations are prioritized
```

- [ ] **Step 2: Ambiguity self-check**

Search the report for forbidden vague labels:

```text
- TBD
- TODO
- 应该修一下
- 有问题但不清楚
- bug（unless qualified as possible-doc-implementation-mismatch with evidence）
```

Expected: none. If present, rewrite with concrete classification and evidence.

- [ ] **Step 3: Final read-through**

Confirm the report does not overclaim:

```text
Allowed claims:
- “模拟用户认为……”
- “基于文档/README/入口，可能造成……”
- “建议补充……”

Disallowed claims:
- “真实用户已经……”
- “已运行验证……”
- “这是实现 bug” without direct evidence
```

---

### Task 5: 汇报结果

**Files:**
- Read: `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`

**Interfaces:**
- Consumes: reviewed Markdown report
- Produces: concise user-facing summary

- [ ] **Step 1: Summarize completion**

Report to user:

```markdown
已完成模拟用户研究报告：`docs/superpowers/feedback/2026-07-02-simulated-user-research.md`。

覆盖：24 位跨行业模拟用户、7 个 workspace package。

关键结论：
- ...
- ...
- ...

边界：本轮是模拟研究，未声称真实外部访谈或完整命令运行验证；每位 persona 均要求先查阅文档再反馈，并把既有设计取舍从 bug 中分离。
```

---

## Self-Review

- Spec coverage: 已覆盖用户确认的模拟用户研究报告、至少 20 人、每个 package 覆盖、先查阅文档、避免把设计选择当 bug、最终收集意见。
- Placeholder scan: 无 TBD/TODO/implement later/fill in details。
- Type consistency: `PersonaFeedback[]`、`PackageSummary[]`、`CrossPackageTheme[]` 在任务之间命名一致。
- Scope check: 本计划只生成研究报告，不执行源码修改，不扩大为真实可运行验证。
