# Documentation Alignment Hard Switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Synchronize all documentation with the current `feat/up` codebase after the Struct/struct rename, alias-only field naming, and `build(ctx, input)` request builder changes.

**Architecture:** Treat documentation as three layers — superpowers specs/plans as the design source of truth, `packages/core/*` docs as the implementation boundary, and VitePress `doc/**` as the public user guide. Update each layer in order, using automated scans for stale API references and manual type-check sampling for code examples.

**Tech Stack:** Markdown, VitePress, TypeScript, pnpm, vitest, ripgrep.

## Global Constraints

- **Hard switch only**: no compatibility notes, no migration guides, no "old vs new" comparisons.
- **Code is the source of truth**: when docs conflict with current code or accepted specs, update the docs.
- **Single source of truth per rule**: design decisions live in specs; implementation boundaries live in internal docs; usage examples live in user docs.
- **Runnable examples**: every TypeScript snippet in user docs must type-check against current public API.
- **Multi-language tiering**: English is canonical; `zh-Hans` follows English; other locales get minimal stale-content removal only.
- **No code changes**: this plan modifies documentation only.

---

## File Structure

### Design layer
- `docs/superpowers/specs/2026-06-29-documentation-alignment-hard-switch-design.md` — this work's design spec.
- `docs/superpowers/specs/2026-06-19-struct-alias-only-design.md` — accepted alias-only design (retain, minor cleanup).
- `docs/superpowers/specs/2026-06-20-struct-bytecraft-repair-design.md` — accepted struct cleanup design (retain, minor cleanup).
- `docs/superpowers/specs/2026-06-18-core-type-inlining-design.md` — may still reference `requireTag`; clean only if misleading.
- `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md` — references old API by design; add historical note.
- `docs/superpowers/plans/2026-06-18-core-type-inlining.md` — may reference `requireTag`; clean if not historical.
- `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md` — may reference `requireTag`; clean if not historical.
- `docs/2026-06-19-struct-json-requiretag-analysis.md` — historical analysis; add historical note.

### Internal layer
- `packages/core/README.md` — rewrite from placeholder to quick-start.
- `packages/core/design.md` — unify terminology and `build(ctx, input)` details.
- `packages/core/core-minimalism-implementation-plan.md` — mark completed items, clean stale references.
- `packages/core/research/*.md` — clean stale references only.

### User layer
- `doc/core/struct.md` — review and harden alias-only narrative.
- `doc/core/commands.md` — rewrite all examples to use `@defjs/core` `struct`.
- `doc/core/sse.md` — fix `build` examples to `build(ctx, input)`.
- `doc/core/http.md` — sync examples.
- `doc/core/client.md` — sync examples.
- `doc/core/context.md` — sync examples.
- `doc/core/web-socket.md` — sync examples.
- `doc/guide/getting-started.md` — sync examples.
- `doc/guide/examples.md` — sync examples.
- `doc/guide/design-decisions.md` — sync terminology.
- `doc/zh-Hans/**` — follow English updates.
- `doc/de-DE/**`, `doc/es-ES/**`, `doc/fr-FR/**`, `doc/ja-JP/**`, `doc/ar/**`, `doc/ru-RU/**`, `doc/zh-Hant-HK/**`, `doc/zh-Hant-TW/**` — remove stale tag/Schema content, add TODO comments where needed.

---

## Task 1: Baseline Scan Script

**Files:**
- Create: `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh`

**Interfaces:**
- Consumes: none.
- Produces: a reusable shell script that prints all suspect old-API references in documentation.

- [ ] **Step 1: Create scan script**

