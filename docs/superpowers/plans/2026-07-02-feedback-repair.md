# Feedback Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按用户确认的方案 B 修复 P0 文档可信度问题，并补充 P1 React / Vue / Angular cookbook；不做 API、runtime 或 helper 能力改造。

**Architecture:** 本轮是 docs-only 修复：先统一公开入口与 core onboarding 写法，再前置 OpenTelemetry WebSocket query propagation 安全边界，最后补齐 framework thin-adapter cookbook。README 保持 concise positioning；VitePress 文档页承载长 cookbook 和更多解释。所有示例只使用当前公开 API，并通过现有 `/doc` typecheck 与 docs build 验证文档站页面。

**Tech Stack:** Markdown、VitePress、TypeScript/twoslash docs、pnpm workspace、`@defjs/core`、`@defjs/react`、`@defjs/vue`、`@defjs/angular`、`@defjs/opentelemetry-server`。

## Global Constraints

- 本轮只执行用户确认的方案 B：P0 文档可信度修复 + P1 React/Vue/Angular cookbook。
- 不修改 runtime source、public API、helper export、package manifest、build scripts 或测试框架。
- 不新增 `@defjs/react-query`、`@defjs/nuxt`、`@defjs/angular-rxjs` 等新包。
- 不实现 opt-in strict / regulated profile。
- 不实现 SSE/WebSocket message-level telemetry。
- 不实现 `captureHeaders`、`captureAttributes`、redaction preset。
- locale 文档只修改与本轮反馈修复直接相关的页面，不扩展到无关镜像页。
- 不新建第二套 docs 校验系统。
- 文档内容保持现有英文文档风格；计划、执行说明、审查说明和最终汇报使用简体中文。
- 主入口示例统一采用 `createClient(withEndpoint('https://api.example.com'))`。
- 请求形状能直映 transport parts 时，优先使用 `struct.request({ path, query, headers, body })`。
- 只有确实需要手工映射或复杂转换时，才展示 `build(ctx, input)` 与 `ctx.setPathParams(...)` / `ctx.setQueryParams(...)` / `ctx.setJson(...)`。
- `output` 的 array form 是 onboarding house style；不能写成唯一合法写法，reference 页面仍需说明 object form 也受支持。
- `withInterceptors` 在公开入口中只保留一种一致写法；framework package 的同名 option/helper 需要说明它是 provider/client option glue。
- Node `>=26`、`pnpm@11.6.0`、`engine-strict=true` 是 repo development baseline，不是所有 consumer package adoption 的硬性前置条件。
- Framework packages 保持 thin adapter：只负责 client 注入、provider wiring 和 option glue，不承诺内置 query/cache/state/testing 框架。
- `@defjs/opentelemetry-server` 不初始化 OpenTelemetry SDK，只接入应用已经创建的 tracer/meter。
- WebSocket `queryPropagation` 默认开启是 browser compatibility choice；安全敏感生产流量推荐展示 `webSocket: { queryPropagation: false }` 作为 recommended production baseline。
- README 文件不声称被现有 docs typecheck 自动覆盖；README 验收必须包含人工一致性复核。
- 执行期间不要提交 commit，除非用户在后续消息中明确要求提交。

---

## File Structure

- Modify: `README.md`
  - 负责 root package positioning、Quick Start、Delivered / Planned / Non-goals、adoption note。
- Modify: `packages/core/README.md`
  - 负责 core package README 的 public onboarding 示例，与文档站主路径保持一致。
- Modify: `doc/index.md`
  - 负责首页极短 Quick Start snippet，不展开所有 API 变体。
- Modify: `doc/guide/getting-started.md`
  - 负责主 onboarding 教程：install、client、request、execute、完整示例和 quick reference。
- Modify: `doc/guide/examples.md`
  - 负责 copy-paste examples 与 cheat-sheet；修正 `.alias(name)` 写法。
- Modify: `doc/core/commands.md`
  - 负责 `defineRequest` / command reference 中的 canonical examples 与 `struct.request(...)` 关系。
- Modify: `doc/core/http.md`
  - 负责 HTTP reference 中 `struct.request(...)` auto mapping 与 `build(ctx, input)` manual mapping 的清晰分层。
- Modify: `packages/opentelemetry-server/README.md`
  - 负责 package README 的 safety-first OpenTelemetry guidance。
- Modify: `doc/plugins/opentelemetry-server.md`
  - 负责文档站插件页的同等 OTel 安全边界与 production baseline。
- Modify: `packages/react/README.md`
  - 负责 React package concise README、thin-adapter boundary、链接到 docs cookbook。
