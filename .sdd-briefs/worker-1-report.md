# Worker 1 Report: Tasks 1-2

## Task 1: Baseline Scan Script

### What was implemented
- Created `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh` with the exact content from the brief.
- Made it executable.
- Ran the baseline scan; saved output showing all current stale API references across user docs, internal docs, and superpowers design docs.

### Verification
- Script runs without errors and produces expected output listing stale references.
- Output saved to persisted tool result.

### Commit
- `5f1a6b5` — docs: add doc stale-api scan script

---

## Task 2: Clean Superpowers Design Docs

### What was implemented
1. **Added historical note to alias-only redesign plan** (`docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`)
   - Inserted historical note immediately below the title.

2. **Added historical note to struct-json-requiretag analysis** (`docs/2026-06-19-struct-json-requiretag-analysis.md`)
   - Inserted historical note immediately below the title.

3. **Removed non-historical requireTag references**
   - `docs/superpowers/plans/2026-06-18-core-type-inlining.md`: Replaced Step 9 description that inlined `TagObjectOptions`/`requireTag` with a note that `TagObjectOptions` was removed in the alias-only redesign and `requireTag` no longer exists.
   - `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md`: Replaced `decodeTaggedField` and `decodeObjectByTag` signatures that included `requireTag` and `TagNamespace` parameters with alias-only equivalents (`decodeObjectByAlias` with `label` parameter).
   - `docs/superpowers/specs/2026-06-18-core-type-inlining-design.md`: Updated the `TagObjectOptions` row in the wave 1 table to state it was removed in the alias-only redesign and `requireTag` no longer exists.

### Verification
- Ran `/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh` after edits.
- Remaining `requireTag` references in the scan output are now limited to:
  - Historical notes in the two documents that received them (by design).
  - The alias-only redesign plan itself (which intentionally discusses the old system).
  - Other unrelated files (research docs, VitePress docs, other locale docs) that are outside the scope of Task 2.

### Files changed
- `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`
- `docs/2026-06-19-struct-json-requiretag-analysis.md`
- `docs/superpowers/plans/2026-06-18-core-type-inlining.md`
- `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md`
- `docs/superpowers/specs/2026-06-18-core-type-inlining-design.md`

### Commit
- `6b35cef` — docs(superpowers): clean stale tag/requireTag references in design docs

---

## Self-review

- No TBD/TODO placeholders were introduced.
- No new stale API references were introduced by the edits.
- Markdown is valid; edits preserve file structure.
- No code changes were made (documentation only).

## Concerns
None.
