# VitePress Twoslash Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `doc/` VitePress 文档站点接入 Shiki Twoslash，让内联 TypeScript 示例进入真实类型检查，并让 docs 的 typecheck、test、build 进入 CI。

**Architecture:** VitePress 渲染层使用 `@shikijs/vitepress-twoslash` 处理 `typescript twoslash` / `vue twoslash` 代码块；CI 层使用 `twoslash` / `twoslash-vue` 直接扫描 Markdown 中的 Twoslash 代码块并把非预期 error 诊断转成失败。Markdown 解析、Twoslash 检查、CLI 输出分成三个小模块，便于单元测试。

**Tech Stack:** VitePress `2.0.0-alpha.17`、Vue `^3.5.38`、`@shikijs/vitepress-twoslash ^4.2.0`、`@shikijs/twoslash ^4.2.0`、`twoslash ^0.3.8`、`twoslash-vue ^0.3.8`、TypeScript、Vitest、tsx、GitHub Actions。

## Global Constraints

- 全流程保持现有 Markdown 写作方式；不引入完整 MDX pipeline。
- `doc` 必须加入 pnpm workspace，使根 `pnpm typecheck` 和根 `pnpm test` 能覆盖文档。
- `doc/package.json` 的 `typecheck` 必须同时执行 `tsc --project tsconfig.json --noEmit` 和 Markdown Twoslash 类型检测。
- `docs:build` 保持专注 VitePress 构建，不隐式运行 `typecheck` 或 `test`。
- CI 必须包含独立 `docs` job，并执行 `pnpm --filter doc run typecheck`、`pnpm --filter doc run test`、`pnpm --filter doc run docs:build`。
- 第一阶段只迁移 root locale 的关键示例：`doc/guide/getting-started.md`、`doc/core/client.md`、`doc/plugins/vue.md`。
- 普通、不完整、故意错误但未标注预期错误的示例继续使用普通 `typescript`，不加 `twoslash`。
- Twoslash cache 目录固定为 `doc/.vitepress/cache/twoslash`，不提交到 git。
- Node 版本保持项目现状：`>=26`。

## References

