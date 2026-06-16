# Oxlint/Oxfmt Type Safety Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Biome with Oxlint/Oxfmt, normalize public API entrypoints, and deeply reduce unsafe TypeScript escape hatches across production and tests without introducing `check:constraints` or any independent constraint checker.

**Architecture:** Oxlint owns linting, Oxfmt owns formatting, tsgo owns typechecking, Vitest owns runtime tests. Project-specific constraints that Oxlint cannot express are implemented directly in code structure and maintained by review; no separate constraint-checking command is added.

**Tech Stack:** TypeScript, pnpm 11, Oxlint, Oxfmt, tsgo (`@typescript/native-preview`), tsdown, Vitest, Angular, Vue.

---

## Scope and sequencing

This plan implements the approved spec in `docs/superpowers/specs/2026-06-13-oxlint-oxfmt-type-safety-design.md`.

The work is intentionally split into commits that each leave the repo understandable:

1. Toolchain migration to Oxlint/Oxfmt.
2. `public_api.ts` entrypoint normalization.
3. Import-style cleanup.
4. Type-safety refactors in focused core modules.
5. Test cleanup and full verification.

Do not create `check:constraints`, `check-code-constraints.ts`, AST policy scanners, or CI-only constraint scripts. If a constraint cannot be represented by Oxlint/Oxfmt, enforce it by the code changes in this plan and note that future maintenance is by code review.

---

## File structure map

### Toolchain files

- Modify: `package.json` — replace Biome scripts/dependency with Oxlint/Oxfmt scripts/dependencies.
- Modify: `pnpm-workspace.yaml` — replace Biome catalog entries with Oxlint/Oxfmt catalog entries.
- Create: `oxlint.config.ts` — repo-level Oxlint configuration.
- Create: `.oxfmtrc.json` — repo-level Oxfmt configuration.
- Delete: `biome.json` — no longer the root lint/format config.
- Delete: `packages/core/biome.json` — no longer package lint/format config.
- Delete: `packages/angular/biome.json` — no longer package lint/format config.
- Delete: `packages/vue/biome.json` — no longer package lint/format config.
- Modify: `packages/core/package.json` — replace `lint`/`lint:fix`, add `fmt`/`fmt:check`.
- Modify: `packages/angular/package.json` — replace `lint`/`lint:fix`, add `fmt`/`fmt:check`.
- Modify: `packages/vue/package.json` — replace `lint`/`lint:fix`, add `fmt`/`fmt:check`.
- Modify: `packages/opentelemetry-server/package.json` — replace `lint`/`lint:fix`, add `fmt`/`fmt:check`.

### Public API files

- Create: `packages/angular/src/public_api.ts` — Angular package public surface.
- Modify: `packages/angular/src/index.ts` — re-export only `./public_api`.
- Create: `packages/vue/src/public_api.ts` — Vue package public surface.
- Modify: `packages/vue/src/index.ts` — re-export only `./public_api`.
- Create: `packages/core/src/error/public_api.ts` — core error public surface.
- Modify: `packages/core/src/error/index.ts` — re-export only `./public_api`.
- Create: `packages/core/src/http/transport/public_api.ts` — HTTP transport public surface.
- Modify: `packages/core/src/http/transport/index.ts` — re-export only `./public_api`.
- Create: `packages/core/src/struct/codec/public_api.ts` — struct codec public surface.
- Modify: `packages/core/src/struct/codec/index.ts` — re-export only `./public_api`.

### Import cleanup files

- Modify: `packages/vue/src/core.ts` — replace `import('@defjs/core').Interceptor` with top-level `import type { Interceptor }`.
- Modify: `packages/core/src/struct/types.tag.type.test.ts` — replace `typeof import('./index')` references with top-level named imports.
- Modify: `packages/core/src/struct/types.runtime.type.test.ts` — replace `import('./index')` references with top-level named imports.
- Modify every file reported by `grep -R "{ type " packages --include='*.ts'` — split inline type specifiers into separate `import type` declarations.
- Modify every file reported by `grep -RIn "import(" packages --include='*.ts'` or `grep -RIn "require(" packages --include='*.ts'` — remove inline import expressions or replace with top-level imports.

### Type-safety files

- Modify: `packages/core/src/interceptor/interceptor.ts` — remove `any` from chain builder.
- Modify: `packages/core/src/interceptor/interceptor.type.test.ts` — add or update type tests for interceptor chain signatures.
- Modify: `packages/core/src/internal/request_builder.ts` — expose typed build callback path and reduce runtime boundary casts.
- Modify: `packages/core/src/internal/request_builder.spec.ts` — remove callback `any` annotations and keep behavior tests.
- Create: `packages/core/src/internal/request_builder.type.test.ts` — focused type tests for build input inference.
- Modify: `packages/core/src/struct/types.ts` — replace avoidable `any` with `unknown` or constrained schema aliases.
- Modify: `packages/core/src/struct/constructors.ts` — centralize schema construction assertions.
- Modify: `packages/core/src/sse/sse.ts` — reduce endpoint/session casts and add boundary remarks where casts remain.
- Modify: `packages/core/src/web_socket/web_socket.ts` — reduce endpoint/session casts and add boundary remarks where casts remain.
- Modify: `packages/core/src/sse/*.spec.ts`, `packages/core/src/web_socket/*.spec.ts`, `packages/core/src/http/*.spec.ts`, `packages/vue/test/core.spec.ts`, and `packages/core/test/setup.ts` — remove test `any` and naked unsafe assertions.

---

## Task 1: Replace Biome dependencies and scripts with Oxlint/Oxfmt

**Files:**

- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `packages/core/package.json`
- Modify: `packages/angular/package.json`
- Modify: `packages/vue/package.json`
- Modify: `packages/opentelemetry-server/package.json`
- Create: `oxlint.config.ts`
- Create: `.oxfmtrc.json`
- Delete: `biome.json`
- Delete: `packages/core/biome.json`
- Delete: `packages/angular/biome.json`
- Delete: `packages/vue/biome.json`

- [ ] **Step 1: Install the replacement toolchain**

Run:

```bash
pnpm add -Dw oxlint@1.69.0 oxfmt@0.54.0 oxlint-tsgolint@0.23.0
```

Expected: `package.json`, `pnpm-workspace.yaml`, and `pnpm-lock.yaml` update with Oxlint/Oxfmt packages. No source files should change.

- [ ] **Step 2: Remove Biome from root devDependencies**

In `package.json`, replace the root `devDependencies` entry:

```json
"@biomejs/biome": "catalog:"
```

with:

```json
"oxfmt": "catalog:",
"oxlint": "catalog:",
"oxlint-tsgolint": "catalog:"
```

Keep the entries alphabetized the same way the file naturally settles after formatting.

- [ ] **Step 3: Update root scripts**

In `package.json`, replace the `scripts` object with this exact shape, preserving existing non-quality scripts:

```json
"scripts": {
  "build": "pnpm -r run build",
  "changeset": "changeset",
  "changeset:version": "changeset version",
  "check": "pnpm lint && pnpm fmt:check && pnpm typecheck",
  "fmt": "oxfmt . --write",
  "fmt:check": "oxfmt . --check",
  "lint": "oxlint .",
  "lint:fix": "oxlint . --fix",
  "test": "pnpm -r run test",
  "typecheck": "pnpm -r --if-present run typecheck"
}
```

Do not add `check:constraints` or any equivalent script.

- [ ] **Step 4: Update workspace catalog**

In `pnpm-workspace.yaml`, remove:

```yaml
'@biomejs/biome': '2.5.0'
```

Add:

```yaml
oxfmt: '0.54.0'
oxlint: '1.69.0'
oxlint-tsgolint: '0.23.0'
```

Remove all `@biomejs/...@2.5.0` entries from `minimumReleaseAgeExclude`. Add these exact entries near the other toolchain exclusions:

```yaml
- 'oxfmt@0.54.0'
- 'oxlint-tsgolint@0.23.0'
- 'oxlint@1.69.0'
```

- [ ] **Step 5: Create `oxlint.config.ts`**

Create `oxlint.config.ts` with:

```ts
import { defineConfig } from 'oxlint'

export default defineConfig({
  plugins: ['typescript', 'import', 'vitest'],
  rules: {
    'import/no-namespace': 'error',
    'typescript/ban-ts-comment': [
      'error',
      {
        minimumDescriptionLength: 10,
        'ts-expect-error': 'allow-with-description',
        'ts-ignore': true,
      },
    ],
    'typescript/consistent-type-imports': [
      'error',
      {
        disallowTypeAnnotations: true,
        fixStyle: 'separate-type-imports',
        prefer: 'type-imports',
      },
    ],
    'typescript/no-explicit-any': 'error',
    'typescript/no-non-null-assertion': 'error',
  },
})
```

If Oxlint reports an unknown rule during verification, remove only that unsupported rule from `oxlint.config.ts`, record the unsupported rule name in the final implementation report, and do not replace it with a standalone checker.

- [ ] **Step 6: Create `.oxfmtrc.json`**

Create `.oxfmtrc.json` with:

```json
{
  "$schema": "./node_modules/oxfmt/configuration_schema.json",
  "ignorePatterns": [
    "**/node_modules/**",
    "**/dist/**",
    "**/coverage/**",
    "**/test-out/**",
    "**/build/**",
    "**/.next/**",
    "**/out/**",
    "**/.claude/**",
    "**/playwright-report/**",
    "**/blob-report/**",
    "**/test-results/**"
  ],
  "printWidth": 140,
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "useTabs": false
}
```

- [ ] **Step 7: Update package-level scripts**

In each of these files:

- `packages/core/package.json`
- `packages/angular/package.json`
- `packages/vue/package.json`
- `packages/opentelemetry-server/package.json`

replace:

```json
"lint": "biome check",
"lint:fix": "biome check --write"
```

with:

```json
"fmt": "oxfmt . --write",
"fmt:check": "oxfmt . --check",
"lint": "oxlint .",
"lint:fix": "oxlint . --fix"
```

Keep existing `build`, `test`, `typecheck`, and `pub` scripts unchanged.

- [ ] **Step 8: Delete Biome config files**

Delete these files:

```bash
rm biome.json packages/core/biome.json packages/angular/biome.json packages/vue/biome.json
```

Do not delete unrelated docs or generated files.

- [ ] **Step 9: Verify the toolchain commands are wired**

Run:

```bash
pnpm lint
```

Expected: Oxlint runs. The command may fail with existing code violations; it must not fail because `oxlint` is missing or because the config cannot be parsed.

Run:

```bash
pnpm fmt:check
```

Expected: Oxfmt runs. The command may report files needing formatting; it must not fail because `oxfmt` is missing or because `.oxfmtrc.json` cannot be parsed.

- [ ] **Step 10: Commit toolchain migration**

