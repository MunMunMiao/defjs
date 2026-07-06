# Remaining Review Findings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 2026-07-05 审查中除 request body wrapper 错误以外的其余已确认问题，让 adapter 语义、package README 边界、framework 文档示例与 docs 验证承诺重新对齐。

**Architecture:** 先做唯一需要 runtime 改动的 adapter 行为对齐，再修 React/Vue 生命周期与 snippet 正确性，再收紧 OpenTelemetry package README / docs 边界，最后处理 docs 维护漂移文案与 stale plan。除了 Task 1 外其余全部是 docs-only；不扩展成站点重构或新校验系统。

**Tech Stack:** Markdown、VitePress、TypeScript snippets、Vitest、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`。

## Global Constraints

- 本计划只覆盖本轮审查的“其余问题”；`struct.request({ body: struct.object(...) })` 那组高优问题不在本计划内。
- 优先最小修复面；不做新的 docs IA 重构，不新增 package、依赖或脚本。
- 让 framework adapter 行为向 core 对齐；不要继续把实现限制写成长期用户规则。
- README 保持简短；长解释放在 `doc/**`。
- 只修已确认出错的 locale 页面：`doc/zh-Hans/plugins/vue.md`、`doc/zh-Hans/guide/examples.md`；不启动全量翻译同步。
- 不新建第二套 docs 校验系统；优先收窄“已验证”文案，必要时只把关键片段纳入现有 twoslash。
- OpenTelemetry 文案必须和官方 stable semconv 对齐；package README 不再混入 VitePress page-only 元素。
- 计划中的 commit 步骤只在用户后续明确要求提交时执行。
- 验证必须使用 fresh 命令输出；不能凭“看起来正确”结束任务。

## Todo List

- [ ] Task 1: 对齐 React/Vue `withInterceptors(...)` 与 core 追加语义
- [ ] Task 2: 修正 React/Vue 生命周期与 interceptor 文档示例
- [ ] Task 3: 收紧 OpenTelemetry package README / docs 边界并修正 metric 语义
- [ ] Task 4: 收敛 docs 维护漂移：验证承诺、npm 快照、上下文说明和 stale plan

---

## File Structure

- Modify: `packages/react/src/core.tsx`
  - 让 React adapter 的 `withInterceptors(...)` 改为追加语义。
- Modify: `packages/vue/src/core.ts`
  - 让 Vue adapter 的 `withInterceptors(...)` 改为追加语义。
- Test: `packages/react/src/core.browser.spec.tsx`
  - 覆盖 React adapter 多次 `withInterceptors(...)` 的追加顺序。
- Test: `packages/vue/test/core.spec.ts`
  - 覆盖 Vue adapter 多次 `withInterceptors(...)` 的追加顺序。
- Modify: `packages/react/README.md`
  - 修 React Quick Start cleanup 示例，并同步新的 interceptor 语义说明。
- Modify: `doc/plugins/react.md`
  - 修 React Quick Start/usage 示例，使用真实 abort cleanup。
- Modify: `packages/vue/README.md`
  - 修 logging interceptor 示例，不再使用不存在的 `request.url`。
- Modify: `doc/plugins/vue.md`
  - 修 Vue SSE 启动期取消路径与 interceptor 说明。
- Modify: `doc/zh-Hans/plugins/vue.md`
  - 同步 Vue SSE 启动期取消修正。
- Modify: `packages/opentelemetry-server/README.md`
  - 移除 frontmatter、修复 site-root links、修正 stable metric 属性表。
- Modify: `doc/plugins/opentelemetry-server.md`
  - 修正 stable metric 属性表。
- Modify: `README.md`
  - 收敛 root README 的 npm snapshot 与 docs verification wording。
- Modify: `packages/core/README.md`
  - 把 “verify the docs examples” 收窄到 twoslash 覆盖面。
- Modify: `doc/index.md`
  - 把发布说明从硬编码版本改成 generic caveat。
- Modify: `doc/guide/getting-started.md`
  - 同上，避免写死 `@defjs/core@0.3.3`。
- Modify: `packages/angular/README.md`
  - 移除 hard-coded npm snapshot，保留 peer range / source-vs-published caveat。
- Modify: `doc/plugins/angular.md`
  - 同上，并去掉 stale dependency table snapshot。
- Modify: `doc/core/context.md`
  - 收窄 execution-time priority 文案，明确 SSE reconnect 仍是 client-level。
- Modify: `doc/zh-Hans/guide/examples.md`
  - 让 Angular `app.config.ts` 代码块自洽：导入或并列定义 `authInterceptors`。
- Modify: `docs/superpowers/plans/2026-07-02-feedback-repair.md`
  - 修正与实际 diff 冲突的 locale constraint。
- Read-only reference: `packages/core/src/client/option.ts`
  - core `withInterceptors(...interceptors)` 的追加语义基准。
- Read-only reference: `doc/package.json`, `package.json`
  - docs build/typecheck 与 workspace verification 命令来源。

---

### Task 1: 对齐 React/Vue `withInterceptors(...)` 与 core 追加语义

**Files:**
- Modify: `packages/react/src/core.tsx`
- Modify: `packages/vue/src/core.ts`
- Test: `packages/react/src/core.browser.spec.tsx`
- Test: `packages/vue/test/core.spec.ts`
- Modify: `packages/react/README.md`
- Modify: `doc/plugins/react.md`
- Modify: `packages/vue/README.md`
- Modify: `doc/plugins/vue.md`

**Interfaces:**
- Consumes: `ClientOption`, `Interceptor`, core baseline from `packages/core/src/client/option.ts`
- Produces:
  - React `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`
  - Vue `withInterceptors(...fns: (() => Interceptor)[]): ClientOption`
  - both append to existing `config.interceptors` in option application order

- [ ] **Step 1: Add a failing React test for repeated `withInterceptors(...)` calls**

Append this case to `packages/react/src/core.browser.spec.tsx`:

```tsx
it('appends interceptors across multiple withInterceptors calls', () => {
  const interceptorA = {} as Interceptor
  const interceptorB = {} as Interceptor
  const config = { interceptors: [] as Interceptor[] } as ClientConfig

  withInterceptors(() => interceptorA)(config)
  withInterceptors(() => interceptorB)(config)

  expect(config.interceptors).toEqual([interceptorA, interceptorB])
})
```

Also change the existing `"should set interceptors in config"` test to initialize `config` with `interceptors: [] as Interceptor[]` so it matches the real `createClient` config shape.

- [ ] **Step 2: Run the React test and confirm it fails for the right reason**

Run:

```bash
pnpm --dir packages/react exec vitest run src/core.browser.spec.tsx --config vitest.config.ts
```

Expected: FAIL on the new append-order assertion because the current implementation overwrites `config.interceptors` on the second call.

- [ ] **Step 3: Add the matching failing Vue test**

Append this case to `packages/vue/test/core.spec.ts`:

```ts
it('appends interceptors across multiple withInterceptors calls', () => {
  const interceptorA = {} as Interceptor
  const interceptorB = {} as Interceptor
  const config = { interceptors: [] as Interceptor[] } as ClientConfig

  withInterceptors(() => interceptorA)(config)
  withInterceptors(() => interceptorB)(config)

  expect(config.interceptors).toEqual([interceptorA, interceptorB])
})
```

Also change the existing `"should set interceptors in config"` test to initialize `config` with `interceptors: [] as Interceptor[]`.

- [ ] **Step 4: Run the Vue test and confirm it fails for the same overwrite behavior**

Run:

```bash
pnpm --dir packages/vue exec vitest run test/core.spec.ts --config vitest.config.ts
```

Expected: FAIL on the new append-order assertion because the current implementation replaces the array.

- [ ] **Step 5: Change both adapter helpers to append instead of replace**

Update `packages/react/src/core.tsx`:

```tsx
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config) => {
    config.interceptors.push(...fns.map((fn) => fn()))
  }
}
```

Update `packages/vue/src/core.ts`:

```ts
export function withInterceptors(...fns: (() => Interceptor)[]): ClientOption {
  return (config) => {
    config.interceptors.push(...fns.map((fn) => fn()))
  }
}
```

- [ ] **Step 6: Rewrite the React/Vue docs so they describe append semantics, not one-call grouping**

Use this wording in `packages/react/README.md`, `doc/plugins/react.md`, `packages/vue/README.md`, and `doc/plugins/vue.md` wherever the current text says the adapter replaces `config.interceptors`:

```md
`withInterceptors(...)` in this adapter accepts factory functions because the provider/plugin creates the real `@defjs/core` client later. Each call appends the interceptors produced by those factories in option application order, matching the core client's `withInterceptors(...)` composition model.
```

Delete wording equivalent to “group all interceptors in one `withInterceptors(...)` call”.

- [ ] **Step 7: Re-run focused package tests**

Run:

```bash
pnpm --dir packages/react exec vitest run src/core.browser.spec.tsx --config vitest.config.ts
pnpm --dir packages/vue exec vitest run test/core.spec.ts --config vitest.config.ts
```

Expected: PASS for both files.

- [ ] **Step 8: Commit checkpoint (only if the user later explicitly requests commits)**

```bash
git add packages/react/src/core.tsx packages/vue/src/core.ts packages/react/src/core.browser.spec.tsx packages/vue/test/core.spec.ts packages/react/README.md doc/plugins/react.md packages/vue/README.md doc/plugins/vue.md
git commit -m "fix: align framework interceptor composition"
```

---

### Task 2: 修正 React/Vue 生命周期与 interceptor 文档示例

**Files:**
- Modify: `doc/plugins/react.md`
- Modify: `packages/react/README.md`
- Modify: `packages/vue/README.md`
- Modify: `doc/plugins/vue.md`
- Modify: `doc/zh-Hans/plugins/vue.md`

**Interfaces:**
- Consumes: Task 1 aligned adapter semantics and current `client.execute(..., { signal })` support from `@defjs/core`
- Produces:
  - React docs that show actual request cancellation rather than only stale-result suppression
  - Vue docs that allow cancellation before and after SSE stream establishment
  - Vue README logging example that only uses real `HttpRequest` fields

- [ ] **Step 1: Capture the current broken patterns before editing**

Run:

```bash
grep -n "let cancelled = false" doc/plugins/react.md packages/react/README.md
grep -n "request.url\|closeStream = () => {}" packages/vue/README.md doc/plugins/vue.md doc/zh-Hans/plugins/vue.md
```

Expected:
- React files still show the `let cancelled = false` cleanup pattern.
- Vue README still references `request.url`.
- Vue docs still initialize `closeStream` as a no-op and only replace it after stream creation.

- [ ] **Step 2: Replace the React Quick Start cleanup example with an abort-aware version**

Use this exact effect body in both `doc/plugins/react.md` and `packages/react/README.md`:

```tsx
useEffect(() => {
  const abort = new AbortController()

  client
    .execute(getUser({ path: { id } }), { signal: abort.signal })
    .then(([error, user]) => {
      if (abort.signal.aborted) {
        return
      }

      if (error) {
        setName(error.message)
        return
      }

      setName(user.name)
    })
    .catch((error) => {
      if (!abort.signal.aborted) {
        setName(error instanceof Error ? error.message : 'request failed')
      }
    })

  return () => {
    abort.abort()
  }
}, [client, id])
```

Keep the surrounding prose short: explain that `AbortController` stops the in-flight request, while the aborted branch prevents stale UI updates.

- [ ] **Step 3: Fix the Vue README logging interceptor so it only uses real request fields**

Replace the current `loggingInterceptor` in `packages/vue/README.md` with:

```ts
const loggingInterceptor = createHttpInterceptor(async (request, next) => {
  const target = `${request.baseEndpoint ?? ''}${request.endpoint}${request.queryString}`
  console.log(request.method, target)
  return next(request)
})
```

- [ ] **Step 4: Replace the Vue SSE example with startup-aware cancellation**

Use this version in `doc/plugins/vue.md`:

```ts
export function useNotifications() {
  const client = injectClient()
  const abort = new AbortController()
  let disposed = false
  let closeStream = () => {
    abort.abort()
  }

  onBeforeUnmount(() => {
    disposed = true
    closeStream()
  })

  onMounted(async () => {
    const [streamError, stream] = await client.execute(notifications(), { signal: abort.signal })

    if (streamError || !stream) {
      return
    }

    if (disposed) {
      stream.close('component-unmounted')
      return
    }

    closeStream = () => {
      abort.abort()
      stream.close('component-unmounted')
    }

    try {
      for await (const event of stream) {
        if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
          console.log(event.data.text)
        }
      }
    } catch (error) {
      const closeInfo = await stream.closed

      if (disposed || closeInfo.code === 'aborted' || abort.signal.aborted) {
        return
      }

      console.error(error)
    }
  })
}
```

- [ ] **Step 5: Mirror the same SSE cancellation fix in the Chinese Vue page**

Apply the same code block to `doc/zh-Hans/plugins/vue.md`, translating only the surrounding prose. Keep the code itself identical.

- [ ] **Step 6: Build the docs and verify the old broken patterns are gone**

Run:

```bash
pnpm --dir doc run docs:build
grep -n "request.url" packages/vue/README.md
grep -n "let cancelled = false" doc/plugins/react.md packages/react/README.md
grep -n "closeStream = () => {}" doc/plugins/vue.md doc/zh-Hans/plugins/vue.md
```

Expected:
- `pnpm --dir doc run docs:build` exits 0.
- The three `grep` commands return no matches.

- [ ] **Step 7: Commit checkpoint (only if the user later explicitly requests commits)**

```bash
git add doc/plugins/react.md packages/react/README.md packages/vue/README.md doc/plugins/vue.md doc/zh-Hans/plugins/vue.md
git commit -m "fix: repair framework example cleanup flows"
```

---

### Task 3: 收紧 OpenTelemetry package README / docs 边界并修正 metric 语义

**Files:**
- Modify: `packages/opentelemetry-server/README.md`
- Modify: `doc/plugins/opentelemetry-server.md`

**Interfaces:**
- Consumes: stable HTTP metric semantics from OpenTelemetry docs and the current package/runtime boundary
- Produces:
  - package README that reads like a package README rather than a VitePress source file
  - consistent metric tables across package README and docs page
  - package README links that work in repo/package contexts

- [ ] **Step 1: Snapshot the current package README boundary problems**

Run:

```bash
grep -n '^---$' packages/opentelemetry-server/README.md
grep -n '/core/client\|/core/sse\|/core/web-socket' packages/opentelemetry-server/README.md
grep -n 'optional .*server.address\|optional .*server.port' packages/opentelemetry-server/README.md doc/plugins/opentelemetry-server.md
```

Expected:
- The README still has YAML frontmatter markers.
- The README still uses site-root links.
- Both files still describe `server.address` / `server.port` as optional in the HTTP metric table.

- [ ] **Step 2: Remove VitePress-only frontmatter from the package README**

The top of `packages/opentelemetry-server/README.md` should become exactly:

```md
# @defjs/opentelemetry-server

Server-side outbound OpenTelemetry integration for `@defjs/core` HTTP, SSE, and WebSocket clients.
```

Delete the leading `---`, `title:`, and `description:` block entirely. Keep page frontmatter only in `doc/plugins/opentelemetry-server.md`.

- [ ] **Step 3: Replace package README “What’s Next” links with repo-safe relative links**

Use this block in `packages/opentelemetry-server/README.md`:

```md
## What's Next

- [`doc/core/client.md`](../../doc/core/client.md) — `createClient` and full transport configuration
- [`doc/core/sse.md`](../../doc/core/sse.md) — `defineEventStream` and streaming event consumption
- [`doc/core/web-socket.md`](../../doc/core/web-socket.md) — `defineWebSocket` and real-time communication
```

Do not use `/core/*` site-root links in the package README.

- [ ] **Step 4: Correct the HTTP metric row in both files**

Replace the current HTTP metric row in both `packages/opentelemetry-server/README.md` and `doc/plugins/opentelemetry-server.md` with:

```md
| `http.client.request.duration` | `s` | `http.request.method`, `server.address`, `server.port`, plus conditional `http.response.status_code` and `error.type` |
```

Keep the surrounding prose explicit that this row is describing the stable semantic-convention dimensions, not an exhaustive dump of every custom attribute.

- [ ] **Step 5: Rebuild docs and verify the package README no longer contains page-only markers**

Run:

```bash
pnpm --dir doc run docs:build
grep -n '^---$' packages/opentelemetry-server/README.md
grep -n '/core/client\|/core/sse\|/core/web-socket' packages/opentelemetry-server/README.md
grep -n 'optional .*server.address\|optional .*server.port' packages/opentelemetry-server/README.md doc/plugins/opentelemetry-server.md
```

Expected:
- `pnpm --dir doc run docs:build` exits 0.
- All three `grep` commands return no matches.

- [ ] **Step 6: Commit checkpoint (only if the user later explicitly requests commits)**

```bash
git add packages/opentelemetry-server/README.md doc/plugins/opentelemetry-server.md
git commit -m "fix: tighten opentelemetry docs boundaries"
```

---

### Task 4: 收敛 docs 维护漂移：验证承诺、npm 快照、上下文说明和 stale plan

**Files:**
- Modify: `README.md`
- Modify: `packages/core/README.md`
- Modify: `doc/index.md`
- Modify: `doc/guide/getting-started.md`
- Modify: `packages/angular/README.md`
- Modify: `doc/plugins/angular.md`
- Modify: `doc/core/context.md`
- Modify: `doc/zh-Hans/guide/examples.md`
- Modify: `docs/superpowers/plans/2026-07-02-feedback-repair.md`

**Interfaces:**
- Consumes: current docs build/typecheck scripts and the confirmed review findings
- Produces:
  - narrower, truthful verification wording
  - no hard-coded npm snapshot sprawl in public docs entrypoints
  - explicit SSE execute-time override boundary
  - self-consistent Angular Chinese example and self-consistent historical plan note

- [ ] **Step 1: Capture the current broad claims and brittle snapshots before editing**

Run:

```bash
grep -n "verify the docs examples" README.md packages/core/README.md
grep -n "Latest npm release\|No public npm package found\|currently ships @defjs/angular@18.0.7\|latest npm currently 0.3.3" README.md doc/index.md doc/guide/getting-started.md packages/angular/README.md doc/plugins/angular.md packages/core/README.md
grep -n "Execution-time options .* highest priority" doc/core/context.md
grep -n "const auth = authInterceptors" doc/zh-Hans/guide/examples.md
grep -n "不修改 locale 镜像文档" docs/superpowers/plans/2026-07-02-feedback-repair.md
```

Expected: each command finds the exact stale wording that this task is about to remove or narrow.

- [ ] **Step 2: Narrow verification wording in root/core README instead of pretending every snippet is typechecked**

Use this exact block in both `README.md` and `packages/core/README.md` where the current text says “verify the docs examples”:

```md
Use these commands to install the workspace and verify the docs twoslash examples:

```bash
pnpm install
pnpm --dir doc run typecheck
```

`pnpm --dir doc run typecheck` validates the docs site's twoslash blocks. Ordinary fenced snippets in README files and long-form guides still need manual review.
```

Do not introduce a new validation script in this task.

- [ ] **Step 3: Replace hard-coded published-version caveats with one generic source-vs-published warning**

Use this paragraph everywhere the current docs hard-code current npm snapshots:

```md
Published packages may lag behind this source checkout. Before copying a source/workspace snippet into an external app, verify that the published `@defjs/*` versions you installed expose the same API surface. Use the installed package metadata and release notes as the source of truth for exact version numbers.
```

Apply it to:
- `README.md`
- `doc/index.md`
- `doc/guide/getting-started.md`
- `packages/angular/README.md`
- `doc/plugins/angular.md`

For `README.md`, also collapse the package table to just `Package | Purpose` and place this note immediately after the table:

```md
> Exact published npm availability changes faster than this README. Use package metadata and release notes as the source of truth for version numbers and shipped APIs.
```

For `doc/plugins/angular.md`, replace the current dependency snapshot table with this shorter section:

```md
## Dependencies

- Current source package peer range: Angular `>=18.0.0 <=22.0.0`
- `@defjs/core` should come from the same source checkout or published version line as the adapter you install
- For exact published versions, check the installed package metadata rather than this repository page
```

- [ ] **Step 4: Make the SSE execution-time boundary explicit and repair the Chinese Angular snippet**

Replace the `doc/core/context.md` configuration paragraph with:

```md
Configuration functions apply in order; later client options override earlier client options. Execution-time options only override settings that `client.execute(...)` actually accepts for that transport (for example `timeout`, `signal`, or request context). SSE reconnect remains a client-level configuration and is not overridden per execute call.
```

Update `doc/zh-Hans/guide/examples.md` so the `app.config.ts` block becomes:

```ts
// app.config.ts
import { ApplicationConfig } from '@angular/core'
import { provideClient, withEndpoint, withInterceptors } from '@defjs/angular'
import { authInterceptors } from './interceptors'

const auth = authInterceptors(() => localStorage.getItem('token'))

export const appConfig: ApplicationConfig = {
  providers: [
    provideClient(
      withEndpoint('https://api.example.com'),
      withInterceptors(() => auth.http, () => auth.sse, () => auth.webSocket),
    ),
  ],
}
```

Also relabel the earlier helper snippet in that section as `// interceptors.ts` so the import has a visible source.

- [ ] **Step 5: Fix the stale locale constraint in the older plan file**

Replace the current line in `docs/superpowers/plans/2026-07-02-feedback-repair.md`:

```md
- 不修改 locale 镜像文档，例如 `doc/zh-Hans`、`doc/fr-FR`、`doc/de-DE`。
```

with:

```md
- 不新增额外 locale 扩写任务；仅修复本轮已直接涉及且已确认有误的 locale 页面。
```

This keeps the plan historically useful without pretending the branch never touched locale files.

- [ ] **Step 6: Run docs verification and grep for stale wording**

Run:

```bash
pnpm --dir doc run typecheck
pnpm --dir doc run docs:build
grep -n "verify the docs examples" README.md packages/core/README.md
grep -n "Latest npm release\|No public npm package found\|currently ships @defjs/angular@18.0.7\|latest npm currently 0.3.3" README.md doc/index.md doc/guide/getting-started.md packages/angular/README.md doc/plugins/angular.md packages/core/README.md
grep -n "不修改 locale 镜像文档" docs/superpowers/plans/2026-07-02-feedback-repair.md
```

Expected:
- `pnpm --dir doc run typecheck` exits 0.
- `pnpm --dir doc run docs:build` exits 0.
- All three `grep` commands return no matches.

- [ ] **Step 7: Commit checkpoint (only if the user later explicitly requests commits)**

```bash
git add README.md packages/core/README.md doc/index.md doc/guide/getting-started.md packages/angular/README.md doc/plugins/angular.md doc/core/context.md doc/zh-Hans/guide/examples.md docs/superpowers/plans/2026-07-02-feedback-repair.md
git commit -m "docs: reduce stale verification and release wording"
```

---

## Verification Checklist

- [ ] `packages/react/src/core.browser.spec.tsx` 新增的 append-order 用例先失败、后通过。
- [ ] `packages/vue/test/core.spec.ts` 新增的 append-order 用例先失败、后通过。
- [ ] `pnpm --dir packages/react exec vitest run src/core.browser.spec.tsx --config vitest.config.ts` 通过。
- [ ] `pnpm --dir packages/vue exec vitest run test/core.spec.ts --config vitest.config.ts` 通过。
- [ ] `pnpm --dir doc run typecheck` 通过。
- [ ] `pnpm --dir doc run docs:build` 通过。
- [ ] `grep -n "request.url" packages/vue/README.md` 无输出。
- [ ] `grep -n "let cancelled = false" doc/plugins/react.md packages/react/README.md` 无输出。
- [ ] `grep -n "closeStream = () => {}" doc/plugins/vue.md doc/zh-Hans/plugins/vue.md` 无输出。
- [ ] `grep -n '^---$' packages/opentelemetry-server/README.md` 无输出。
- [ ] `grep -n '/core/client\|/core/sse\|/core/web-socket' packages/opentelemetry-server/README.md` 无输出。
- [ ] `grep -n 'optional .*server.address\|optional .*server.port' packages/opentelemetry-server/README.md doc/plugins/opentelemetry-server.md` 无输出。
- [ ] `grep -n "verify the docs examples" README.md packages/core/README.md` 无输出。
- [ ] `grep -n "Latest npm release\|No public npm package found\|currently ships @defjs/angular@18.0.7\|latest npm currently 0.3.3" README.md doc/index.md doc/guide/getting-started.md packages/angular/README.md doc/plugins/angular.md packages/core/README.md` 无输出。
- [ ] `doc/core/context.md` 明确写出 execute-time override 只适用于该 transport 支持的 execute options。
- [ ] `doc/zh-Hans/guide/examples.md` 的 `app.config.ts` 代码块能单独看出 `authInterceptors` 来源。
- [ ] `docs/superpowers/plans/2026-07-02-feedback-repair.md` 不再声称本轮完全不改 locale 页面。

## Coverage Notes

- 本计划**已覆盖**：adapter interceptor 语义、React cleanup、Vue SSE startup cancellation、Vue README `request.url`、OpenTelemetry metric table、OpenTelemetry package README frontmatter/links、docs verification wording、npm snapshot sprawl、SSE execution-time wording、zh-Hans Angular snippet、stale plan line。
- 本计划**刻意不覆盖**：`struct.request({ body: struct.object(...) })` 那组 request body wrapper 修复；它需要单独的高优任务和更窄的 review 面。
- 本计划**不新增**：新 docs 校验框架、全量 locale 同步、package 设计重构、OpenTelemetry runtime 新功能。

Plan complete and saved to `docs/superpowers/plans/2026-07-05-remaining-review-fixes.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