```bash
#!/usr/bin/env bash
set -euo pipefail
ROOT="/Users/munmunmiao/Documents/web/zen-kit"

echo "=== Stale API references in user docs ==="
rg -n "\bSchema\b|\.tag\(|\btag\.|requireTag|@mobily/ts-belt|setPathParam\b|setQueryParam\b|setHeader\b" \
  "$ROOT/doc" \
  "$ROOT/packages/core/README.md" \
  "$ROOT/packages/core/design.md" \
  "$ROOT/packages/core/core-minimalism-implementation-plan.md" \
  "$ROOT/packages/core/research" \
  "$ROOT/docs/superpowers/specs" \
  "$ROOT/docs/superpowers/plans" \
  "$ROOT/docs/2026-06-19-struct-json-requiretag-analysis.md" \
  --glob '*.md' || true

echo "=== Old SSE build pattern ==="
rg -n "build:\s*\(\s*\{[^}]*\}\s*\)\s*=>\s*\{[^}]*params" "$ROOT/doc" --glob '*.md' || true
```

- [ ] **Step 2: Make executable and run**

Run:

```bash
chmod +x /Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: output listing all current stale references; save this output to use as a before/after comparison.

- [ ] **Step 3: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
git commit -m "docs: add doc stale-api scan script"
```

---

## Task 2: Clean Superpowers Design Docs

**Files:**
- Modify: `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md` (add historical note near title).
- Modify: `docs/superpowers/plans/2026-06-18-core-type-inlining.md` (remove `requireTag` if not historical).
- Modify: `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md` (remove `requireTag` if not historical).
- Modify: `docs/2026-06-19-struct-json-requiretag-analysis.md` (add historical note).
- Modify: `docs/superpowers/specs/2026-06-18-core-type-inlining-design.md` (remove `requireTag` if not historical).

**Interfaces:**
- Consumes: accepted alias-only design from `docs/superpowers/specs/2026-06-19-struct-alias-only-design.md`.
- Produces: design docs that do not mislead future implementers into reintroducing tag/requireTag.

- [ ] **Step 1: Add historical note to alias-only redesign plan**

Insert immediately below the title in `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`:

```markdown
> Historical note: this plan describes the migration away from the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.
```

- [ ] **Step 2: Add historical note to struct-json-requiretag analysis**

Insert immediately below the title in `docs/2026-06-19-struct-json-requiretag-analysis.md`:

```markdown
> Historical note: this document analyzes the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.
```

- [ ] **Step 3: Remove non-historical requireTag references**

In `docs/superpowers/plans/2026-06-18-core-type-inlining.md` and `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md`, delete paragraphs or code blocks that prescribe `requireTag` behavior as a current feature. If a paragraph is discussing the old system, convert it to past tense or delete it.

- [ ] **Step 4: Run scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: remaining references are either in historical notes or in the alias-only redesign plan itself.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md \
  docs/superpowers/plans/2026-06-18-core-type-inlining.md \
  docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md \
  docs/superpowers/specs/2026-06-18-core-type-inlining-design.md \
  docs/2026-06-19-struct-json-requiretag-analysis.md
git commit -m "docs(superpowers): clean stale tag/requireTag references in design docs"
```

---

## Task 3: Rewrite packages/core/README.md

**Files:**
- Modify: `packages/core/README.md`

**Interfaces:**
- Consumes: current public API from `packages/core/src/index.ts` and `packages/core/design.md`.
- Produces: a concise quick-start README whose example type-checks.

- [ ] **Step 1: Replace README content**

Write to `packages/core/README.md`:

```markdown
# @defjs/core

Type-safe HTTP, SSE, and WebSocket commands for TypeScript.

## Install

```bash
npm install @defjs/core
```

## Quick start

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com/v1' })

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error)
} else {
  console.log(user.id, user.name)
}
```

## Core ideas

- **Commands** are type-safe objects created by `defineRequest`, `defineEventStream`, and `defineWebSocket`.
- **Struct** declares request/response shapes and field wire names with `.alias(name)`.
- **Build** lets you manually map parsed input to request parts via `build(ctx, input)`.
- **Client** executes commands and dispatches to the right transport.

See `packages/core/design.md` for the full implementation boundary.
```

