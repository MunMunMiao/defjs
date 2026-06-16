# defjs Monorepo CI/CD Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 monorepo 的 CI/CD 收敛为“标准 package 脚本 + 单一 workflow + 共享 Bun setup”，并把 build / typecheck / test / release 全部改成 Bun workspace 风格，避免手写 `cd` 链。

**Architecture:** 不引入 Turbo / Nx 这类任务图工具；这个仓库的规模仍然适合用“标准脚本契约 + Bun workspace fan-out + GitHub Actions matrix”解决。根级 `build` / `typecheck` 使用 `bun run --parallel --workspaces` 交给 Bun 按 workspace 并行执行；根级测试只保留 `bun` + `chrome` + `firefox` 三条主线，其中 `test:bun`、`test:chrome`、`test:firefox` 统一用 `bun run --parallel --workspaces --if-present <script>` 在所有 workspace 里分发并跳过缺失脚本。release workflow 也直接用 `bun run --filter "@defjs/<pkg>" <script>` 针对目标包执行自检与发布，避免被无关包阻塞。

**Tech Stack:** Bun, TypeScript, GitHub Actions, Biome, Vitest

---

## 文件结构

- `package.json` — 根级 workspace fan-out scripts（`build` / `typecheck` / `test:bun` / `test:chrome` / `test:firefox`）
- `packages/core/package.json` — core 的本地脚本契约（`build` / `lint` / `typecheck` / `pub` / `test:bun` / `test:chrome` / `test:firefox`）
- `packages/vue/package.json` — vue 的本地脚本契约（`build` / `lint` / `typecheck` / `pub` / `test:chrome` / `test:firefox`）
- `packages/angular/package.json` — angular 的本地脚本契约（`build` / `lint` / `typecheck` / `pub`）
- `packages/opentelemetry-server/package.json` — opentelemetry-server 的本地脚本契约（`build` / `lint` / `typecheck` / `pub`）
- `.github/actions/setup-bun-deps/action.yml` — 共享 Bun + cache + install 复用层
- `.github/workflows/ci.yml` — CI DAG、路径触发、浏览器矩阵、build 门禁
- `.github/workflows/releases.yml` — 手动发布、版本检查、包级自检与发布

---

### Task 1: 标准化 package 脚本契约并改成 Bun workspace fan-out

**Files:**

- Modify: `package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/vue/package.json`
- Modify: `packages/angular/package.json`
- Modify: `packages/opentelemetry-server/package.json`

- [ ] **Step 1: 把每个包的脚本补齐成同一套最小契约，并移除不再需要的测试入口**

```json
// package.json
"scripts": {
  "build": "bun run --parallel --workspaces build",
  "lint": "biome check .",
  "lint:fix": "biome check . --write",
  "test:bun": "bun run --parallel --workspaces --if-present test:bun",
  "test:chrome": "bun run --parallel --workspaces --if-present test:chrome",
  "test:firefox": "bun run --parallel --workspaces --if-present test:firefox",
  "typecheck": "bun run --parallel --workspaces typecheck"
}
```

```json
// packages/core/package.json
"scripts": {
  "build": "bun scripts/build.ts",
  "lint": "biome check",
  "lint:fix": "biome check --write",
  "pub": "bun publish dist",
  "test:bun": "env -u NODE PATH=\"${PATH#$NODE:}\" bun ../../node_modules/vitest/vitest.mjs run --config vitest.config.bun.ts src",
  "test:chrome": "bun x vitest run --config vitest.config.browser.chrome.ts",
  "test:firefox": "bun x vitest run --config vitest.config.browser.firefox.ts",
  "typecheck": "bun x tsc -p tsconfig.json --noEmit"
}
```

```json
// packages/vue/package.json
"scripts": {
  "build": "bun scripts/build.ts",
  "lint": "biome check",
  "lint:fix": "biome check --write",
  "pub": "bun publish dist",
  "test:chrome": "bun x vitest run --config vitest.config.browser.chrome.ts",
  "test:firefox": "bun x vitest run --config vitest.config.browser.firefox.ts",
  "typecheck": "bun x tsc -p tsconfig.json --noEmit"
}
```

```json
// packages/angular/package.json
"scripts": {
  "build": "bun scripts/build.ts",
  "lint": "biome check",
  "lint:fix": "biome check --write",
  "pub": "bun publish dist",
  "typecheck": "bun x tsc -p tsconfig.json --noEmit"
}
```

```json
// packages/opentelemetry-server/package.json
"scripts": {
  "build": "bun scripts/build.ts",
  "lint": "biome check",
  "lint:fix": "biome check --write",
  "pub": "bun publish dist",
  "typecheck": "bun x tsc -p tsconfig.json --noEmit"
}
```

- [ ] **Step 2: 运行 workspace fan-out 命令，确认脚本契约真的成立**

Run:

```bash
bun run build
bun run typecheck
bun run test:bun
bun run test:chrome
bun run test:firefox
```

Expected:

- 所有命令 PASS
- 根级 `build` 通过 Bun workspace 并行执行所有 package 的 `build`
- 根级 `typecheck` 通过 Bun workspace 并行执行所有 package 的 `typecheck`
- 根级测试只剩 `bun`、`chrome`、`firefox`
- `test:bun` 只会命中有脚本的 workspace（当前只会是 `core`）

- [ ] **Step 3: 提交脚本契约标准化**

```bash
git add package.json packages/core/package.json packages/vue/package.json packages/angular/package.json packages/opentelemetry-server/package.json
git commit -m "chore(ci): standardize package scripts"
```

---

### Task 2: 抽出共享 Bun setup，并收紧 CI DAG

**Files:**

- Create: `.github/actions/setup-bun-deps/action.yml`
- Modify: `.github/workflows/ci.yml`

- [ ] **Step 1: 先把 Bun 安装、cache、install 抽到一个 composite action**

```yaml
# .github/actions/setup-bun-deps/action.yml
name: Setup Bun dependencies
description: Install Bun and restore dependency caches
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@v2
    - uses: actions/cache@v4
      with:
        path: |
          ~/.bun/install/cache
          node_modules
        key: deps-${{ runner.os }}-${{ hashFiles('bun.lock') }}
        restore-keys: deps-
    - shell: bash
      run: bun install --frozen-lockfile
```

- [ ] **Step 2: 用这个 action 改写 `.github/workflows/ci.yml`，并移除 node-only / type-only / deno / safari 测试 job**

重点改这几处：

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

```yaml
jobs:
  changes:
    outputs:
      core: ${{ steps.filter.outputs.core }}
      vue: ${{ steps.filter.outputs.vue }}
      angular: ${{ steps.filter.outputs.angular }}
      opentelemetry: ${{ steps.filter.outputs.opentelemetry }}
      root: ${{ steps.filter.outputs.root }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            root:
              - biome.json
              - package.json
              - bun.lock
              - tsconfig.json
              - vitest.config.ts
              - .github/workflows/**
              - .github/actions/**
            core:
              - packages/core/**
            vue:
              - packages/vue/**
            angular:
              - packages/angular/**
            opentelemetry:
              - packages/opentelemetry-server/**
```

```yaml
lint:
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-bun-deps
    - run: bun run lint
```

```yaml
typecheck:
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-bun-deps
    - run: bun run typecheck
```

```yaml
test-bun:
  if: ${{ needs.changes.outputs.root == 'true' || needs.changes.outputs.core == 'true' }}
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-bun-deps
    - run: bun run test:bun
```

```yaml
test-browser:
  if: ${{ needs.changes.outputs.root == 'true' || needs.changes.outputs.core == 'true' || needs.changes.outputs.vue == 'true' }}
  strategy:
    fail-fast: false
    matrix:
      browser: [chrome, firefox]
  steps:
    - uses: actions/checkout@v4
    - uses: actions/setup-node@v4
      with:
        node-version: 22
    - uses: ./.github/actions/setup-bun-deps
    - run: bun run test:${{ matrix.browser }}
```

```yaml
build:
  needs: [lint, typecheck, test-bun, test-browser]
  if: |
    always() &&
    (needs.lint.result == 'success' || needs.lint.result == 'skipped') &&
    (needs.typecheck.result == 'success' || needs.typecheck.result == 'skipped') &&
    (needs.test-bun.result == 'success' || needs.test-bun.result == 'skipped') &&
    (needs.test-browser.result == 'success' || needs.test-browser.result == 'skipped')
  steps:
    - uses: actions/checkout@v4
    - uses: ./.github/actions/setup-bun-deps
    - run: bun run build
```

这里故意只保留：

- `test-bun`：根级 `bun run test:bun`，实际通过 Bun workspace 只命中 `core`
- `test-browser`：浏览器维度矩阵只保留 `chrome` / `firefox`，每个 job 通过根级 `bun run test:chrome` / `bun run test:firefox` 去 fan-out 到 `core` 和 `vue`

**不要把 `test-node`、`test-types`、`test:safari`、`deno` 加回主 CI。**
浏览器 job 仍然保留 `setup-node@v4`，但只是为了 Vitest browser provider 的运行环境，不代表我们恢复 node-only 测试。

- [ ] **Step 3: 跑与 CI 相关的本地 smoke check**

Run:

```bash
git diff --check
bun run test:bun
bun run test:chrome
bun run test:firefox
```

Expected:

- 没有 YAML/空白错误
- `bun`、`chrome`、`firefox` 三条测试主线都能跑通
- 主 CI 不再包含 node-only / type-only / safari / deno 的测试门禁
- 这些 smoke check 只通过 root workspace 命令验证，不再手写 `cd packages/...`

- [ ] **Step 4: 提交 CI 工作流改造**

```bash
git add .github/actions/setup-bun-deps/action.yml .github/workflows/ci.yml
git commit -m "chore(ci): share bun setup and tighten workflow"
```

---

### Task 3: 让 release 只校验目标包，并用 Bun workspace filter 发布

**Files:**

