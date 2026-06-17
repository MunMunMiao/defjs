# Multi-framework Nested DI Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `@defjs/react`、`@defjs/vue`、`@defjs/angular` 分别增加独立的多层组件依赖注入测试，锁定 nested provider 的“最近 provider 生效”语义。

**Architecture:** React 和 Vue 复用现有 Vitest browser + Playwright 测试入口，在各自现有 browser spec 中增加框架原生组件树测试。Angular 新增自己的 Vitest browser 测试基础设施，并用 Angular standalone components + TestBed 测试 hierarchical injector。三套测试只共享行为目标，不共享测试代码、adapter、DSL 或 contract runner。

**Tech Stack:** TypeScript, pnpm workspace, Vitest 4, @vitest/browser-playwright, Playwright, Hono test server, React Testing Library, Vue 3, Angular 22 TestBed, @defjs/core。

## Global Constraints

- 每个包都使用各自独立的测试，不做共享测试抽象或共享 contract adapter。
- Nested provider 的正式语义是：最近 provider 生效。
- 测试只依赖公开 API：`ClientProvider` / `useClient`、`provideClient` / `injectClient`、`withEndpoint`、`withInterceptors`。
- React 与 Vue 复用现有 Vitest browser 测试体系。
- Angular 新增独立测试基础设施和 `test` 脚本，使根级 `pnpm -r run test` 能覆盖 Angular 包。
- 不改造 `@defjs/core`。
- 不直接导出或测试 Angular 内部私有 token：`HTTP_CLIENT`、`HTTP_ENDPOINT`、`HTTP_INTERCEPTOR_FNS`。
- Angular 测试必须使用官方支持的 DI 方式：`EnvironmentProviders` 只放在 TestBed/environment injector；不要放进 `@Component.providers`。
- Angular inner provider 使用官方 `createEnvironmentInjector([provideClient(...)], parentInjector)` 与 `ViewContainerRef.createComponent(..., { environmentInjector })` 表达子 environment injector。
- Vue 包已公开导出 `HTTP_CLIENT`；Vue 子树 provider 测试可以使用该公开 `InjectionKey`。
- 本计划中的 commit 步骤是执行检查点；除非用户明确授权提交，否则执行者只运行 `git status --short` 并停在提交前。

---

## File Structure

### React

- Modify: `packages/react/src/e2e.browser.spec.tsx`
  - 负责 React 真实浏览器场景。新增 nested `ClientProvider` 测试，验证 outer/inner provider 的实例隔离、同层复用和 interceptor 行为。
- Modify: `packages/react/README.md`
  - 负责公开文档。更新 `<ClientProvider>` API 描述，使其与“最近 provider 生效”语义一致。

### Vue

- Modify: `packages/vue/src/core.browser.spec.ts`
  - 负责 Vue 浏览器运行时测试。新增 Vue 三层组件注入测试和 Vue 子树 `provide(HTTP_CLIENT, ...)` 分层覆盖测试。

### Angular

- Modify: `packages/angular/package.json`
  - 增加 `test` 脚本和 Angular/Vitest browser 测试所需 devDependencies。
- Create: `packages/angular/vitest.config.ts`
  - 聚合 Angular browser test project 并配置 coverage。
- Create: `packages/angular/vitest.config.browser.ts`
  - 配置 Vitest browser + Playwright，发现 `src/**/*.browser.spec.ts`。
- Create: `packages/angular/test/shared.ts`
  - 提供 Angular 包自己的 `packageRoot`、`globalSetupPath`、`coverageConfig`。
- Create: `packages/angular/test/setup.ts`
  - 提供 Angular 包自己的 Hono test server 和 `testServerHost`。
- Create: `packages/angular/src/core.browser.spec.ts`
  - 使用 Angular standalone components + TestBed 测试无 provider、单 provider 多层注入、多 provider 分层覆盖和真实请求。

---

### Task 1: React nested `ClientProvider` regression

**Files:**

- Modify: `packages/react/src/e2e.browser.spec.tsx`
- Modify: `packages/react/README.md`

**Interfaces:**