- Modify: `doc/plugins/react.md`
  - 负责 React long-form cookbook：Next.js App Router、headers/cookies forwarding、TanStack Query、hydrate/dehydrate、Error Boundary、provider lifecycle。
- Modify: `packages/vue/README.md`
  - 负责 Vue package concise README、thin-adapter boundary、链接到 docs cookbook。
- Modify: `doc/plugins/vue.md`
  - 负责 Vue long-form cookbook：Nuxt server/client separation、application-level forwarding、Pinia、SSE/WebSocket cleanup、SSR safety。
- Modify: `packages/angular/README.md`
  - 负责 Angular package concise README、DI thin-adapter boundary、链接到 docs cookbook。
- Modify: `doc/plugins/angular.md`
  - 负责 Angular long-form cookbook：facade/service、RxJS bridge、signals bridge、TestBed override、typed mock client、多 client provider boundary。
- Read-only evidence: `docs/superpowers/specs/2026-07-02-feedback-repair-design.md`
  - 绑定本计划范围、非目标、验收标准。
- Read-only evidence: `docs/superpowers/feedback/2026-07-02-simulated-user-research.md`
  - 绑定用户研究反馈来源；不能把已记录设计选择改写成 confirmed bug。
- Read-only evidence: `package.json`、`doc/package.json`、`.npmrc`
  - 绑定 Node/pnpm baseline 与验证命令。

---

### Task 1: Root entrypoint alignment

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: workspace package reality from `pnpm-workspace.yaml` and current package README set.
- Produces: root-level public positioning that later package README edits can link back to without contradicting delivered/planned/non-goal status.

- [ ] **Step 1: Review the current root README package and roadmap claims**

Read `README.md` and identify these exact current drift points before editing:

```text
- Packages table currently lists only @defjs/core and @defjs/angular.
- Roadmap currently lists Vue wrapper package and React wrapper package as future items even though packages exist.
- Quick Start currently uses createClient({ endpoint: ... }) and object-form output.
- README has no adoption note separating repo development baseline from package adoption maturity.
```

- [ ] **Step 2: Replace the Quick Start request snippet with the onboarding house style**

Use a short snippet with `withEndpoint`, `struct.request(...)`, array-form `output`, and error-first tuple:

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
if (error) {
  console.error(error)
} else {
  console.log(user.name)
}
```

- [ ] **Step 3: Replace the Packages table with delivered packages**

Use this exact package set and keep version badges if existing badge style is retained:

```markdown
## Packages

| Package | Purpose |
| --- | --- |
| [`@defjs/core`](packages/core) | Typed HTTP, SSE, and WebSocket client definitions and execution. |
| [`@defjs/react`](packages/react) | React thin adapter for sharing a typed core client through `ClientProvider` and `useClient`. |
| [`@defjs/vue`](packages/vue) | Vue thin adapter for providing and injecting a typed core client. |
| [`@defjs/angular`](packages/angular) | Angular DI thin adapter for providing and injecting a typed core client. |
| [`@defjs/opentelemetry-server`](packages/opentelemetry-server) | Server-side outbound OpenTelemetry instrumentation for core clients. |
```

- [ ] **Step 4: Replace Roadmap with delivered/planned/non-goals boundaries**

Use this structure so delivered ability, future work, and non-goals are separated:

```markdown
## Status and Roadmap

### Delivered today

- Typed HTTP, SSE, and WebSocket command definitions in `@defjs/core`.
- Thin framework adapters for React, Vue, and Angular.
- Server-side outbound OpenTelemetry instrumentation for defjs clients.
- VitePress documentation site.

### Planned

- CLI tool.
- Generate API definitions from OpenAPI.
- Generate full SDK packages for larger API surfaces.

### Non-goals / boundaries

- Framework adapters are not query/cache/state libraries.
- OpenTelemetry integration does not initialize the OpenTelemetry SDK for you.
- Request/response bodies, full headers, raw query strings, and stream/message payloads are not captured by default.
- CLI and code generation are not delivered packages yet.
```

- [ ] **Step 5: Add the adoption note immediately after Status and Roadmap**

Use this text, preserving exact version values:

```markdown
## Adoption note

Repository development uses Node `>=26`, `pnpm@11.6.0`, and `engine-strict=true`. Those values describe this repository's contributor baseline, not a blanket requirement for every consumer application that installs a published package.

