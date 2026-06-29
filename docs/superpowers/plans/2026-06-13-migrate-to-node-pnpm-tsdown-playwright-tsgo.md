# 迁移到 Node + pnpm workspace + tsdown + Playwright + tsgo 实施方案

> **For agentic workers:** REQUIRED SUB-SKILL: 使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行。步骤使用复选框 (`- [ ]`) 语法以便跟踪。

**Goal:** 将当前基于 Bun workspaces / `Bun.build` / `@vitest/browser-webdriverio` / `tsc` 的 monorepo 全面迁移到 Node.js + pnpm workspace + tsdown + Playwright + tsgo，并保证构建、类型检查、单元测试、浏览器测试与 CI 全部通过。

**Architecture:** 用 pnpm workspace 替换 Bun workspaces；用 `tsdown`（Rolldown/Oxc）替换 `Bun.build + bun-plugin-dts` 负责库打包与 dts 生成；用 `@vitest/browser-playwright` 替换 WebdriverIO + chromedriver/geckodriver；用 `@typescript/native-preview`（`tsgo`）替换 `tsc` 作为类型检查器；所有构建脚本用 Node/TS（`tsx`）重写，CI 改为 `actions/setup-node` + `pnpm/action-setup`。

**Tech Stack:** Node.js ≥26、pnpm 11.6.0、tsdown、tsx、@typescript/native-preview (tsgo)、Vitest 4、@vitest/browser-playwright、Playwright、Hono、Biome。

---

## 文件映射

| 文件/目录                                    | 职责                                                                                                                          |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `pnpm-workspace.yaml`                        | 声明 workspace 包位置                                                                                                         |
| `.npmrc`                                     | pnpm monorepo 行为配置（workspace protocol、peer 自动安装等）                                                                 |
| `package.json`                               | 根项目配置、共享 devDependencies、根脚本、`packageManager`                                                                    |
| `packages/*/tsdown.config.ts`                | 各包的 tsdown 打包配置；同时通过 `copy` 选项复制 LICENSE/README，通过 `hooks.build:done` 重写 `dist/package.json`             |
| `packages/core/tsdown.config.ts`             | core 的打包配置（返回数组：minified + 普通 ESM + dts）                                                                        |
| `packages/*/vitest.config.browser.ts`        | 浏览器测试统一配置，使用 `browser.instances` 同时跑 Chromium 与 Firefox                                                       |
| `packages/core/vitest.config.ts`             | 项目聚合配置，仅保留 Node + Chromium + Firefox 项目                                                                           |
| `packages/*/test/`                           | 测试基础设施目录：包含 `setup.ts`（原 `test-setup.ts`）、`shared.ts`（原 `vitest.shared.ts`）、Hono XSRF 中间件等测试辅助文件 |
| `.github/actions/setup-pnpm-deps/action.yml` | 新的 CI setup composite action                                                                                                |
| `.changeset/config.json`                     | changesets 配置：`updateInternalDependencies: "minor"`、public access、GitHub changelog                                       |
| `.changeset/README.md`                       | 引导贡献者在 PR 中添加 changeset                                                                                              |
| `.github/workflows/ci.yml`                   | CI 主流程：PR / push 触发，调用可复用 checks 工作流                                                                           |
| `.github/workflows/_checks.yml`              | 可复用检查工作流（lint / typecheck / test / build / lockfile）                                                                |
| `.github/workflows/release.yml`              | 基于 changesets 自动创建 Version Packages PR 并发布包                                                                         |
| `.github/dependabot.yml`                     | Dependabot 自动更新 npm 与 GitHub Actions 依赖                                                                                |

---

### Task 1: 初始化 pnpm workspace

**Files:**

- Create: `pnpm-workspace.yaml`
- Create: `.npmrc`
- Modify: `package.json`
- Delete: `bunfig.toml`
- Delete: `bun.lock`（迁移完成后由 `pnpm-lock.yaml` 取代）

- [ ] **Step 1: 创建 `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'

catalog:
  '@biomejs/biome': '2.5.0'
  '@changesets/changelog-github': '^0.7.0'
  '@changesets/cli': '^2.31.0'
  '@hono/node-server': '^2.0.4'
  '@hono/node-ws': '^1.3.1'
  '@types/node': '^25.9.3'
  '@typescript/native-preview': '^7.0.0-dev.20260612.1'
  '@vitest/browser': '^4.1.8'
  '@vitest/browser-playwright': '^4.1.8'
  '@vitest/coverage-istanbul': '^4.1.8'
  '@vitest/ui': '^4.1.8'
  hono: '^4.12.25'
  playwright: '^1.60.0'
  tsdown: '^0.22.2'
  tsx: '^4.22.4'
  typescript: '^6.0.3'
  vite: '^8.0.16'
  vitest: '^4.1.8'
```

- [ ] **Step 2: 创建 `.npmrc`**

```ini
shamefully-hoist=false
strict-peer-dependencies=false
auto-install-peers=true
link-workspace-packages=true
prefer-workspace-packages=true
save-workspace-protocol=rolling
engine-strict=true
```

- [ ] **Step 3: 修改根 `package.json`**

完整替换为：

```json
{
  "name": "defjs",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.6.0",
  "engines": {
    "node": ">=26"
  },
  "devDependencies": {
    "@biomejs/biome": "catalog:",
    "@changesets/changelog-github": "catalog:",
    "@changesets/cli": "catalog:",
    "@hono/node-server": "catalog:",
    "@hono/node-ws": "catalog:",
    "@types/node": "catalog:",
    "@typescript/native-preview": "catalog:",
    "@vitest/browser": "catalog:",
    "@vitest/browser-playwright": "catalog:",
    "@vitest/coverage-istanbul": "catalog:",
    "@vitest/ui": "catalog:",
    "hono": "catalog:",
    "playwright": "catalog:",
    "tsdown": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vite": "catalog:",
    "vitest": "catalog:"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "changeset": "changeset",
    "changeset:version": "changeset version",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r --if-present run typecheck"
  }
}
```

