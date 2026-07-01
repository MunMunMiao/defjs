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