Most defjs packages are still evolving before a stable 1.0 API. `@defjs/angular` follows Angular ecosystem versioning, while the overall defjs API surface may still change as the project matures.
```

- [ ] **Step 6: Manually review the root README for unsupported claims**

Check that `README.md` does not promise any of these:

```text
- SLA or stability guarantee.
- React/Vue wrappers as future-only work.
- Built-in query/cache/state adapters.
- Built-in OpenTelemetry SDK initialization.
- Delivered CLI or OpenAPI codegen package.
```

Expected: none of these claims remain.

---

### Task 2: Public onboarding path unification

**Files:**
- Modify: `packages/core/README.md`
- Modify: `doc/index.md`
- Modify: `doc/guide/getting-started.md`
- Modify: `doc/guide/examples.md`
- Modify: `doc/core/commands.md`
- Modify: `doc/core/http.md`

**Interfaces:**
- Consumes: Task 1 canonical root onboarding snippet.
- Produces: one consistent public onboarding style used by root README, core README, homepage, guides, examples, and HTTP/command references.

- [ ] **Step 1: Update `doc/index.md` homepage snippet**

Keep homepage short. Use `withEndpoint`, `struct.request(...)`, array-form `output`, and nested `path` input:

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
if (!error) {
  console.log(user.id, user.name)
}
```

- [ ] **Step 2: Update `doc/guide/getting-started.md` Step 2 request definition**

Replace the old `input: struct.object({ id: ... })` example with `struct.request(...)`:

```ts
const getUser = defineRequest({
  method: 'GET',
  path: '/v1/users/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

- [ ] **Step 3: Update `doc/guide/getting-started.md` Step 3 execute example**

Use the same command shape as Step 2:

```ts
async function loadUser() {
  const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

  if (error) {
    console.error(error.code, error.message)
    return
  }

  console.log(user.name)
}
```

- [ ] **Step 4: Update `doc/guide/getting-started.md` complete example**

Use `struct.request(...)` when the shape maps directly to headers/body, and avoid naming a request command and an async function with the same identifier:

```ts
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

const createPostRequest = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.request({
    headers: struct.object({
      'X-Request-ID': struct.string(),
    }),
    body: struct.object({
      title: struct.string(),
      body: struct.string(),
    }),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number(), title: struct.string() }) },
    { status: 400, body: struct.object({ field: struct.string(), reason: struct.string() }) },
  ] as const,
})