说明：

- 移除 `workspaces` 字段（pnpm 使用 `pnpm-workspace.yaml`）。
- 使用 `catalog:` 协议集中管理共享 devDependencies 版本，各子包通过 `"pkg": "catalog:"` 引用，避免版本漂移。
- 新增 `@changesets/cli` 与 `@changesets/changelog-github`，用于自动生成 Version Packages PR 和 changelog。
- 根项目设置 `"private": true`，防止 `pnpm changeset publish` 误发布根包。
- 移除 `@types/bun`、`bun-plugin-dts`、`chromedriver`、`geckodriver`、`webdriverio`、`@vitest/browser-webdriverio`、`vite-plugin-dts`。
- `@typescript/native-preview` 提供 `tsgo` CLI；保留 `typescript` 作为 tsdown dts 与 IDE 后备。
- 覆盖率统一使用 `@vitest/coverage-istanbul`（支持 Firefox 等非 V8 运行时），因此不再保留 `@vitest/coverage-v8`。

- [ ] **Step 4: 删除 Bun 专属文件**

```bash
rm bunfig.toml bun.lock
```

- [ ] **Step 5: 安装依赖并生成 lockfile**

```bash
pnpm install
```

预期：`pnpm-lock.yaml` 出现在根目录，无安装错误。

---

### Task 2: 清理 Bun 运行时残留

**Files:**

- Modify: `biome.json`

- [ ] **Step 1: 从 Biome globals 中移除 `Bun`**

将 `biome.json` 中的：

```json
"javascript": {
  "globals": ["Bun"],
  ...
}
```

改为：

```json
"javascript": {
  "globals": [],
  ...
}
```

- [ ] **Step 2: 验证 lint 仍通过**

```bash
pnpm run lint
```

预期：无 `Bun` 相关 lint 错误。

---

### Task 3: `@defjs/core` 构建迁移到 tsdown

**Files:**

- Create: `packages/core/tsdown.config.ts`
- Delete: `packages/core/scripts/build.ts`
- Modify: `packages/core/package.json`

- [ ] **Step 1: 创建 `packages/core/tsdown.config.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    outExtensions: () => ({ js: '.min.js' }),
  },
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: true,
    clean: false,
    minify: false,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    copy: ['../../LICENSE', './README.md'],
    hooks: {
      async 'build:done'({ options }) {
        await rewritePackageJson(options.outDir)
      },
    },
  },
])
```

说明：

- 通过 `outExtensions` 直接输出 `index.min.js`，无需手动 rename。
- `copy` 把根目录 `LICENSE` 与包内 `README.md` 复制到 `dist`。
- `hooks.build:done` 在第二次（普通 + dts）构建完成后重写 `dist/package.json`。

- [ ] **Step 2: 删除 `packages/core/scripts/build.ts`**

```bash
rm packages/core/scripts/build.ts
```

- [ ] **Step 3: 修改 `packages/core/package.json` 的 `build` 脚本**

将：

```json
"build": "tsx scripts/build.ts",
```

改为：

```json
"build": "tsdown",
```

确认 `devDependencies` 中已声明 `"tsdown": "catalog:"`；若缺失则添加。

其余字段保持不变。

- [ ] **Step 4: 验证 core 构建**

```bash
cd packages/core
pnpm run build
```

预期：`dist/index.js`、`dist/index.min.js`、`dist/index.d.ts`、`dist/package.json` 均生成。

---

### Task 4: `@defjs/core` 浏览器测试迁移到 Playwright（仅 Node + Chromium + Firefox）

**Files:**

- Create: `packages/core/test/setup.ts`（从 `test-setup.ts` 移动并调整路径）
- Create: `packages/core/test/shared.ts`（从 `vitest.shared.ts` 移动并调整路径）
- Create: `packages/core/test/xsrf-middleware.ts`（Hono XSRF 路由中间件）
- Create: `packages/core/test/vite-xsrf-plugin.ts`（Vite dev server 适配插件）
- Create: `packages/core/vitest.config.browser.ts`
- Modify: `packages/core/vitest.config.node.ts`（调整导入路径）
- Modify: `packages/core/vitest.config.ts`（调整导入路径）
- Modify: `packages/core/tsconfig.json`
- Modify: `packages/core/tsconfig.build.json`
- Delete: `packages/core/test-setup.ts`
- Delete: `packages/core/vitest.shared.ts`
- Delete: `packages/core/vitest-xsrf-proxy-plugin.ts`
- Delete: `packages/core/vitest.config.browser.chrome.ts`
- Delete: `packages/core/vitest.config.browser.firefox.ts`
- Delete: `packages/core/vitest.config.browser.safari.ts`
- Delete: `packages/core/vitest.config.bun.ts`
- Delete: `packages/core/vitest.config.deno.ts`

- [ ] **Step 1: 创建 `packages/core/test/` 目录并迁移测试基础设施文件**

```bash
mkdir -p packages/core/test
```

将原文件迁移到新目录：

```bash
git mv packages/core/test-setup.ts packages/core/test/setup.ts
git mv packages/core/vitest.shared.ts packages/core/test/shared.ts
```

删除旧的 Vite 风格 XSRF 代理文件（后续用 Hono 中间件替代）：

```bash
rm packages/core/vitest-xsrf-proxy-plugin.ts
```

- [ ] **Step 2: 创建 `packages/core/test/xsrf-middleware.ts`**

XSRF 的签发与校验逻辑统一用 Hono 中间件实现：