- Consumes: `ClientProvider`, `useClient`, `withEndpoint`, `withInterceptors` from `packages/react/src/core.tsx`.
- Consumes: `createHttpInterceptor`, `defineRequest`, `struct` from `@defjs/core`.
- Produces: React nested provider behavior coverage; later verification relies on `pnpm --dir packages/react test` passing.

- [ ] **Step 1: Add the React nested provider test import**

In `packages/react/src/e2e.browser.spec.tsx`, replace the current core import:

```ts
import { defineRequest, struct } from '@defjs/core'
```

with:

```ts
import { createHttpInterceptor, defineRequest, struct } from '@defjs/core'
```

- [ ] **Step 2: Add the React nested provider regression test**

In `packages/react/src/e2e.browser.spec.tsx`, append this `it(...)` block inside the existing `describe('React wrapper e2e', () => { ... })`, after the current `should provide the same client instance to nested components` test:

```tsx
it('should resolve the nearest client provider in nested component trees', async () => {
  const endpoint = inject('testServerHost')
  const seenScopes: string[] = []
  let outerClient: unknown
  let outerSiblingClient: unknown
  let innerMiddleClient: unknown
  let innerLeafClient: unknown

  const scopedInterceptor = (scope: string) =>
    createHttpInterceptor(async (req, next) => {
      seenScopes.push(scope)
      req.headers.set('x-defjs-scope', scope)
      return next(req)
    })

  function OuterRequestConsumer() {
    const client = useClient()
    const [count, setCount] = useState('loading')
    outerClient = client

    useEffect(() => {
      client.execute(getUsers()).then(([error, users]) => {
        if (error) {
          setCount('error')
          return
        }

        setCount(String((users as Array<{ id: number; name: string }>).length))
      })
    }, [client])

    return <span data-testid="outer-count">{count}</span>
  }

  function OuterSiblingConsumer() {
    outerSiblingClient = useClient()
    return null
  }

  function InnerMiddle() {
    innerMiddleClient = useClient()
    return <InnerLeaf />
  }

  function InnerLeaf() {
    const client = useClient()
    const [count, setCount] = useState('loading')
    innerLeafClient = client

    useEffect(() => {
      client.execute(getUsers()).then(([error, users]) => {
        if (error) {
          setCount('error')
          return
        }

        setCount(String((users as Array<{ id: number; name: string }>).length))
      })
    }, [client])

    return <span data-testid="inner-count">{count}</span>
  }

  render(
    <ClientProvider options={[withEndpoint(endpoint), withInterceptors(() => scopedInterceptor('outer'))]}>
      <OuterRequestConsumer />
      <ClientProvider options={[withEndpoint(endpoint), withInterceptors(() => scopedInterceptor('inner'))]}>
        <InnerMiddle />
      </ClientProvider>
      <OuterSiblingConsumer />
    </ClientProvider>,
  )

  await waitFor(() => {
    expect(screen.getByTestId('outer-count').textContent).toBe('2')
    expect(screen.getByTestId('inner-count').textContent).toBe('2')
  })

  expect(outerClient).toBeDefined()
  expect(outerSiblingClient).toBeDefined()
  expect(innerMiddleClient).toBeDefined()
  expect(innerLeafClient).toBeDefined()
  expect(outerClient).toBe(outerSiblingClient)
  expect(innerMiddleClient).toBe(innerLeafClient)
  expect(innerLeafClient).not.toBe(outerClient)
  expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
})
```

- [ ] **Step 3: Run the focused React browser spec**

Run:

```bash
pnpm --dir packages/react exec vitest run --config vitest.config.browser.ts src/e2e.browser.spec.tsx
```

Expected: PASS. This is a regression test for behavior already implemented by React Context; a failure means the existing implementation does not match the approved nested provider contract.

- [ ] **Step 4: Update the React README provider wording**

In `packages/react/README.md`, replace the current `<ClientProvider>` API paragraph:

```md
Creates a client and provides it to child components. Throws if nested inside another `ClientProvider` is not supported; nest providers only at separate tree branches.
```

with:

```md
Creates a client and provides it to child components. Nested `ClientProvider`s are supported: components read the nearest provider, so an inner provider creates a separate client for its subtree while siblings continue using the outer client.
```

- [ ] **Step 5: Run React package verification**

Run:

```bash
pnpm --dir packages/react test
pnpm --dir packages/react typecheck
```

Expected: both commands exit 0. If Playwright reports missing browsers, record the exact environment error and run no replacement command that claims browser coverage.

- [ ] **Step 6: Commit checkpoint**

If the user has explicitly authorized commits, run:

```bash
git add packages/react/src/e2e.browser.spec.tsx packages/react/README.md
git commit -m "test(react): cover nested client provider injection"
```

If commits are not authorized, run:

```bash
git status --short packages/react/src/e2e.browser.spec.tsx packages/react/README.md
```

Expected without commit authorization: both files appear as modified.

---

### Task 2: Vue multi-layer provide/inject tests

**Files:**

- Modify: `packages/vue/src/core.browser.spec.ts`

**Interfaces:**

- Consumes: `HTTP_CLIENT`, `injectClient`, `provideClient`, `withEndpoint`, `withInterceptors` from `packages/vue/src/index.ts`.
- Consumes: `createClient`, `createHttpInterceptor`, `defineRequest`, `struct` from `@defjs/core`.
- Produces: Vue browser tests for single provider descendant reuse and nested subtree provider override.

- [ ] **Step 1: Expand Vue test imports**

In `packages/vue/src/core.browser.spec.ts`, replace:

```ts
import { createHttpInterceptor, defineRequest, struct, type Client } from '@defjs/core'
import { beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp } from 'vue'
import { injectClient, provideClient, withEndpoint, withInterceptors } from './index'
```

with:

```ts
import { createClient, createHttpInterceptor, defineRequest, struct, type Client } from '@defjs/core'
import { beforeEach, describe, expect, inject, test } from 'vitest'
import { createApp, defineComponent, h, provide } from 'vue'
import { HTTP_CLIENT, injectClient, provideClient, withEndpoint, withInterceptors } from './index'
```

- [ ] **Step 2: Add the Vue single-provider multi-layer test**

In `packages/vue/src/core.browser.spec.ts`, add this test inside `describe('vue browser runtime', () => { ... })`, after `should provide client via app.provide`:

```ts
test('should share one client through multiple Vue component layers', () => {
  let middleClient: Client | undefined
  let leafClient: Client | undefined

  const Leaf = defineComponent({
    name: 'LeafClientConsumer',
    setup() {
      leafClient = injectClient()
      return () => h('span')
    },
  })

  const Middle = defineComponent({
    name: 'MiddleClientConsumer',
    setup() {
      middleClient = injectClient()
      return () => h(Leaf)
    },
  })

  const app = createApp(Middle)
  app.use(provideClient(withEndpoint(testServerHost), withInterceptors(passthroughHttpInterceptor)))
  app.mount(document.createElement('div'))

  expect(middleClient).toBeDefined()
  expect(leafClient).toBeDefined()
  expect(middleClient).toBe(leafClient)
})
```

- [ ] **Step 3: Add the Vue nested provider override test**

In `packages/vue/src/core.browser.spec.ts`, add this test inside `describe('vue browser runtime', () => { ... })`, after the test from Step 2:

