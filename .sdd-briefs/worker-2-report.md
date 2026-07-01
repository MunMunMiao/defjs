# Worker 2 Report: Tasks 3-4

## Task 3: Rewrite packages/core/README.md

**What was implemented:**
Rewrote `packages/core/README.md` with the current struct API. Key changes from the brief's example:

1. **Added `withEndpoint` import and usage**: The brief's example used `createClient({ endpoint: '...' })`, but the actual API requires `createClient(withEndpoint('...'))`. Updated the README example accordingly.

2. **Added type assertion for `user`**: The brief's example destructured `const [error, user] = await client.execute(...)` and accessed `user.id` / `user.name` directly. Due to TypeScript inference limitations with the union tuple return type, `user` is typed as `unknown` when destructured. Added `as { id: number; name: string }` assertion to make the example type-check under `--strict`.

**Verification:**
- Created `src/readme-typecheck.ts` inside the package and ran `pnpm exec tsc --noEmit --project tsconfig.json`
- Result: **PASS** (no errors)
- Removed the temporary file afterward.

**Commit:** `b996c9a` docs(core): rewrite README with current struct API

## Task 4: Update packages/core/design.md

**What was implemented:**
1. **Standardized ctx method names**: Verified that all ctx method references in `design.md` already use the plural forms (`setPathParams`, `setQueryParams`, `setHeaders`). The transport capability table (lines 467-473) already matches the current implementation. No changes needed.

2. **Clarified alias behavior in build**: Replaced the first item in the "Binding 边界" section (line 454) with the specified paragraph:
   > In `build(ctx, input)`, explicit object literal keys are the final wire keys and are never rewritten by source-field aliases. Whole-source bound values (e.g. `ctx.setJson(input.body)`) still recursively apply the source struct's aliases.

**Verification:**
- Ran `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh`
- Result: **No new stale references introduced** by this change. The remaining matches are in other locale docs (de-DE, es-ES, fr-FR, ja-JP, ar, ru-RU, zh-Hans, zh-Hant-HK, zh-Hant-TW) which are outside the scope of Tasks 3-4.

**Commit:** `2d61494` docs(core): align design.md with current build ctx API

## Issues / Deviations from Brief

### Task 3 Deviations
1. **`createClient` API mismatch**: The brief's example used `createClient({ endpoint: '...' })`, but the actual API is `createClient(withEndpoint('...'))`. The README was updated to match the real API.

2. **`user` type inference issue**: The brief's example accessed `user.id` and `user.name` directly after destructuring, but TypeScript infers `user` as `unknown` in this pattern. Added `as { id: number; name: string }` type assertions to make the example type-check. This is a documentation workaround for a current API typing limitation, not a code change.

### Task 4 Deviations
- None. The ctx method names were already plural in `design.md`; only the alias behavior paragraph needed to be added.

## Self-Review
- [x] No TBD/TODO placeholders in modified files
- [x] No stale API references introduced in English/internal docs
- [x] Markdown formatting is valid
