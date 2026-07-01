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