```ts
test('should resolve the nearest Vue provider in nested component trees', async () => {
  const seenScopes: string[] = []
  let outerClient: Client | undefined
  let outerSiblingClient: Client | undefined
  let innerMiddleClient: Client | undefined
  let innerLeafClient: Client | undefined
  let outerRequest: Promise<unknown> | undefined
  let innerRequest: Promise<unknown> | undefined

  const scopedInterceptor = (scope: string) =>
    createHttpInterceptor(async (req, next) => {
      seenScopes.push(scope)
      req.headers.set('x-defjs-scope', scope)
      return next(req)
    })

  const getLayeredUsers = defineRequest({
    method: 'GET',
    output: {
      200: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
        }),
      ),
    },
    path: '/api/users',
  })

  const OuterRequestConsumer = defineComponent({
    name: 'OuterRequestConsumer',
    setup() {
      outerClient = injectClient()
      outerRequest = outerClient.execute(getLayeredUsers())
      return () => h('span')
    },
  })

  const OuterSiblingConsumer = defineComponent({
    name: 'OuterSiblingConsumer',
    setup() {
      outerSiblingClient = injectClient()
      return () => h('span')
    },
  })

  const InnerLeaf = defineComponent({
    name: 'InnerLeafConsumer',
    setup() {
      innerLeafClient = injectClient()
      innerRequest = innerLeafClient.execute(getLayeredUsers())
      return () => h('span')
    },
  })

  const InnerMiddle = defineComponent({
    name: 'InnerMiddleConsumer',
    setup() {
      innerMiddleClient = injectClient()
      return () => h(InnerLeaf)
    },
  })

  const InnerProvider = defineComponent({
    name: 'InnerClientProvider',
    setup() {
      provide(
        HTTP_CLIENT,
        createClient(
          withEndpoint(testServerHost),
          withInterceptors(() => scopedInterceptor('inner')),
        ),
      )
      return () => h(InnerMiddle)
    },
  })

  const Root = defineComponent({
    name: 'RootClientProviderConsumer',
    setup() {
      return () => [h(OuterRequestConsumer), h(InnerProvider), h(OuterSiblingConsumer)]
    },
  })

  const app = createApp(Root)
  app.use(
    provideClient(
      withEndpoint(testServerHost),
      withInterceptors(() => scopedInterceptor('outer')),
    ),
  )
  app.mount(document.createElement('div'))

  const [outerResult, innerResult] = await Promise.all([outerRequest, innerRequest])

  expect(outerResult).toEqual([
    null,
    [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ],
  ])
  expect(innerResult).toEqual([
    null,
    [
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ],
  ])
  expect(outerClient).toBeDefined()
  expect(outerSiblingClient).toBeDefined()
  expect(innerMiddleClient).toBeDefined()
  expect(innerLeafClient).toBeDefined()
  expect(outerClient).toBe(outerSiblingClient)
  expect(innerMiddleClient).toBe(innerLeafClient)
  expect(innerLeafClient).not.toBe(outerClient)
  expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
})
```

- [ ] **Step 4: Run the focused Vue browser spec**

Run:

```bash
pnpm --dir packages/vue exec vitest run --config vitest.config.browser.ts src/core.browser.spec.ts
```

Expected: PASS. A failure in the nested provider test means the Vue wrapper or the test's use of public `HTTP_CLIENT` does not match the approved Vue subtree injection contract.

- [ ] **Step 5: Run Vue package verification**

Run:

```bash
pnpm --dir packages/vue test
pnpm --dir packages/vue typecheck
```

Expected: both commands exit 0. If Playwright reports missing browsers, record the exact environment error and run no replacement command that claims browser coverage.

- [ ] **Step 6: Commit checkpoint**

If the user has explicitly authorized commits, run:

```bash
git add packages/vue/src/core.browser.spec.ts
git commit -m "test(vue): cover nested client injection layers"
```

If commits are not authorized, run:

```bash
git status --short packages/vue/src/core.browser.spec.ts
```

Expected without commit authorization: the file appears as modified.

---

### Task 3: Angular browser test infrastructure

**Files:**

- Modify: `packages/angular/package.json`
- Create: `packages/angular/vitest.config.ts`
- Create: `packages/angular/vitest.config.browser.ts`
- Create: `packages/angular/test/shared.ts`
- Create: `packages/angular/test/setup.ts`

**Interfaces:**

- Consumes: root `pnpm-workspace.yaml` catalog versions for Vitest, Playwright, Hono, tsdown, tsx, TypeScript.
- Produces: `pnpm --dir packages/angular test` command and browser project that runs `packages/angular/src/**/*.browser.spec.ts`.

- [ ] **Step 1: Update Angular package scripts and devDependencies**

In `packages/angular/package.json`, replace the `scripts` and `devDependencies` blocks with this content while keeping the existing package metadata, `peerDependencies`, and `engines` unchanged:

```json
  "scripts": {
    "build": "tsdown",
    "pub": "pnpm publish",
    "test": "vitest run --config vitest.config.ts --coverage",
    "typecheck": "tsgo --project tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@angular/compiler": "22.0.0",
    "@angular/platform-browser": "22.0.0",
    "@angular/platform-browser-dynamic": "22.0.0",
    "@hono/node-server": "catalog:",
    "@typescript/native-preview": "catalog:",
    "@vitest/browser": "catalog:",
    "@vitest/browser-playwright": "catalog:",
    "@vitest/coverage-istanbul": "catalog:",
    "hono": "catalog:",
    "playwright": "catalog:",
    "tsdown": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:",
    "zone.js": "^0.16.0"
  },
```

The resulting file must remain valid JSON. Do not move `@angular/common`, `@angular/core`, or `@defjs/core` out of `peerDependencies`.

- [ ] **Step 2: Install Angular test dependencies into the workspace lockfile**

Run:

```bash
pnpm install
```

Expected: exit 0 and `pnpm-lock.yaml` updates the `packages/angular` importer with the new devDependencies.

- [ ] **Step 3: Create the Angular package Vitest aggregator config**

Create `packages/angular/vitest.config.ts` with exactly:

```ts
import { defineConfig } from 'vitest/config'
import { coverageConfig } from './test/shared'

export default defineConfig({
  test: {
    coverage: {
      ...coverageConfig,
    },
    projects: ['./vitest.config.browser.ts'],
  },
})
```

- [ ] **Step 4: Create the Angular browser Vitest config**

Create `packages/angular/vitest.config.browser.ts` with exactly:

```ts
import { resolve } from 'node:path'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { globalSetupPath, packageRoot } from './test/shared'

export default defineConfig({
  root: packageRoot,
  resolve: {
    alias: {
      '@defjs/core': resolve(packageRoot, '../core/src'),
    },
  },
  test: {
    name: 'angular-browser',
    globalSetup: globalSetupPath,
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

- [ ] **Step 5: Create the Angular test shared config**

Create `packages/angular/test/shared.ts` with exactly:

```ts
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const globalSetupPath = resolve(packageRoot, 'test/setup.ts')
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

- [ ] **Step 6: Create the Angular test server setup**

Create `packages/angular/test/setup.ts` with exactly:

```ts
import type { Socket } from 'node:net'
import type { ServerType } from '@hono/node-server'
import { createAdaptorServer } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import type { TestProject } from 'vitest/node'

declare module 'vitest' {
  export interface ProvidedContext {
    testServerHost: string
  }
}

let testServer: ServerType | undefined
const testServerSockets = new Set<Socket>()

export async function setup({ provide }: TestProject) {
  const app = new Hono()

  app.use(
    '*',
    cors({
      origin(origin) {
        return origin || '*'
      },
      allowHeaders: ['*', 'Accept', 'Content-Type', 'x-defjs-scope'],
      allowMethods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      credentials: true,
    }),
  )

  app.get('/api/users', (c) => {
    return c.json([
      { id: 1, name: 'John' },
      { id: 2, name: 'Jane' },
    ])
  })

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: '127.0.0.1',
  })
  testServer = server

  server.on('connection', (socket) => {
    testServerSockets.add(socket)
    socket.on('close', () => {
      testServerSockets.delete(socket)
    })
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const address = server.address()
  if (!address || typeof address === 'string') {
    throw new TypeError('Failed to resolve test server address')
  }

  const testServerAddr = `http://127.0.0.1:${address.port}`
  server.unref()
  provide('testServerHost', testServerAddr)
  console.log(`Test server is running on ${testServerAddr}`)
}