```ts
import { getCookie, setCookie } from 'hono/cookie'
import type { Hono } from 'hono'

export function registerXsrfRoutes(app: Hono): void {
  app.get('/xsrf-token', (c) => {
    const token = 'test-xsrf-token'
    setCookie(c, 'XSRF-TOKEN', token, {
      path: '/',
      sameSite: 'Strict',
      httpOnly: false,
    })
    return c.json({ token })
  })

  app.post('/xsrf-validate', async (c) => {
    const cookieToken = getCookie(c, 'XSRF-TOKEN')
    const headerToken = c.req.header('X-XSRF-TOKEN')

    if (cookieToken && headerToken && cookieToken === headerToken) {
      return c.json({ ok: true })
    }

    return c.json({ ok: false, reason: 'missing or mismatched XSRF token' }, 403)
  })
}
```

说明：

- 所有 XSRF 业务逻辑收敛到 Hono 路由/中间件，便于在测试服务器和 Vite dev server 两端复用。
- cookie 不使用 `httpOnly`，以便浏览器测试代码读取；`SameSite=Strict` 模拟生产行为。

- [ ] **Step 3: 创建 `packages/core/test/vite-xsrf-plugin.ts`**

Vite dev server 通过该插件把 `/xsrf-*` 请求转发给同一个 Hono 中间件处理，保持 endpoint 逻辑全部在 Hono：

```ts
import type { IncomingMessage, ServerResponse } from 'node:http'
import { Hono } from 'hono'
import type { Plugin } from 'vite'
import { registerXsrfRoutes } from './xsrf-middleware'

function toRequest(req: IncomingMessage, body: Buffer): Request {
  const host = req.headers.host ?? 'localhost'
  return new Request(`http://${host}${req.url}`, {
    method: req.method,
    headers: req.headers as Record<string, string>,
    body: body.length > 0 ? body : undefined,
  })
}

async function sendResponse(response: Response, res: ServerResponse): Promise<void> {
  res.statusCode = response.status
  response.headers.forEach((value, key) => res.setHeader(key, value))
  const buffer = Buffer.from(await response.arrayBuffer())
  res.end(buffer)
}

export function xsrfProxyPlugin(): Plugin {
  const app = new Hono()
  registerXsrfRoutes(app)

  return {
    name: 'xsrf-test-proxy',
    configureServer(server) {
      server.middlewares.use('/xsrf-', async (req, res) => {
        const chunks: Buffer[] = []
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        }
        const request = toRequest(req, Buffer.concat(chunks))
        const response = await app.fetch(request)
        await sendResponse(response, res)
      })
    },
  }
}
```

- [ ] **Step 4: 修改 `packages/core/test/setup.ts` 注册 XSRF 路由**

在现有 Hono app 初始化后、启动测试服务器前，加入：

```ts
import { registerXsrfRoutes } from './xsrf-middleware'

// 现有 app 初始化代码之后
registerXsrfRoutes(app)
```

确保 `setup.ts` 顶部导入路径从 `./vitest.shared` 改为 `./shared`。

- [ ] **Step 5: 创建 `packages/core/test/shared.ts`**

完整替换为：

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(fileURLToPath(import.meta.url))
export const globalSetupPath = resolve(packageRoot, 'setup.ts')
export const runtimeSpecificSpecPatterns = [
  'src/**/*.node.spec.ts',
  'src/**/*.browser.spec.ts',
  'src/**/*.chrome.spec.ts',
  'src/**/*.firefox.spec.ts',
]
export const coverageConfig = {
  enabled: true,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

说明：`reportsDirectory` 使用 `packageRoot` 解析，由于 `shared.ts` 位于 `test/` 下，`packageRoot` 是 `packages/core`，因此报告目录仍为 `packages/core/coverage`。

- [ ] **Step 6: 修改 `packages/core/tsconfig.json` 覆盖所有 TS 文件**

完整替换为：

```json
{
  "compileOnSave": false,
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist",
    "declaration": true,
    "noEmit": false,
    "emitDeclarationOnly": false,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "target": "ESNext",
    "module": "ESNext",
    "moduleDetection": "force",
    "moduleResolution": "bundler",
    "strict": true,
    "strictNullChecks": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*.ts", "test/**/*.ts"]
}
```

说明：`tsgo` 类型检查会覆盖 `src/` 与 `test/` 下的所有 `.ts` 文件，包括 spec、type test、测试辅助文件，没有例外。

- [ ] **Step 7: 修改 `packages/core/tsconfig.build.json` 排除测试文件**

用于 `tsdown` 构建，仅打包源码：

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test", "src/**/*.spec.ts", "src/**/*.type.test.ts"]
}
```

- [ ] **Step 8: 修改 `packages/core/vitest.config.node.ts` 调整导入路径**

```ts
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './test/shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-node',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter((pattern) => pattern !== 'src/**/*.node.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
    pool: 'threads',
  },
})
```

- [ ] **Step 9: 创建 `packages/core/vitest.config.browser.ts`**

完整替换为：

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot } from './test/shared'
import { xsrfProxyPlugin } from './test/vite-xsrf-plugin'

export default defineConfig({
  root: packageRoot,
  plugins: [xsrfProxyPlugin()],
  test: {
    name: 'core-browser',
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
        },
      ],
    },
  },
})
```

- [ ] **Step 10: 修改 `packages/core/vitest.config.ts` 聚合配置**

完整替换为：

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const nodeConfig = fileURLToPath(new URL('./vitest.config.node.ts', import.meta.url))
const browserConfig = fileURLToPath(new URL('./vitest.config.browser.ts', import.meta.url))

export default defineConfig({
  test: {
    projects: [nodeConfig, browserConfig],
  },
})
```

- [ ] **Step 11: 确保 `packages/core/package.json` 声明依赖**

确认 `devDependencies` 中包含：

```json
{
  "@vitest/coverage-istanbul": "catalog:",
  "@typescript/native-preview": "catalog:"
}
```

若缺失则添加。

- [ ] **Step 12: 删除旧的浏览器/运行时测试配置**

