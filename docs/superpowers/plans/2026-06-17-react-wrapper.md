# @defjs/react Wrapper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a new `packages/react` package that provides a thin React Context bridge (`ClientProvider`, `useClient`) for `@defjs/core`, including unit/integration tests and a real React app e2e test in Vitest browser mode.

**Architecture:** A single `ClientProvider` component creates a `@defjs/core` `Client` via `createClient(...options)` and exposes it through a private React Context. `useClient` consumes the Context and throws a descriptive error when called outside a Provider. `withEndpoint` and `withInterceptors` are thin helpers matching the Vue/Angular wrapper signatures.

**Tech Stack:** React 18+, TypeScript, tsdown, Vitest, `@vitest/browser-playwright`, Hono.

---

## File Structure

```
packages/react/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── tsdown.config.ts
├── vitest.config.ts
├── vitest.config.browser.ts
├── README.md
├── src/
│   ├── index.ts
│   ├── public_api.ts
│   ├── core.tsx              # Provider, hook, withEndpoint, withInterceptors
│   ├── core.browser.spec.tsx # unit/integration tests
│   └── e2e.browser.spec.tsx  # real React app e2e tests
└── test/
    ├── shared.ts             # coverage config + packageRoot + globalSetupPath
    └── setup.ts              # Hono test server global setup
```

---

### Task 1: Create package configuration

**Files:**
- Create: `packages/react/package.json`
- Create: `packages/react/tsconfig.json`
- Create: `packages/react/tsconfig.build.json`

- [ ] **Step 1: Create `packages/react/package.json`**

```json
{
  "name": "@defjs/react",
  "version": "0.0.1",
  "bugs": {
    "url": "https://github.com/defjs/defjs/issues"
  },
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/defjs/defjs.git"
  },
  "type": "module",
  "module": "src/index.ts",
  "typings": "src/index.ts",
  "exports": {
    "./package.json": "./package.json",
    ".": "./src/index.ts"
  },
  "publishConfig": {
    "directory": "dist"
  },
  "scripts": {
    "build": "tsdown",
    "pub": "pnpm publish",
    "test": "vitest run --config vitest.config.ts --coverage",
    "typecheck": "tsgo --project tsconfig.json --noEmit"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitest/browser": "catalog:",
    "@vitest/browser-playwright": "catalog:",
    "@vitest/coverage-istanbul": "catalog:",
    "playwright": "catalog:",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tsdown": "catalog:",
    "tsx": "catalog:",
    "typescript": "catalog:",
    "vitest": "catalog:"
  },
  "peerDependencies": {
    "@defjs/core": "workspace:^",
    "react": ">=18.0.0"
  },
  "engines": {
    "node": ">=26"
  }
}
```

- [ ] **Step 2: Create `packages/react/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
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
  "include": ["src/**/*.ts", "src/**/*.tsx", "test/**/*.ts"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create `packages/react/tsconfig.build.json`**

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx", "src/**/*.d.ts"],
  "exclude": ["test", "src/**/*.spec.ts", "src/**/*.spec.tsx", "src/**/*.type.test.ts", "src/**/*.browser.spec.ts", "src/**/*.browser.spec.tsx"]
}
```

- [ ] **Step 4: Run typecheck to verify config loads**

Run:

```bash
cd packages/react
pnpm install
pnpm typecheck
```

Expected: PASS (no source files yet, but config should load without errors)

- [ ] **Step 5: Commit**

```bash
git add packages/react/package.json packages/react/tsconfig.json packages/react/tsconfig.build.json
git commit -m "chore(react): bootstrap package config"
```

---

### Task 2: Add build configuration

**Files:**
- Create: `packages/react/tsdown.config.ts`

- [ ] **Step 1: Create `packages/react/tsdown.config.ts`**

```typescript
import { readFile, writeFile } from 'node:fs/promises'
import { defineConfig } from 'tsdown'

async function rewritePackageJson(outDir: string): Promise<void> {
  const raw = await readFile('./package.json', 'utf8')
  const pkg: Record<string, unknown> = JSON.parse(raw)

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
  deps: {
    neverBundle: ['react', 'react-dom', '@defjs/core'],
  },
  copy: ['../../LICENSE', './README.md'],
  hooks: {
    async 'build:done'({ options }) {
      await rewritePackageJson(options.outDir)
    },
  },
})
```

- [ ] **Step 2: Verify build config syntax**

Run:

```bash
cd packages/react
pnpm exec tsx --check tsdown.config.ts
```

Expected: PASS (no runtime execution, only syntax/type check)

- [ ] **Step 3: Commit**

```bash
git add packages/react/tsdown.config.ts
git commit -m "chore(react): add tsdown build config"
```

---