export async function teardown() {
  if (!testServer) {
    return
  }

  if (!testServer.listening) {
    testServerSockets.clear()
    testServer = undefined
    return
  }

  testServerSockets.forEach((socket) => {
    socket.destroy()
  })
  testServerSockets.clear()

  await new Promise<void>((resolve, reject) => {
    testServer?.close((error) => {
      if (error) {
        if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
          resolve()
          return
        }

        reject(error)
        return
      }

      resolve()
    })
  })

  testServer = undefined
}
```

- [ ] **Step 7: Run Angular test command before adding specs**

Run:

```bash
pnpm --dir packages/angular test -- --passWithNoTests
```

Expected: exit 0 and Vitest reports no matching tests or no tests. The command proves the new test infrastructure starts before the Angular spec is added.

- [ ] **Step 8: Commit checkpoint**

If the user has explicitly authorized commits, run:

```bash
git add packages/angular/package.json packages/angular/vitest.config.ts packages/angular/vitest.config.browser.ts packages/angular/test/shared.ts packages/angular/test/setup.ts pnpm-lock.yaml
git commit -m "test(angular): add browser test harness"
```

If commits are not authorized, run:

```bash
git status --short packages/angular/package.json packages/angular/vitest.config.ts packages/angular/vitest.config.browser.ts packages/angular/test/shared.ts packages/angular/test/setup.ts pnpm-lock.yaml
```

Expected without commit authorization: the Angular package config files appear as added or modified, and `pnpm-lock.yaml` appears modified after `pnpm install`.

---

### Task 4: Angular multi-layer DI component tests

**Files:**

- Create: `packages/angular/src/core.browser.spec.ts`

**Interfaces:**

- Consumes: Angular test infrastructure from Task 3.
- Consumes: `provideClient`, `injectClient`, `withEndpoint`, `withInterceptors` from `packages/angular/src/index.ts`.
- Consumes: `createHttpInterceptor`, `defineRequest`, `struct`, `Client` from `@defjs/core`.
- Produces: Angular browser tests for missing provider failure, single provider descendant reuse, and nested provider override.

- [ ] **Step 1: Create the Angular browser DI spec**

Create `packages/angular/src/core.browser.spec.ts` with exactly:

```ts
import '@angular/compiler'
import 'zone.js'
import 'zone.js/testing'

import { Component } from '@angular/core'
import { TestBed } from '@angular/core/testing'
import { BrowserDynamicTestingModule, platformBrowserDynamicTesting } from '@angular/platform-browser-dynamic/testing'
import { createHttpInterceptor, defineRequest, struct, type Client } from '@defjs/core'
import { afterEach, beforeAll, describe, expect, inject, it } from 'vitest'
import { injectClient, provideClient, withEndpoint, withInterceptors } from './index'

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(
      struct.object({
        id: struct.number(),
        name: struct.string(),
      }),
    ),
  },
})

type Users = Array<{ id: number; name: string }>

beforeAll(() => {
  TestBed.initTestEnvironment(BrowserDynamicTestingModule, platformBrowserDynamicTesting())
})

afterEach(() => {
  TestBed.resetTestingModule()
})