```bash
rm packages/core/vitest.config.browser.chrome.ts \
   packages/core/vitest.config.browser.firefox.ts \
   packages/core/vitest.config.browser.safari.ts \
   packages/core/vitest.config.bun.ts \
   packages/core/vitest.config.deno.ts
```

注意：`packages/core/vitest.config.browser.ts` 是 Step 9 新建的，不要误删。

- [ ] **Step 13: 本地安装 Playwright 浏览器并运行 core 测试**

```bash
cd packages/core
pnpm exec playwright install --with-deps chromium firefox
pnpm run test
```

预期：Node 项目与 Chromium/Firefox 浏览器实例并行运行，全部通过，且覆盖率各项均为 100%。

---

### Task 5: `@defjs/core` 类型检查迁移到 tsgo

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/core/tsconfig.json`（如有必要移除 `@types/bun`）
- Delete: `packages/core/vitest.config.typecheck.ts`

- [ ] **Step 1: 删除独立的 Vitest typecheck 配置**

`packages/core/vitest.config.typecheck.ts` 原本仅用于 `.type.test.ts` 的 `tsc` 检查；现在统一由 `tsgo` 检查项目类型，不再单独保留。

```bash
rm packages/core/vitest.config.typecheck.ts
```

- [ ] **Step 2: 确保 `packages/core/tsconfig.json` 不再引用 `@types/bun`**

当前 `packages/core/tsconfig.json` 继承根 `tsconfig.json`。检查根 `tsconfig.json` 的 `types`：

```json
"types": ["@types/bun"]
```

改为：

```json
"types": ["@types/node"]
```

- [ ] **Step 3: 修改 `packages/core/package.json` 的 `typecheck` 脚本**

将：

```json
"typecheck": "tsc --project tsconfig.json --noEmit"
```

改为：

```json
"typecheck": "tsgo --project tsconfig.json --noEmit"
```

同时确认 `devDependencies` 中已声明 `"@typescript/native-preview": "catalog:"`；若缺失则添加。删除任何 `typecheck:tsc`、`typecheck:tsgo` 等冗余脚本，仅保留一条 `typecheck`。

- [ ] **Step 4: 运行 tsgo 类型检查**

```bash
cd packages/core
pnpm run typecheck
```

预期：`tsgo` 完成类型检查且无错误。

- [ ] **Step 5: 处理 tsgo 报错**

若 `tsgo` 报错，优先调整 `tsconfig.json` 或源码以适配 `tsgo`；本方案不再保留 `tsc` 作为后备，确保类型检查链路只使用 `tsgo`。

### Task 6: `@defjs/angular` 构建迁移到 tsdown

**Files:**

- Create: `packages/angular/tsdown.config.ts`
- Delete: `packages/angular/scripts/build.ts`
- Modify: `packages/angular/package.json`

- [ ] **Step 1: 创建 `packages/angular/tsdown.config.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: './dist',
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  dts: true,
  clean: true,
  minify: false,
  sourcemap: false,
  tsconfig: './tsconfig.build.json',
  external: ['@angular/common', '@angular/core', '@defjs/core'],
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(options.outDir)
    },
  },
})
```

- [ ] **Step 2: 删除 `packages/angular/scripts/build.ts`**

```bash
rm packages/angular/scripts/build.ts
```

- [ ] **Step 3: 修改 `packages/angular/package.json` 的 `build` 脚本**

将：

```json
"build": "tsx scripts/build.ts",
```

改为：

```json
"build": "tsdown",
```

其余字段保持不变。

- [ ] **Step 4: 添加 `typecheck` 脚本并更新 tsconfig**

在 `packages/angular/package.json` 的 `scripts` 中添加：

```json
"typecheck": "tsgo --project tsconfig.json --noEmit"
```

确认 `devDependencies` 中已声明：

```json
{
  "@typescript/native-preview": "catalog:",
  "tsdown": "catalog:",
  "typescript": "catalog:"
}
```

若缺失则添加。

同时检查 `packages/angular/tsconfig.json` 的 `include` 覆盖所有源码 TS 文件：

```json
"include": ["src/**/*.ts"]
```

```bash
cd packages/angular
pnpm run typecheck
pnpm run build
```

预期：类型检查无错误；`dist/index.js`、`dist/index.d.ts`、`dist/package.json` 生成。

---

### Task 7: `@defjs/vue` 构建与浏览器测试迁移

**Files:**

- Create: `packages/vue/test/setup.ts`（从 `test-setup.ts` 移动并调整路径）
- Create: `packages/vue/test/shared.ts`（从 `vitest.shared.ts` 移动并调整路径）
- Create: `packages/vue/tsdown.config.ts`
- Create: `packages/vue/vitest.config.ts`
- Create: `packages/vue/vitest.config.browser.ts`
- Modify: `packages/vue/tsconfig.json`
- Modify: `packages/vue/tsconfig.build.json`
- Delete: `packages/vue/scripts/build.ts`
- Delete: `packages/vue/test-setup.ts`
- Delete: `packages/vue/vitest.shared.ts`
- Delete: `packages/vue/vitest.config.browser.chrome.ts`
- Delete: `packages/vue/vitest.config.browser.firefox.ts`
- Modify: `packages/vue/package.json`

- [ ] **Step 1: 创建 `packages/vue/test/` 目录并迁移测试基础设施文件**

```bash
mkdir -p packages/vue/test
```

迁移文件：

```bash
git mv packages/vue/test-setup.ts packages/vue/test/setup.ts
git mv packages/vue/vitest.shared.ts packages/vue/test/shared.ts
```

- [ ] **Step 2: 修改 `packages/vue/test/setup.ts` 导入路径**

将文件内对 `./vitest.shared` 的引用改为 `./shared`（如有）。其余 Hono 测试服务器逻辑保持不变。

- [ ] **Step 3: 创建 `packages/vue/test/shared.ts`**

完整替换为：

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(fileURLToPath(import.meta.url))
export const globalSetupPath = resolve(packageRoot, 'setup.ts')
export const coverageConfig = {
  enabled: true,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

- [ ] **Step 4: 创建 `packages/vue/tsdown.config.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

