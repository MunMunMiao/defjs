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

