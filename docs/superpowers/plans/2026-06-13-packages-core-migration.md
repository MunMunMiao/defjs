# packages/core Migration to pnpm + tsdown + browser-playwright + tsgo

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Bun scripts with pnpm scripts, replace Bun.build + bun-plugin-dts with tsdown, replace @vitest/browser-webdriverio with @vitest/browser-playwright, and adopt @typescript/native-preview (tsgo) as the TypeScript compiler in packages/core.

**Architecture:** The migration is a build/test toolchain swap with no source code changes. tsdown replaces Bun.build for bundling + dts generation. pnpm scripts replace `bun` invocations. Playwright replaces WebdriverIO for browser tests. tsgo replaces `tsc` for type-checking.

**Tech Stack:** pnpm workspaces, tsdown, @vitest/browser-playwright, @typescript/native-preview (tsgo), rolldown-plugin-dts

---

## File Structure

| File                               | Responsibility                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `package.json`                     | Scripts, dependencies, publish config                                             |
| `tsconfig.json`                    | TypeScript compiler options (used by tsdown + tsgo)                               |
| `tsconfig.build.json`              | Build-only tsconfig (excludes tests)                                              |
| `tsconfig.typecheck.json`          | Type-check-only tsconfig for `.type.test.ts` files                                |
| `tsdown.config.ts`                 | tsdown bundler configuration (entry, formats, dts, minify)                        |
| `vitest.config.ts`                 | Root Vitest workspace config (projects: node + browser)                           |
| `vitest.config.node.ts`            | Node test config (threads pool, coverage)                                         |
| `vitest.config.browser.ts`         | Browser test config (Playwright provider, chrome + firefox)                       |
| `vitest.config.browser.chrome.ts`  | Standalone Chrome browser test config                                             |
| `vitest.config.browser.firefox.ts` | Standalone Firefox browser test config                                            |
| `vitest.config.browser.safari.ts`  | Standalone Safari browser test config                                             |
| `vitest.config.bun.ts`             | Bun runtime test config (kept for Bun-specific tests)                             |
| `vitest.config.deno.ts`            | Deno runtime test config (kept for Deno-specific tests)                           |
| `vitest.config.typecheck.ts`       | Type-check test config (uses tsgo for type checking)                              |
| `vitest.shared.ts`                 | Shared constants (packageRoot, globalSetupPath, coverageConfig, runtime patterns) |
| `vitest-xsrf-proxy-plugin.ts`      | Vite dev-server proxy plugin for XSRF test endpoints                              |
| `test-setup.ts`                    | Vitest globalSetup — Hono test server with WebSocket + SSE endpoints              |
| `scripts/build.ts`                 | **DELETE** — replaced by tsdown CLI                                               |
| `biome.json`                       | Biome lint config (extends root, minor update for globals)                        |

---

## Task 1: Update Root package.json for pnpm Workspaces

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/package.json`

- [ ] **Step 1: Replace `packageManager` and `workspaces` with pnpm fields**

```json
{
  "name": "defjs",
  "version": "0.0.0",
  "type": "module",
  "packageManager": "pnpm@10.0.0",
  "engines": {
    "node": ">=22.0.0",
    "pnpm": ">=10.0.0"
  },
  "devDependencies": {
    "@biomejs/biome": "2.4.16",
    "@hono/node-server": "^2.0.4",
    "@hono/node-ws": "^1.3.1",
    "@types/bun": "^1.3.14",
    "@typescript/native-preview": "^7.0.0-dev.20260612.1",
    "@vitest/browser": "^4.1.8",
    "@vitest/browser-playwright": "^4.1.8",
    "@vitest/browser-webdriverio": "^4.1.8",
    "@vitest/coverage-istanbul": "^4.1.8",
    "@vitest/coverage-v8": "^4.1.8",
    "@vitest/ui": "^4.1.8",
    "bun-plugin-dts": "^0.4.0",
    "chromedriver": "^149.0.2",
    "geckodriver": "^6.1.0",
    "hono": "^4.12.23",
    "playwright": "^1.52.0",
    "tsdown": "^0.22.2",
    "typescript": "^6.0.3",
    "vite": "^8.0.16",
    "vite-plugin-dts": "^5.0.2",
    "vitest": "^4.1.8",
    "webdriverio": "^9.27.2"
  },
  "scripts": {
    "build": "pnpm -r run build",
    "lint": "biome check .",
    "lint:fix": "biome check . --write",
    "test:bun": "pnpm -r --if-present run test:bun",
    "test:chrome": "pnpm -r --if-present run test:chrome",
    "test:firefox": "pnpm -r --if-present run test:firefox",
    "typecheck": "pnpm -r run typecheck"
  }
}
```

**Notes:**

- Remove `workspaces` array — pnpm uses `pnpm-workspace.yaml` instead.
- Add `playwright` to devDependencies (required by `@vitest/browser-playwright`).
- Add `tsdown` to devDependencies.
- Add `@typescript/native-preview` to devDependencies.
- Keep `@vitest/browser-webdriverio` temporarily until all packages migrate; remove after.
- Keep `bun-plugin-dts` temporarily until all packages migrate; remove after.

- [ ] **Step 2: Create pnpm-workspace.yaml**

Create: `/Users/munmunmiao/Documents/web/zen-kit/pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 3: Verify root scripts**