describe('Angular browser runtime', () => {
  it('should throw when injectClient is called without provider', async () => {
    @Component({
      standalone: true,
      template: '',
    })
    class LonelyConsumer {
      readonly client = injectClient()
    }

    await TestBed.configureTestingModule({
      imports: [LonelyConsumer],
    }).compileComponents()

    expect(() => TestBed.createComponent(LonelyConsumer)).toThrow(/HTTP_CLIENT|No provider/)
  })

  it('should share one client through multiple Angular component layers', async () => {
    const endpoint = inject('testServerHost')
    let middleClient: Client | undefined
    let leafClient: Client | undefined

    @Component({
      standalone: true,
      selector: 'leaf-client-consumer',
      template: '',
    })
    class LeafClientConsumer {
      readonly client = injectClient()

      constructor() {
        leafClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'middle-client-consumer',
      imports: [LeafClientConsumer],
      template: '<leaf-client-consumer />',
    })
    class MiddleClientConsumer {
      readonly client = injectClient()

      constructor() {
        middleClient = this.client
      }
    }

    @Component({
      standalone: true,
      imports: [MiddleClientConsumer],
      providers: [provideClient(withEndpoint(endpoint))],
      template: '<middle-client-consumer />',
    })
    class RootClientProvider {}

    await TestBed.configureTestingModule({
      imports: [RootClientProvider],
    }).compileComponents()

    const fixture = TestBed.createComponent(RootClientProvider)
    fixture.detectChanges()

    expect(middleClient).toBeDefined()
    expect(leafClient).toBeDefined()
    expect(middleClient).toBe(leafClient)
  })

  it('should resolve the nearest Angular provider in nested component trees', async () => {
    const endpoint = inject('testServerHost')
    const seenScopes: string[] = []
    let outerClient: Client | undefined
    let outerSiblingClient: Client | undefined
    let innerMiddleClient: Client | undefined
    let innerLeafClient: Client | undefined
    let outerRequest: Promise<[unknown, unknown]> | undefined
    let innerRequest: Promise<[unknown, unknown]> | undefined

    const scopedInterceptor = (scope: string) =>
      createHttpInterceptor(async (req, next) => {
        seenScopes.push(scope)
        req.headers.set('x-defjs-scope', scope)
        return next(req)
      })

    @Component({
      standalone: true,
      selector: 'outer-request-consumer',
      template: '',
    })
    class OuterRequestConsumer {
      readonly client = injectClient()

      constructor() {
        outerClient = this.client
        outerRequest = this.client.execute(getUsers()) as Promise<[unknown, unknown]>
      }
    }

    @Component({
      standalone: true,
      selector: 'outer-sibling-consumer',
      template: '',
    })
    class OuterSiblingConsumer {
      readonly client = injectClient()

      constructor() {
        outerSiblingClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-leaf-consumer',
      template: '',
    })
    class InnerLeafConsumer {
      readonly client = injectClient()

      constructor() {
        innerLeafClient = this.client
        innerRequest = this.client.execute(getUsers()) as Promise<[unknown, unknown]>
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-middle-consumer',
      imports: [InnerLeafConsumer],
      template: '<inner-leaf-consumer />',
    })
    class InnerMiddleConsumer {
      readonly client = injectClient()

      constructor() {
        innerMiddleClient = this.client
      }
    }

    @Component({
      standalone: true,
      selector: 'inner-client-provider',
      imports: [InnerMiddleConsumer],
      providers: [
        provideClient(
          withEndpoint(endpoint),
          withInterceptors(() => scopedInterceptor('inner')),
        ),
      ],
      template: '<inner-middle-consumer />',
    })
    class InnerClientProvider {}

    @Component({
      standalone: true,
      imports: [OuterRequestConsumer, InnerClientProvider, OuterSiblingConsumer],
      providers: [
        provideClient(
          withEndpoint(endpoint),
          withInterceptors(() => scopedInterceptor('outer')),
        ),
      ],
      template: '<outer-request-consumer /><inner-client-provider /><outer-sibling-consumer />',
    })
    class RootClientProvider {}

    await TestBed.configureTestingModule({
      imports: [RootClientProvider],
    }).compileComponents()

    const fixture = TestBed.createComponent(RootClientProvider)
    fixture.detectChanges()

    const [outerResult, innerResult] = await Promise.all([outerRequest, innerRequest])

    expect(outerResult).toEqual([
      null,
      [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ] satisfies Users,
    ])
    expect(innerResult).toEqual([
      null,
      [
        { id: 1, name: 'John' },
        { id: 2, name: 'Jane' },
      ] satisfies Users,
    ])
    expect(outerClient).toBeDefined()
    expect(outerSiblingClient).toBeDefined()
    expect(innerMiddleClient).toBeDefined()
    expect(innerLeafClient).toBeDefined()
    expect(outerClient).toBe(outerSiblingClient)
    expect(innerMiddleClient).toBe(innerLeafClient)
    expect(innerLeafClient).not.toBe(outerClient)
    expect([...seenScopes].sort()).toEqual(['inner', 'outer'])
  })
})
```

- [ ] **Step 2: Run the focused Angular browser spec**

Run:

```bash
pnpm --dir packages/angular exec vitest run --config vitest.config.browser.ts src/core.browser.spec.ts
```

Expected: PASS. If Angular reports that `EnvironmentProviders` cannot be used in component `providers`, replace only the component-level `providers: [provideClient(...)]` usages with Angular's accepted provider placement for standalone component tests, then rerun this exact command. Keep the assertions and public API calls unchanged.

- [ ] **Step 3: Run Angular package verification**

Run:

```bash
pnpm --dir packages/angular test
pnpm --dir packages/angular typecheck
```

Expected: both commands exit 0. If coverage fails because a branch in `packages/angular/src/core.ts` remains uncovered, add a focused test in `packages/angular/src/core.browser.spec.ts` that exercises the uncovered public API path instead of lowering thresholds.

- [ ] **Step 4: Commit checkpoint**

If the user has explicitly authorized commits, run:

```bash
git add packages/angular/src/core.browser.spec.ts
git commit -m "test(angular): cover nested client injection layers"
```

If commits are not authorized, run:

```bash
git status --short packages/angular/src/core.browser.spec.ts
```

Expected without commit authorization: the file appears as added.

---

### Task 5: Final cross-package verification

**Files:**

- Verify only; no planned source edits.

**Interfaces:**

- Consumes: React tests from Task 1.
- Consumes: Vue tests from Task 2.
- Consumes: Angular harness from Task 3 and Angular tests from Task 4.
- Produces: final evidence that all requested framework packages have independent nested DI coverage.

- [ ] **Step 1: Run package-level React verification**

Run:

```bash
pnpm --dir packages/react test
pnpm --dir packages/react typecheck
```

Expected: both commands exit 0.

- [ ] **Step 2: Run package-level Vue verification**

Run:

```bash
pnpm --dir packages/vue test
pnpm --dir packages/vue typecheck
```

Expected: both commands exit 0.

- [ ] **Step 3: Run package-level Angular verification**

Run:

```bash
pnpm --dir packages/angular test
pnpm --dir packages/angular typecheck
```

Expected: both commands exit 0.

- [ ] **Step 4: Run workspace verification**

Run:

```bash
pnpm test
pnpm typecheck
```

Expected: both commands exit 0. `pnpm test` must include `@defjs/angular` because Task 3 added its `test` script.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git status --short
git diff -- packages/react/src/e2e.browser.spec.tsx packages/react/README.md packages/vue/src/core.browser.spec.ts packages/angular/package.json packages/angular/vitest.config.ts packages/angular/vitest.config.browser.ts packages/angular/test/shared.ts packages/angular/test/setup.ts packages/angular/src/core.browser.spec.ts pnpm-lock.yaml
```

