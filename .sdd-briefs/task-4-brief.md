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