Run:

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml oxlint.config.ts .oxfmtrc.json packages/core/package.json packages/angular/package.json packages/vue/package.json packages/opentelemetry-server/package.json biome.json packages/core/biome.json packages/angular/biome.json packages/vue/biome.json
git commit -m "chore: replace biome with oxlint and oxfmt"
```

Expected: one commit that contains only toolchain configuration, scripts, lockfile, and removed Biome configs.

---

## Task 2: Normalize public API entrypoints

**Files:**

- Create: `packages/angular/src/public_api.ts`
- Modify: `packages/angular/src/index.ts`
- Create: `packages/vue/src/public_api.ts`
- Modify: `packages/vue/src/index.ts`
- Create: `packages/core/src/error/public_api.ts`
- Modify: `packages/core/src/error/index.ts`
- Create: `packages/core/src/http/transport/public_api.ts`
- Modify: `packages/core/src/http/transport/index.ts`
- Create: `packages/core/src/struct/codec/public_api.ts`
- Modify: `packages/core/src/struct/codec/index.ts`

- [ ] **Step 1: Add Angular public API file**

Create `packages/angular/src/public_api.ts`:

```ts
export { injectClient, provideClient, provideGlobalClient, withHost, withInterceptors } from './core'
```

- [ ] **Step 2: Restrict Angular index to public API**

Replace all contents of `packages/angular/src/index.ts` with:

```ts
export * from './public_api'
```

- [ ] **Step 3: Add Vue public API file**

Create `packages/vue/src/public_api.ts`:

```ts
export { getGlobalClient, resetGlobalClient } from '@defjs/core'
export { HTTP_CLIENT, injectClient, provideClient, provideGlobalClient, withHost, withInterceptors } from './core'
```

- [ ] **Step 4: Restrict Vue index to public API**

Replace all contents of `packages/vue/src/index.ts` with:

```ts
export * from './public_api'
```

- [ ] **Step 5: Add core error public API file**

Create `packages/core/src/error/public_api.ts`:

```ts
export * from './factory'
export * from './types'
```

- [ ] **Step 6: Restrict core error index to public API**

Replace all contents of `packages/core/src/error/index.ts` with:

```ts
export * from './public_api'
```

- [ ] **Step 7: Add HTTP transport public API file**

Create `packages/core/src/http/transport/public_api.ts`:

```ts
export { fetchHandler } from './fetch'
```

- [ ] **Step 8: Restrict HTTP transport index to public API**

Replace all contents of `packages/core/src/http/transport/index.ts` with:

```ts
export * from './public_api'
```

- [ ] **Step 9: Add struct codec public API file**

Create `packages/core/src/struct/codec/public_api.ts`:

```ts
export * from './json'
export * from './multipart'
export * from './query'
export * from './urlencoded'
```

- [ ] **Step 10: Restrict struct codec index to public API**

Replace all contents of `packages/core/src/struct/codec/index.ts` with:

```ts
export * from './public_api'
```

- [ ] **Step 11: Verify public API changes typecheck**

Run:

```bash
pnpm typecheck
```

Expected: either PASS, or failures unrelated to public API entrypoint shape. If a public export is missing, add it to the relevant `public_api.ts` rather than exporting directly from `index.ts`.

- [ ] **Step 12: Commit public API normalization**

Run:

```bash
git add packages/angular/src/public_api.ts packages/angular/src/index.ts packages/vue/src/public_api.ts packages/vue/src/index.ts packages/core/src/error/public_api.ts packages/core/src/error/index.ts packages/core/src/http/transport/public_api.ts packages/core/src/http/transport/index.ts packages/core/src/struct/codec/public_api.ts packages/core/src/struct/codec/index.ts
git commit -m "refactor: normalize public api entrypoints"
```

---

## Task 3: Remove inline type imports and inline type specifiers

**Files:**

- Modify: `packages/vue/src/core.ts`
- Modify: `packages/core/src/struct/types.tag.type.test.ts`
- Modify: `packages/core/src/struct/types.runtime.type.test.ts`
- Modify any additional file found by the search commands in this task.

- [ ] **Step 1: Find forbidden import forms**

Run:

```bash
grep -RIn "import(" packages --include='*.ts'
grep -RIn "require(" packages --include='*.ts'
grep -RIn "import type \* as\|import \* as" packages --include='*.ts'
grep -RIn "{ type " packages --include='*.ts'
```

Expected before changes: at least `packages/vue/src/core.ts` and core struct type tests are reported. After this task, these commands should print no source violations. Ignore matches in comments only after confirming the comment is not an instruction to keep forbidden code.

- [ ] **Step 2: Fix Vue inline type import**

In `packages/vue/src/core.ts`, replace the first import:

```ts
import { type Client, type ClientOption, createClient, setGlobalClient } from '@defjs/core'
```

with two top-level imports:

```ts
import type { Client, ClientOption, Interceptor } from '@defjs/core'
import { createClient, setGlobalClient } from '@defjs/core'
```

Then replace the `withInterceptors` signature:

```ts
export function withInterceptors(...fns: (() => import('@defjs/core').Interceptor)[]): ClientOption {
```

with:

```ts
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
```

- [ ] **Step 3: Fix Angular inline type specifiers**

In `packages/angular/src/core.ts`, replace:

```ts
import { APP_INITIALIZER, type EnvironmentProviders, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core'
import {
  type Client,
  createClient,
  type Interceptor,
  setGlobalClient,
  withInterceptors as withClientInterceptors,
  withEndpoint,
} from '@defjs/core'
```

with:

```ts
import { DOCUMENT } from '@angular/common'
import type { EnvironmentProviders } from '@angular/core'
import { APP_INITIALIZER, InjectionToken, inject, makeEnvironmentProviders } from '@angular/core'
import type { Client, Interceptor } from '@defjs/core'
import { createClient, setGlobalClient, withEndpoint, withInterceptors as withClientInterceptors } from '@defjs/core'
```

Keep only one `DOCUMENT` import; if the file already has `import { DOCUMENT } from '@angular/common'`, do not duplicate it.

- [ ] **Step 4: Fix struct tag public API negative type test**

In `packages/core/src/struct/types.tag.type.test.ts`, add top-level value imports for removed public values that are checked with `typeof`:

```ts
import { struct } from './index'
```

For references that currently use `typeof import('./index').XmlTag`, replace them with named imports only when the symbol is expected to exist. For removed symbols that are intentionally absent, keep the negative test as a property access on a typed module value is not possible without namespace import. Replace those assertions with direct import-negative tests:

```ts
// @ts-expect-error XmlTag was removed from public exports.
import type { XmlTag } from './index'
```

For removed runtime helpers, use named imports with `@ts-expect-error`:

```ts
// @ts-expect-error XML object encoder was removed from public exports.
import { encodeXmlObject } from './index'
```

Place these imports at the top of the file. Do not use `import * as` or `typeof import()`.

- [ ] **Step 5: Fix struct runtime public API negative type test**

In `packages/core/src/struct/types.runtime.type.test.ts`, replace every `import('./index').Name` or `typeof import('./index').name` negative check with a top-level named import preceded by an explanatory `@ts-expect-error` comment, for example:

```ts
// @ts-expect-error TypeOf is intentionally not part of the public struct API.
import type { TypeOf } from './index'
```

and:

```ts
// @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
import { encodeJson } from './index'
```

Do not use namespace import.

- [ ] **Step 6: Split all inline type specifiers**

For every file found by:

```bash
grep -RIn "{ type " packages --include='*.ts'
```

change mixed imports from this pattern:

```ts
import { type A, b, type C } from './module'
```

into separate imports:

```ts
import type { A, C } from './module'
import { b } from './module'
```

Do not use `import type * as`.

- [ ] **Step 7: Verify forbidden import forms are gone**

Run:

```bash
grep -RIn "import(" packages --include='*.ts'
grep -RIn "require(" packages --include='*.ts'
grep -RIn "import type \* as\|import \* as" packages --include='*.ts'
grep -RIn "{ type " packages --include='*.ts'
pnpm typecheck
```

Expected: the four grep commands produce no code violations, and `pnpm typecheck` passes or reports only pre-existing type-safety failures to be handled in later tasks.

- [ ] **Step 8: Commit import cleanup**

Run:

```bash
git add packages/vue/src/core.ts packages/angular/src/core.ts packages/core/src/struct/types.tag.type.test.ts packages/core/src/struct/types.runtime.type.test.ts
```

Then list any additional files changed by inline type-specifier cleanup:

```bash
git status --short packages
```

Add only the additional files actually changed in this task, using explicit paths. Then commit:

```bash
git commit -m "refactor: use explicit top-level type imports"
```

---

## Task 4: Remove `any` from interceptor chain builders

**Files:**

- Modify: `packages/core/src/interceptor/interceptor.ts`
- Modify: `packages/core/src/interceptor/interceptor.type.test.ts`
- Test: `packages/core/src/interceptor/interceptor.runtime.spec.ts`

- [ ] **Step 1: Add type tests for chain signatures**

Append to `packages/core/src/interceptor/interceptor.type.test.ts`:

```ts
import type { HttpRequest } from '../internal/http_request'
import type { HttpResponse } from '../internal/http_response'
import type { EventStreamHandle } from '../sse/transport/event_stream'
import type { InterceptorFn, SSEInterceptorFn, WebSocketHandler, WebSocketInterceptorFn } from './interceptor'
import { makeInterceptorChain, makeSSEInterceptorChain, makeWebSocketInterceptorChain } from './interceptor'

const httpChain: InterceptorFn = makeInterceptorChain([])
const sseChain: SSEInterceptorFn = makeSSEInterceptorChain([])
const wsChain: WebSocketInterceptorFn = makeWebSocketInterceptorChain([])

const httpNext = async (_req: HttpRequest): Promise<HttpResponse<unknown>> => ({
  error: null,
  headers: new Headers(),
  ok: true,
  status: 200,
  statusText: 'OK',
  url: 'https://example.test',
})

const sseNext = async (_req: HttpRequest): Promise<EventStreamHandle<unknown>> => {
  throw new Error('type-only handler is never executed')
}

const wsNext: WebSocketHandler = async () => {
  throw new Error('type-only handler is never executed')
}

void httpChain({ headers: new Headers(), method: 'GET', url: 'https://example.test' }, httpNext)
void sseChain({ headers: new Headers(), method: 'GET', url: 'https://example.test' }, sseNext)
void wsChain({ headers: new Headers(), method: 'GET', url: 'wss://example.test' }, wsNext)
```

If `HttpRequest` requires a different object shape, use the smallest valid object already used in existing interceptor tests.

- [ ] **Step 2: Run the type test and confirm the current problem**

Run:

```bash
pnpm --filter @defjs/core typecheck
```

Expected: with current code, typecheck may still pass because `any` hides the problem. The test establishes target behavior before the implementation change.

- [ ] **Step 3: Replace generic `makeChain` with typed handler aliases**

In `packages/core/src/interceptor/interceptor.ts`, replace lines around the current `makeChain` implementation with:

```ts
type ChainHandler<TResult> = (req: HttpRequest) => Promise<TResult>
type ChainInterceptor<TResult> = (req: HttpRequest, next: ChainHandler<TResult>) => Promise<TResult>

function makeChain<TResult, TFn extends ChainInterceptor<TResult>>(interceptors: readonly TFn[]): TFn {
  const identity = ((req: HttpRequest, next: ChainHandler<TResult>) => next(req)) as TFn

  // Type boundary: reduceRight preserves the interceptor shape, but TypeScript cannot express that the accumulator's next argument
  // is produced by the same chain builder for all concrete interceptor variants.
  return interceptors.reduceRight<TFn>(
    (fn, interceptor) =>
      ((initReq: HttpRequest, finalHandlerFn: ChainHandler<TResult>) => interceptor(initReq, (req) => fn(req, finalHandlerFn))) as TFn,
    identity,
  )
}
```

This removes `any` and keeps the remaining assertion documented.

- [ ] **Step 4: Verify interceptor runtime tests**

Run:

```bash
pnpm --filter @defjs/core test -- src/interceptor/interceptor.runtime.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Verify interceptor typecheck**

Run:

```bash
pnpm --filter @defjs/core typecheck
```

Expected: PASS or failures outside interceptor files that later tasks address.

- [ ] **Step 6: Commit interceptor type cleanup**

Run:

```bash
git add packages/core/src/interceptor/interceptor.ts packages/core/src/interceptor/interceptor.type.test.ts
git commit -m "refactor(core): type interceptor chains without any"
```

---

## Task 5: Type RequestBuilder build callbacks and remove callback `any` from specs

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts`
- Create: `packages/core/src/internal/request_builder.type.test.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`
- Modify: `packages/core/src/http/request.spec.ts`
- Modify: `packages/core/src/sse/request.spec.ts`
- Modify: `packages/core/src/web_socket/build.spec.ts`

- [ ] **Step 1: Add focused RequestBuilder type tests**

Create `packages/core/src/internal/request_builder.type.test.ts`:

```ts
import { struct } from '../struct'
import { buildRequest } from './request_builder'

const input = struct.request({
  body: struct.json(
    struct.object({
      users: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
        }),
      ),
    }),
  ),
  headers: struct.object({
    token: struct.string(),
  }),
  query: struct.object({
    page: struct.number().optional(),
  }),
})

