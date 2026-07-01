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