Run: `pnpm install` (from root)
Expected: Lockfile created, dependencies installed.

---

## Task 2: Update packages/core/package.json

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json`

- [ ] **Step 1: Replace Bun scripts with pnpm scripts**

```json
{
  "name": "@defjs/core",
  "version": "0.4.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "module": "src/index.ts",
  "typings": "src/index.ts",
  "license": "MIT",
  "publishConfig": {
    "directory": "dist"
  },
  "repository": {
    "type": "git",
    "url": "git+https://github.com/defjs/defjs.git"
  },
  "bugs": {
    "url": "https://github.com/defjs/defjs/issues"
  },
  "scripts": {
    "build": "tsdown",
    "lint": "biome check",
    "lint:fix": "biome check --write",
    "pub": "pnpm publish dist",
    "test": "vitest run --config vitest.config.ts",
    "test:bun": "vitest run --config vitest.config.bun.ts",
    "test:chrome": "vitest run --config vitest.config.browser.chrome.ts",
    "test:firefox": "vitest run --config vitest.config.browser.firefox.ts",
    "test:safari": "vitest run --config vitest.config.browser.safari.ts",
    "typecheck": "tsgo -p tsconfig.json --noEmit"
  }
}
```

**Notes:**

- `build` now calls `tsdown` (reads `tsdown.config.ts` by default).
- `pub` uses `pnpm publish` instead of `bun publish`.
- `test` uses `vitest run` directly (no `bun x` wrapper).
- `typecheck` uses `tsgo` instead of `tsc`.
- Add `test:bun`, `test:chrome`, `test:firefox`, `test:safari` for standalone runtime/browser runs.

- [ ] **Step 2: Verify package.json is valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json'))"`
Expected: No error.

---

## Task 3: Create tsdown.config.ts

**Files:**

- Create: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/tsdown.config.ts`
- Delete: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/scripts/build.ts`

- [ ] **Step 1: Write tsdown config**

```ts
import { defineConfig } from 'tsdown'

export default defineConfig([
  {
    entry: './src/index.ts',
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    minify: false,
    dts: true,
    tsconfig: './tsconfig.build.json',
    clean: true,
    sourcemap: false,
  },
  {
    entry: './src/index.ts',
    outDir: './dist',
    format: 'esm',
    platform: 'browser',
    target: 'esnext',
    minify: true,
    dts: false,
    tsconfig: './tsconfig.build.json',
    clean: false,
    sourcemap: false,
    outExtensions: { js: '.min.js' },
  },
])
```

**Notes:**

- First config: unminified ESM + `.d.ts` generation. `clean: true` wipes `dist/` before build.
- Second config: minified ESM only (no dts). `clean: false` preserves first build output. `outExtensions` forces `.min.js` suffix.
- `tsconfig: './tsconfig.build.json'` ensures test files are excluded from the build.
- tsdown auto-detects `types`/`typings` in `package.json` and enables dts by default; we set `dts: true` explicitly for clarity.