### Task 3: Add test infrastructure

**Files:**
- Create: `packages/react/test/shared.ts`
- Create: `packages/react/test/setup.ts`
- Create: `packages/react/vitest.config.ts`
- Create: `packages/react/vitest.config.browser.ts`

- [ ] **Step 1: Create `packages/react/test/shared.ts`**

```typescript
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
export const globalSetupPath = resolve(packageRoot, 'test/setup.ts')
export const coverageConfig = {
  enabled: true,
  provider: 'istanbul' as const,
  reporter: ['lcov', 'json', 'html', 'text'],
  reportsDirectory: resolve(packageRoot, 'coverage'),
  include: ['src/**/*.ts', 'src/**/*.tsx'],
  exclude: ['**/node_modules/**', '**/test/**', 'src/**/*.spec.ts', 'src/**/*.spec.tsx', 'src/**/*.type.test.ts'],
  thresholds: {
    branches: 100,
    functions: 100,
    lines: 100,
    statements: 100,
  },
}
```

- [ ] **Step 2: Create `packages/react/test/setup.ts`**

Copy from `packages/vue/test/setup.ts` verbatim:

```typescript
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
      allowHeaders: ['*', 'Accept', 'Content-Type'],
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

  app.get('/api/users/:id', (c) => {
    const id = c.req.param('id')
    return c.json({ id: Number(id), name: 'John' })
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

- [ ] **Step 3: Create `packages/react/vitest.config.ts`**

```typescript
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

- [ ] **Step 4: Create `packages/react/vitest.config.browser.ts`**

```typescript
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
    name: 'react-browser',
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
          include: ['src/**/*.browser.spec.tsx', 'src/**/*.chrome.spec.tsx'],
        },
        {
          browser: 'firefox',
          include: ['src/**/*.browser.spec.tsx', 'src/**/*.firefox.spec.tsx'],
        },
      ],
    },
  },
})
```

- [ ] **Step 5: Commit**

```bash
git add packages/react/test packages/react/vitest.config.ts packages/react/vitest.config.browser.ts
git commit -m "chore(react): add test infrastructure"
```

---

### Task 4: Write unit/integration tests for core wrapper

**Files:**
- Create: `packages/react/src/core.browser.spec.tsx`

- [ ] **Step 1: Create the test file with imports and mount helper**

```tsx
import type { Client, ClientConfig, Interceptor } from '@defjs/core'
import { describe, expect, it } from 'vitest'
import { createRoot } from 'react-dom/client'
import type { ReactElement } from 'react'
import { ClientProvider, useClient, withEndpoint, withInterceptors } from './core'

function mount(element: ReactElement): { container: HTMLDivElement; unmount: () => void } {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  root.render(element)
  return {
    container,
    unmount: () => {
      root.unmount()
      container.remove()
    },
  }
}
```

- [ ] **Step 2: Add tests for `withEndpoint`**

```tsx
describe('withEndpoint', () => {
  it('should return a ClientOption function', () => {
    const option = withEndpoint('https://api.example.com')
    expect(typeof option).toBe('function')
  })

  it('should set endpoint in config', () => {
    const config = {} as ClientConfig
    const option = withEndpoint('https://api.example.com')
    option(config)
    expect(config.endpoint).toBe('https://api.example.com')
  })
})
```

- [ ] **Step 3: Add tests for `withInterceptors`**

```tsx
describe('withInterceptors', () => {
  it('should return a ClientOption function', () => {
    const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
    expect(typeof option).toBe('function')
  })

  it('should set interceptors in config', () => {
    const config = {} as ClientConfig
    const interceptor = (() => ({})) as unknown as () => Interceptor
    const option = withInterceptors(interceptor)
    option(config)
    expect(config.interceptors).toEqual([interceptor()])
  })
})
```

- [ ] **Step 4: Add tests for `ClientProvider` and `useClient`**

```tsx
describe('ClientProvider', () => {
  it('should provide client to child component', () => {
    let injectedClient: Client | undefined

    function Child() {
      injectedClient = useClient()
      return null
    }

    const { unmount } = mount(
      <ClientProvider>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
    unmount()
  })

  it('should configure endpoint via withEndpoint', () => {
    let injectedClient: Client | undefined

    function Child() {
      injectedClient = useClient()
      return null
    }

    const { unmount } = mount(
      <ClientProvider options={[withEndpoint('https://api.example.com')]}>
        <Child />
      </ClientProvider>,
    )

    expect(injectedClient).toBeDefined()
    unmount()
  })
})

describe('useClient', () => {
  it('should throw when no provider is present', () => {
    function Child() {
      useClient()
      return null
    }

    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    expect(() => {
      root.render(<Child />)
    }).toThrow('No HTTP client provided')

    root.unmount()
    container.remove()
  })
})
```