- [ ] **Step 2: Type-check the example**

Create a temporary file:

```bash
cat > /tmp/readme-typecheck.ts <<'EOF'
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com/v1' })

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
EOF
```

Run:

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/packages/core
pnpm exec tsc --noEmit --skipLibCheck --module esnext --moduleResolution bundler --target esnext --strict /tmp/readme-typecheck.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md
git commit -m "docs(core): rewrite README with current struct API"
```

---

## Task 4: Update packages/core/design.md

**Files:**
- Modify: `packages/core/design.md`

**Interfaces:**
- Consumes: current `build(ctx, input)` implementation from `packages/core/src/internal/request_builder.ts`.
- Produces: internal doc with consistent terminology for `build` ctx methods and transport differences.

- [ ] **Step 1: Standardize ctx method names**

Search for any variant like `setPathParam` (singular) and replace with `setPathParams` (plural). Ensure the transport capability table matches the current implementation:

| ctx method | HTTP | SSE | WebSocket |
| --- | --- | --- | --- |
| `setPathParams` | yes | yes | yes |
| `setQueryParams` | yes | yes | yes |
| `setHeaders` | yes | yes | no |
| `setJson` / `setFormUrlEncoded` / `setFormData` | yes | no | no |
| `setArrayBuffer` / `setBlob` / `setText` / `setHtml` | yes | no | no |

- [ ] **Step 2: Clarify alias behavior in build**

Add or rewrite this paragraph in the "Binding boundaries" section:

```markdown
In `build(ctx, input)`, explicit object literal keys are the final wire keys and are never rewritten by source-field aliases. Whole-source bound values (e.g. `ctx.setJson(input.body)`) still recursively apply the source struct's aliases.
```

- [ ] **Step 3: Run scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: no new stale references introduced.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md
git commit -m "docs(core): align design.md with current build ctx API"
```

---

## Task 5: Review doc/core/struct.md

**Files:**
- Modify: `doc/core/struct.md`

**Interfaces:**
- Consumes: accepted alias-only design.
- Produces: user-facing struct doc with no tag/Schema references and runnable examples.

- [ ] **Step 1: Verify alias-only narrative**

Ensure the doc contains:
- No references to `tag`, `Schema`, or `requireTag`.
- `.alias(name)` as the only field wire-name mechanism.
- `Infer<T>` import from `@defjs/core`.

- [ ] **Step 2: Type-check key examples**

Extract the "Primitive Types" example and the "Field Aliases" example into temporary files and type-check them with `tsc --noEmit` against `@defjs/core`.