export default defineConfig({
  entry: ['./src/index.ts'],
  outDir: './dist',
  format: 'esm',
  platform: 'browser',
  target: 'esnext',
  dts: true,
  clean: true,
  minify: false,
  sourcemap: false,
  tsconfig: './tsconfig.build.json',
  external: ['vue', '@defjs/core'],
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(options.outDir)
    },
  },
})
```

- [ ] **Step 5: 删除 `packages/vue/scripts/build.ts`**

```bash
rm packages/vue/scripts/build.ts
```

- [ ] **Step 6: 修改 `packages/vue/package.json` 的 `build` 脚本**

将：

```json
"build": "tsx scripts/build.ts",
```

改为：

```json
"build": "tsdown",
```

确认 `devDependencies` 中已声明 `"tsdown": "catalog:"`；若缺失则添加。

其余字段保持不变。

- [ ] **Step 7: 添加 `typecheck` 脚本**

在 `packages/vue/package.json` 的 `scripts` 中添加：

```json
"typecheck": "tsgo --project tsconfig.json --noEmit"
```

同时确认 `devDependencies` 中已声明 `"@typescript/native-preview": "catalog:"`；若缺失则添加。

- [ ] **Step 8: 修改 `packages/vue/tsconfig.json` 覆盖所有 TS 文件**

完整替换为：

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "jsx": "preserve",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "noEmit": true,
    "paths": {
      "@defjs/core": ["../core/src"]
    }
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

说明：`tsgo` 类型检查覆盖 `src/` 与 `test/` 下所有 `.ts` 文件，包括 spec、type test 与测试辅助文件，没有例外。

- [ ] **Step 9: 修改 `packages/vue/tsconfig.build.json` 排除测试文件**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts"],
  "exclude": ["test", "src/**/*.spec.ts", "src/**/*.type.test.ts"]
}
```

- [ ] **Step 10: 创建 `packages/vue/vitest.config.browser.ts`**

完整替换为：

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot } from './test/shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'vue-browser',
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          browser: 'chromium',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
        },
      ],
    },
  },
})
```

- [ ] **Step 11: 修改 `packages/vue/vitest.config.ts` 聚合配置**

完整替换为：

```ts
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const browserConfig = fileURLToPath(new URL('./vitest.config.browser.ts', import.meta.url))

export default defineConfig({
  test: {
    projects: [browserConfig],
  },
})
```

说明：`vitest.config.browser.ts` 通过 `browser.instances` 同时启动 Chromium 与 Firefox 两个实例，共享同一个 Vite dev server。

- [ ] **Step 12: 确保 `packages/vue/package.json` 声明覆盖率依赖**

确认 `devDependencies` 中包含：

```json
"@vitest/coverage-istanbul": "catalog:"
```

若缺失则添加。

- [ ] **Step 13: 删除旧的浏览器测试配置**

```bash
rm packages/vue/vitest.config.browser.chrome.ts \
   packages/vue/vitest.config.browser.firefox.ts
```

注意：上一步刚创建的 `packages/vue/vitest.config.browser.ts` 不要误删。

- [ ] **Step 14: 验证 vue 类型检查、构建与测试**

```bash
cd packages/vue
pnpm run typecheck
pnpm run build
pnpm exec playwright install --with-deps chromium firefox
pnpm run test
```

预期：类型检查无错误；构建产物生成；Chromium 与 Firefox 浏览器实例并行运行，全部通过，且覆盖率各项均为 100%。

---

### Task 8: `@defjs/opentelemetry-server` 构建迁移到 tsdown

**Files:**

- Create: `packages/opentelemetry-server/test/setup.ts`（从 `test-setup.ts` 移动并调整路径）
- Create: `packages/opentelemetry-server/test/shared.ts`
- Create: `packages/opentelemetry-server/tsdown.config.ts`
- Create: `packages/opentelemetry-server/tsconfig.build.json`
- Modify: `packages/opentelemetry-server/vitest.config.node.ts`
- Delete: `packages/opentelemetry-server/scripts/build.ts`
- Delete: `packages/opentelemetry-server/test-setup.ts`
- Delete: `packages/opentelemetry-server/vitest.config.typecheck.ts`
- Modify: `packages/opentelemetry-server/package.json`
- Modify: `packages/opentelemetry-server/tsconfig.json`

- [ ] **Step 1: 创建 `packages/opentelemetry-server/test/` 目录并迁移测试基础设施文件**

```bash
mkdir -p packages/opentelemetry-server/test
```

迁移文件：

```bash
git mv packages/opentelemetry-server/test-setup.ts packages/opentelemetry-server/test/setup.ts
```

删除旧的 Vitest typecheck 配置（类型检查统一由 `tsgo` 负责）：

```bash
rm packages/opentelemetry-server/vitest.config.typecheck.ts
```

- [ ] **Step 2: 创建 `packages/opentelemetry-server/test/shared.ts`**

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(fileURLToPath(import.meta.url))
export const globalSetupPath = resolve(packageRoot, 'setup.ts')
export const coverageConfig = {
  enabled: true,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

- [ ] **Step 3: 修改 `packages/opentelemetry-server/vitest.config.node.ts`**

完整替换为：

```ts
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath } from './test/shared'