async function submitPost() {
  const [error, post] = await client.execute(
    createPostRequest({
      headers: { 'X-Request-ID': 'uuid-123' },
      body: { title: 'Hello', body: 'World' },
    }),
  )

  if (error) {
    console.error(error)
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

- [ ] **Step 5: Add an adoption note near installation in `doc/guide/getting-started.md`**

Use this short text below the install code-group:

```markdown
::: info Development baseline
This repository is developed with Node `>=26`, `pnpm@11.6.0`, and `engine-strict=true`. That baseline is for contributors working in this monorepo. Installing a published defjs package into an application follows the package's published runtime and bundler constraints.
:::
```

- [ ] **Step 6: Update `packages/core/README.md` to match the same minimal onboarding path**

Ensure the first copy-paste example in `packages/core/README.md` uses this same shape:

```ts
const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
```

- [ ] **Step 7: Update `doc/core/http.md` input/build explanation**

Replace the incorrect statement “When `input` is provided, `build` must also be provided” with this explanation:

```markdown
`input` describes the command input shape. There are two common mapping paths:

1. Use `struct.request(...)` when fields map directly to HTTP transport parts such as `path`, `query`, `headers`, or `body`. Defjs can build those request parts automatically.
2. Use `build(ctx, input)` when the public command input differs from the wire shape, or when you need custom mapping logic.
```

- [ ] **Step 8: Update `doc/core/http.md` auto-mapping example**

Use this example before any manual `build(ctx, input)` example:

```ts
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    query: struct.object({ includePosts: struct.boolean() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

- [ ] **Step 9: Update `doc/core/http.md` manual mapping example**

Use this example to show `build(ctx, input)` only for manual mapping:

```ts
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.object({
    id: struct.number(),
    preview: struct.boolean(),
    body: struct.object({ name: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams({ id: input.id })
    ctx.setQueryParams({ preview: input.preview })
    ctx.setJson(input.body)
  },
  output: [
    { status: 200, body: User },
    { status: 400, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

- [ ] **Step 10: Update `doc/core/commands.md` request examples**

For `defineRequest` examples, prefer the same `struct.request(...)` + array-form `output` shape. When the page documents both supported `output` syntaxes, use this wording:

```markdown
The examples in this guide use the array form because it keeps status/body pairs explicit and supports grouping multiple statuses. Object-form `output` is still supported and remains useful for compact reference examples.
```

- [ ] **Step 11: Update `doc/guide/examples.md` copy-paste examples**

Convert request examples that directly map path/query/header/body fields to `struct.request(...)`. Keep `build(ctx, input)` only for examples whose public input shape differs from the wire shape.

Use this manual mapping pattern when needed:

```ts
build(ctx, input) {
  ctx.setPathParams({ id: input.id })
  ctx.setQueryParams({ preview: input.preview })
  ctx.setJson(input.body)
}
```

- [ ] **Step 12: Fix `.alias(name)` cheat-sheet wording in `doc/guide/examples.md`**

Replace any `struct.alias(name)` cheat-sheet entry with field-level `.alias(name)`:

```ts
const User = struct.object({
  userName: struct.string().alias('user_name'),
})
```

- [ ] **Step 13: Run docs typecheck for onboarding pages**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
```

Expected: exit code `0`. If it fails, record the exact failing file, line, and diagnostic before making any follow-up edits.

- [ ] **Step 14: Run docs build for onboarding pages**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: exit code `0`. If it fails, record the exact VitePress error before making any follow-up edits.

---

### Task 3: OpenTelemetry safety-first repair

**Files:**
- Modify: `packages/opentelemetry-server/README.md`
- Modify: `doc/plugins/opentelemetry-server.md`

**Interfaces:**
- Consumes: Global OTel constraints from the repair design spec.
- Produces: consistent package README and docs plugin page where query propagation risk is visible near first configuration and production baseline is explicit.

- [ ] **Step 1: Move WebSocket query propagation warning near first usage in package README**

Place this section after the first configuration example in `packages/opentelemetry-server/README.md`:

````markdown
## Production baseline for WebSocket propagation

Browser WebSocket clients usually cannot set arbitrary headers, so `webSocket.queryPropagation` defaults to `true` for compatibility. That default injects trace context into the WebSocket URL query string.

For security-sensitive production traffic, use this safer baseline unless you have reviewed URL-based propagation for your environment:

```ts
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: false,
  },
})
```

Query strings can be recorded by proxies, browsers, APM tooling, access logs, and network debugging tools. If your propagator includes `baggage`, baggage values can also be written into the URL and may contain sensitive data.
````

- [ ] **Step 2: Keep the configuration table honest about the runtime default**

In the WebSocket options table, preserve the default as `true` and make the description mention both compatibility and production guidance:

```markdown
| `queryPropagation` | `boolean` | `true` | Inject trace context into the WebSocket URL query string for browser compatibility. Use `false` as the recommended production baseline for security-sensitive traffic. |
```

- [ ] **Step 3: Add privacy/cardinality boundary to package README monitoring model**

Use this text in the monitoring model or safety section:

```markdown
Do not add raw query strings, request or response bodies, full headers, baggage values, or message payloads to spans or metrics unless the application has reviewed privacy, cardinality, retention, and redaction requirements. This package avoids those fields by default because they often contain sensitive or high-cardinality data.
```

- [ ] **Step 4: Preserve SDK initialization boundary in package README**

Ensure the README still states this boundary near the introduction or first usage:

```markdown
This package does not initialize an OpenTelemetry SDK. Initialize the SDK in your application, then pass the tracer and optional meter into `withOpenTelemetryServer(...)`.
```

- [ ] **Step 5: Mirror the same safety-first structure in `doc/plugins/opentelemetry-server.md`**

Add the same conceptual sections in this order near the top of the plugin page:

```markdown
1. Outbound-only client instrumentation boundary.
2. Does not initialize SDK boundary.
3. Recommended production baseline for WebSocket propagation.
4. Configuration table with actual default `queryPropagation: true`.
5. Privacy/cardinality boundary for hooks and custom attributes.
```

- [ ] **Step 6: Run docs typecheck for plugin page**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
```

Expected: exit code `0`. If it fails, fix only diagnostics caused by this task's Markdown/code snippets.

- [ ] **Step 7: Run docs build for plugin page**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: exit code `0`. If it fails, fix only diagnostics caused by this task's Markdown/code snippets.

- [ ] **Step 8: Manual OTel consistency review**

Compare `packages/opentelemetry-server/README.md` and `doc/plugins/opentelemetry-server.md` for these exact facts:

```text
- SDK initialization boundary appears in both.
- `queryPropagation` runtime default remains `true` in both.
- `queryPropagation: false` appears as recommended production baseline in both.
- Browser compatibility reason appears in both.
- proxies, browsers, APM tooling, access logs, and baggage risk appear in both.
- Raw query strings, bodies, full headers, and message payloads are not suggested as default telemetry.
```

Expected: all six checks pass.

---

### Task 4: React and Vue thin-adapter cookbook additions

**Files:**
- Modify: `packages/react/README.md`
- Modify: `doc/plugins/react.md`
- Modify: `packages/vue/README.md`
- Modify: `doc/plugins/vue.md`

**Interfaces:**
- Consumes: Global thin-adapter constraints and canonical core onboarding style.
- Produces: React and Vue package READMEs that stay concise, plus long-form docs pages that show mainstream integration recipes without claiming built-in query/cache/state/Nuxt/Pinia capabilities.

- [ ] **Step 1: Add React thin-adapter boundary to package README**

Use concise language like this near the top of `packages/react/README.md`:

```markdown
`@defjs/react` is a thin adapter around `@defjs/core`. It provides `ClientProvider`, `useClient`, and React-specific option wiring so a typed defjs client can be shared through a component tree.

It does not implement query caching, retries, Suspense integration, SWR, TanStack Query, or application state management. Compose those libraries at the application layer by calling `client.execute(...)` inside their own hooks or functions.
```

- [ ] **Step 2: Keep React package README short and link to docs cookbook**

Add this link section instead of duplicating the whole cookbook in the package README:

```markdown
## Cookbook

See the React documentation page for recipes covering Next.js App Router, application-level header/cookie forwarding, TanStack Query, hydration boundaries, and provider lifecycle: https://defjs.org/plugins/react
```

- [ ] **Step 3: Add React Next.js App Router server-client pattern to `doc/plugins/react.md`**

Add a cookbook section that shows per-request client creation on the server side:

```ts
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { cookies, headers } from 'next/headers'

export async function createDefjsServerClient() {
  const requestHeaders = await headers()
  const requestCookies = await cookies()

  return createClient(
    withEndpoint(process.env.API_ENDPOINT!),
    withInterceptors([
      async (request, next) => {
        const requestId = requestHeaders.get('x-request-id')
        if (requestId) {
          request.headers.set('x-request-id', requestId)
        }

        const cookieHeader = requestCookies.toString()
        if (cookieHeader) {
          request.headers.set('cookie', cookieHeader)
        }

        return next(request)
      },
    ]),
  )
}
```

- [ ] **Step 4: Add React ClientProvider lifecycle note to `doc/plugins/react.md`**

Use this prose:

```markdown
Create the client at the same lifecycle boundary where you want its options and interceptors to live. In browser-only React apps that is often module scope or a top-level provider component. In request-scoped server rendering, create a new client for each request so sensitive headers and cookies do not leak across users. Remounting `ClientProvider` with a different client replaces the client visible to descendants.
```

- [ ] **Step 5: Add React TanStack Query recipe to `doc/plugins/react.md`**

Use this pattern and explicitly throw the defjs error so TanStack Query owns retry/error UI:

```ts
import { useClient } from '@defjs/react'
import { useQuery } from '@tanstack/react-query'

export function useUserQuery(id: number) {
  const client = useClient()

  return useQuery({
    queryKey: ['user', id],
    queryFn: async () => {
      const [error, user] = await client.execute(getUser({ path: { id } }))
      if (error) {
        throw error
      }
      return user
    },
  })
}
```

- [ ] **Step 6: Add React hydration boundary explanation to `doc/plugins/react.md`**

Use this prose:

```markdown
For prefetch / dehydrate / hydrate flows, let TanStack Query own the cached data. Defjs only executes the typed command. On the server, call `client.execute(...)` inside the query prefetch function and throw the defjs error if the tuple contains an error. On the client, wrap the tree with both the query provider and `ClientProvider`; keep serialized query data in TanStack Query's hydration payload, not inside the defjs client.
```

- [ ] **Step 7: Add React Error Boundary note to `doc/plugins/react.md`**

Use this distinction:

```markdown
`client.execute(...)` returns an error-first tuple and does not throw for normal request failures. Error Boundaries only catch thrown errors during render or hooks that throw. If an application wants Error Boundary behavior, convert the tuple into a thrown error at the integration boundary, as shown in the TanStack Query recipe.
```

- [ ] **Step 8: Add Vue thin-adapter boundary to package README**

Use concise language like this near the top of `packages/vue/README.md`:

```markdown
`@defjs/vue` is a thin adapter around `@defjs/core`. It provides Vue plugin/provide/inject wiring for a typed defjs client.

It does not implement a Nuxt module, Pinia plugin, query cache, retry policy, or application state management. Compose those pieces at the application layer by calling `client.execute(...)` from your own composables, stores, or route logic.
```

- [ ] **Step 9: Keep Vue package README short and link to docs cookbook**

Add this link section:

```markdown
## Cookbook

See the Vue documentation page for recipes covering Nuxt server/client separation, application-level header/cookie forwarding, Pinia actions, SSE/WebSocket cleanup, and SSR safety: https://defjs.org/plugins/vue
```

- [ ] **Step 10: Add Nuxt client plugin recipe to `doc/plugins/vue.md`**

Use this browser/client plugin pattern for app-level client provisioning:

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { provideClient } from '@defjs/vue'

export default defineNuxtPlugin((nuxtApp) => {
  const client = createClient(withEndpoint(useRuntimeConfig().public.apiBase))
  nuxtApp.vueApp.use(provideClient(client))
})
```

- [ ] **Step 11: Add Nuxt server-side request boundary note to `doc/plugins/vue.md`**

Use this prose:

```markdown
For SSR or server routes, create a defjs client inside the request boundary when forwarding user-specific headers or cookies. Do not store a client with sensitive request headers in a cross-request singleton. The Vue adapter provides app-level injection; it does not decide which headers or cookies are safe to forward.
```

- [ ] **Step 12: Add Pinia action recipe to `doc/plugins/vue.md`**

Use an application-owned action that receives or imports the client boundary explicitly:

```ts
import { defineStore } from 'pinia'
import { injectClient } from '@defjs/vue'

export const useUserStore = defineStore('user', () => {
  const client = injectClient()

  async function loadUser(id: number) {
    const [error, user] = await client.execute(getUser({ path: { id } }))
    if (error) {
      throw error
    }
    return user
  }

  return { loadUser }
})
```

- [ ] **Step 13: Add Vue SSE/WebSocket cleanup guidance to `doc/plugins/vue.md`**

Use this pattern text and keep method names aligned with existing stream/session docs during implementation:

```markdown
Treat SSE streams and WebSocket sessions as resources owned by the component, route, or store that opened them. Close or abort them on `onBeforeUnmount`, route changes, or store disposal so long-lived connections do not outlive the UI that needs them.
```

Include a concise cleanup sketch:

```ts
import { onBeforeUnmount } from 'vue'
import { injectClient } from '@defjs/vue'

const client = injectClient()
const [error, session] = await client.execute(openChat({ path: { roomId } }))

if (!error) {
  onBeforeUnmount(() => {
    session.close()
  })
}
```

- [ ] **Step 14: Run docs typecheck for React/Vue docs**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
```

Expected: exit code `0`. If it fails, fix diagnostics caused by React/Vue cookbook snippets or mark non-typechecked ecosystem snippets as plain `ts` instead of `twoslash` if the docs tooling lacks external framework dependencies.

- [ ] **Step 15: Run docs build for React/Vue docs**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: exit code `0`. If it fails, fix Markdown/VitePress syntax introduced by this task.

- [ ] **Step 16: Manual React/Vue boundary review**

Confirm these exact unsupported promises are absent:

```text
- @defjs/react includes TanStack Query integration.
- @defjs/react includes SWR integration.
- @defjs/react includes Suspense/cache/state management.
- @defjs/vue includes a Nuxt module.
- @defjs/vue includes a Pinia plugin.
- @defjs/vue includes state management or query caching.
```

Expected: none of these appear as built-in package capabilities.

---

### Task 5: Angular thin-adapter cookbook additions

**Files:**
- Modify: `packages/angular/README.md`
- Modify: `doc/plugins/angular.md`

**Interfaces:**
- Consumes: Global thin-adapter constraints and canonical core onboarding style.
- Produces: Angular package README that stays concise, plus long-form docs page for DI facade/service, RxJS, signals, TestBed, typed mock client, and multi-client boundaries.

- [ ] **Step 1: Add Angular DI thin-adapter boundary to package README**

Use concise language like this near the top of `packages/angular/README.md`:

```markdown
`@defjs/angular` is a thin Angular dependency-injection adapter around `@defjs/core`. It provides provider and injection helpers for sharing typed defjs clients through Angular's DI system.

It does not implement RxJS operators, signal state, TestBed utilities, generated mocks, retry policies, or application state management. Compose those patterns in Angular services, facades, or tests by calling `client.execute(...)`.
```

- [ ] **Step 2: Keep Angular package README short and link to docs cookbook**

Add this link section:

```markdown
## Cookbook

See the Angular documentation page for recipes covering service facades, RxJS, signals, TestBed overrides, typed mock clients, and multi-client provider boundaries: https://defjs.org/plugins/angular
```

- [ ] **Step 3: Add Angular service facade recipe to `doc/plugins/angular.md`**

Use a service that owns the injected client and exposes application methods:

```ts
import { Injectable } from '@angular/core'
import { injectClient } from '@defjs/angular'

@Injectable({ providedIn: 'root' })
export class UserApi {
  private readonly client = injectClient()

  async loadUser(id: number) {
    const [error, user] = await this.client.execute(getUser({ path: { id } }))
    if (error) {
      throw error
    }
    return user
  }
}
```

- [ ] **Step 4: Add Angular RxJS bridge recipe to `doc/plugins/angular.md`**

Use `from(client.execute(...))` and convert the tuple at the boundary:

```ts
import { Injectable } from '@angular/core'
import { injectClient } from '@defjs/angular'
import { from, map } from 'rxjs'

@Injectable({ providedIn: 'root' })
export class UserQuery {
  private readonly client = injectClient()

  user$(id: number) {
    return from(this.client.execute(getUser({ path: { id } }))).pipe(
      map(([error, user]) => {
        if (error) {
          throw error
        }
        return user
      }),
    )
  }
}
```

- [ ] **Step 5: Add Angular signal bridge recipe to `doc/plugins/angular.md`**

Use Angular's own interop helper and keep defjs as the request executor:

```ts
import { Component, input } from '@angular/core'
import { toSignal } from '@angular/core/rxjs-interop'

@Component({
  selector: 'app-user-card',
  template: `
    @if (user(); as value) {
      <p>{{ value.name }}</p>
    }
  `,
})
export class UserCardComponent {
  readonly id = input.required<number>()
  readonly user = toSignal(this.userQuery.user$(this.id()))

  constructor(private readonly userQuery: UserQuery) {}
}
```

If the current Angular docs style avoids template snippets, keep this as non-twoslash Markdown code so docs typecheck does not require Angular template compilation.

- [ ] **Step 6: Add TestBed provider override recipe to `doc/plugins/angular.md`**

Use this testing pattern, adjusting token names to the actual `@defjs/angular` public API during implementation:

```ts
import { TestBed } from '@angular/core/testing'
import { provideClient } from '@defjs/angular'

const mockClient = {
  execute: async () => [null, { id: 1, name: 'Ada' }] as const,
}

beforeEach(() => {
  TestBed.configureTestingModule({
    providers: [provideClient(mockClient)],
  })
})
```

- [ ] **Step 7: Add typed mock client factory recipe to `doc/plugins/angular.md`**

Use a tiny application-owned mock factory and state that the package does not generate mocks:

```ts
function createMockClient(result: Awaited<ReturnType<typeof realClient.execute>>) {
  return {
    execute: async () => result,
  }
}
```

Pair it with this prose:

```markdown
`@defjs/angular` does not generate test doubles. Keep mocks in application test utilities so they can model the commands and errors your application actually uses.
```

- [ ] **Step 8: Add multi-client provider boundary recipe to `doc/plugins/angular.md`**

Use prose that explains the boundary without inventing new runtime API:

```markdown
For multiple backends, create separate provider boundaries in Angular DI. Put each configured defjs client at the module, route, or component boundary that owns it, then inject the client from services inside that boundary. This keeps endpoint, auth, and interceptor choices local to the feature that needs them.
```

If existing `@defjs/angular` docs expose named tokens or provider helpers for multiple clients, use those existing helpers only; do not propose a new helper export.

- [ ] **Step 9: Run docs typecheck for Angular docs**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
```

Expected: exit code `0`. If it fails, fix diagnostics caused by Angular cookbook snippets or mark framework-dependent examples as plain Markdown code blocks when the docs toolchain lacks Angular compiler context.

- [ ] **Step 10: Run docs build for Angular docs**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: exit code `0`. If it fails, fix Markdown/VitePress syntax introduced by this task.

- [ ] **Step 11: Manual Angular boundary review**

Confirm these unsupported promises are absent:

```text
- @defjs/angular includes RxJS operators.
- @defjs/angular includes signal state helpers.
- @defjs/angular includes TestBed utilities.
- @defjs/angular generates mocks.
- @defjs/angular provides state management.
```

Expected: none of these appear as built-in package capabilities.

---

### Task 6: Global validation and handoff

**Files:**
- Review: `README.md`
- Review: `packages/core/README.md`
- Review: `packages/react/README.md`
- Review: `packages/vue/README.md`
- Review: `packages/angular/README.md`
- Review: `packages/opentelemetry-server/README.md`
- Review: `doc/index.md`
- Review: `doc/guide/getting-started.md`
- Review: `doc/guide/examples.md`
- Review: `doc/core/commands.md`
- Review: `doc/core/http.md`
- Review: `doc/plugins/react.md`
- Review: `doc/plugins/vue.md`
- Review: `doc/plugins/angular.md`
- Review: `doc/plugins/opentelemetry-server.md`

**Interfaces:**
- Consumes: Tasks 1–5 documentation changes.
- Produces: verified final state report for the user, including commands run, exit status, and any unverified README/manual checks.

- [ ] **Step 1: Check Node version**

Run:

```bash
node -v
```

Expected: major version is `26` or newer. If not, report that docs validation may not be runnable under the repository's `engines.node` baseline.

- [ ] **Step 2: Check pnpm version**

Run:

```bash
pnpm -v
```

Expected: version is `11.6.0`. If not, report the exact installed version and whether commands were still attempted.

- [ ] **Step 3: Run docs typecheck once after all edits**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
```

Expected: exit code `0`. If it fails, do not claim docs typecheck passed; report the exact failing diagnostics and fix only issues caused by this repair scope.

- [ ] **Step 4: Run docs build once after all edits**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: exit code `0`. If it fails, do not claim docs build passed; report the exact failing diagnostics and fix only issues caused by this repair scope.

- [ ] **Step 5: Optionally run doc tests if environment remains healthy**

Run this only after typecheck and build succeed:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run test
```

Expected: exit code `0`. If skipped, report the skip reason explicitly.

- [ ] **Step 6: Manual README consistency checklist**

Review README files manually because current docs typecheck does not cover all package READMEs. Check:

```text
- Root README lists delivered packages: @defjs/core, @defjs/react, @defjs/vue, @defjs/angular, @defjs/opentelemetry-server.
- Root README lists CLI/OpenAPI/full SDK generation as planned, not delivered.
- Root README does not describe React/Vue wrappers as future-only.
- Core README, homepage, Getting Started, Examples, Commands, and HTTP pages all use createClient(withEndpoint(...)) in onboarding examples.
- Core README, homepage, Getting Started, Examples, Commands, and HTTP pages prefer struct.request(...) for direct path/query/header/body mapping.
- Manual mapping examples use build(ctx, input), not build(input) returning an object.
- Array-form output appears as onboarding house style, while object-form output remains documented as supported where relevant.
- OTel README and plugin page both show queryPropagation: false as recommended production baseline.
- React/Vue/Angular READMEs and docs pages all state thin-adapter boundaries.
```

Expected: all checks pass before final report.

- [ ] **Step 7: Inspect git diff before final report**

Run:

```bash
git diff -- README.md packages/core/README.md packages/react/README.md packages/vue/README.md packages/angular/README.md packages/opentelemetry-server/README.md doc/index.md doc/guide/getting-started.md doc/guide/examples.md doc/core/commands.md doc/core/http.md doc/plugins/react.md doc/plugins/vue.md doc/plugins/angular.md doc/plugins/opentelemetry-server.md
```

Expected: diff contains only documentation changes in the planned files and no runtime/API/helper changes.

- [ ] **Step 8: Final user-facing report**

Report in Chinese with this structure:

```markdown
已完成方案 B 文档修复。

修改范围：
- ...

验证：
- `node -v`: ...
- `pnpm -v`: ...
- `pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck`: ...
- `pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build`: ...
- `pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run test`: ... 或说明未运行原因

人工复核：
- README delivered/planned/non-goals: ...
- onboarding style consistency: ...
- OTel safety baseline: ...
- framework thin-adapter boundary: ...

未覆盖或风险：
- ...
```

---

## Self-Review

- Spec coverage: 本计划覆盖 root README delivered/planned/non-goals、adoption note、公开入口 onboarding 统一、`struct.request(...)` 与 `build(ctx, input)` 分层、OTel WebSocket query propagation 安全提示、React/Vue/Angular cookbook、thin-adapter 边界、验证策略和验收标准。
- Placeholder scan: 本计划没有占位符、未完成标记或未指定文件路径的泛化步骤。
- Type/API consistency: 计划中的主路径示例统一使用 `createClient(withEndpoint(...))`、`defineRequest(...)`、`struct.request(...)`、array-form `output`、`client.execute(...)` error-first tuple；manual mapping 示例统一使用 `build(ctx, input)` 与 `ctx.setPathParams(...)` / `ctx.setQueryParams(...)` / `ctx.setJson(...)`。
- Scope check: 本计划只修改 Markdown 文档和 README，不新增包、不修改 runtime source、不新增 public API；locale 仅限本轮已直接涉及且确认有误的页面，不新增 docs validation system。
- Verification check: 自动验证限定为现有 `doc` package 的 `typecheck`、`docs:build` 和可选 `test`；README 验收明确采用人工一致性复核，不把 README 写成已被 docs typecheck 覆盖。