- [ ] **Step 3: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/struct.md
git commit -m "docs: review struct.md for alias-only consistency"
```

---

## Task 6: Rewrite doc/core/commands.md

**Files:**
- Modify: `doc/core/commands.md`

**Interfaces:**
- Consumes: current `defineRequest`, `defineEventStream`, `defineWebSocket` signatures and `struct` API.
- Produces: commands doc whose examples use `@defjs/core` only.

- [ ] **Step 1: Replace imports and types**

Change every `import { number, object, string } from '@mobily/ts-belt'` to:

```typescript
import { struct } from '@defjs/core'
```

Replace every `object({...})` with `struct.object({...})`, every `string()` with `struct.string()`, every `number()` with `struct.number()`, every `optional(...)` with `(...).optional()`.

- [ ] **Step 2: Update defineRequest example**

Rewrite the example to:

```typescript
import { defineRequest } from '@defjs/core'
import { struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  output: [
    { status: 200, body: struct.object({ name: struct.string(), age: struct.number() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

- [ ] **Step 3: Update defineEventStream example**

Rewrite the example to:

```typescript
import { defineEventStream, struct } from '@defjs/core'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.object({ text: struct.string() }),
    userJoined: struct.object({ userId: struct.number(), name: struct.string() }),
  },
})

const command = Notifications()
```

- [ ] **Step 4: Update defineWebSocket example**

Rewrite the example to:

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: struct.object({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  incoming: {
    message: struct.object({ user: struct.string(), text: struct.string() }),
    system: struct.object({ event: struct.string() }),
  },
  outgoing: {
    sendMessage: struct.object({ text: struct.string() }),
    joinRoom: struct.object({ roomId: struct.string() }),
  },
})
```

- [ ] **Step 5: Update IsInputOptional examples**

Rewrite examples to:

```typescript
// Input with all optional fields — optional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: struct.object({
    query: struct.object({ q: struct.string().optional() }),
  }),
  build(ctx, input) {
    ctx.setQueryParams(input.query)
  },
})
```

- [ ] **Step 6: Type-check the full file**

Extract all TypeScript blocks into a single temporary file and run `tsc --noEmit`.

- [ ] **Step 7: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/commands.md
git commit -m "docs: rewrite commands.md with @defjs/core struct API"
```

---

## Task 7: Fix doc/core/sse.md Build Examples

**Files:**
- Modify: `doc/core/sse.md`

**Interfaces:**
- Consumes: current SSE `build(ctx, input)` API.
- Produces: SSE doc with correct build examples.

- [ ] **Step 1: Replace old build pattern**

Replace:

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.object({ roomId: struct.string() }),
  build: ({ roomId }) => ({
    params: { roomId },
  }),
  events: { ... },
})
```

with:

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})
```

- [ ] **Step 2: Review other SSE snippets**

Ensure every SSE snippet uses `struct.request` for input when path/query/headers are needed, and uses `build(ctx, input)` for custom mapping.

- [ ] **Step 3: Type-check**

Extract SSE snippets and run `tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/sse.md
git commit -m "docs: fix sse.md build examples to use build(ctx, input)"
```

---

## Task 8: Sync Remaining Core User Docs

**Files:**
- Modify: `doc/core/http.md`
- Modify: `doc/core/client.md`
- Modify: `doc/core/context.md`
- Modify: `doc/core/web-socket.md`

**Interfaces:**
- Consumes: updated `commands.md`, `sse.md`, `struct.md`, and current code signatures.
- Produces: consistent examples across all core user docs.

- [ ] **Step 1: Replace old imports and types**

In each file, replace `@mobily/ts-belt` imports with `@defjs/core` `struct`, and update any `Schema`/`schema` references to `Struct`/`struct`.

- [ ] **Step 2: Update examples**

For each code block, ensure:
- `struct.object`, `struct.string`, `struct.number`, etc.
- `struct.request(...)` for request-shaped input.
- `build(ctx, input)` with `ctx.setPathParams`, `ctx.setQueryParams`, etc.

- [ ] **Step 3: Type-check each file**

Extract TypeScript blocks per file and run `tsc --noEmit`.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/core/http.md \
  /Users/munmunmiao/Documents/web/zen-kit/doc/core/client.md \
  /Users/munmunmiao/Documents/web/zen-kit/doc/core/context.md \
  /Users/munmunmiao/Documents/web/zen-kit/doc/core/web-socket.md
git commit -m "docs: sync http/client/context/web-socket docs with current API"
```

---

## Task 9: Sync Guide Docs

**Files:**
- Modify: `doc/guide/getting-started.md`
- Modify: `doc/guide/examples.md`
- Modify: `doc/guide/design-decisions.md`

**Interfaces:**
- Consumes: updated core user docs.
- Produces: guide docs that match the rest of the site.

- [ ] **Step 1: Update getting-started.md**

Rewrite the quick-start example to use `createClient`, `defineRequest`, `struct.request`, and `client.execute`.

- [ ] **Step 2: Update examples.md**

Replace all `@mobily/ts-belt` usage with `@defjs/core` `struct`.

- [ ] **Step 3: Update design-decisions.md**

Replace `Schema`/`schema` with `Struct`/`struct`, `tag.*` with `.alias`, and any old build patterns with `build(ctx, input)`.

- [ ] **Step 4: Type-check**

Extract code blocks and run `tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc/guide/getting-started.md \
  /Users/munmunmiao/Documents/web/zen-kit/doc/guide/examples.md \
  /Users/munmunmiao/Documents/web/zen-kit/doc/guide/design-decisions.md