- [Shiki VitePress integration](https://shiki.style/packages/vitepress) — `transformerTwoslash`、`TwoslashFloatingVue`、`createFileSystemTypesCache` 的官方用法。
- [Shiki Twoslash package](https://shiki.style/packages/twoslash) — Shiki transformer addon 与 `explicitTrigger` 选项。
- [Twoslash createTwoslasher API](https://twoslash.netlify.app/refs/api) — 批量检查时复用 TypeScript language service。
- [Twoslash result reference](https://twoslash.netlify.app/refs/result) — `TwoslashReturn.errors` / `NodeError` 结果形状。

---

## File Structure

### Create

- `doc/tsconfig.json` — docs 脚本、VitePress 配置、Twoslash examples 共用的 TypeScript 配置。
- `doc/scripts/markdown-twoslash.ts` — 递归查找 Markdown 文件并提取带 `twoslash` meta 的 code fence。
- `doc/scripts/markdown-twoslash.test.ts` — 验证 Markdown 提取逻辑。
- `doc/scripts/twoslash-check.ts` — 封装 `twoslash` / `twoslash-vue`，把结果转换成本项目诊断结构。
- `doc/scripts/twoslash-check.test.ts` — 验证正确示例通过、错误示例失败、预期错误不失败。
- `doc/scripts/typecheck-docs.ts` — CLI：扫描 Markdown、运行检查、打印结果、设置 exit code。
- `doc/scripts/typecheck-docs.test.ts` — 验证 CLI result formatting 与 exit-independent 行为。

### Modify

- `pnpm-workspace.yaml` — 加入 `doc` workspace，并新增 Twoslash 相关 catalog 版本。
- `doc/package.json` — 新增 docs `typecheck` / `test` 脚本、workspace package 依赖、Twoslash 依赖、测试工具依赖。
- `doc/.vitepress/config.ts` — 注册 `transformerTwoslash({ typesCache: createFileSystemTypesCache() })`，并加载 `js/jsx/ts/tsx` 语言。
- `doc/.vitepress/theme/index.ts` — 注册 `TwoslashFloatingVue` 并导入 Twoslash 样式。
- `.gitignore` — 忽略 `doc/.vitepress/cache/`。
- `doc/guide/getting-started.md` — 把关键完整 TypeScript 示例改为 `typescript twoslash`，并修正示例使其能独立类型检查。
- `doc/core/client.md` — 把 HTTP request 代表性示例改为 `typescript twoslash`，并补齐 `withEndpoint` import。
- `doc/plugins/vue.md` — 把 Vue interceptor 代表性示例改为 `typescript twoslash`，并让示例自包含。
- `.github/workflows/ci.yml` — 拆分 `packages` / `docs` filters，新增独立 docs job。
- `pnpm-lock.yaml` — 通过 `pnpm install` 更新。

---

### Task 1: Workspace、依赖、VitePress Twoslash 配置

**Files:**

- Modify: `pnpm-workspace.yaml`
- Modify: `doc/package.json`
- Create: `doc/tsconfig.json`
- Modify: `doc/.vitepress/config.ts`
- Modify: `doc/.vitepress/theme/index.ts`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml`

**Interfaces:**

- Consumes: 当前 VitePress 配置 `doc/.vitepress/config.ts` 和主题入口 `doc/.vitepress/theme/index.ts`。
- Produces:
  - `doc` 成为 pnpm workspace package。
  - `doc/tsconfig.json` 可供后续 `twoslash-check.ts` 读取等价 compiler options。
  - VitePress 能渲染 `twoslash` code fence 的 hover UI。

- [ ] **Step 1: 修改 `pnpm-workspace.yaml`，加入 `doc` workspace 和 Twoslash catalog**

编辑 `pnpm-workspace.yaml` 的 `packages` 和 `catalog` 段，使相关部分包含以下内容：

```yaml
packages:
  - 'packages/*'
  - 'doc'

allowBuilds:
  esbuild: true

catalog:
  '@changesets/changelog-github': '^0.7.0'
  '@changesets/cli': '^2.31.0'
  '@hono/node-server': '^2.0.4'
  '@hono/node-ws': '^1.3.1'
  '@shikijs/twoslash': '^4.2.0'
  '@shikijs/vitepress-twoslash': '^4.2.0'
  '@types/node': '^25.9.3'
  '@typescript/native-preview': '^7.0.0-dev.20260612.1'
  '@vitest/browser': '^4.1.8'
  '@vitest/browser-playwright': '^4.1.8'
  '@vitest/coverage-istanbul': '^4.1.8'
  '@vitest/ui': '^4.1.8'
  hono: '^4.12.25'
  oxfmt: '0.54.0'
  oxlint: '1.69.0'
  oxlint-tsgolint: '0.23.0'
  playwright: '^1.60.0'
  tsdown: '^0.22.2'
  tsx: '^4.22.4'
  twoslash: '^0.3.8'
  twoslash-vue: '^0.3.8'
  typescript: '^6.0.3'
  vite: '^8.0.16'
  vitest: '^4.1.8'
```

Do not remove the existing `minimumReleaseAgeExclude` section.

- [ ] **Step 2: Replace `doc/package.json` with docs workspace scripts and dependencies**

Write this full JSON into `doc/package.json`:

```json
{
  "name": "doc",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "docs:dev": "vitepress dev",
    "docs:build": "vitepress build",
    "docs:preview": "vitepress preview",
    "test": "vitest run",
    "typecheck": "tsc --project tsconfig.json --noEmit && tsx scripts/typecheck-docs.ts"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "module",
  "devDependencies": {
    "@defjs/angular": "workspace:*",
    "@defjs/core": "workspace:*",
    "@defjs/opentelemetry-server": "workspace:*",
    "@defjs/react": "workspace:*",
    "@defjs/vue": "workspace:*",
    "@shikijs/twoslash": "catalog:",
    "@shikijs/vitepress-twoslash": "catalog:",
    "@types/node": "catalog:",
    "tsx": "catalog:",
    "twoslash": "catalog:",
    "twoslash-vue": "catalog:",
    "typescript": "catalog:",
    "vitepress": "2.0.0-alpha.17",
    "vitest": "catalog:",
    "vue": "^3.5.38"
  }
}
```

- [ ] **Step 3: Create `doc/tsconfig.json`**

Write this file:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true,
    "baseUrl": ".",
    "paths": {
      "@defjs/angular": ["../packages/angular/src/index.ts"],
      "@defjs/core": ["../packages/core/src/index.ts"],
      "@defjs/opentelemetry-server": ["../packages/opentelemetry-server/src/index.ts"],
      "@defjs/react": ["../packages/react/src/index.ts"],
      "@defjs/vue": ["../packages/vue/src/index.ts"]
    },
    "types": ["node"],
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "preserve",
    "allowImportingTsExtensions": true
  },
  "include": [".vitepress/**/*.ts", "scripts/**/*.ts"]
}
```

- [ ] **Step 4: Add Twoslash transformer to `doc/.vitepress/config.ts`**

At the top of `doc/.vitepress/config.ts`, replace the current import section with:

```typescript
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { createFileSystemTypesCache } from '@shikijs/vitepress-twoslash/cache-fs'
import { defineConfig } from 'vitepress'
```

Inside the `defineConfig({ ... })` object, add this `markdown` property after `cleanUrls: true,` and before `locales:`:

```typescript
  markdown: {
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache(),
      }),
    ],
    languages: ['js', 'jsx', 'ts', 'tsx'],
  },
```

The beginning of the config object should look like this after the edit:

```typescript
export default defineConfig({
  title: 'Defjs',
  description: 'Typed request APIs across transports and runtimes',
  cleanUrls: true,

  markdown: {
    codeTransformers: [
      transformerTwoslash({
        typesCache: createFileSystemTypesCache(),
      }),
    ],
    languages: ['js', 'jsx', 'ts', 'tsx'],
  },

  locales: {
```

- [ ] **Step 5: Register Twoslash Floating Vue in `doc/.vitepress/theme/index.ts`**

Replace `doc/.vitepress/theme/index.ts` with:

```typescript
import TwoslashFloatingVue from '@shikijs/vitepress-twoslash/client'
import '@shikijs/vitepress-twoslash/style.css'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.use(TwoslashFloatingVue)
  },
}

export default theme
```

- [ ] **Step 6: Ignore the Twoslash cache directory**

Append this line to `.gitignore` under the existing `# output` section:

```gitignore
doc/.vitepress/cache/
```

The output section should contain:

```gitignore
# output
dist
test-out
doc/.vitepress/cache/
```

- [ ] **Step 7: Install dependencies and update lockfile**

Run:

```bash
pnpm install
```

Expected: command exits with code 0 and `pnpm-lock.yaml` is updated to include `doc` and Twoslash dependencies.

- [ ] **Step 8: Verify VitePress config type-checks before docs checker exists**

Run:

```bash
pnpm --filter doc exec tsc --project tsconfig.json --noEmit
```

Expected: PASS with exit code 0.

- [ ] **Step 9: Verify docs build still works without Twoslash code blocks**

Run:

```bash
pnpm --filter doc run docs:build
```

Expected: PASS with VitePress build output and no Twoslash runtime error.

- [ ] **Step 10: Commit Task 1**

```bash
git add pnpm-workspace.yaml doc/package.json doc/tsconfig.json doc/.vitepress/config.ts doc/.vitepress/theme/index.ts .gitignore pnpm-lock.yaml
git commit -m "chore(docs): wire vitepress twoslash dependencies"
```

---

### Task 2: Markdown Twoslash block extraction

**Files:**

- Create: `doc/scripts/markdown-twoslash.ts`
- Create: `doc/scripts/markdown-twoslash.test.ts`

**Interfaces:**

- Consumes: Markdown file contents and a docs root path.
- Produces:
  - `type TwoslashLanguage = 'ts' | 'tsx' | 'vue'`
  - `interface TwoslashBlock { filePath: string; index: number; lang: TwoslashLanguage; code: string; startLine: number; info: string }`
  - `extractTwoslashBlocks(markdown: string, filePath?: string): TwoslashBlock[]`
  - `listMarkdownFiles(rootDir: string): string[]`
  - `readTwoslashBlocks(rootDir: string): TwoslashBlock[]`

- [ ] **Step 1: Write failing tests for extraction**

Create `doc/scripts/markdown-twoslash.test.ts`:

````typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { extractTwoslashBlocks, listMarkdownFiles, readTwoslashBlocks } from './markdown-twoslash'

let tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defjs-docs-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
  tempDirs = []
})

describe('extractTwoslashBlocks', () => {
  it('extracts TypeScript twoslash fences', () => {
    const markdown = ['# Demo', '', '```typescript twoslash', 'const value = 1', '```'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'demo.md')).toEqual([
      {
        code: 'const value = 1',
        filePath: 'demo.md',
        index: 1,
        info: 'typescript twoslash',
        lang: 'ts',
        startLine: 4,
      },
    ])
  })

  it('extracts tsx and vue twoslash fences', () => {
    const markdown = [
      '```tsx twoslash',
      'const element = <div />',
      '```',
      '',
      '```vue twoslash',
      '<script setup lang="ts">',
      'const value = 1',
      '</script>',
      '```',
    ].join('\n')

    const blocks = extractTwoslashBlocks(markdown, 'component.md')

    expect(blocks.map((block) => block.lang)).toEqual(['tsx', 'vue'])
    expect(blocks.map((block) => block.index)).toEqual([1, 2])
  })

  it('ignores plain TypeScript fences and non-TypeScript fences', () => {
    const markdown = ['```typescript', 'const value = 1', '```', '', '```json twoslash', '{ "value": 1 }', '```'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'plain.md')).toEqual([])
  })

  it('supports tilde fences', () => {
    const markdown = ['~~~ts twoslash', 'const value = 1', '~~~'].join('\n')

    expect(extractTwoslashBlocks(markdown, 'tilde.md')).toHaveLength(1)
  })
})

