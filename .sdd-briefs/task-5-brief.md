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