- [ ] **Step 5: Run tests to confirm they fail**

Run:

```bash
cd packages/react
pnpm test
```

Expected: FAIL with module not found or function not defined errors for `./core`

- [ ] **Step 6: Commit**

```bash
git add packages/react/src/core.browser.spec.tsx
git commit -m "test(react): add failing browser tests for core wrapper"
```

---

### Task 5: Implement core wrapper

**Files:**
- Create: `packages/react/src/core.tsx`
- Create: `packages/react/src/public_api.ts`
- Create: `packages/react/src/index.ts`

- [ ] **Step 1: Create `packages/react/src/core.tsx`**

```tsx
'use client'

import type { Client, ClientOption, Interceptor } from '@defjs/core'
import { createClient } from '@defjs/core'
import { createContext, useContext, useState, type ReactNode } from 'react'

const HttpClientContext = createContext<Client | null>(null)

export interface ClientProviderProps {
  options?: ClientOption[]
  children?: ReactNode
}

export function ClientProvider({ options = [], children }: ClientProviderProps) {
  const [client] = useState(() => createClient(...options))

  return <HttpClientContext.Provider value={client}>{children}</HttpClientContext.Provider>
}

export function useClient(): Client {
  const client = useContext(HttpClientContext)

  if (!client) {
    throw new Error('No HTTP client provided. Did you forget to wrap your app in <ClientProvider>?')
  }

  return client
}

export function withEndpoint(endpoint: string): ClientOption {
  return (config) => {
    config.endpoint = endpoint
  }
}

export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config) => {
    config.interceptors = fns.map((fn) => fn())
  }
}
```

- [ ] **Step 2: Create `packages/react/src/public_api.ts`**

```typescript
export { ClientProvider, useClient, withEndpoint, withInterceptors } from './core'
export type { ClientProviderProps } from './core'
```

- [ ] **Step 3: Create `packages/react/src/index.ts`**

```typescript
export * from './public_api'
```

- [ ] **Step 4: Run tests to confirm core tests pass**

Run:

```bash
cd packages/react
pnpm test
```

Expected: PASS for `src/core.browser.spec.tsx` in Chromium and Firefox

- [ ] **Step 5: Commit**

```bash
git add packages/react/src/core.tsx packages/react/src/public_api.ts packages/react/src/index.ts
git commit -m "feat(react): implement ClientProvider, useClient and option helpers"
```

---

### Task 6: Write e2e tests with real React app

**Files:**
- Create: `packages/react/src/e2e.browser.spec.tsx`

- [ ] **Step 1: Create `packages/react/src/e2e.browser.spec.tsx`**

```tsx
import { describe, expect, inject, it, vi } from 'vitest'
import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { defineRequest, struct } from '@defjs/core'
import { ClientProvider, useClient, withEndpoint } from './core'

const UserSchema = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(UserSchema),
  },
})

function UserList() {
  const client = useClient()
  const [users, setUsers] = useState<Array<{ id: number; name: string }>>([])

  useEffect(() => {
    client.execute(getUsers()).then(([, users]) => {
      if (users) {
        setUsers(users)
      }
    })
  }, [client])

  return (
    <ul data-testid="user-list">
      {users.map((user) => (
        <li key={user.id} data-testid={`user-${user.id}`}>{user.name}</li>
      ))}
    </ul>
  )
}

function App({ endpoint }: { endpoint: string }) {
  return (
    <ClientProvider options={[withEndpoint(endpoint)]}>
      <div>
        <h1>Users</h1>
        <UserList />
      </div>
    </ClientProvider>
  )
}

describe('React wrapper e2e', () => {
  it('should fetch and render real data through useClient', async () => {
    const endpoint = inject('testServerHost')
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    root.render(
      <App endpoint={endpoint} />,
    )

    await vi.waitFor(() => {
      expect(container.querySelector('[data-testid="user-1"]')?.textContent).toBe('John')
      expect(container.querySelector('[data-testid="user-2"]')?.textContent).toBe('Jane')
    })

    root.unmount()
    container.remove()
  })

  it('should provide the same client instance to nested components', () => {
    const endpoint = inject('testServerHost')
    const clients: unknown[] = []
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    function DeepChild() {
      clients.push(useClient())
      return null
    }

    function MiddleChild() {
      clients.push(useClient())
      return <DeepChild />
    }

    root.render(
      <ClientProvider options={[withEndpoint(endpoint)]}>
        <MiddleChild />
      </ClientProvider>,
    )

    expect(clients.length).toBe(2)
    expect(clients[0]).toBe(clients[1])
    root.unmount()
    container.remove()
  })
})
```