describe('listMarkdownFiles', () => {
  it('lists markdown files and skips ignored directories', () => {
    const root = createTempDir()
    fs.mkdirSync(path.join(root, 'guide'), { recursive: true })
    fs.mkdirSync(path.join(root, '.vitepress', 'cache'), { recursive: true })
    fs.mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    fs.writeFileSync(path.join(root, 'index.md'), '# Home')
    fs.writeFileSync(path.join(root, 'guide', 'start.md'), '# Start')
    fs.writeFileSync(path.join(root, '.vitepress', 'cache', 'ignored.md'), '# Cache')
    fs.writeFileSync(path.join(root, 'node_modules', 'pkg', 'ignored.md'), '# Dependency')

    const files = listMarkdownFiles(root).map((file) => path.relative(root, file).split(path.sep).join('/'))

    expect(files).toEqual(['guide/start.md', 'index.md'])
  })
})

describe('readTwoslashBlocks', () => {
  it('reads twoslash blocks from markdown files with normalized paths', () => {
    const root = createTempDir()
    fs.mkdirSync(path.join(root, 'guide'), { recursive: true })
    fs.writeFileSync(path.join(root, 'guide', 'start.md'), ['```typescript twoslash', 'const value = 1', '```'].join('\n'))

    expect(readTwoslashBlocks(root)).toEqual([
      {
        code: 'const value = 1',
        filePath: 'guide/start.md',
        index: 1,
        info: 'typescript twoslash',
        lang: 'ts',
        startLine: 2,
      },
    ])
  })
})
````