git commit -m "docs: sync guide docs with current API"
```

---

## Task 10: Multi-Language Cleanup

**Files:**
- Modify: `doc/zh-Hans/**`
- Modify: `doc/de-DE/**`, `doc/es-ES/**`, `doc/fr-FR/**`, `doc/ja-JP/**`, `doc/ar/**`, `doc/ru-RU/**`, `doc/zh-Hant-HK/**`, `doc/zh-Hant-TW/**`

**Interfaces:**
- Consumes: updated English docs.
- Produces: `zh-Hans` mirrors English; other locales no longer contain misleading old API content.

- [ ] **Step 1: Sync zh-Hans**

For each updated English file under `doc/core/` and `doc/guide/`, apply equivalent changes to `doc/zh-Hans/`. Translate new examples as needed.

- [ ] **Step 2: Minimum cleanup for other locales**

In every other locale directory, delete or rewrite paragraphs/examples that mention:
- `@mobily/ts-belt`
- `Schema`/`schema` as the old name
- `tag.*` / `.tag(...)` / `requireTag`
- old `build: (...) => ({ params })` patterns

Where full rewrite is too large, replace the stale section with a TODO comment in Markdown:

```markdown
<!-- TODO: sync with English after struct/alias redesign -->
```

- [ ] **Step 3: Run scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: no stale references in English, `zh-Hans`, or internal docs; other locales only have TODO comments or historical notes.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc
git commit -m "docs: sync zh-Hans and clean stale API in other locales"
```

---

## Task 11: VitePress Build Check

**Files:**
- Modify: none (validation task).

**Interfaces:**
- Consumes: updated docs.
- Produces: build success/failure report.

- [ ] **Step 1: Install dependencies if needed**

Run:

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/doc
pnpm install
```

- [ ] **Step 2: Build docs**

Run:

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/doc
pnpm run docs:build
```

Expected: build exits 0 with no broken-link errors.

- [ ] **Step 3: Commit build artifacts if generated**

If `.vitepress/dist` is generated and tracked, commit it. Otherwise, no commit.

---

## Task 12: Final Scan and Type-Check Sampling

**Files:**
- Modify: none (validation task).

**Interfaces:**
- Consumes: all updated docs.
- Produces: final verification report.

- [ ] **Step 1: Final stale-API scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: output limited to historical notes and TODO comments.

- [ ] **Step 2: Run core typecheck**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
```

Expected: PASS.

- [ ] **Step 3: Final commit**

If any scan script or validation note file was updated, commit it:

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
git commit -m "docs: finalize doc alignment hard switch"
```

---

## Self-Review

### Spec coverage

- Spec section "范围" → Tasks 2 (superpowers), 3-4 (internal), 5-10 (user).
- Spec section "已识别的具体问题" → Tasks 6 (commands.md), 7 (sse.md), 3 (README.md), 4 (design.md).
- Spec section "成功标准" → Tasks 1, 11, 12 (scan + build + typecheck).
- Spec section "多语言分级处理" → Task 10.

### Placeholder scan

No TBD/TODO inside actual tasks. The only TODOs are intentional Markdown comments in non-English locales (Task 10).

### Type consistency

- `struct` namespace used throughout.
- `build(ctx, input)` with `ctx.setPathParams`, `ctx.setQueryParams`, etc.
- `struct.request(...)` for request-shaped input.
- `client.execute(command)` for execution.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-29-documentation-alignment-hard-switch-implementation.md`.

Two execution options:

1. **Subagent-Driven (recommended)** - Dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