export default defineConfig({
  test: {
    name: 'opentelemetry-server-node',
    globals: true,
    include: ['src/**/*.spec.ts', 'e2e.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      ...coverageConfig,
    },
  },
})
```

- [ ] **Step 4: 修改 `packages/opentelemetry-server/tsconfig.json` 覆盖所有 TS 文件**

完整替换为：

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext", "DOM", "DOM.Iterable"],
    "types": ["@types/node", "vitest/globals"],
    "isolatedModules": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noPropertyAccessFromIndexSignature": true
  },
  "include": ["src/**/*", "test/**/*.ts", "e2e.spec.ts", "scripts/**/*.ts"]
}
```

说明：`tsgo` 类型检查覆盖源码、测试辅助文件、`e2e.spec.ts` 与构建脚本，没有例外。注意 `types` 从 `@types/bun` 改为 `@types/node`。

- [ ] **Step 5: 创建 `packages/opentelemetry-server/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": []
  },
  "include": ["src/**/*.ts"],
  "exclude": ["test", "scripts", "src/**/*.spec.ts", "src/**/*.type.test.ts", "e2e.spec.ts"]
}
```

- [ ] **Step 6: 创建 `packages/opentelemetry-server/tsdown.config.ts`**

```ts
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg = JSON.parse(raw) as Record<string, unknown>

  delete pkg.devDependencies
  delete pkg.scripts

  pkg.module = 'index.js'
  pkg.typings = 'index.d.ts'
  pkg.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(`${outDir}/package.json`, JSON.stringify(pkg, undefined, 2))
}

export default defineConfig([
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: false,
    clean: true,
    minify: true,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    external: ['@defjs/core', '@opentelemetry/api', '@opentelemetry/core'],
    outExtensions: () => ({ js: '.min.js' }),
  },
  {
    entry: ['./src/index.ts'],
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    dts: true,
    clean: false,
    minify: false,
    sourcemap: false,
    tsconfig: './tsconfig.build.json',
    external: ['@defjs/core', '@opentelemetry/api', '@opentelemetry/core'],
    copy: ['../../LICENSE', './README.md'],
    hooks: {
      async 'build:done'({ options }) {
        await rewritePackageJson(options.outDir)
      },
    },
  },
])
```

- [ ] **Step 7: 删除 `packages/opentelemetry-server/scripts/build.ts`**

```bash
rm packages/opentelemetry-server/scripts/build.ts
```

- [ ] **Step 8: 修改 `packages/opentelemetry-server/package.json` 的 `build` 脚本**

将：

```json
"build": "tsx scripts/build.ts",
```

改为：

```json
"build": "tsdown",
```

确认 `devDependencies` 中已声明 `"tsdown": "catalog:"`；若缺失则添加。

- [ ] **Step 9: 添加 `typecheck` 脚本并确认依赖**

在 `packages/opentelemetry-server/package.json` 的 `scripts` 中添加：

```json
"typecheck": "tsgo --project tsconfig.json --noEmit"
```

确认 `devDependencies` 中包含：

```json
{
  "@typescript/native-preview": "catalog:",
  "@vitest/coverage-istanbul": "catalog:"
}
```

若缺失则添加。

- [ ] **Step 10: 验证 opentelemetry-server 类型检查、构建与测试**

```bash
cd packages/opentelemetry-server
pnpm run typecheck
pnpm run build
pnpm run test
```

预期：类型检查无错误；`dist/index.js`、`dist/index.min.js`、`dist/index.d.ts` 生成；测试通过且覆盖率各项均为 100%。

---

### Task 9: 统一 workspace 依赖协议与脚本

**Files:**

- Modify: `packages/core/package.json`
- Modify: `packages/angular/package.json`
- Modify: `packages/vue/package.json`
- Modify: `packages/opentelemetry-server/package.json`

- [ ] **Step 1: 统一 workspace 内部依赖协议**

检查所有子包 `package.json`：

- 每个子包 `engines.node` 设置为 `">=26"`，与根项目保持一致。
- 添加 `publishConfig.directory: "dist"`，让 `pnpm changeset publish` 自动发布 `dist` 产物。
- 对 `@defjs/core` 的依赖（`dependencies` / `peerDependencies`）使用 `workspace:^`。
- 对 `@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server` 等同源包依赖使用 `workspace:^`。
- 不要在子包里写死版本号（如 `"@defjs/core": "^0.0.0"`）。

示例：

```json
"peerDependencies": {
  "@defjs/core": "workspace:^"
},
"publishConfig": {
  "directory": "dist"
}
```

- [ ] **Step 2: 统一共享 devDependencies 使用 `catalog:`**

各子包只声明自己实际使用的 devDependencies，版本统一写 `catalog:`：

| 包                              | 应声明的 devDependencies（按需）                                                                                                              |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core`                 | `@typescript/native-preview`、`@vitest/browser`、`@vitest/browser-playwright`、`@vitest/coverage-istanbul`、`hono`、`playwright`、`vitest` 等 |
| `packages/vue`                  | 同上（去掉 `hono`，除非测试服务器需要）                                                                                                       |
| `packages/angular`              | `@typescript/native-preview`、`tsdown`、`tsx`、`typescript` 等                                                                                |
| `packages/opentelemetry-server` | `@typescript/native-preview`、`@vitest/coverage-istanbul`、`vitest`、`@hono/node-server`、`@hono/node-ws` 等                                  |

根 `package.json` 只保留运行根脚本所需的 devDependencies（如 `biome`、`typescript`）。

- [ ] **Step 3: 检查 `.npmrc` 与 `pnpm-workspace.yaml` 生效**

```bash
pnpm install
```

确认：

- `pnpm-lock.yaml` 生成，无冲突。
- 子包中 `catalog:` 被解析为 `pnpm-workspace.yaml` 中对应版本。
- `workspace:^` 被解析为本地包路径。

- [ ] **Step 4: 运行递归类型检查**

```bash
pnpm run typecheck
```

预期：所有包 `typecheck` 通过。

- [ ] **Step 5: 运行递归构建**

```bash
pnpm run build
```

预期：所有包构建成功。

---

### Task 10: CI / Release 规范化迁移

**Files:**

- Create: `.github/actions/setup-pnpm-deps/action.yml`
- Create: `.github/workflows/_checks.yml`
- Create: `.github/dependabot.yml`
- Delete: `.github/actions/setup-bun-deps/action.yml`
- Modify: `.github/workflows/ci.yml`
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: 创建 `.github/actions/setup-pnpm-deps/action.yml`**

```yaml
name: Setup pnpm dependencies
description: Install Node, pnpm, restore pnpm cache, and install dependencies
runs:
  using: composite
  steps:
    - uses: pnpm/action-setup@v4
      with:
        version: 11.6.0
        run_install: false
    - uses: actions/setup-node@v4
      with:
        node-version: 26
        cache: 'pnpm'
    - shell: bash
      run: pnpm install --frozen-lockfile
    - name: Print toolchain versions
      shell: bash
      run: |
        echo "node: $(node --version)"
        echo "pnpm: $(pnpm --version)"
        echo "tsgo: $(pnpm exec tsgo --version 2>/dev/null || echo 'not available')"
        echo "playwright: $(pnpm exec playwright --version 2>/dev/null || echo 'not available')"
