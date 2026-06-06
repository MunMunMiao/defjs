# Root README Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the root README so it matches the current `@defjs/core` surface, removes mini programs references, and stops marking streaming as WIP.

**Architecture:** This is a single-file documentation refresh centered on `README.md`. The plan keeps the scope intentionally small: update the product summary and supported-features bullets, then rewrite the roadmap so it only lists genuinely open work. Do not touch `packages/core/design.md` or package-level docs in this change.

**Tech Stack:** Markdown, repository grep, git diff

---

### Task 1: Rewrite the root README summary section

**Files:**
- Modify: `README.md:16-30`

- [ ] **Step 1: Replace the current feature bullets with only currently supported capabilities**

```md
## Introduction

`def` is an abbreviation for `define`, so it can be read as `define js`.

Defjs is a library that helps you define and initiate requests, aiming to make it easier for you to define requests without worrying about the details.

- Supports multiple request methods such as [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API), custom, etc.
- Functional API.
- Supports streaming.
- Supports JS/TS with complete type.
- Supports any JS runtime.
- Supports Interceptors.
- Supports ESM.
```

- [ ] **Step 2: Remove the mini programs bullet entirely**

```md
- 🚧 Supports Mini Programs. (WIP)
```

- [ ] **Step 3: Keep the wording consistent with the current implementation instead of roadmap language**

```md
- Supports streaming.
- Supports JS/TS with complete type.
- Supports any JS runtime.
```

- [ ] **Step 4: Verify the section no longer contains WIP markers for supported features**

Run:

```bash
grep -n "Mini Programs\|WIP\|🚧" README.md
```

Expected: no matches for mini programs or streaming; the documentation badge line may still remain if intentionally kept.

### Task 2: Refresh the README roadmap and documentation pointers

**Files:**
- Modify: `README.md:90-109`

- [ ] **Step 1: Remove the mini programs roadmap item**

```md
- Wechat mini programs handler
```

- [ ] **Step 2: Remove the speculative simplification item if it is no longer a current roadmap commitment**

```md
- Think about simplifying useXXX and doRequest
```

- [ ] **Step 3: Keep only the roadmap items that are still open product work**

```md
## Roadmap

- Documentation official website
- CLI Tool
  - Generate API from OpenAPI
  - Generate Full SDK Package (Like the [S3 SDK](https://www.npmjs.com/package/@aws-sdk/client-s3))
- Vue wrapper package
- React wrapper package
```

- [ ] **Step 4: Verify the roadmap no longer mentions mini programs**

Run:

```bash
grep -n "mini programs\|Wechat mini programs\|simplifying useXXX and doRequest" README.md
```

Expected: no matches.

### Task 3: Final consistency check

**Files:**
- Modify: `README.md`
- Verify: `README.md`, `packages/core/design.md`

- [ ] **Step 1: Inspect the diff to confirm only the root README changed**

Run:

```bash
git diff -- README.md packages/core/design.md
```

Expected: changes only in `README.md`; `packages/core/design.md` should remain untouched.

- [ ] **Step 2: Sanity-check the updated README for tone and internal consistency**

Run:

```bash
grep -n "streaming\|Mini Programs\|Wechat mini programs\|WIP" README.md
```

Expected: only the documentation site badge line may still contain `🚧` if intentionally preserved; all product bullets should describe current supported behavior.