- [ ] **Step 2: Run tests and verify they fail because module does not exist**

Run:

```bash
pnpm --filter doc run test -- scripts/markdown-twoslash.test.ts
```

Expected: FAIL with an import error for `./markdown-twoslash`.

- [ ] **Step 3: Implement `doc/scripts/markdown-twoslash.ts`**

Create `doc/scripts/markdown-twoslash.ts`:

```typescript
import fs from 'node:fs'
import path from 'node:path'

export type TwoslashLanguage = 'ts' | 'tsx' | 'vue'

export interface TwoslashBlock {
  code: string
  filePath: string
  index: number
  info: string
  lang: TwoslashLanguage
  startLine: number
}

const IGNORED_DIRS = new Set(['.vitepress', 'node_modules'])

function normalizeLanguage(raw: string): TwoslashLanguage | undefined {
  switch (raw) {
    case 'ts':
    case 'typescript':
      return 'ts'
    case 'tsx':
      return 'tsx'
    case 'vue':
      return 'vue'
    default:
      return undefined
  }
}

export function extractTwoslashBlocks(markdown: string, filePath = 'inline.md'): TwoslashBlock[] {
  const blocks: TwoslashBlock[] = []
  const fencePattern = /(^|\n)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\2[ \t]*(?=\n|$)/g

  let match: RegExpExecArray | null
  while ((match = fencePattern.exec(markdown)) !== null) {
    const prefix = match[1]
    const rawInfo = match[3]
    const code = match[4]
    const info = rawInfo.trim()
    const parts = info.split(/\s+/).filter(Boolean)
    const lang = normalizeLanguage(parts[0] ?? '')

    if (!lang || !parts.includes('twoslash')) {
      continue
    }

    const fenceStart = match.index + prefix.length
    const fenceLine = markdown.slice(0, fenceStart).split('\n').length

    blocks.push({
      code,
      filePath,
      index: blocks.length + 1,
      info,
      lang,
      startLine: fenceLine + 1,
    })
  }

  return blocks
}

export function listMarkdownFiles(rootDir: string): string[] {
  const files: string[] = []

  function walk(dir: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name)

      if (entry.isDirectory()) {
        if (!IGNORED_DIRS.has(entry.name)) {
          walk(fullPath)
        }
        continue
      }

      if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath)
      }
    }
  }

  walk(rootDir)
  return files.sort()
}

export function readTwoslashBlocks(rootDir: string): TwoslashBlock[] {
  return listMarkdownFiles(rootDir).flatMap((file) => {
    const markdown = fs.readFileSync(file, 'utf8')
    const relativePath = path.relative(rootDir, file).split(path.sep).join('/')
    return extractTwoslashBlocks(markdown, relativePath)
  })
}
```

- [ ] **Step 4: Run extractor tests and verify they pass**

Run:

```bash
pnpm --filter doc run test -- scripts/markdown-twoslash.test.ts
```

Expected: PASS; all tests in `markdown-twoslash.test.ts` pass.

- [ ] **Step 5: Run docs script type-check**

Run:

```bash
pnpm --filter doc exec tsc --project tsconfig.json --noEmit
```

Expected: PASS with exit code 0.

- [ ] **Step 6: Commit Task 2**

```bash
git add doc/scripts/markdown-twoslash.ts doc/scripts/markdown-twoslash.test.ts
git commit -m "test(docs): extract twoslash markdown blocks"
```

---

### Task 3: Twoslash checker and docs typecheck CLI

**Files:**

- Create: `doc/scripts/twoslash-check.ts`
- Create: `doc/scripts/twoslash-check.test.ts`
- Create: `doc/scripts/typecheck-docs.ts`
- Create: `doc/scripts/typecheck-docs.test.ts`

**Interfaces:**

- Consumes:
  - `TwoslashBlock` from `doc/scripts/markdown-twoslash.ts`
  - `readTwoslashBlocks(rootDir: string): TwoslashBlock[]`
- Produces:
  - `interface TwoslashDiagnostic`
  - `createTwoslashChecker(): TwoslashChecker`
  - `runTypecheck(rootDir?: string): TypecheckResult`
  - `formatDiagnostic(diagnostic: TwoslashDiagnostic): string`
  - `formatSummary(result: TypecheckResult): string`

- [ ] **Step 1: Write failing tests for Twoslash checker**

Create `doc/scripts/twoslash-check.test.ts`:

```typescript
import { afterAll, describe, expect, it } from 'vitest'

import type { TwoslashBlock } from './markdown-twoslash'
import { createTwoslashChecker } from './twoslash-check'

const checker = createTwoslashChecker()

function block(code: string): TwoslashBlock {
  return {
    code,
    filePath: 'inline.md',
    index: 1,
    info: 'typescript twoslash',
    lang: 'ts',
    startLine: 1,
  }
}

afterAll(() => {
  checker.clearCache()
})

describe('createTwoslashChecker', () => {
  it('passes a valid defjs request example', () => {
    const diagnostics = checker.checkBlock(
      block(`
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

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

async function loadUser() {
  const [error, user] = await client.execute(getUser({ id: 1 }))
  if (error) {
    return error.code
  }
  return user.name
}
`),
    )

    expect(diagnostics).toEqual([])
  })

  it('reports an invalid defjs request example', () => {
    const diagnostics = checker.checkBlock(
      block(`
import { defineRequest } from '@defjs/core'

defineRequest({ method: 'GET' })
`),
    )

    expect(diagnostics.length).toBeGreaterThan(0)
    expect(diagnostics[0].filePath).toBe('inline.md')
    expect(diagnostics[0].blockIndex).toBe(1)
  })

  it('does not report errors declared with @errors', () => {
    const diagnostics = checker.checkBlock(
      block(`
// @errors: 2322
const value: number = 'text'
`),
    )

    expect(diagnostics).toEqual([])
  })
})
```

- [ ] **Step 2: Write failing tests for CLI formatting and scanning**

Create `doc/scripts/typecheck-docs.test.ts`:

````typescript
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { formatDiagnostic, formatSummary, runTypecheck } from './typecheck-docs'

let tempDirs: string[] = []

function createTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'defjs-docs-typecheck-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  for (const dir of tempDirs) {
    fs.rmSync(dir, { force: true, recursive: true })
  }
  tempDirs = []
})

describe('formatDiagnostic', () => {
  it('formats file, block, location, code, and text', () => {
    expect(
      formatDiagnostic({
        blockIndex: 2,
        character: 8,
        code: 'TS2322',
        filePath: 'guide/start.md',
        level: 'error',
        line: 12,
        text: "Type 'string' is not assignable to type 'number'.",
      }),
    ).toBe("guide/start.md block #2 line 12:8\n  TS2322: Type 'string' is not assignable to type 'number'.")
  })
})

describe('formatSummary', () => {
  it('formats a success summary', () => {
    expect(
      formatSummary({
        blocksChecked: 1,
        diagnostics: [],
        filesChecked: 1,
      }),
    ).toBe('Checked 1 twoslash code block in 1 markdown file.\nNo Twoslash type errors found.')
  })

  it('formats a failure summary', () => {
    expect(
      formatSummary({
        blocksChecked: 2,
        diagnostics: [
          {
            blockIndex: 1,
            character: 1,
            code: 'TS2322',
            filePath: 'guide/start.md',
            level: 'error',
            line: 3,
            text: 'Bad assignment.',
          },
        ],
        filesChecked: 1,
      }),
    ).toBe('Checked 2 twoslash code blocks in 1 markdown file.\nFound 1 Twoslash type error.')
  })
})

describe('runTypecheck', () => {
  it('checks markdown twoslash blocks under the provided root', () => {
    const root = createTempDir()
    fs.writeFileSync(path.join(root, 'index.md'), ['```typescript twoslash', 'const value = 1', '```'].join('\n'))

    const result = runTypecheck(root)

    expect(result.filesChecked).toBe(1)
    expect(result.blocksChecked).toBe(1)
    expect(result.diagnostics).toEqual([])
  })
})
````

- [ ] **Step 3: Run tests and verify they fail because modules do not exist**

Run:

```bash
pnpm --filter doc run test -- scripts/twoslash-check.test.ts scripts/typecheck-docs.test.ts
```

Expected: FAIL with import errors for `./twoslash-check` and `./typecheck-docs`.

- [ ] **Step 4: Implement `doc/scripts/twoslash-check.ts`**

Create `doc/scripts/twoslash-check.ts`:

```typescript
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createTwoslasher, type TwoslashInstance } from 'twoslash'
import { createTwoslasher as createVueTwoslasher } from 'twoslash-vue'
import ts from 'typescript'

import type { TwoslashBlock } from './markdown-twoslash'

export interface TwoslashDiagnostic {
  blockIndex: number
  character: number
  code: string
  filePath: string
  level: 'error'
  line: number
  text: string
}

interface RawTwoslashError {
  character?: number
  code?: number | string
  id?: number | string
  level?: string
  line?: number
  text?: string
}

export interface TwoslashChecker {
  checkBlock(block: TwoslashBlock): TwoslashDiagnostic[]
  clearCache(): void
}

const DOC_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

export const DOC_COMPILER_OPTIONS: ts.CompilerOptions = {
  allowImportingTsExtensions: true,
  baseUrl: DOC_DIR,
  jsx: ts.JsxEmit.Preserve,
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  paths: {
    '@defjs/angular': ['../packages/angular/src/index.ts'],
    '@defjs/core': ['../packages/core/src/index.ts'],
    '@defjs/opentelemetry-server': ['../packages/opentelemetry-server/src/index.ts'],
    '@defjs/react': ['../packages/react/src/index.ts'],
    '@defjs/vue': ['../packages/vue/src/index.ts'],
  },
  skipLibCheck: true,
  strict: true,
  target: ts.ScriptTarget.ES2022,
  types: ['node'],
}

const HANDBOOK_OPTIONS = {
  noErrorValidation: true,
}

function extensionFor(block: TwoslashBlock): 'ts' | 'tsx' | 'vue' {
  return block.lang
}

function errorCode(error: RawTwoslashError): string {
  const raw = error.code ?? error.id ?? 'unknown'
  return typeof raw === 'number' ? `TS${raw}` : String(raw)
}

function errorCodeNumber(error: RawTwoslashError): number | undefined {
  const raw = error.code ?? error.id
  const value = typeof raw === 'number' ? raw : Number(raw)
  return Number.isFinite(value) ? value : undefined
}

function isUnexpectedError(error: RawTwoslashError, expectedCodes: Set<number>): boolean {
  if (error.level && error.level !== 'error') {
    return false
  }

  const code = errorCodeNumber(error)
  return code === undefined || !expectedCodes.has(code)
}

function toDiagnostic(block: TwoslashBlock, error: RawTwoslashError): TwoslashDiagnostic {
  return {
    blockIndex: block.index,
    character: error.character ?? 1,
    code: errorCode(error),
    filePath: block.filePath,
    level: 'error',
    line: block.startLine + Math.max((error.line ?? 1) - 1, 0),
    text: error.text ?? 'Unknown Twoslash error.',
  }
}

export function createTwoslashChecker(): TwoslashChecker {
  const tsRunner: TwoslashInstance = createTwoslasher({
    compilerOptions: DOC_COMPILER_OPTIONS,
    handbookOptions: HANDBOOK_OPTIONS,
  })
  const vueRunner: TwoslashInstance = createVueTwoslasher({
    compilerOptions: DOC_COMPILER_OPTIONS,
    handbookOptions: HANDBOOK_OPTIONS,
  })

  return {
    checkBlock(block) {
      const runner = block.lang === 'vue' ? vueRunner : tsRunner
      const result = runner(block.code, extensionFor(block), {
        compilerOptions: DOC_COMPILER_OPTIONS,
        handbookOptions: HANDBOOK_OPTIONS,
      })
      const expectedCodes = new Set((result.meta.handbookOptions.errors ?? []).map(Number))

      return (result.errors as RawTwoslashError[])
        .filter((error) => isUnexpectedError(error, expectedCodes))
        .map((error) => toDiagnostic(block, error))
    },
    clearCache() {
      tsRunner.getCacheMap()?.clear()
      vueRunner.getCacheMap()?.clear()
    },
  }
}
```

- [ ] **Step 5: Implement `doc/scripts/typecheck-docs.ts`**

Create `doc/scripts/typecheck-docs.ts`:

```typescript
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { readTwoslashBlocks } from './markdown-twoslash'
import { createTwoslashChecker, type TwoslashDiagnostic } from './twoslash-check'

export interface TypecheckResult {
  blocksChecked: number
  diagnostics: TwoslashDiagnostic[]
  filesChecked: number
}

const DOC_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))

function plural(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm
}

export function formatDiagnostic(diagnostic: TwoslashDiagnostic): string {
  return `${diagnostic.filePath} block #${diagnostic.blockIndex} line ${diagnostic.line}:${diagnostic.character}\n  ${diagnostic.code}: ${diagnostic.text}`
}

export function formatSummary(result: TypecheckResult): string {
  const blockWord = plural(result.blocksChecked, 'code block', 'code blocks')
  const fileWord = plural(result.filesChecked, 'markdown file', 'markdown files')
  const lines = [`Checked ${result.blocksChecked} twoslash ${blockWord} in ${result.filesChecked} ${fileWord}.`]

  if (result.diagnostics.length === 0) {
    lines.push('No Twoslash type errors found.')
  } else {
    const errorWord = plural(result.diagnostics.length, 'error', 'errors')
    lines.push(`Found ${result.diagnostics.length} Twoslash type ${errorWord}.`)
  }

  return lines.join('\n')
}

export function runTypecheck(rootDir = DOC_DIR): TypecheckResult {
  const blocks = readTwoslashBlocks(rootDir)
  const checker = createTwoslashChecker()

  try {
    const diagnostics = blocks.flatMap((block) => checker.checkBlock(block))
    const filesChecked = new Set(blocks.map((block) => block.filePath)).size

    return {
      blocksChecked: blocks.length,
      diagnostics,
      filesChecked,
    }
  } finally {
    checker.clearCache()
  }
}

export function printResult(result: TypecheckResult): void {
  for (const diagnostic of result.diagnostics) {
    console.error(formatDiagnostic(diagnostic))
  }

  if (result.diagnostics.length > 0) {
    console.error('')
  }

  const summary = formatSummary(result)
  if (result.diagnostics.length > 0) {
    console.error(summary)
  } else {
    console.log(summary)
  }
}