```

说明：

- 使用 `actions/setup-node` 的 `cache: 'pnpm'` 自动基于 `pnpm-lock.yaml` 缓存 pnpm store，比手动 `actions/cache` 更稳定。
- 最后一步打印 Node / pnpm / tsgo / Playwright 版本，便于 CI 排错（对应规范化项 #12）。

- [ ] **Step 2: 创建 changesets 配置**

创建 `.changeset/config.json`：

```json
{
  "$schema": "https://unpkg.com/@changesets/config@2.31.0/schema.json",
  "changelog": ["@changesets/changelog-github", { "repo": "defjs/defjs" }],
  "commit": false,
  "fixed": [],
  "linked": [],
  "access": "public",
  "baseBranch": "main",
  "updateInternalDependencies": "minor",
  "ignore": []
}
```

创建 `.changeset/README.md`：

````md
# Changesets

每次提交会影响发布的代码变更时，请运行：

```bash
pnpm run changeset
```
````

按提示选择受影响的包、填写变更说明、选择 bump 类型（patch / minor / major）。

生成的 `.changeset/*.md` 文件请随 PR 一起提交。合并后，changesets bot 会自动创建 Version Packages PR。

````

说明：
- `updateInternalDependencies: "minor"` 表示只有当依赖包的变更达到 minor 或 major 时，才会 cascade bump 依赖它的子包；patch 级别变更不会触发子包重发。
- `access: "public"` 表示发布的 scoped 包（`@defjs/*`）为 public。
- `changelog` 使用 `@changesets/changelog-github`，自动在 changelog 中关联 PR 链接。

- [ ] **Step 3: 创建可复用工作流 `.github/workflows/_checks.yml`**

CI 与 Release 共用同一套检查逻辑，避免重复配置（对应规范化项 #5、#8）。

```yaml
name: Checks

on:
  workflow_call:
    inputs:
      package:
        description: 'Package to run checks for (empty = all packages)'
        required: false
        type: string
        default: ''

jobs:
  lockfile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm-deps
      - name: Check lockfile health
        run: pnpm dedupe --check

  quality:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      matrix:
        task: [lint, typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm-deps
      - name: ${{ matrix.task }}
        run: |
          if [ -n "${{ inputs.package }}" ]; then
            pnpm --filter @defjs/${{ inputs.package }} run ${{ matrix.task }}
          else
            pnpm run ${{ matrix.task }}
          fi

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm-deps
      - name: Get Playwright version
        id: playwright-version
        shell: bash
        run: echo "version=$(pnpm exec playwright --version | awk '{print $2}')" >> "$GITHUB_OUTPUT"
      - name: Cache Playwright browsers
        uses: actions/cache@v4
        with:
          path: ~/.cache/ms-playwright
          key: playwright-${{ runner.os }}-${{ steps.playwright-version.outputs.version }}
      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium firefox
      - name: Test
        run: |
          if [ -n "${{ inputs.package }}" ]; then
            pnpm --filter @defjs/${{ inputs.package }} run test
          else
            pnpm run test
          fi

  build:
    needs: [lockfile, quality, test]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: ./.github/actions/setup-pnpm-deps
      - name: Build
        run: |
          if [ -n "${{ inputs.package }}" ]; then
            pnpm --filter @defjs/${{ inputs.package }} run build
          else
            pnpm run build
          fi
````

说明：

- `lockfile` job 运行 `pnpm dedupe --check`，防止 lockfile 中出现重复依赖（对应规范化项 #4）。
- `test` job 缓存 `~/.cache/ms-playwright`，显著减少浏览器重复下载（对应规范化项 #3）。
- 覆盖率仍通过 Vitest `thresholds: 100%` 在 CI 内强制检查，未达标时 `test` job 直接失败。

- [ ] **Step 4: 重写 `.github/workflows/ci.yml`（PR / push 通用 CI）**

完整替换为：

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:

concurrency:
  group: ${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true

jobs:
  changes:
    runs-on: ubuntu-latest
    outputs:
      any: ${{ steps.filter.outputs.any }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            any:
              - '**'
              - '!**.md'
              - '!docs/**'
              - '!**/*.drawio'
              - '!LICENSE'

  checks:
    needs: changes
    if: ${{ needs.changes.outputs.any == 'true' }}
    uses: ./.github/workflows/_checks.yml
    secrets: inherit

  dependency-review:
    needs: changes
    if: ${{ github.event_name == 'pull_request' && needs.changes.outputs.any == 'true' }}
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          fail-on-severity: moderate
```

说明：

- 路径过滤使用 `any: ['**', '!**.md', ...]`，避免新增配置文件时漏触发 CI（对应规范化项 #14）。
- 复用 `_checks.yml`，与 Release 流程共用同一套检查逻辑（对应规范化项 #5）。
- PR 中启用 `dependency-review-action`，拦截存在高危漏洞的新增依赖（对应规范化项 #10）。

- [ ] **Step 5: 重写 `.github/workflows/release.yml`（基于 changesets 自动发包）**

完整替换为：

```yaml
name: Release