buildRequest(
  { body: { users: [{ id: 1, name: 'Ada' }] }, headers: { token: 't' }, query: { page: 1 } },
  (request, view) => {
    request.setHeaders({ token: view.headers.token })
    request.setQueryParams({ page: view.query.page })
    request.setJson({ users: view.body.users.map((user) => ({ id: user.id, name: user.name })) })
  },
  { input },
)

buildRequest(
  { body: { users: [{ id: 1, name: 'Ada' }] } },
  (request, view) => {
    // @ts-expect-error unknown body fields are rejected by the typed build view.
    request.setJson({ users: view.body.users.map((user) => ({ missing: user.missing })) })
  },
  { input },
)
```

- [ ] **Step 2: Update `buildRequest` signature**

In `packages/core/src/internal/request_builder.ts`, replace the existing `buildRequest` signature:

```ts
export function buildRequest(
  input: unknown,
  build: ((request: RequestBuilder, input: unknown) => void) | undefined,
  options: RequestAutoBuildOptions & { input?: AnyStruct },
): RequestBuild {
```

with:

```ts
export function buildRequest<TInput extends AnyStruct | undefined, TTransport extends RequestTransport = 'http'>(
  input: unknown,
  build: RequestBuildHandler<TInput, TTransport> | undefined,
  options: RequestAutoBuildOptions & { input?: TInput; transport?: TTransport },
): RequestBuild {
```

- [ ] **Step 3: Add typed helper functions for internal build boundaries**

In `packages/core/src/internal/request_builder.ts`, add these helpers near `buildRequest`:

```ts
function createTypedBuildContext<TTransport extends RequestTransport>(
  plan: BuildPlanStep[],
  _transport: TTransport,
): RequestBuildContext<TTransport> {
  // Type boundary: assertTransportBuild validates transport-specific output after materialization; the builder object exposes
  // the superset of methods internally and is narrowed here to the transport-specific public build context.
  return createBuildPlanBuilder(plan) as RequestBuildContext<TTransport>
}

function createTypedBuildInput<TInput extends AnyStruct | undefined>(
  schema: NonNullable<TInput>,
  owner: symbol,
): RequestBuildInput<TInput> {
  // Type boundary: createBoundView materializes a runtime proxy from the same schema used by RequestBuildInput's conditional type.
  return createBoundView(schema as unknown as RuntimeSchema, [], owner) as RequestBuildInput<TInput>
}
```

- [ ] **Step 4: Use typed helpers inside `buildRequest`**

Replace:

```ts
const boundInput = createBoundView(options.input as unknown as RuntimeSchema, [], owner)
build(createBuildPlanBuilder(plan), boundInput)
```

with:

```ts
const boundInput = createTypedBuildInput(options.input, owner)
build(createTypedBuildContext(plan, transport), boundInput)
```

- [ ] **Step 5: Remove callback `any` annotations from RequestBuilder specs**

In `packages/core/src/internal/request_builder.spec.ts`, replace callbacks like:

```ts
;(request: any, view: any) => {
  request.setFormUrlEncoded({ a: view.body.a, b: view.body.b })
}
```

with inferred callbacks:

```ts
;(request, view) => {
  request.setFormUrlEncoded({ a: view.body.a, b: view.body.b })
}
```

Apply the same transformation to every `(request: any, view: any)`, `(ctx: any, view: any)`, and `(_ctx: any, view: any)` callback in this file. Keep unused parameter underscores when the parameter remains unused:

```ts
;(_ctx, view) => {
  request.setJson({ id: view.body.id })
}
```

- [ ] **Step 6: Remove callback `any` annotations in request-related specs**

In these files, remove explicit `any` from build callbacks and rely on inference:

- `packages/core/src/http/request.spec.ts`
- `packages/core/src/sse/request.spec.ts`
- `packages/core/src/web_socket/build.spec.ts`

Example replacement:

```ts
;(builder: any, input: any) => {
  builder.setJson({ id: input.body.id })
}
```

becomes:

```ts
;(builder, input) => {
  builder.setJson({ id: input.body.id })
}
```

- [ ] **Step 7: Verify RequestBuilder type tests**

Run:

```bash
pnpm --filter @defjs/core typecheck
```

Expected: `request_builder.type.test.ts` is included by the package typecheck or a nearby type-test config. If it is not included, add it to `packages/core/tsconfig.json` include patterns only if current includes do not already cover `src/**/*.ts`.

- [ ] **Step 8: Verify RequestBuilder runtime tests**

Run:

```bash
pnpm --filter @defjs/core test -- src/internal/request_builder.spec.ts src/http/request.spec.ts src/sse/request.spec.ts src/web_socket/build.spec.ts
```

Expected: PASS.

- [ ] **Step 9: Commit RequestBuilder typing cleanup**

Run:

```bash
git add packages/core/src/internal/request_builder.ts packages/core/src/internal/request_builder.type.test.ts packages/core/src/internal/request_builder.spec.ts packages/core/src/http/request.spec.ts packages/core/src/sse/request.spec.ts packages/core/src/web_socket/build.spec.ts
git commit -m "refactor(core): type request build callbacks"
```

---

## Task 6: Centralize struct schema construction type boundaries

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/runtime.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Test: `packages/core/src/struct/types.runtime.type.test.ts`

- [ ] **Step 1: Replace helper `any` with constrained unknown where it does not affect inference**

In `packages/core/src/struct/types.ts`, replace:

```ts
type SchemaInput<T> = T extends { readonly _struct: { readonly input: any } } ? T['_struct']['input'] : never
type SchemaOutput<T> = T extends { readonly _struct: { readonly output: any } } ? T['_struct']['output'] : never
```

with:

```ts
type SchemaInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
type SchemaOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never
```

Run `pnpm --filter @defjs/core typecheck`. If this breaks schema inference, revert only these two lines and add comments explaining that conditional type inference requires `any` here as a type algebra boundary.

- [ ] **Step 2: Add schema construction cast helper**

In `packages/core/src/struct/runtime.ts`, export a helper near `makeSchema`:

```ts
export function castSchema<TSchema extends SchemaLike>(schema: SchemaLike): TSchema {
  // Type boundary: all schema runtime objects are created by makeSchema/createPrimitiveSchema; the branded generic surface
  // exists only for compile-time input/output inference and has no distinct runtime representation.
  return schema as TSchema
}
```

Add `SchemaLike` to the type imports in `runtime.ts` if it is not already imported.

- [ ] **Step 3: Replace constructor double assertions with `castSchema`**

In `packages/core/src/struct/constructors.ts`, update the runtime import:

```ts
import { createPrimitiveSchema, DEFAULT_FLAGS, makeSchema } from './runtime'
```

becomes:

```ts
import { castSchema, createPrimitiveSchema, DEFAULT_FLAGS, makeSchema } from './runtime'
```

Replace each double assertion like:

```ts
return createPrimitiveSchema({
  expected: 'string',
  is: (value): value is string => typeof value === 'string',
  kind: 'string',
  zero: () => '',
}) as unknown as StringSchema
```

with:

```ts
return castSchema<StringSchema>(
  createPrimitiveSchema({
    expected: 'string',
    is: (value): value is string => typeof value === 'string',
    kind: 'string',
    zero: () => '',
  }),
)
```

Apply the same `castSchema<T>(...)` replacement for constructors returning `NumberSchema`, `Schema<null, null>`, `Schema<unknown, unknown>`, `ArraySchema<S>`, `ObjectSchema<T>`, `RequestSchema<T>`, `RequestBodySchema<C, S>`, `RecordSchema<S>`, `TupleSchema<T>`, `UnionSchema<T>`, and other schema interfaces in this file.

- [ ] **Step 4: Keep true public `any` schema explicit and documented**

For `createAnySchema`, replace:

```ts
export function createAnySchema(): Schema<unknown, any> {
  return makeSchema({
    flags: DEFAULT_FLAGS,
    kind: 'any',
  }) as unknown as Schema<unknown, any>
}
```

with:

```ts
export function createAnySchema(): Schema<unknown, any> {
  // Type boundary: struct.any() intentionally models an unconstrained decoded value for users who opt into that escape hatch.
  return castSchema<Schema<unknown, any>>(
    makeSchema({
      flags: DEFAULT_FLAGS,
      kind: 'any',
    }),
  )
}
```

- [ ] **Step 5: Verify struct type behavior**

Run:

```bash
pnpm --filter @defjs/core typecheck
pnpm --filter @defjs/core test -- src/struct
```

Expected: PASS. Existing negative type tests must keep their explanatory `@ts-expect-error` comments.

- [ ] **Step 6: Commit struct type-boundary cleanup**

Run:

```bash
git add packages/core/src/struct/types.ts packages/core/src/struct/runtime.ts packages/core/src/struct/constructors.ts packages/core/src/struct/types.runtime.type.test.ts
git commit -m "refactor(core): centralize schema type boundaries"
```

---

## Task 7: Reduce SSE and WebSocket cast surfaces

**Files:**

- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/sse/request.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/web_socket/build.ts`
- Modify: `packages/core/src/sse/*.spec.ts`
- Modify: `packages/core/src/web_socket/*.spec.ts`

- [ ] **Step 1: Add local typed endpoint factory helpers in SSE**

In `packages/core/src/sse/sse.ts`, add helper functions near the endpoint creation logic:

```ts
function createTypedEventStreamEndpoint<TInput extends AnyStruct | undefined, TEvents extends EventStreamSchemas | undefined>(
  endpoint: EventStreamEndpoint<TInput, TEvents>,
): UseEventStreamEndpointFn<TInput, TEvents> {
  return (input) => createEventStreamRef(endpoint, input)
}

function castParsedEventStreamInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}
```

Use the actual local type names already present in `sse.ts`; do not introduce imports that create circular dependencies.

- [ ] **Step 2: Replace SSE endpoint return assertion**

Replace:

```ts
return ((input?: EndpointInput<TInput>) => createEventStreamRef(endpoint, input)) as UseEventStreamEndpointFn<TInput, TEvents>
```

with:

```ts
return createTypedEventStreamEndpoint(endpoint)
```

- [ ] **Step 3: Replace parsed SSE input assertions with helper**

Replace each direct assertion like:

```ts
parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
```

with:

```ts
parsedInput = castParsedEventStreamInput<TInput>(await parseEndpointInput(endpoint.input, input))
```

- [ ] **Step 4: Add local typed endpoint factory helpers in WebSocket**

In `packages/core/src/web_socket/web_socket.ts`, add helpers near endpoint creation:

```ts
function createTypedWebSocketEndpoint<
  TInput extends AnyStruct | undefined,
  TIncoming extends WebSocketMessageSchemas | undefined,
  TOutgoing extends WebSocketMessageSchemas | undefined,
>(endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>): UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing> {
  return (input) => createWebSocketRef(endpoint, input)
}

function castParsedWebSocketInput<TInput extends AnyStruct | undefined>(value: unknown): ParsedInput<TInput> {
  // Type boundary: parseEndpointInput validates with endpoint.input before this helper is called.
  return value as ParsedInput<TInput>
}
```

Use the exact message schema type names from the file if they differ.

- [ ] **Step 5: Replace WebSocket endpoint return assertion**

Replace:

```ts
return ((input?: EndpointInput<TInput>) => createWebSocketRef(endpoint, input)) as UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing>
```

with:

```ts
return createTypedWebSocketEndpoint(endpoint)
```

- [ ] **Step 6: Replace parsed WebSocket input assertions with helper**

Replace each direct assertion like:

```ts
parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
```

with:

```ts
parsedInput = castParsedWebSocketInput<TInput>(await parseEndpointInput(endpoint.input, input))
```

- [ ] **Step 7: Add remarks to remaining protocol-boundary assertions**

For each remaining assertion in `packages/core/src/sse/sse.ts` or `packages/core/src/web_socket/web_socket.ts` that cannot be eliminated, add a directly adjacent comment. Use this style:

```ts
// Type boundary: interceptor chain returns the runtime handle created from this endpoint's event schemas.
const stream = (await sseChain(request, sseHandler)) as EventStreamHandle<EventStreamData<TEvents>>
```

Do not leave naked `as unknown as`, `as never`, or unremarked `as SomeType` in these files.

- [ ] **Step 8: Clean SSE/WebSocket tests**

In `packages/core/src/sse/*.spec.ts` and `packages/core/src/web_socket/*.spec.ts`, replace naked invalid-input casts like:

```ts
const ref = useStream().with({ client, abort: controller.signal, timeout: 1 } as never)
```

with a negative type test when the purpose is type rejection:

```ts
// @ts-expect-error with.abort and with.timeout are mutually exclusive.
const ref = useStream().with({ client, abort: controller.signal, timeout: 1 })
```

When the purpose is runtime defensive behavior, use a local helper at the top of the spec file:

```ts
function invalidRuntimeInput<T>(value: unknown): T {
  // Type boundary: this spec intentionally passes invalid runtime data to exercise defensive error handling.
  return value as T
}
```

Then call:

```ts
const [error] = await useStream(invalidRuntimeInput({ id: 'invalid' }))
```

Add a specific assertion that the defensive error path is exercised.

- [ ] **Step 9: Verify streaming tests**

Run:

```bash
pnpm --filter @defjs/core test -- src/sse src/web_socket
pnpm --filter @defjs/core typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit streaming type cleanup**

Run:

```bash
git add packages/core/src/sse packages/core/src/web_socket
git commit -m "refactor(core): reduce streaming type assertions"
```

---

## Task 8: Remove remaining explicit `any` and unsafe assertions in tests

**Files:**

- Modify: `packages/core/test/setup.ts`
- Modify: `packages/vue/test/core.spec.ts`
- Modify: any `packages/**/*.ts` still reported by the search commands below.

- [ ] **Step 1: Scan remaining explicit `any`**

Run:

```bash
grep -RIn "\bany\b" packages --include='*.ts' | grep -v "Type boundary"
```

Expected: reports remaining explicit `any` usages. Each one must either be removed or have a precise `Type boundary:` comment. Do not add broad file-level disable comments.

- [ ] **Step 2: Fix Vue test server type**

In `packages/vue/test/core.spec.ts`, replace:

```ts
let server: any
```

with the concrete server type used by the setup helper. If the server is returned by `createTestServer`, derive it without `any`:

```ts
type TestServer = Awaited<ReturnType<typeof createTestServer>>

let server: TestServer
```

If the helper returns a tuple or object, use the exact returned property type from the helper instead of `any`.

- [ ] **Step 3: Fix core test setup handler context**

In `packages/core/test/setup.ts`, replace handler parameters like:

```ts
const basicSSEHandler = (c: any) => {
```

with the concrete Hono context type already available from the imported Hono app. If the file imports `Context` from `hono`, use:

```ts
import type { Context } from 'hono'

const basicSSEHandler = (c: Context) => {
```

If a more specific environment generic is already declared in the file, use that instead of plain `Context`.

- [ ] **Step 4: Scan remaining unsafe assertions**

Run:

```bash
grep -RIn " as " packages --include='*.ts' | grep -v " as const" | grep -v "Type boundary" | grep -v "Negative type test"
```

Expected: reports remaining `as` assertions without a nearby explanatory comment. Eliminate each assertion where possible. For true runtime boundaries, add a directly adjacent comment using one of these exact prefixes:

```ts
// Type boundary: ...
// Runtime boundary: ...
// Negative type test: ...
```

The comment must describe the concrete invariant, not merely say that TypeScript needs help.

- [ ] **Step 5: Scan TypeScript comments**

Run:

```bash
grep -RIn "@ts-ignore\|@ts-expect-error" packages --include='*.ts'
```

Expected: no `@ts-ignore`. Every `@ts-expect-error` must include a specific reason on the same comment line.

- [ ] **Step 6: Run lint and typecheck**

Run:

```bash
pnpm lint
pnpm typecheck
```

Expected: PASS, or failures that identify a specific remaining type-safety issue. Fix those issues in the same task before committing.

- [ ] **Step 7: Commit remaining type-safety cleanup**

Run:

```bash
git status --short packages
git add packages/core/test/setup.ts packages/vue/test/core.spec.ts
```

Add any additional `packages/**/*.ts` files changed in this task using explicit paths. Then inspect staged files:

```bash
git diff --cached --name-only
```

Ensure the staged list does not include unrelated docs, generated dist files, coverage output, or `.DS_Store`. Then commit:

```bash
git commit -m "refactor: remove unsafe test type escapes"
```

---

## Task 9: Final verification and formatting checkpoint

**Files:**

- Modify only files that verification proves still need changes.

- [ ] **Step 1: Run formatter check**

Run:

```bash
pnpm fmt:check
```

Expected: PASS. If it fails only due formatting, run:

```bash
pnpm fmt
```

Then inspect the diff:

```bash
git diff --stat
git diff -- packages pnpm-workspace.yaml package.json oxlint.config.ts .oxfmtrc.json
```

Only keep Oxfmt changes that are part of this migration. Do not format unrelated untracked docs.

- [ ] **Step 2: Run full lint**

Run:

```bash
pnpm lint
```

Expected: PASS. If Oxlint reports unsupported config rules, remove the unsupported rule from `oxlint.config.ts`, rerun `pnpm lint`, and record the removed rule in the final report.

- [ ] **Step 3: Run full typecheck**

Run:

```bash
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 4: Run full test suite**

Run:

```bash
pnpm test
```

Expected: PASS.

- [ ] **Step 5: Run full build**

Run:

```bash
pnpm build
```

Expected: PASS.

- [ ] **Step 6: Confirm no forbidden import patterns remain**

Run:

```bash
grep -RIn "import(" packages --include='*.ts' || true
grep -RIn "require(" packages --include='*.ts' || true
grep -RIn "import type \* as\|import \* as" packages --include='*.ts' || true
grep -RIn "{ type " packages --include='*.ts' || true
```

Expected: no output. If output remains in comments that describe forbidden examples, either remove those comments or rewrite them without matching the forbidden syntax.

- [ ] **Step 7: Confirm public API entrypoints**

Run:

```bash
find packages -name index.ts -not -path '*/dist/*' -print -exec sh -c 'printf "--- %s ---\n" "$1"; sed -n "1,5p" "$1"' sh {} \;
```

Expected: the module entrypoints changed in Task 2 contain only:

```ts
export * from './public_api'
```

Do not modify unrelated `index.ts` files unless they are part of the approved scope.

- [ ] **Step 8: Commit final verification fixes**

If steps 1-7 produced additional code changes, run:

```bash
git add package.json pnpm-workspace.yaml pnpm-lock.yaml oxlint.config.ts .oxfmtrc.json packages
git commit -m "chore: satisfy oxlint oxfmt verification"
```

If no files changed, do not create an empty commit.

- [ ] **Step 9: Final report**

Prepare a final implementation report with:

```markdown
## 完成内容

- Oxlint/Oxfmt toolchain migration summary
- public_api normalization summary
- import cleanup summary
- type-safety refactor summary

## 验证

- `pnpm lint`: PASS
- `pnpm fmt:check`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS

## 未自动化约束

- public_api future regression is maintained by review, not a standalone checker
- as-assertion remark quality is maintained by review, not a standalone checker
```

Do not claim PASS for any command that did not pass.

---

## Self-review checklist

- Spec coverage: Tasks 1 and 9 cover Oxlint/Oxfmt; Task 2 covers `public_api.ts`; Task 3 covers import restrictions; Tasks 4-8 cover production and test type-safety cleanup; Task 9 covers final verification.
- No independent checker: the plan does not create `check:constraints`, `check-code-constraints.ts`, or any equivalent script.
- Type consistency: snippets use `RequestBuildHandler`, `RequestBuildContext`, and `RequestBuildInput` already present in `packages/core/src/internal/request_builder.ts`; interceptor snippets use existing `HttpRequest`, `InterceptorFn`, `SSEInterceptorFn`, and `WebSocketInterceptorFn` names.
- Validation: each commit-level task includes a verification command and expected result.
