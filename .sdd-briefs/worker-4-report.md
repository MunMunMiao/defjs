# Worker 4 Report: Tasks 10-12

## Task 10: Multi-Language Cleanup

### Step 1: Sync zh-Hans

Synced the following zh-Hans files to match their English counterparts:

- `doc/zh-Hans/core/commands.md`
  - Replaced `@mobily/ts-belt` imports with `@defjs/core` `struct`
  - Updated all examples to use `struct.object`, `struct.string`, `struct.number`, etc.
  - Changed `build(request, input)` to `build(ctx, input)` with `ctx.setPathParams`
  - Changed `optional(string())` to `struct.string().optional()`

- `doc/zh-Hans/core/sse.md`
  - Updated to use `withEndpoint` / `withSSEOptions` instead of old `createClient({ endpoint, sse })`
  - Fixed SSE event examples to use `struct.json(...)` wrapper
  - Fixed `build` to use `build(ctx, input)` with `struct.request(...)` input
  - Fixed event data access to check `typeof event.data === 'object'`
  - Fixed complete example `for await` loop

- `doc/zh-Hans/core/http.md`
  - Replaced `@mobily/ts-belt` imports with `struct`
  - Updated all examples to current `build(ctx, input)` pattern

- `doc/zh-Hans/core/web-socket.md`
  - Updated imports to include `withEndpoint`
  - Changed `build: (request, input) =>` to `build(ctx, input)`
  - Fixed `session.send` example to use flat object

- `doc/zh-Hans/guide/getting-started.md`
  - Changed input from flat object to `struct.request({ body, headers })`
  - Updated `build` to use `ctx.setJson` / `ctx.setHeaders`
  - Updated command invocation to use nested input shape

- `doc/zh-Hans/guide/examples.md`
  - Updated all CRUD examples to use `struct.request(...)` and `build(ctx, input)`
  - Updated WebSocket chat example to use `struct.request` and `build(ctx, input)`
  - Fixed `session.send` to use flat object form
  - Fixed `msg.data` access to direct property access
  - Fixed API cheat sheet `struct.alias(name)` formatting

- `doc/zh-Hans/guide/design-decisions.md`
  - Updated `onInvalidEvent` example to use `withSSEOptions`
  - Changed `build(request, input)` to `build(ctx, input)`

- `doc/zh-Hans/core/struct.md`
  - Minor fix: translated one remaining English sentence to Chinese

### Step 2: Minimum cleanup for other locales

Replaced stale content in the following locales with TODO comments:
- de-DE, es-ES, fr-FR, ja-JP, ar, ru-RU, zh-Hant-HK, zh-Hant-TW, ko-KR

Files replaced:
- `core/commands.md` (all had `@mobily/ts-belt` imports)
- `core/http.md` (all had old `build: (...) => ({ params })` patterns)
- `guide/design-decisions.md` (all had old build patterns)

Note: Some locale files (e.g., `de-DE/core/sse.md`, `de-DE/core/struct.md`) were already TODO-only or already clean; they were left as-is.

### Step 3: Run scan

Ran `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh`.

Remaining hits in user docs (English + zh-Hans):
- `doc/core/commands.md:253`: "transport type tag" — legitimate English word, not stale API
- `doc/core/errors.md:173` / `doc/zh-Hans/core/errors.md:173`: `req.setHeader(...)` in interceptor example — this is calling a method on a request object in an interceptor, not the old builder API

No actual stale API references remain in English or zh-Hans user docs.

### Step 4: Commit

```
c4cd2c6 docs: sync zh-Hans and clean stale API in other locales
```

---

## Task 11: VitePress Build Check

### Step 1: Install dependencies

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/doc
pnpm install
```
Result: Already up to date (274ms)

### Step 2: Build docs

```bash
cd /Users/munmunmiao/Documents/web/zen-kit/doc
pnpm run docs:build
```
Result: Build completed successfully in 17.59s. No broken-link errors.

### Step 3: Commit build artifacts

`.vitepress/dist` is not tracked; no commit needed.

---

## Task 12: Final Scan and Type-Check Sampling

### Step 1: Final stale-API scan

Ran `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh`.

Output limited to:
- Historical notes in `docs/2026-06-19-struct-json-requiretag-analysis.md`
- Historical notes in `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`
- Internal research docs (research/) with historical tag references
- Design docs/specs that intentionally document the old system
- False positives: `transport type tag` (English word), `req.setHeader` in interceptor context

No stale references in English, zh-Hans, or internal docs that aren't historical notes.

### Step 2: Run core typecheck

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
```
Result: PASS (tsgo --project tsconfig.json --noEmit, exited 0)

### Step 3: Final commit

No scan script or validation note file was updated; no commit needed.

---

## Self-Review

### Placeholder scan

- No TBD/TODO placeholders inside actual English or zh-Hans doc content.
- The only TODOs are intentional Markdown comments in non-English locales (as specified by the brief).

### Type consistency

- `struct` namespace used throughout zh-Hans docs.
- `build(ctx, input)` with `ctx.setPathParams`, `ctx.setQueryParams`, etc.
- `struct.request(...)` for request-shaped input.
- `client.execute(command)` for execution.

### Issues / Concerns

1. The `doc/core/errors.md` and `doc/zh-Hans/core/errors.md` files contain `req.setHeader(...)` in an interceptor example. The scan script flags this because it matches `setHeader\b`. This is a false positive — the code is inside an interceptor function where `req` is an `HttpRequest` object, not the old builder API. No action needed.

2. Some locale files (e.g., `de-DE/core/sse.md`, `de-DE/core/struct.md`) were already minimal or TODO-only before this task. They were left unchanged.

3. The `ko-KR` locale was not explicitly listed in the brief but was discovered during execution. It was cleaned alongside the other non-zh-Hans locales.
