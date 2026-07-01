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