- [ ] **Step 2: Delete old Bun build script**

Delete: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/scripts/build.ts`

If `scripts/` directory is empty after deletion, delete the directory too.

- [ ] **Step 3: Test tsdown build**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm build`
Expected:

- `dist/index.js` exists (unminified).
- `dist/index.d.ts` exists (declarations).
- `dist/index.min.js` exists (minified).
- No `dist/LICENSE` or `dist/README.md` yet (we handle those in Task 4).

---

## Task 4: Post-build File Copying (package.json, LICENSE, README)

**Files:**

- Create: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/scripts/post-build.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json` (scripts)

The old `scripts/build.ts` copied `LICENSE` and `README.md` into `dist/`, and rewrote `package.json` for publishing. tsdown does not do this automatically. We add a small post-build script.

- [ ] **Step 1: Write post-build script**

```ts
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

async function main() {
  const rootDir = resolve(import.meta.dirname, '..')
  const distDir = resolve(rootDir, 'dist')

  // Copy LICENSE from repo root
  await copyFile(resolve(rootDir, '../../LICENSE'), resolve(distDir, 'LICENSE'))

  // Copy README from package
  await copyFile(resolve(rootDir, 'README.md'), resolve(distDir, 'README.md'))

  // Rewrite package.json for publishing
  const pkgJson = JSON.parse(await readFile(resolve(rootDir, 'package.json'), 'utf-8'))
  delete pkgJson.devDependencies
  delete pkgJson.scripts
  pkgJson.module = 'index.js'
  pkgJson.typings = 'index.d.ts'
  pkgJson.exports = {
    './package.json': './package.json',
    '.': {
      types: './index.d.ts',
      default: './index.js',
    },
  }

  await writeFile(resolve(distDir, 'package.json'), JSON.stringify(pkgJson, undefined, 2))
}

await main()
```

- [ ] **Step 2: Update build script to run post-build**

In `/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json`:

```json
"scripts": {
  "build": "tsdown && tsx scripts/post-build.ts",
  ...
}
```

**Note:** `tsx` is needed to run `.ts` scripts under Node. Add `tsx` to root devDependencies if not already present. Alternatively, use `node --import tsx` or compile to `.mjs`. Since the project already uses `type: "module"`, `tsx` is the simplest choice.

- [ ] **Step 3: Verify post-build artifacts**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm build`
Expected:

- `dist/index.js` exists.
- `dist/index.d.ts` exists.
- `dist/index.min.js` exists.
- `dist/LICENSE` exists.
- `dist/README.md` exists.
- `dist/package.json` exists with `module: "index.js"`, `typings: "index.d.ts"`, and `exports` field.

---

## Task 5: Migrate Browser Test Configs to Playwright

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.browser.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.browser.chrome.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.browser.firefox.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.browser.safari.ts`

- [ ] **Step 1: Rewrite vitest.config.browser.ts**

```ts
import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'
import { xsrfProxyPlugin } from './vitest-xsrf-proxy-plugin'

export default defineConfig({
  root: packageRoot,
  plugins: [xsrfProxyPlugin()],
  test: {
    name: 'core-browser',
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [
        {
          name: 'chrome',
          browser: 'chromium',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
        },
        {
          name: 'firefox',
          browser: 'firefox',
          include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
        },
      ],
    },
  },
})
```

**Notes:**

- Replace `import { webdriverio } from '@vitest/browser-webdriverio'` with `import { playwright } from '@vitest/browser-playwright'`.
- Replace `provider: webdriverio()` with `provider: playwright()`.
- Replace `browser: 'chrome'` with `browser: 'chromium'` (Playwright naming).
- Remove `chromedriverBinary` and all `wdio:chromedriverOptions` capabilities — Playwright manages its own browsers.
- Per-instance `provider` override is removed; top-level `playwright()` is sufficient.
- `include` stays on each instance to filter spec files.

- [ ] **Step 2: Rewrite vitest.config.browser.chrome.ts**

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'
import { xsrfProxyPlugin } from './vitest-xsrf-proxy-plugin'

export default defineConfig({
  root: packageRoot,
  plugins: [xsrfProxyPlugin()],
  test: {
    name: 'core-browser-chrome',
    include: ['src/**/*.browser.spec.ts', 'src/**/*.chrome.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'chromium' }],
    },
  },
})
```