on:
  push:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: release-${{ github.ref }}
  cancel-in-progress: false

jobs:
  release:
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    permissions:
      contents: write
      id-token: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: ./.github/actions/setup-pnpm-deps

      - name: Create Release Pull Request or Publish to npm
        uses: changesets/action@v1
        with:
          publish: pnpm run build && pnpm changeset publish --provenance
          commit: 'chore: version packages'
          title: 'chore: version packages'
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_CONFIG_TOKEN: ${{ secrets.NPM_TOKEN }}
```

说明：

- `changesets/action` 会自动处理两件事：
  1. 存在未消费的 changeset 时，自动创建/更新 `chore: version packages` PR。
  2. 当 Version Packages PR 被合并（即没有 pending changeset 且版本号已 bump）时，自动执行 `pnpm changeset publish --provenance` 发布所有版本号变化的包。
- `updateInternalDependencies: "minor"` 已配置，patch 级别的 `core` 变更不会强制子包 cascade bump；minor/major 才会。
- `--provenance` 生成 npm 可验证的构建来源声明；若 registry 不支持可移除。
- `permissions.contents: write` 用于推送 git tag，`pull-requests: write` 用于创建 Version Packages PR。

- [ ] **Step 6: 创建 `.github/dependabot.yml`**

```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
    open-pull-requests-limit: 10
    versioning-strategy: increase-if-necessary
    groups:
      dev-dependencies:
        patterns:
          - '*'
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: monthly
```

说明：启用 Dependabot 自动提交依赖更新 PR，减少人工跟进（对应规范化项 #10）。

- [ ] **Step 7: 删除旧的 Bun setup action**

```bash
rm -rf .github/actions/setup-bun-deps
```

- [ ] **Step 8: 本地验证 workflow 文件格式**

```bash
pnpm exec actionlint .github/workflows/*.yml || true
```

预期：无语法错误（若未安装 `actionlint` 可跳过）。

---

### Task 11: 验证、风险与回滚

- [ ] **Step 1: 全量本地验证**

```bash
pnpm install
pnpm run lint
pnpm run typecheck
pnpm exec playwright install --with-deps chromium firefox
pnpm run test
pnpm run build
```

预期：`test` 一条命令即可并行运行所有 Node 与浏览器项目；覆盖率报告输出且 lines/branches/functions/statements 均达到 100%；全部命令退出码为 0。

- [ ] **Step 2: 产物 diff 检查**

对比迁移前后每个 `dist` 目录：

- `dist/index.js` / `dist/index.min.js` / `dist/index.d.ts` 存在。
- `dist/package.json` 中无 `devDependencies` 与 `scripts`。

```bash
cd packages/core
cat dist/package.json
```

- [ ] **Step 3: 处理已知风险**

| 风险                                                                   | 缓解措施                                                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `tsgo` 为预览版，部分 `tsconfig` 选项或声明输出可能与 `tsc` 不一致     | 类型检查链路只使用 `tsgo`；若报错，优先调整 `tsconfig.json` 或源码适配，不保留 `tsc` 后备             |
| `tsdown` 的 `copy` 或 `hooks.build:done` 行为与预期不符                | 先在本地单包验证；必要时把 `copy` 改为 `hooks.build:done` 内手动复制                                  |
| Playwright 浏览器下载在 CI 中耗时                                      | 单条 `pnpm run test` 前先 `playwright install --with-deps chromium firefox`；不缓存浏览器二进制       |
| pnpm workspace 中 `@defjs/core` peerDependency 通过 `workspace:^` 解析 | `.npmrc` 开启 `auto-install-peers=true`；发布时 pnpm 自动转换协议                                     |
| 某些 source 依赖 `Bun` 全局                                            | 已移除；若后续发现残留，直接替换为 Node.js 等价 API，不再保留 Bun 兼容                                |
| Vitest 多个 project 并发时 `test/setup.ts` 的模块级单例可能冲突        | 已将 XSRF 逻辑改为无状态的 Hono 中间件；若 `testServer` 端口冲突，将 global setup 改为按 project 隔离 |

- [ ] **Step 4: 切换原则（保持 Node/pnpm 架构）**

本次迁移为**全新架构切换**，不保留 Bun 旧流程作为后备：

- `bun.lock`、`bunfig.toml`、`.github/actions/setup-bun-deps` 等旧文件直接删除，不保留可恢复副本。
- 若迁移后主分支出现不稳定，策略是**在 pnpm + Node + tsdown + Playwright + tsgo 新架构内修复**，而不是切回 Bun。
- 紧急情况下可通过 Git revert 回滚本次迁移的 PR/提交，但回滚后的代码基线仍是新架构（只是回到迁移前的状态）。
- 所有 CI、构建、测试、发布脚本均以新架构为唯一事实来源。

- [ ] **Step 5: 提交与 PR**

建议分阶段提交：

1. `chore: migrate root to pnpm workspace`
2. `chore(core): migrate build and tests to tsdown + playwright`
3. `chore(vue,angular,opentelemetry): migrate builds to tsdown`
4. `chore(ci): switch workflows to pnpm + playwright + tsgo`

---

## 附录：关键外部参考

- [pnpm Workspaces](https://pnpm.io/workspaces)
- [tsdown GitHub](https://github.com/nicepkg/tsdown)
- [Vitest Browser Mode - Playwright Provider](https://vitest.dev/config/browser/provider.html)
- [TypeScript Go / @typescript/native-preview](https://github.com/microsoft/typescript-go)