export function main(): void {
  const result = runTypecheck()
  printResult(result)

  if (result.diagnostics.length > 0) {
    process.exitCode = 1
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
```

- [ ] **Step 6: Run checker and CLI tests**

Run:

```bash
pnpm --filter doc run test -- scripts/twoslash-check.test.ts scripts/typecheck-docs.test.ts
```

Expected: PASS; both test files pass.

- [ ] **Step 7: Run all docs tests**

Run:

```bash
pnpm --filter doc run test
```

Expected: PASS; `markdown-twoslash.test.ts`、`twoslash-check.test.ts`、`typecheck-docs.test.ts` all pass.

- [ ] **Step 8: Run docs typecheck before any Twoslash docs migration**

Run:

```bash
pnpm --filter doc run typecheck
```

Expected: PASS with output similar to:

```text
Checked 0 twoslash code blocks in 0 markdown files.
No Twoslash type errors found.
```

- [ ] **Step 9: Commit Task 3**

```bash
git add doc/scripts/twoslash-check.ts doc/scripts/twoslash-check.test.ts doc/scripts/typecheck-docs.ts doc/scripts/typecheck-docs.test.ts
git commit -m "feat(docs): add twoslash typecheck cli"
```

---

### Task 4: Migrate critical Markdown examples to `typescript twoslash`

**Files:**

- Modify: `doc/guide/getting-started.md`
- Modify: `doc/core/client.md`
- Modify: `doc/plugins/vue.md`

**Interfaces:**

- Consumes: `typecheck-docs.ts` CLI from Task 3.
- Produces: At least three root-locale documentation pages with type-checked Twoslash examples.

- [ ] **Step 1: Convert key examples in `doc/guide/getting-started.md`**

Change the Step 1 code fence from:

````markdown
```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```
````

to:

````markdown
```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```
````

Change the Step 2 code fence from:

````markdown
```typescript
import { defineRequest, struct } from '@defjs/core'

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
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```
````

to:

````markdown
```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```
````

Replace the Step 3 code block with a self-contained Twoslash example:

````markdown
```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

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
    404: struct.object({
      message: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user] = await client.execute(getUser({ id: 1 }))

  if (error) {
    // error is typed based on the non-2xx schemas in output
    console.error(error.code, error.message)
    return
  }

  // user is typed as { id: number; name: string }
  console.log(user.name)
}
```
````

Leave the CDN block and the long Complete Example block as ordinary `typescript` in this task because the CDN import and long interceptor example are better migrated separately after the first Twoslash CI path is stable.

- [ ] **Step 2: Convert the HTTP example in `doc/core/client.md`**

In the HTTP Requests section, replace the code block with:

````markdown
```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

async function loadUser() {
  const [error, user, response] = await client.execute(getUser())

  if (error) {
    console.error(error.code, error.message)
  } else {
    console.log(user.id, user.name, response.status)
  }
}
```
````

This fixes the current missing `withEndpoint` import and keeps the example independently type-checkable.

- [ ] **Step 3: Convert one Vue plugin example in `doc/plugins/vue.md`**

In the “Configuring Interceptors” section, replace the code block with:

````markdown
```typescript twoslash
import { createHttpInterceptor } from '@defjs/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/vue'
import { createApp } from 'vue'

const app = createApp({})

const authInterceptor = createHttpInterceptor((req, next) => {
  req.headers.set('Authorization', 'Bearer token')
  return next(req)
})

app.use(
  provideClient(
    withEndpoint('https://api.example.com'),
    withInterceptors(() => authInterceptor),
  ),
)
```
````

Leave the `UserCard.vue` and SSE/WebSocket examples as ordinary `typescript` in this task because they contain Vue SFC markup inside a TypeScript fence. Convert those later with `vue twoslash` after the base TypeScript path is verified.

- [ ] **Step 4: Run docs typecheck and verify migrated examples compile**

Run:

```bash
pnpm --filter doc run typecheck
```

Expected: PASS with output showing a non-zero count, for example:

```text
Checked 5 twoslash code blocks in 3 markdown files.
No Twoslash type errors found.
```

The exact block count can be greater than 5 if earlier tasks or local edits added more Twoslash fences, but it must not be 0.

- [ ] **Step 5: Run docs tests**

Run:

```bash
pnpm --filter doc run test
```

Expected: PASS.

- [ ] **Step 6: Run docs build**

Run:

```bash
pnpm --filter doc run docs:build
```

Expected: PASS; generated VitePress output includes no Twoslash runtime import errors.

- [ ] **Step 7: Commit Task 4**

```bash
git add doc/guide/getting-started.md doc/core/client.md doc/plugins/vue.md
git commit -m "docs: typecheck key examples with twoslash"
```

---

### Task 5: CI integration for docs typecheck, tests, and build

**Files:**

- Modify: `.github/workflows/ci.yml`

**Interfaces:**

- Consumes: `doc` workspace scripts from Tasks 1 and 3.
- Produces: GitHub Actions jobs:
  - `checks` runs for package-affecting changes.
  - `docs` runs for docs-affecting changes.
  - `dependency-review` runs for pull requests with any checked change.

- [ ] **Step 1: Replace `.github/workflows/ci.yml` with split filters and docs job**

Write this full content to `.github/workflows/ci.yml`:

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
      docs: ${{ steps.filter.outputs.docs }}
      packages: ${{ steps.filter.outputs.packages }}
    steps:
      - uses: actions/checkout@v4
      - uses: dorny/paths-filter@v3
        id: filter
        with:
          filters: |
            any:
              - '**'
              - '!**/*.drawio'
              - '!LICENSE'
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

  checks:
    needs: changes
    if: ${{ needs.changes.outputs.packages == 'true' }}
    uses: ./.github/workflows/_checks.yml
    secrets: inherit

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

- [ ] **Step 2: Run local docs CI commands in the same order as GitHub Actions**

Run:

```bash
pnpm --filter doc run typecheck
pnpm --filter doc run test
pnpm --filter doc run docs:build
```

Expected: all three commands PASS.

- [ ] **Step 3: Validate workflow YAML syntax with GitHub Actions-friendly parser if available**

Run:

```bash
pnpm exec prettier --check .github/workflows/ci.yml 2>/dev/null || ruby -e 'require "yaml"; YAML.load_file(".github/workflows/ci.yml"); puts "ci.yml parsed"'
```

Expected: either Prettier reports formatted YAML, or Ruby prints:

```text
ci.yml parsed
```

If both tools are unavailable, run this fallback:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('.github/workflows/ci.yml').read_text()
required = [
    'docs:',
    'Typecheck docs',
    'pnpm --filter doc run typecheck',
    'pnpm --filter doc run test',
    'pnpm --filter doc run docs:build',
]
missing = [item for item in required if item not in text]
if missing:
    raise SystemExit(f'missing expected CI entries: {missing}')
print('ci.yml contains docs job entries')
PY
```

Expected fallback output:

```text
ci.yml contains docs job entries
```

- [ ] **Step 4: Commit Task 5**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: check docs type tests and build"
```

---

### Task 6: Final local verification and cleanup

**Files:**

- Verify: all files touched by Tasks 1–5

**Interfaces:**

- Consumes: all produced scripts and CI config.
- Produces: verified working tree ready for review.

- [ ] **Step 1: Run docs typecheck**

Run:

```bash
pnpm --filter doc run typecheck
```

Expected: PASS and output includes `No Twoslash type errors found.`

- [ ] **Step 2: Run docs tests**

Run:

```bash
pnpm --filter doc run test
```

Expected: PASS.

- [ ] **Step 3: Run docs build**

Run:

```bash
pnpm --filter doc run docs:build
```

Expected: PASS.

- [ ] **Step 4: Run root typecheck to verify workspace integration**

Run:

```bash
pnpm typecheck
```

Expected: PASS; output includes the `doc` workspace typecheck script in addition to package typechecks.

- [ ] **Step 5: Run root tests to verify docs test participates in recursive test**

Run:

```bash
pnpm test
```

Expected: PASS. If browser tests require Playwright browsers that are not installed locally, run this once and then repeat the test command:

```bash
pnpm exec playwright install chromium firefox
```

- [ ] **Step 6: Run formatter and lint checks**

Run:

```bash
pnpm fmt:check
pnpm lint
```

Expected: both PASS.

- [ ] **Step 7: Run final diff hygiene checks**

Run:

```bash
git diff --check
git status --short
```

Expected:

- `git diff --check` prints no whitespace errors.
- `git status --short` shows only intended files from this implementation.

- [ ] **Step 8: Commit final cleanup if Step 6 changed files**

If `pnpm fmt` was needed after `fmt:check` failed, run:

```bash
git add doc pnpm-workspace.yaml pnpm-lock.yaml .github/workflows/ci.yml .gitignore
git commit -m "chore(docs): finalize twoslash checks"
```

If no files changed after Task 5, skip this commit.

---

## Self-Review

### Spec coverage

- 内联 Markdown 写作：Task 4 migrates selected inline Markdown examples to `typescript twoslash`.
- VitePress reader-facing Twoslash: Task 1 configures `transformerTwoslash`, `TwoslashFloatingVue`, and stylesheet.
- `doc` workspace and root typecheck/test linkage: Task 1 adds `doc` to workspace and scripts; Task 6 verifies root commands.
- Docs typecheck CLI: Tasks 2 and 3 implement scanner, checker, CLI, and tests.
- CI docs job: Task 5 adds split filters and docs job with typecheck/test/build.
- Cache ignore: Task 1 ignores `doc/.vitepress/cache/`.
- Gradual migration: Task 4 only migrates three root-locale pages.
- Testing: Tasks 2 and 3 add unit tests; Task 6 runs docs and root tests.

### Placeholder scan

The plan uses exact paths, package versions, commands, expected outputs, and code snippets. It contains no placeholder markers such as `TBD`, `TODO`, `fill in`, or unspecified versions.

### Type consistency

- `TwoslashBlock` is defined in Task 2 and imported unchanged in Task 3.
- `TwoslashDiagnostic` is defined in Task 3 and reused by CLI formatting tests.
- `createTwoslashChecker().checkBlock(block)` returns `TwoslashDiagnostic[]`, matching all tests and CLI code.
- `runTypecheck(rootDir?: string)` returns `TypecheckResult`, matching `formatSummary` and `printResult`.