- [ ] **Step 3: Rewrite vitest.config.browser.firefox.ts**

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'
import { xsrfProxyPlugin } from './vitest-xsrf-proxy-plugin'

export default defineConfig({
  root: packageRoot,
  plugins: [xsrfProxyPlugin()],
  test: {
    name: 'core-browser-firefox',
    include: ['src/**/*.browser.spec.ts', 'src/**/*.firefox.spec.ts'],
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: true,
      screenshotFailures: false,
      instances: [{ browser: 'firefox' }],
    },
  },
})
```

- [ ] **Step 4: Rewrite vitest.config.browser.safari.ts**

```ts
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './vitest.shared'
import { xsrfProxyPlugin } from './vitest-xsrf-proxy-plugin'

export default defineConfig({
  root: packageRoot,
  plugins: [xsrfProxyPlugin()],
  test: {
    name: 'core-browser-safari',
    include: ['src/**/*.browser.spec.ts', 'src/**/*.safari.spec.ts'],
    globalSetup: globalSetupPath,
    maxWorkers: 1,
    fileParallelism: false,
    coverage: {
      enabled: false,
    },
    browser: {
      enabled: true,
      provider: playwright(),
      connectTimeout: 120_000,
      headless: false,
      screenshotFailures: false,
      instances: [{ browser: 'webkit' }],
    },
  },
})
```

**Note:** Safari uses `webkit` in Playwright. Keep `headless: false` because WebKit on some platforms requires a display.

- [ ] **Step 5: Verify browser tests run**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm test:chrome`
Expected: Playwright installs Chromium, tests execute, results reported.

---

## Task 6: Update Type-check Config to Use tsgo

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.typecheck.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json` (typecheck script)

- [ ] **Step 1: Update vitest.config.typecheck.ts**

```ts
import { defineConfig } from 'vitest/config'
import { packageRoot } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-typecheck',
    include: [],
    coverage: {
      enabled: false,
    },
    typecheck: {
      checker: 'tsgo',
      enabled: true,
      include: ['src/**/*.type.test.ts'],
      only: true,
      tsconfig: './tsconfig.typecheck.json',
    },
  },
})
```

**Note:** Vitest's `typecheck.checker` accepts `'tsc' | 'tsgo' | 'custom'`. Setting it to `'tsgo'` tells Vitest to invoke the native-preview binary for type-checking tests.

- [ ] **Step 2: Confirm package.json typecheck script**

Already updated in Task 2:

```json
"typecheck": "tsgo -p tsconfig.json --noEmit"
```

- [ ] **Step 3: Verify typecheck**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm typecheck`
Expected: tsgo runs, type errors reported if any, exits 0 on success.

---

## Task 7: Update Node and Bun/Deno Test Configs

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.node.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.bun.ts`
- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/vitest.config.deno.ts`

These configs do not reference Bun or WebdriverIO directly, but we update them to ensure consistency.

- [ ] **Step 1: Update vitest.config.node.ts**

```ts
import { defineConfig } from 'vitest/config'
import { coverageConfig, globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

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

No functional changes needed; confirm file is unchanged from original.

- [ ] **Step 2: Update vitest.config.bun.ts**

```ts
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-bun',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter((pattern) => pattern !== 'src/**/*.bun.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
```

No functional changes needed; confirm file is unchanged from original.

- [ ] **Step 3: Update vitest.config.deno.ts**

```ts
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot, runtimeSpecificSpecPatterns } from './vitest.shared'