Expected: diff contains only the framework-specific test additions, Angular test infrastructure, React README wording update, and lockfile dependency changes.

- [ ] **Step 6: Commit checkpoint**

If the user has explicitly authorized commits, run:

```bash
git add packages/react/src/e2e.browser.spec.tsx packages/react/README.md packages/vue/src/core.browser.spec.ts packages/angular/package.json packages/angular/vitest.config.ts packages/angular/vitest.config.browser.ts packages/angular/test/shared.ts packages/angular/test/setup.ts packages/angular/src/core.browser.spec.ts pnpm-lock.yaml
git commit -m "test: cover nested framework client injection"
```

If commits are not authorized, run:

```bash
git status --short
```

Expected without commit authorization: all implementation files remain uncommitted for user review.

---

## Self-Review

### Spec coverage

- React nested provider behavior: covered by Task 1.
- Vue multi-layer and nested provider behavior: covered by Task 2.
- Angular independent test infrastructure: covered by Task 3.
- Angular component-level hierarchical injector behavior: covered by Task 4.
- No shared test abstraction: enforced in Global Constraints and by separate framework tasks.
- Final verification: covered by Task 5.

### Placeholder scan

The plan contains concrete file paths, concrete code snippets, exact commands, and expected outcomes. There are no placeholder sections.

### Type consistency

- React uses `ClientProvider`, `useClient`, `withEndpoint`, `withInterceptors` from the React package and `createHttpInterceptor` from `@defjs/core`.
- Vue uses public `HTTP_CLIENT` plus `injectClient`, `provideClient`, `withEndpoint`, `withInterceptors`; nested subtree client creation uses `createClient` from `@defjs/core` with Vue wrapper options.
- Angular tests use only public Angular wrapper APIs and do not import private tokens.
