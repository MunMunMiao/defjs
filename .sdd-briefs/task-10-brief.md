## Task 10: Multi-Language Cleanup

**Files:**
- Modify: `doc/zh-Hans/**`
- Modify: `doc/de-DE/**`, `doc/es-ES/**`, `doc/fr-FR/**`, `doc/ja-JP/**`, `doc/ar/**`, `doc/ru-RU/**`, `doc/zh-Hant-HK/**`, `doc/zh-Hant-TW/**`

**Interfaces:**
- Consumes: updated English docs.
- Produces: `zh-Hans` mirrors English; other locales no longer contain misleading old API content.

- [ ] **Step 1: Sync zh-Hans**

For each updated English file under `doc/core/` and `doc/guide/`, apply equivalent changes to `doc/zh-Hans/`. Translate new examples as needed.

- [ ] **Step 2: Minimum cleanup for other locales**

In every other locale directory, delete or rewrite paragraphs/examples that mention:
- `@mobily/ts-belt`
- `Schema`/`schema` as the old name
- `tag.*` / `.tag(...)` / `requireTag`
- old `build: (...) => ({ params })` patterns

Where full rewrite is too large, replace the stale section with a TODO comment in Markdown:

```markdown
<!-- TODO: sync with English after struct/alias redesign -->
```

- [ ] **Step 3: Run scan**

Run:

```bash
/Users/munmunmiao/Documents/web/zen-kit/scripts/scan-doc-stale-api.sh
```

Expected: no stale references in English, `zh-Hans`, or internal docs; other locales only have TODO comments or historical notes.

- [ ] **Step 4: Commit**

```bash
git add /Users/munmunmiao/Documents/web/zen-kit/doc
git commit -m "docs: sync zh-Hans and clean stale API in other locales"
```

---