- Modify: `.github/workflows/releases.yml`

- [ ] **Step 1: 给 release 增加 `vue` 入口，并把包级脚本用于发布前校验**

```yaml
on:
  workflow_dispatch:
    inputs:
      package:
        description: 'Package to release'
        required: true
        type: choice
        options:
          - core
          - vue
          - angular
          - opentelemetry-server
```

```yaml
jobs:
  release:
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-bun-deps
      - run: |
          PKG="@defjs/${{ github.event.inputs.package }}"
          bun run --filter "$PKG" lint
          bun run --filter "$PKG" typecheck
          bun run --filter "$PKG" build
          bun run --filter "$PKG" pub
        env:
          NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}
```

保留版本检查，但把它放在 `bun run --filter` 之前或之后都可以；关键是 `lint/typecheck/build/pub` 都只针对目标包，不再用全局 `bun run lint && bun run typecheck` 卡住发布，也不再通过 `cd packages/...` 手工切目录。

- [ ] **Step 2: 本地验证每个包的发布前脚本都能独立跑通**

Run:

```bash
bun run --filter '@defjs/core' lint
bun run --filter '@defjs/core' typecheck
bun run --filter '@defjs/core' build
bun run --filter '@defjs/vue' lint
bun run --filter '@defjs/vue' typecheck
bun run --filter '@defjs/vue' build
bun run --filter '@defjs/angular' lint
bun run --filter '@defjs/angular' typecheck
bun run --filter '@defjs/angular' build
bun run --filter '@defjs/opentelemetry-server' lint
bun run --filter '@defjs/opentelemetry-server' typecheck
bun run --filter '@defjs/opentelemetry-server' build
```

Expected:

- 四个包都能独立通过本地自检
- `release` workflow 不再依赖其他包的状态
- 发布前不再引入额外的 node-only / browser-only 测试步骤
- 验证命令全部通过 Bun workspace `--filter` 直接定位到目标包

- [ ] **Step 3: 提交 release workflow 改造**

```bash
git add .github/workflows/releases.yml
git commit -m "chore(release): use package-local release checks"
```

---

### Task 4: 终局验证与回归确认

**Files:**

- Verify only: `package.json`
- Verify only: `packages/core/package.json`
- Verify only: `packages/vue/package.json`
- Verify only: `packages/angular/package.json`
- Verify only: `packages/opentelemetry-server/package.json`
- Verify only: `.github/actions/setup-bun-deps/action.yml`
- Verify only: `.github/workflows/ci.yml`
- Verify only: `.github/workflows/releases.yml`

- [ ] **Step 1: 重新跑仓库级门禁**

Run:

```bash
bun run lint
bun run typecheck
bun run build
bun run test:bun
bun run test:chrome
bun run test:firefox
```

Expected:

- 根级 lint/typecheck/build 全部通过
- root 主线测试只剩 `bun`、`chrome`、`firefox`

- [ ] **Step 2: 复核 workflow diff，确认 DAG 和发布边界没有写偏**

Run:

```bash
git diff -- .github/actions/setup-bun-deps/action.yml .github/workflows/ci.yml .github/workflows/releases.yml
```

Expected:

- CI 仍然只有一个主 workflow
- build 依赖 lint/typecheck/test-bun/test-browser
- release 只校验并发布目标包
- 没有把 node-only / type-only / deno / safari 测试塞回主 CI

- [ ] **Step 3: 检查工作区只留下计划内变更**

Run:

```bash
git status --short
```

Expected:

- 只看到本计划涉及的 source / workflow 文件改动
- 没有多余的调试文件或临时脚本

---

## 计划自查

### 1. 覆盖面检查

- `package.json` 的 root workspace fan-out scripts 由 Task 1 负责。
- `packages/core` / `packages/vue` / `packages/angular` / `packages/opentelemetry-server` 的脚本契约由 Task 1 负责。
- 共享 Bun setup、root CI DAG、路径触发、`bun` + `chrome/firefox` 测试矩阵、build 门禁由 Task 2 负责。
- `releases.yml` 的 package-local 自检、`vue` 发布入口、目标包 publish 边界由 Task 3 负责。
- 端到端验证与 diff 复核由 Task 4 负责。

### 2. 占位符扫描

- 没有 `TBD`、`TODO`、`implement later` 之类的占位。
- 所有新增脚本都写到了具体命令，没有留空位。
- 没有把未决定的包名、文件名、job 名称写成模糊描述。

### 3. 类型与命名一致性

- 统一使用 `build` / `typecheck` 作为 workspace fan-out 目标。
- 统一使用 `lint`、`build`、`typecheck`、`pub` 作为包级发布/质量脚本。
- CI 里的测试只保留 `test:bun` 和 `test-browser`。
- `test-browser` 只覆盖 `chrome` / `firefox` 两个浏览器；每个 job 通过根级 `bun run test:chrome` / `bun run test:firefox` 再由 Bun workspace fan-out 到 `core` / `vue`。
- 主 CI 明确不包含 node-only / type-only / deno / safari 测试门禁。
