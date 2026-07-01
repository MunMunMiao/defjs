## Task 2: Clean Superpowers Design Docs

**Files:**
- Modify: `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md` (add historical note near title).
- Modify: `docs/superpowers/plans/2026-06-18-core-type-inlining.md` (remove `requireTag` if not historical).
- Modify: `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md` (remove `requireTag` if not historical).
- Modify: `docs/2026-06-19-struct-json-requiretag-analysis.md` (add historical note).
- Modify: `docs/superpowers/specs/2026-06-18-core-type-inlining-design.md` (remove `requireTag` if not historical).

**Interfaces:**
- Consumes: accepted alias-only design from `docs/superpowers/specs/2026-06-19-struct-alias-only-design.md`.
- Produces: design docs that do not mislead future implementers into reintroducing tag/requireTag.

- [ ] **Step 1: Add historical note to alias-only redesign plan**

Insert immediately below the title in `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`:

```markdown
> Historical note: this plan describes the migration away from the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.
```

- [ ] **Step 2: Add historical note to struct-json-requiretag analysis**

Insert immediately below the title in `docs/2026-06-19-struct-json-requiretag-analysis.md`:

```markdown
> Historical note: this document analyzes the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.
```

- [ ] **Step 3: Remove non-historical requireTag references**

In `docs/superpowers/plans/2026-06-18-core-type-inlining.md` and `docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md`, delete paragraphs or code blocks that prescribe `requireTag` behavior as a current feature. If a paragraph is discussing the old system, convert it to past tense or delete it.

- [ ] **Step 4: Run scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: remaining references are either in historical notes or in the alias-only redesign plan itself.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md \
  docs/superpowers/plans/2026-06-18-core-type-inlining.md \
  docs/superpowers/plans/2026-06-19-core-runtime-struct-boundary.md \
  docs/superpowers/specs/2026-06-18-core-type-inlining-design.md \
  docs/2026-06-19-struct-json-requiretag-analysis.md
git commit -m "docs(superpowers): clean stale tag/requireTag references in design docs"
```

---