- [ ] **Step 2: Run e2e tests to confirm they pass**

Run:

```bash
cd packages/react
pnpm test
```

Expected: PASS for `src/e2e.browser.spec.tsx` in Chromium and Firefox

- [ ] **Step 3: Commit**

```bash
git add packages/react/src/e2e.browser.spec.tsx
git commit -m "test(react): add e2e tests with real React app"
```

---

### Task 7: Add README

**Files:**
- Create: `packages/react/README.md`

- [ ] **Step 1: Create `packages/react/README.md`**

```markdown
# @defjs/react

React wrapper for [@defjs/core](https://github.com/defjs/defjs).

## Installation

```bash
pnpm add @defjs/react @defjs/core react
```

## Usage

```tsx
import { ClientProvider, useClient, withEndpoint, withInterceptors } from '@defjs/react'
import { defineRequest, struct } from '@defjs/core'

function App() {
  return (
    <ClientProvider options={[
      withEndpoint('https://api.example.com'),
      withInterceptors(() => ({
        // interceptor
      })),
    ]}>
      <UserList />
    </ClientProvider>
  )
}

const getUsers = defineRequest({
  method: 'GET',
  path: '/api/users',
  output: {
    200: struct.array(struct.object({ id: struct.number(), name: struct.string() })),
  },
})

function UserList() {
  const client = useClient()

  useEffect(() => {
    client.execute(getUsers()).then(([, users]) => {
      if (users) {
        console.log(users)
      }
    })
  }, [client])

  return <div>Users</div>
}
```

## API

- `ClientProvider` — React Context Provider for the HTTP client
- `useClient()` — Hook to access the client inside a Provider
- `withEndpoint(endpoint)` — Configure the base endpoint
- `withInterceptors(...factories)` — Register interceptors

## License

MIT
```

- [ ] **Step 2: Commit**

```bash
git add packages/react/README.md
git commit -m "docs(react): add README"
```

---

### Task 8: Verify build, typecheck, lint and tests

**Files:**
- Modify: may update files based on verification output

- [ ] **Step 1: Run typecheck**

```bash
cd packages/react
pnpm typecheck
```

Expected: PASS with no errors

- [ ] **Step 2: Run lint**

```bash
cd packages/react
pnpm exec oxlint .
```

Expected: PASS with no errors (or warnings fixed)

- [ ] **Step 3: Run tests with coverage**

```bash
cd packages/react
pnpm test
```

Expected: PASS with 100% coverage thresholds met in all browsers

- [ ] **Step 4: Run build**

```bash
cd packages/react
pnpm build
```

Expected: PASS and produce `packages/react/dist/` with `index.js`, `index.d.ts`, `package.json`, `LICENSE`, `README.md`

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore(react): pass verification (typecheck, lint, tests, build)"
```

---

### Task 9: Add workspace integration

**Files:**
- Modify: `pnpm-workspace.yaml` (if needed)
- Modify: root `package.json` scripts (if needed)

- [ ] **Step 1: Verify package is picked up by pnpm workspace**

`packages/react` is already under `packages/*`, so no `pnpm-workspace.yaml` change is needed.

- [ ] **Step 2: Verify root scripts include react tests**

Root `package.json` scripts use `pnpm -r run test`, which will include `packages/react` automatically.

- [ ] **Step 3: Run root test command**

```bash
cd /Users/munmunmiao/Documents/web/zen-kit
pnpm test
```

Expected: All packages including `@defjs/react` run their tests

- [ ] **Step 4: Commit**

```bash
git commit --allow-empty -m "chore(react): confirm workspace integration"
```

---

## Self-Review

### Spec coverage

| Spec section | Implementing task |
|--------------|-------------------|
| API: ClientProvider | Task 5 |
| API: useClient | Task 5 |
| API: withEndpoint | Task 5 |
| API: withInterceptors | Task 5 |
| SSR/RSC safety (`"use client"`) | Task 5 |
| Unit/integration tests | Task 4 |
| E2E tests with real React app | Task 6 |
| Build config (tsdown) | Task 2 |
| Test config (Vitest browser mode) | Task 3 |
| README | Task 7 |

### Placeholder scan

- No TBD/TODO/implement-later placeholders
- No vague "add error handling" steps
- Each test includes concrete code and expected output

### Type consistency

- `ClientProviderProps` defined in `core.tsx` and re-exported from `public_api.ts`
- `withInterceptors` accepts `(() => Interceptor)[]` matching Vue/Angular wrapper signatures
- `ClientOption` and `Interceptor` types imported from `@defjs/core`
- Test files use `.tsx` because they contain JSX; Vitest include patterns match `.tsx`

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-17-react-wrapper.md`.

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

Which approach would you like?