export default defineConfig({
  root: packageRoot,
  test: {
    name: 'core-deno',
    include: ['src/**/*.spec.ts'],
    exclude: runtimeSpecificSpecPatterns.filter((pattern) => pattern !== 'src/**/*.deno.spec.ts'),
    globalSetup: globalSetupPath,
    coverage: {
      enabled: false,
    },
  },
})
```

No functional changes needed; confirm file is unchanged from original.

- [ ] **Step 4: Verify node tests run**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm test`
Expected: Node + browser projects execute, all tests pass.

---

## Task 8: Update tsconfig.json for tsgo Compatibility

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/packages/core/tsconfig.json`

tsgo is a preview and may not support all TypeScript 6.0 options. We keep the config conservative.

- [ ] **Step 1: Review and update tsconfig.json**

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
  "include": ["src/**/*.ts", "test-setup.ts"]
}
```

**Notes:**

- No changes required for tsgo compatibility at this stage. tsgo aims to be a drop-in replacement for tsc.
- If tsgo reports unsupported options, remove them iteratively.
- `isolatedModules: true` is recommended for tsdown dts performance (uses oxc-transform).

- [ ] **Step 2: Verify tsgo can parse tsconfig**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && npx tsgo -p tsconfig.json --noEmit`
Expected: tsgo parses config and type-checks without crashing.

---

## Task 9: Update biome.json Globals

**Files:**

- Modify: `/Users/munmunmiao/Documents/web/zen-kit/biome.json`

The root biome.json declares `Bun` as a global. Under pnpm + Node, `Bun` is no longer available. We remove it.

- [ ] **Step 1: Remove Bun global from root biome.json**

In `/Users/munmunmiao/Documents/web/zen-kit/biome.json`, find:

```json
"javascript": {
  "globals": ["Bun"],
  ...
}
```

Replace with:

```json
"javascript": {
  "globals": [],
  ...
}
```

Or remove the `globals` array entirely if no other globals are needed.

- [ ] **Step 2: Verify lint passes**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm lint`
Expected: No errors.

---

## Task 10: Final Verification

**Files:**

- All modified files in packages/core

- [ ] **Step 1: Run full test suite**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm test`
Expected: All node + browser tests pass.

- [ ] **Step 2: Run typecheck**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm typecheck`
Expected: No type errors.

- [ ] **Step 3: Run build**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm build`
Expected:

- `dist/index.js` (unminified ESM)
- `dist/index.d.ts` (declarations)
- `dist/index.min.js` (minified ESM)
- `dist/package.json` (publish-ready)
- `dist/LICENSE`
- `dist/README.md`

- [ ] **Step 4: Run lint**

Run: `cd /Users/munmunmiao/Documents/web/zen-kit/packages/core && pnpm lint`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(core): migrate to pnpm + tsdown + browser-playwright + tsgo

- Replace Bun scripts with pnpm scripts
- Replace Bun.build + bun-plugin-dts with tsdown
- Replace @vitest/browser-webdriverio with @vitest/browser-playwright
- Adopt @typescript/native-preview (tsgo) as TypeScript compiler
- Add tsdown.config.ts for bundling configuration
- Add post-build script for dist packaging"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - [x] Bun scripts replaced with pnpm scripts — Task 2
   - [x] Bun.build + bun-plugin-dts replaced with tsdown — Task 3
   - [x] @vitest/browser-webdriverio replaced with @vitest/browser-playwright — Task 5
   - [x] tsgo adopted as TypeScript compiler — Task 6 + Task 8
   - [x] Exact file changes listed — File Structure section + each task
   - [x] Verification steps included — Every task has verification

2. **Placeholder scan:**
   - [x] No "TBD", "TODO", "implement later"
   - [x] No vague "add appropriate error handling"
   - [x] No "Similar to Task N" references
   - [x] All code blocks contain actual code
   - [x] All commands have expected output

3. **Type consistency:**
   - [x] `playwright()` used consistently across all browser configs
   - [x] `browser: 'chromium'` used instead of `'chrome'` in Playwright configs
   - [x] `browser: 'webkit'` used for Safari
   - [x] `tsdown.config.ts` uses `defineConfig` from `tsdown`
   - [x] `package.json` scripts use `pnpm` consistently

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-13-packages-core-migration.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach would you prefer?
