# Struct Bytecraft Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以“字节匠人式”方式修复并收敛 `packages/core/src/struct`：先修明确 correctness，再把 missing、wire key、branch matching、flat projection、request body、public API 和 phantom 类型载体收成更小的模型。

**Architecture:** 本计划按 Wave 1→7 执行。Wave 1 只做行为修复和测试护栏；Wave 2 抽 missing、field resolution、branch selector 三个内核；Wave 3 收敛 JSON alias walker；Wave 4 统一 flat/request projection；Wave 5 收缩 public API 和文档；Wave 6 降低 request/body 内部高度；Wave 7 删除重复 phantom 并收紧 `isStruct`。每个 wave 独立验证，不混入 content-codec、SSE/WebSocket raw JSON guessing 或 validation DSL。

**Tech Stack:** TypeScript, pnpm 11, Node >=26, Vitest, tsgo, oxlint, oxfmt, VitePress docs。

## Global Constraints

- 当前工作区已有大量未提交改动；每个任务开始和结束都必须查看 `git status --short`，只编辑任务列出的文件。
- 不运行 `git add`、`git commit`、`git reset`、`git stash`，除非用户另行明确授权。
- 本计划是 breaking cleanup：不恢复 `.tag(...)`、`tag.*(...)`、`createTagNamespace`、`getFieldTag(s)`、`FieldTag*`、`TagNamespace*`、`JsonCodecOptions.requireTag` 或 struct custom metadata extension。
- 不新增 `requireAlias`、`taggedOnly`、`explicitFieldsOnly`、per-target alias、omit/private/expose/filter、alias-based placement。
- 不让 normal `parseStructValue` 同时接受 local key 与 wire key；wire alias 只在 codec/request-builder normalize/encode 层生效。
- 不改变 Go-style missing/null/zero-value 语义：缺失字段走零值，`.optional()` 可省略，`.null()` 和 `.nullish()` 保持当前 null/undefined 输出。
- 不把 content-codec、SSE/WebSocket 原始值策略、transport 自动猜 JSON 合入本轮。
- 不新增依赖。
- 所有测试通过的结论必须来自本轮实际命令输出；不能引用历史结果或 agent 报告。
- `rg ... || true` 的 stale scan 以输出内容为准；exit code 1 表示无匹配，不是失败。
- 用户已确认执行全量 breaking cleanup：允许本计划触达代码、public API 和多语言文档。
- 本轮采用无提交 SDD：在当前 checkout 执行，每个 implementer/reviewer 都不得运行 `git add`、`git commit`、`git reset`、`git stash`；review package 使用任务前后快照生成，不使用 commit range。
- 所有 `pnpm --filter @defjs/core exec vitest run ...` 的文件参数必须使用 `packages/core` 包内相对路径，例如 `src/struct/codec/json.spec.ts`，不要使用仓库根相对的 `packages/core/src/...`。
- Task 3 允许同步修改 `packages/core/src/internal/request_builder.ts`，以清除旧的 `getWireKey(field.key, field.alias)` 调用。
- Task 8 的 dangerous-key 测试必须用真实自有 `__proto__` 数据属性，例如 `const raw = Object.create(null); raw['__proto__'] = 'safe'`。
- Task 11 按 spec 最小 public API 执行：不从 struct public API 继续导出 `isStruct`；如发现内部生产文件通过 public entry 导入被收缩类型，允许一并迁移到内部模块。

---

## File Structure

### Design and plan inputs

- Read-only source of truth: `docs/superpowers/specs/2026-06-20-struct-bytecraft-repair-design.md`
- Historical alias-only plan to inherit compatible decisions from: `docs/superpowers/plans/2026-06-19-struct-alias-only-redesign.md`

### Core struct runtime and types

- Modify: `packages/core/src/struct/types.ts`
  - Add or adjust `BaseDefinition.alias?: string`.
  - Add internal field/missing/match-related types when needed.
  - Later remove `[TYPES]` carrier.
- Modify: `packages/core/src/struct/runtime.ts`
  - Keep immutable `alias(name: string)` chain behavior.
  - Later remove runtime `[TYPES]` materialization.
- Modify: `packages/core/src/struct/symbols.ts`
  - Later remove `TYPES` export when no references remain.
- Modify: `packages/core/src/struct/guards.ts`
  - Later harden `isStruct` with own-key `[DEFINITION]` checks.
- Modify: `packages/core/src/struct/public_api.ts`
  - Later shrink public type surface.

### Field resolution and introspection

- Modify: `packages/core/src/struct/shape.ts`
  - Keep object shape reading and struct assertion.
  - Move resolved field metadata and wire key conflict checks here or into a new focused file.
- Create: `packages/core/src/struct/fields.ts`
  - Owns internal `ResolvedStructField`, `resolveStructFields()`, `getWireKey()`, and wire-key conflict detection.
- Modify: `packages/core/src/struct/introspection.ts`
  - `getStructFields()` becomes a thin public view over resolved internal fields.

### Parse, encode, and matching

- Modify: `packages/core/src/struct/parse.ts`
  - Converge missing/null/zero-value helper.
- Modify: `packages/core/src/struct/encode.ts`
  - Add nullable/optional encode guard.
  - Later delegate branch matching to `match.ts`.
- Create: `packages/core/src/struct/match.ts`
  - Owns `matchesRuntimeValue()` and `selectUnionOption()`.

### Codecs and request builder

- Modify: `packages/core/src/struct/codec/common.ts`
  - Consume resolved fields and branch selector.
  - Shrink alias decode traversal.
- Modify: `packages/core/src/struct/codec/flat.ts`
  - Skip missing/undefined before child encode.
  - Later expose shared flat projection kernel.
- Modify: `packages/core/src/struct/codec/json.ts`
  - Keep JSON wrapper over common alias codec.
- Modify: `packages/core/src/struct/codec/query.ts`
  - Preserve target-specific scalar policy and label.
- Modify: `packages/core/src/struct/codec/urlencoded.ts`
  - Preserve URLSearchParams set/append policy.
- Modify: `packages/core/src/struct/codec/multipart.ts`
  - Preserve FormData/Blob/File policy.
- Modify: `packages/core/src/internal/request_builder.ts`
  - Preserve explicit projection key semantics; use shared projection only for bound whole-source values.
- Modify: `packages/core/src/struct/request.ts`
  - Later use precomputed request sections.
- Modify: `packages/core/src/struct/constructors.ts`
  - Later normalize request body descriptor and precompute sections.

### Tests

- Modify or create focused runtime specs under `packages/core/src/struct/**/*.spec.ts`.
- Modify type tests under `packages/core/src/struct/**/*.type.test.ts`.
- Modify request builder specs under `packages/core/src/internal/request_builder.spec.ts` and, if present, `packages/core/src/internal/request_builder.type.test.ts`.
- Do not delete existing tests until replacement coverage exists and the deletion is in the task scope.

### Docs

- Modify: `packages/core/src/struct/README.md`
- Modify: `packages/core/design.md`
- Modify: `README.md`
- Modify generated/localized docs under:
  - `doc/**/core/struct.md`
  - `doc/**/guide/examples.md`
  - `doc/**/guide/getting-started.md`

---

### Task 0: Implementation preflight and stale-scan baseline

**Files:**

- Inspect only: repository working tree

**Interfaces:**

- Consumes: confirmed design `docs/superpowers/specs/2026-06-20-struct-bytecraft-repair-design.md`
- Produces: terminal baseline output used by later task reviews

- [ ] **Step 1: Record current working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: output contains existing modified/deleted/untracked files. Record it in the conversation. Do not write a baseline file.

- [ ] **Step 2: Record old tag symbol baseline**

Run:

```bash
rg -n "\brequireTag\b|\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|tagKind|getFieldTag|getFieldTags|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: production code should already be mostly alias-only on this branch; remaining matches are either negative type tests, historical tests, or stale implementation references to remove in later tasks.

- [ ] **Step 3: Record struct-related changed files**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only -- packages/core/src/struct packages/core/src/internal/request_builder.ts packages/core/src/internal/request_builder.spec.ts packages/core/design.md README.md doc docs/superpowers | sort
```

Expected: a sorted list of existing changed files. Use this list to avoid claiming ownership of unrelated edits.

- [ ] **Step 4: Check package commands**

Run:

```bash
node -e "const p=require('/Users/munmunmiao/Documents/web/zen-kit/packages/core/package.json'); console.log(p.scripts)"
```

Expected: output contains `test`, `test:type`, and `typecheck` scripts.

---

### Task 1: Fix flat codec missing and undefined field encode

**Files:**

- Modify: `packages/core/src/struct/codec/flat.ts`
- Modify: `packages/core/src/struct/codec/query.spec.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.spec.ts`
- Modify: `packages/core/src/struct/codec/multipart.spec.ts`

**Interfaces:**

- Consumes: existing `encodeFlatByAlias<TOutput>(struct, value, options)` from `packages/core/src/struct/codec/flat.ts`
- Produces: `encodeFlatByAlias()` skips absent fields and explicit `undefined` before `encodeStructValue()`

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: existing dirty tree output. Confirm this task will edit only files listed above.

- [ ] **Step 2: Add query/path/header regression tests**

In `packages/core/src/struct/codec/query.spec.ts`, add tests near existing alias/optional tests:

```ts
import { describe, expect, it } from 'vitest'
import { struct } from '../facade'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './query'

describe('flat alias query/path/header missing fields', () => {
  it('skips missing optional date and bigint fields before primitive encode', () => {
    const Query = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      q: struct.string(),
    })

    expect(encodeQueryParams(Query, { q: 'zen' })).toEqual({ q: 'zen' })
    expect(encodePathParams(Query, { q: 'zen' })).toEqual({ q: 'zen' })
    expect(encodeHeaders(Query, { q: 'zen' })).toEqual({ q: 'zen' })
  })

  it('skips explicitly undefined optional fields before primitive encode', () => {
    const Query = struct.object({
      createdAt: struct.date().optional().alias('created_at'),
      count: struct.bigint().optional(),
      q: struct.string(),
    })

    expect(encodeQueryParams(Query, { createdAt: undefined, count: undefined, q: 'zen' })).toEqual({ q: 'zen' })
  })
})
```

If the file already imports `describe`, `expect`, `it`, `struct`, and query helpers, merge the import lists instead of duplicating imports.

- [ ] **Step 3: Add urlencoded regression test**

In `packages/core/src/struct/codec/urlencoded.spec.ts`, add:

```ts
it('skips missing optional date and bigint fields before primitive encode', () => {
  const Body = struct.object({
    createdAt: struct.date().optional().alias('created_at'),
    count: struct.bigint().optional(),
    name: struct.string(),
  })

  const params = encodeUrlencoded(Body, { createdAt: undefined, name: 'miao' })

  expect(params.toString()).toBe('name=miao')
})
```

If the file uses a different local variable style, keep the same assertion shape: `params.toString()` must be exactly `name=miao`.

- [ ] **Step 4: Add multipart regression test**

In `packages/core/src/struct/codec/multipart.spec.ts`, add:

```ts
it('skips missing optional date and bigint fields before primitive encode', () => {
  const Body = struct.object({
    createdAt: struct.date().optional().alias('created_at'),
    count: struct.bigint().optional(),
    name: struct.string(),
  })

  const form = encodeMultipart(Body, { count: undefined, name: 'miao' })

  expect(Array.from(form.entries())).toEqual([['name', 'miao']])
})
```

- [ ] **Step 5: Run RED tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/codec/query.spec.ts packages/core/src/struct/codec/urlencoded.spec.ts packages/core/src/struct/codec/multipart.spec.ts
```

Expected before implementation: at least one new test fails with a primitive encode error such as `Cannot read properties of undefined` or a TypeError from date/bigint encode.

- [ ] **Step 6: Implement missing/undefined skip in flat codec**

In `packages/core/src/struct/codec/flat.ts`, import `hasOwnKey` and update the loop to this shape:

```ts
import { hasOwnKey } from '../utils'

export function encodeFlatByAlias<TOutput>(struct: AnyStructLike, value: unknown, options: FlatEncodeOptions<TOutput>): TOutput {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${options.label} encode expects object struct`)
  }

  const output = options.create()
  assertPlainObject(value, `${options.label} encode expects object value`)

  for (const field of getStructFields(struct)) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    const encoded = encodeStructValue(field.struct, fieldValue)
    if (typeof encoded === 'undefined') {
      continue
    }

    options.put(output, getWireKey(field.key, field.alias), encoded)
  }

  return output
}
```

- [ ] **Step 7: Run GREEN tests**

Run the same command as Step 5.

Expected: all listed spec files pass. If the process exits non-zero only because global coverage thresholds are applied to a small test subset, record the passing test count and the coverage-threshold failure separately; do not claim the command passed.

- [ ] **Step 8: Check task diff**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff -- packages/core/src/struct/codec/flat.ts packages/core/src/struct/codec/query.spec.ts packages/core/src/struct/codec/urlencoded.spec.ts packages/core/src/struct/codec/multipart.spec.ts
```

Expected: diff only contains missing/undefined skip and the new regression tests.

---

### Task 2: Add nullable and optional guard to encode and branch matching

**Files:**

- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/encode.spec.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`

**Interfaces:**

- Consumes: `encodeValue(struct: RuntimeStruct, value: unknown, options?: EncodeOptions): unknown`
- Produces: `encodeValue()` and `matchesDefinition()` treat legal null/undefined flags before primitive encode or branch kind matching

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output; this task edits only files listed above.

- [ ] **Step 2: Add direct encode tests**

In `packages/core/src/struct/encode.spec.ts`, add:

```ts
it('encodes nullable primitive null without calling primitive encoder', () => {
  expect(encodeStructValue(struct.date().null(), null)).toBeNull()
  expect(encodeStructValue(struct.bigint().null(), null)).toBeNull()
})

it('encodes optional primitive undefined without calling primitive encoder', () => {
  expect(encodeStructValue(struct.date().optional(), undefined)).toBeUndefined()
  expect(encodeStructValue(struct.bigint().optional(), undefined)).toBeUndefined()
})
```

If `encodeStructValue` is not imported, import it from `./introspection`.

- [ ] **Step 3: Add union/object branch matching tests**

In `packages/core/src/struct/codec/json.spec.ts`, add:

```ts
it('selects object union branch when nullable primitive field is present as null', () => {
  const Payload = struct.or(
    struct.object({ kind: struct.literal('date'), at: struct.date().null().alias('created_at') }),
    struct.object({ kind: struct.literal('text'), value: struct.string() }),
  )

  expect(encodeJson(Payload, { kind: 'date', at: null })).toEqual({ kind: 'date', created_at: null })
})
```

- [ ] **Step 4: Run RED tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/encode.spec.ts packages/core/src/struct/codec/json.spec.ts
```

Expected before implementation: new direct encode test fails for nullable date/bigint null, or union branch test returns an unaliased/fallthrough value.

- [ ] **Step 5: Implement flags guard**

In `packages/core/src/struct/encode.ts`, add a small helper and use it in both `encodeValue()` and `matchesDefinition()`:

```ts
const NO_FLAG_MATCH = Symbol('NO_FLAG_MATCH')

function encodeFlagValue(definition: StructDefinition, value: unknown): unknown | typeof NO_FLAG_MATCH {
  if (value === null && (definition.kind === 'null' || definition.flags.nullable)) {
    return null
  }
  if (typeof value === 'undefined' && definition.flags.optional) {
    return undefined
  }
  return NO_FLAG_MATCH
}

function matchesFlagValue(definition: StructDefinition, value: unknown): boolean | undefined {
  if (value === null) {
    return definition.kind === 'null' || definition.flags.nullable
  }
  if (typeof value === 'undefined') {
    return definition.flags.optional
  }
  return undefined
}
```

Then update `encodeValue()` immediately after reading `definition`:

```ts
const flagged = encodeFlagValue(definition, value)
if (flagged !== NO_FLAG_MATCH) {
  return flagged
}
```

Update `matchesDefinition()` before its `switch`:

```ts
const flagMatch = matchesFlagValue(definition, value)
if (typeof flagMatch === 'boolean') {
  return flagMatch
}
```

Keep `isRequiredField()` unchanged in this task; it already treats nullable fields as not required.

- [ ] **Step 6: Run GREEN tests**

Run the same command as Step 4.

Expected: new tests pass, and existing encode/json tests still pass except for unrelated coverage-threshold behavior if the project enforces full coverage on a subset run.

- [ ] **Step 7: Check task diff**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff -- packages/core/src/struct/encode.ts packages/core/src/struct/encode.spec.ts packages/core/src/struct/codec/json.spec.ts
```

Expected: diff only contains flags guard and related tests.

---

### Task 3: Introduce resolved struct fields and wire-key conflict detection

**Files:**

- Create: `packages/core/src/struct/fields.ts`
- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/shape.ts`
- Modify: `packages/core/src/struct/introspection.ts`
- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/flat.ts`
- Modify: `packages/core/src/struct/runtime.spec.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`
- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`

**Interfaces:**

- Produces: `ResolvedStructField` and `resolveStructFields(struct, definition)`

```ts
export interface ResolvedStructField {
  readonly alias: string | undefined
  readonly key: string
  readonly struct: RuntimeStruct
  readonly wireKey: string
}

export function getWireKey(fieldKey: string, alias: string | undefined): string
export function resolveStructFields(struct: RuntimeStruct, definition: ObjectDefinition): readonly ResolvedStructField[]
```

- Consumes: `ObjectDefinition.shape` and `ObjectDefinition.cache`
- Later tasks consume: `field.wireKey` instead of recalculating `alias ?? key`

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Update ObjectDefinition cache type**

In `packages/core/src/struct/types.ts`, change `ObjectDefinition.cache` from shape-only to fields-aware:

```ts
export type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeStruct, ObjectShape>
  fields?: readonly unknown[]
  kind: 'object'
  shape: ObjectShape
}
```

This temporary `fields?: readonly unknown[]` type is replaced in Step 4 after `ResolvedStructField` exists. If TypeScript import cycles are clean, use `readonly ResolvedStructField[]` directly instead of `unknown[]`.

- [ ] **Step 3: Add wire-key conflict tests**

In `packages/core/src/struct/runtime.spec.ts`, add:

```ts
it('rejects duplicate wire keys in the same object shape', () => {
  const User = struct.object({
    name: struct.string(),
    displayName: struct.string().alias('name'),
  })

  expect(() => getStructFields(User)).toThrow('duplicate wire key "name"')
})

it('rejects duplicate aliases in the same object shape', () => {
  const User = struct.object({
    firstName: struct.string().alias('name'),
    displayName: struct.string().alias('name'),
  })

  expect(() => getStructFields(User)).toThrow('duplicate wire key "name"')
})
```

Import `getStructFields` from `./introspection` if needed.

- [ ] **Step 4: Create fields helper**

Create `packages/core/src/struct/fields.ts`:

```ts
import { DEFINITION } from './symbols'
import type { ObjectDefinition, ObjectShape, RuntimeStruct } from './types'

export interface ResolvedStructField {
  readonly alias: string | undefined
  readonly key: string
  readonly struct: RuntimeStruct
  readonly wireKey: string
}

export function getWireKey(fieldKey: string, alias: string | undefined): string {
  return alias ?? fieldKey
}

export function resolveStructFields(struct: RuntimeStruct, definition: ObjectDefinition): readonly ResolvedStructField[] {
  const cached = definition.fields as readonly ResolvedStructField[] | undefined
  if (cached) {
    return cached
  }

  const shape = definition.cache.get(struct) ?? readCachedShape(struct, definition)
  const fields = Object.freeze(
    Object.entries(shape).map(([key, field]) => {
      const runtime = field as unknown as RuntimeStruct
      const alias = runtime[DEFINITION].alias
      return {
        alias,
        key,
        struct: runtime,
        wireKey: getWireKey(key, alias),
      }
    }),
  )

  assertUniqueWireKeys(fields)
  definition.fields = fields
  return fields
}

function readCachedShape(struct: RuntimeStruct, definition: ObjectDefinition): ObjectShape {
  const cached = definition.cache.get(struct)
  if (cached) {
    return cached
  }
  throw new TypeError('object shape must be resolved before fields')
}

function assertUniqueWireKeys(fields: readonly ResolvedStructField[]): void {
  const seen = new Map<string, string>()
  for (const field of fields) {
    const previous = seen.get(field.wireKey)
    if (previous) {
      throw new TypeError(`duplicate wire key "${field.wireKey}" for object fields "${previous}" and "${field.key}"`)
    }
    seen.set(field.wireKey, field.key)
  }
}
```

- [ ] **Step 5: Wire field resolution from shape.ts**

In `packages/core/src/struct/shape.ts`, after `definition.cache.set(struct, shape)`, call `resolveStructFields(struct, definition)` once so conflicts are detected when object shape resolves:

```ts
import { resolveStructFields } from './fields'

// inside resolveObjectShape, after definition.cache.set(struct, shape)
resolveStructFields(struct, definition)
return shape
```

If this creates a cycle where `fields.ts` needs `readObjectShape`, move `assertUniqueWireKeys` into `shape.ts` and make `fields.ts` only expose `getWireKey` and the interface. Do not duplicate conflict detection in codec files.

- [ ] **Step 6: Update introspection and codecs to consume wireKey**

In `packages/core/src/struct/introspection.ts`, replace `Object.entries(shape).map(...)` with:

```ts
return resolveStructFields(runtime, definition).map((field) => ({
  alias: field.alias,
  key: field.key,
  struct: field.struct as unknown as StructLike<unknown, unknown, boolean>,
}))
```

In `packages/core/src/struct/codec/common.ts`, change `output[getWireKey(field.key, field.alias)]` to `output[field.wireKey]` after switching to `resolveStructFields()`.

In `packages/core/src/struct/codec/flat.ts`, change `options.put(output, getWireKey(field.key, field.alias), encoded)` to `options.put(output, field.wireKey, encoded)` after switching to resolved fields.

- [ ] **Step 7: Run RED/GREEN tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/runtime.spec.ts packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/codec/query.spec.ts packages/core/src/internal/request_builder.spec.ts
```

Expected after implementation: duplicate wire key tests pass; existing alias JSON/flat/request tests still pass.

- [ ] **Step 8: Check field helper references**

Run:

```bash
rg -n "getWireKey\(|wireKey|resolveStructFields|ResolvedStructField" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal/request_builder.ts
```

Expected: `getWireKey()` is defined once in `fields.ts`; production callers consume `field.wireKey` where they already have resolved fields.

---

### Task 4: Make ambiguous alias-aware union encoding explicit

**Files:**

- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`
- Modify: `packages/core/src/struct/encode.spec.ts`

**Interfaces:**

- Consumes: `matchesDefinition()` from current encode module, or `matchesRuntimeValue()` if Task 8 has already moved matching.
- Produces: union encode throws on multiple matching branches with different encoded wire shape.

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Update ambiguous union tests**

In `packages/core/src/struct/codec/json.spec.ts`, replace tests that assert option-order alias output for ambiguous values with throwing assertions:

```ts
it('rejects ambiguous aliased union object branches', () => {
  const Payload = struct.or(
    struct.object({ value: struct.string().alias('text') }),
    struct.object({ value: struct.string().alias('label') }),
  )

  expect(() => encodeJson(Payload, { value: 'x' })).toThrow('ambiguous union encode')
})

it('rejects ambiguous aliased union array branches', () => {
  const Payload = struct.or(struct.array(struct.string()).alias('texts'), struct.array(struct.string()).alias('labels'))

  expect(() => encodeJson(Payload, [])).toThrow('ambiguous union encode')
})
```

- [ ] **Step 3: Add non-ambiguous guard test**

In `packages/core/src/struct/encode.spec.ts`, add:

```ts
it('keeps first matching union branch when encoded output is equivalent', () => {
  const Payload = struct.or(struct.string(), struct.string())

  expect(encodeStructValue(Payload, 'x')).toBe('x')
})
```

- [ ] **Step 4: Run RED tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/encode.spec.ts
```

Expected before implementation: ambiguous tests fail because current code returns the first matching branch.

- [ ] **Step 5: Implement ambiguity detection in union encode**

In `packages/core/src/struct/encode.ts`, update the `case 'or'` block to gather matching options:

```ts
case 'or': {
  const matches: RuntimeStruct[] = []
  for (const opt of definition.options) {
    const option = opt as unknown as RuntimeStruct
    if (matchesDefinition(option[DEFINITION], value, option)) {
      matches.push(option)
    }
  }

  if (matches.length === 0) {
    return value
  }

  const encoded = matches.map((option) => encodeValue(option, value, options))
  const first = encoded[0]
  for (let index = 1; index < encoded.length; index += 1) {
    if (!sameEncodedShape(first, encoded[index])) {
      throw new TypeError('ambiguous union encode: multiple union branches match with different wire output')
    }
  }
  return first
}
```

Add helper in same file:

```ts
function sameEncodedShape(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}
```

This helper is intentionally narrow and temporary. Task 8 may replace it with a selector-level comparison once matching moves to `match.ts`.

- [ ] **Step 6: Run GREEN tests**

Run the same command as Step 4.

Expected: ambiguous tests throw, equivalent primitive union still encodes.

- [ ] **Step 7: Check task diff**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff -- packages/core/src/struct/encode.ts packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/encode.spec.ts
```

Expected: diff contains only union ambiguity behavior and tests.

---

### Task 5: Consolidate missing, null, optional, and zero-value policy

**Files:**

- Modify: `packages/core/src/struct/parse.ts`
- Modify: `packages/core/src/struct/parse.spec.ts`
- Modify: `packages/core/src/struct/coverage.spec.ts`

**Interfaces:**

- Produces: one internal missing-value function used by parse and zero-value paths

```ts
function resolveMissingValue(struct: RuntimeStruct, path: Path, mode: ParseMode): unknown
```

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add characterization tests for missing policy**

In `packages/core/src/struct/parse.spec.ts`, add a table-driven test:

```ts
it('keeps Go-style missing, optional, nullable, nullish, and zero-value policy', () => {
  const Shape = struct.object({
    name: struct.string(),
    age: struct.number(),
    active: struct.boolean(),
    note: struct.string().optional(),
    nickname: struct.string().null(),
    bio: struct.string().nullish(),
    empty: struct.null(),
    tags: struct.array(struct.string()),
  })

  const [error, value] = parseStructTuple(Shape, {})

  expect(error).toBeNull()
  expect(value).toEqual({
    active: false,
    age: 0,
    bio: null,
    empty: null,
    name: '',
    nickname: null,
    tags: [],
  })
  expect(Object.hasOwn(value, 'note')).toBe(false)
})
```

Import `parseStructTuple` from `./introspection` if needed.

- [ ] **Step 3: Run characterization test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/parse.spec.ts
```

Expected before refactor: the new characterization test passes. This is a refactor guard, not a RED test.

- [ ] **Step 4: Refactor missing policy**

In `packages/core/src/struct/parse.ts`, replace `parseMissingValue()` body with:

```ts
function parseMissingValue(struct: RuntimeStruct, path: Path, mode: ParseMode): ParseResult<unknown> {
  return success(resolveMissingValue(struct, path, mode))
}
```

Rename current private `buildMissingValue()` to `resolveMissingValue()` or make `buildMissingValue()` delegate to it:

```ts
function resolveMissingValue(struct: RuntimeStruct, path: Path, mode: ParseMode): unknown {
  const definition = struct[DEFINITION]

  if (mode === 'field' && definition.flags.optional) {
    return OMIT
  }

  if (definition.flags.optional) {
    return undefined
  }

  if (definition.flags.nullable || definition.kind === 'null') {
    return null
  }

  return buildZeroValue(struct, path)
}
```

Then update all internal calls previously using `buildMissingValue()` for missing semantics to call `resolveMissingValue()`:

```ts
export function safeZeroValue(struct: RuntimeStruct): unknown {
  return resolveMissingValue(struct, [], 'value')
}
```

Inside `buildZeroValue()`, object/request/tuple/or/discriminatedUnion/requestBody should call `resolveMissingValue()` where they are constructing missing child values.

- [ ] **Step 5: Run parse and coverage tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/parse.spec.ts packages/core/src/struct/coverage.spec.ts
```

Expected: tests pass with identical output semantics.

- [ ] **Step 6: Check no duplicate priority function remains**

Run:

```bash
rg -n "function parseMissingValue|function buildMissingValue|function resolveMissingValue|flags\.optional|flags\.nullable" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/parse.ts
```

Expected: `parseMissingValue` is a thin wrapper; there is one helper that defines optional/nullable/null priority.

---

### Task 6: Cache object fields by object definition and expose readonly public field view

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/shape.ts`
- Modify: `packages/core/src/struct/fields.ts`
- Modify: `packages/core/src/struct/introspection.ts`
- Modify: `packages/core/src/struct/runtime.spec.ts`

**Interfaces:**

- Consumes: `ResolvedStructField` from Task 3
- Produces: cached resolved fields shared across alias/null/optional struct derivations

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Update object definition cache model**

In `packages/core/src/struct/types.ts`, change object definition to use a definition-level cache cell:

```ts
export type ObjectDefinition = BaseDefinition & {
  fields?: readonly unknown[]
  kind: 'object'
  resolvedShape?: ObjectShape
  shape: ObjectShape
}
```

Remove `cache: WeakMap<RuntimeStruct, ObjectShape>` from the type.

- [ ] **Step 3: Update object constructor**

In `packages/core/src/struct/constructors.ts`, remove `cache: new WeakMap()` from `createObjectStruct()`:

```ts
return castStruct<ObjectStruct<T>>(
  makeStruct({
    flags: DEFAULT_FLAGS,
    kind: 'object',
    shape: declaredShape,
  }),
)
```

- [ ] **Step 4: Update shape resolution**

In `packages/core/src/struct/shape.ts`, update `resolveObjectShape()`:

```ts
export function resolveObjectShape(_struct: RuntimeStruct, definition: ObjectDefinition): ObjectShape {
  if (definition.resolvedShape) {
    return definition.resolvedShape
  }

  const shape = readObjectShape(definition.shape)
  for (const [key, value] of Object.entries(shape)) {
    assertStruct(value, `object field "${key}"`)
  }

  definition.resolvedShape = shape
  return shape
}
```

Keep `_struct` parameter for this task to avoid touching all callers. A later cleanup can remove it.

- [ ] **Step 5: Update fields resolution**

In `packages/core/src/struct/fields.ts`, read from `definition.resolvedShape ?? resolveObjectShape(struct, definition)` and cache `definition.fields`.

Use this body:

```ts
export function resolveStructFields(struct: RuntimeStruct, definition: ObjectDefinition): readonly ResolvedStructField[] {
  const cached = definition.fields as readonly ResolvedStructField[] | undefined
  if (cached) {
    return cached
  }

  const shape = resolveObjectShape(struct, definition)
  const fields = Object.freeze(
    Object.entries(shape).map(([key, field]) => {
      const runtime = field as unknown as RuntimeStruct
      const alias = runtime[DEFINITION].alias
      return {
        alias,
        key,
        struct: runtime,
        wireKey: getWireKey(key, alias),
      }
    }),
  )

  assertUniqueWireKeys(fields)
  definition.fields = fields
  return fields
}
```

Ensure imports do not create an infinite runtime cycle. If `fields.ts` imports `resolveObjectShape`, `shape.ts` must not import `resolveStructFields`.

- [ ] **Step 6: Add cache behavior test**

In `packages/core/src/struct/runtime.spec.ts`, add:

```ts
it('resolves lazy object shape once across struct derivations', () => {
  let reads = 0
  const User = struct.object({
    get name() {
      reads += 1
      return struct.string()
    },
  })

  getStructFields(User)
  getStructFields(User.alias('user'))
  getStructFields(User.optional())

  expect(reads).toBe(1)
})
```

- [ ] **Step 7: Run tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/runtime.spec.ts packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/codec/query.spec.ts
```

Expected: lazy shape is read once; alias codec and flat codec still pass.

---

### Task 7: Move runtime branch matching to a neutral selector module

**Files:**

- Create: `packages/core/src/struct/match.ts`
- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/encode.spec.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`

**Interfaces:**

- Produces:

```ts
export function matchesRuntimeValue(struct: RuntimeStruct, value: unknown): boolean
export function selectUnionOption(options: readonly StructLike<unknown, unknown, boolean>[], value: unknown): RuntimeStruct | undefined
```

- Consumes: primitive definitions with parse `is` guard and optional runtime guard.

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Extend primitive definition with runtime guard**

In `packages/core/src/struct/types.ts`, add optional runtime guard:

```ts
runtimeIs?: (value: unknown) => boolean
```

inside `PrimitiveDefinition<K, TInput, TOutput>`.

- [ ] **Step 3: Set runtime guards for date and bigint**

In `packages/core/src/struct/constructors.ts`, add `runtimeIs` to bigint/date primitive definitions:

```ts
runtimeIs: (value): value is bigint => typeof value === 'bigint',
```

and:

```ts
runtimeIs: (value): value is Date => value instanceof Date && !Number.isNaN(value.getTime()),
```

Do not change `is`; it remains parse input/wire accept guard.

- [ ] **Step 4: Create match module**

Create `packages/core/src/struct/match.ts` by moving current `matchesDefinition()`, `matchesObjectValue()`, `matchesFieldValue()`, and `isRequiredField()` from `encode.ts`. Public shape:

```ts
import { resolveObjectShape, resolveRuntimeStruct } from './shape'
import { DEFINITION } from './symbols'
import type { RuntimeStruct, StructDefinition, StructLike } from './types'
import { hasOwnKey, isPlainObject } from './utils'

export function matchesRuntimeValue(struct: RuntimeStruct, value: unknown): boolean {
  return matchesDefinition(struct[DEFINITION], value, struct)
}

export function selectUnionOption(options: readonly StructLike<unknown, unknown, boolean>[], value: unknown): RuntimeStruct | undefined {
  for (const option of options) {
    const runtime = option as unknown as RuntimeStruct
    if (matchesRuntimeValue(runtime, value)) {
      return runtime
    }
  }
  return undefined
}

export function matchesDefinition(definition: StructDefinition, value: unknown, struct: RuntimeStruct): boolean {
  const flagMatch = matchesFlagValue(definition, value)
  if (typeof flagMatch === 'boolean') {
    return flagMatch
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return true
    case 'null':
      return value === null
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'bigint':
    case 'date':
      return definition.runtimeIs ? definition.runtimeIs(value) : definition.is(value)
    case 'blob':
      return typeof Blob !== 'undefined' && value instanceof Blob
    case 'file':
      return typeof File !== 'undefined' && value instanceof File
    case 'arrayBuffer':
      return value instanceof ArrayBuffer
    case 'literal':
      return Object.is(value, definition.value)
    case 'enum':
      return definition.values.includes(value as never)
    case 'array':
      return Array.isArray(value) && value.every((item) => matchesRuntimeValue(definition.item as unknown as RuntimeStruct, item))
    case 'tuple':
      return (
        Array.isArray(value) &&
        value.length === definition.items.length &&
        definition.items.every((item, index) => matchesRuntimeValue(item as unknown as RuntimeStruct, value[index]))
      )
    case 'object':
      return isPlainObject(value) && matchesObjectValue(struct, value)
    case 'request':
      return isPlainObject(value)
    case 'requestBody':
      return matchesRuntimeValue(definition.struct as unknown as RuntimeStruct, value)
    case 'record':
      return (
        isPlainObject(value) &&
        Object.values(value).every((entry) => matchesRuntimeValue(definition.value as unknown as RuntimeStruct, entry))
      )
    case 'or':
      return definition.options.some((option) => matchesRuntimeValue(option as unknown as RuntimeStruct, value))
    case 'discriminatedUnion':
      return isPlainObject(value) && definition.map.has(value[definition.discriminator])
    case 'intersection': {
      const left = resolveRuntimeStruct(definition.left)
      const right = resolveRuntimeStruct(definition.right)
      return matchesRuntimeValue(left, value) && matchesRuntimeValue(right, value)
    }
  }
}

function matchesObjectValue(struct: RuntimeStruct, value: { [key: string]: unknown }): boolean {
  const definition = struct[DEFINITION]
  if (definition.kind !== 'object') {
    return true
  }

  const shape = resolveObjectShape(struct, definition)
  for (const [key, fieldStruct] of Object.entries(shape)) {
    const field = fieldStruct as unknown as RuntimeStruct
    const fieldDefinition = field[DEFINITION]
    if (!hasOwnKey(value, key)) {
      if (isRequiredField(fieldDefinition)) {
        return false
      }
      continue
    }

    if (!matchesRuntimeValue(field, value[key])) {
      return false
    }
  }

  return true
}

function isRequiredField(definition: StructDefinition): boolean {
  return !definition.flags.optional && !definition.flags.nullable
}

function matchesFlagValue(definition: StructDefinition, value: unknown): boolean | undefined {
  if (value === null) {
    return definition.kind === 'null' || definition.flags.nullable
  }
  if (typeof value === 'undefined') {
    return definition.flags.optional
  }
  return undefined
}
```

- [ ] **Step 5: Update encode and common imports**

In `packages/core/src/struct/encode.ts`, delete moved matching helpers and import:

```ts
import { matchesDefinition } from './match'
```

In `packages/core/src/struct/codec/common.ts`, replace import from `../encode`:

```ts
import { encodeValue } from '../encode'
import { matchesDefinition } from '../match'
```

- [ ] **Step 6: Run tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/encode.spec.ts packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/constructors.primitives.spec.ts
```

Expected: date/bigint parse input behavior remains; encode union matching uses runtime date/bigint only.

- [ ] **Step 7: Check no codec imports match from encode**

Run:

```bash
rg -n "matchesDefinition|matchesRuntimeValue|selectUnionOption" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct
```

Expected: matching definitions live in `match.ts`; `encode.ts` and `codec/common.ts` import them from `match.ts`.

---

### Task 8: Shrink JSON alias decode walker and route aliased discriminated unions directly

**Files:**

- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`
- Modify: `packages/core/src/struct/parse.security.spec.ts`

**Interfaces:**

- Consumes: `resolveStructFields()` and `matchesRuntimeValue()`
- Produces: alias decode routes discriminatedUnion by raw discriminator wire key when possible

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add discriminatedUnion alias routing tests**

In `packages/core/src/struct/codec/json.spec.ts`, add:

```ts
it('routes aliased discriminated union by discriminator wire key before normalizing target branch', () => {
  const Message = struct.discriminatedUnion('type', [
    struct.object({ type: struct.literal('text').alias('kind'), body: struct.string().alias('message_body') }),
    struct.object({ type: struct.literal('count').alias('kind'), count: struct.number().alias('total_count') }),
  ])

  expect(decodeJson(Message, { kind: 'count', total_count: 3 })).toEqual({ type: 'count', count: 3 })
})

it('rejects conflicting aliased discriminators in discriminated union decode', () => {
  const Message = struct.discriminatedUnion('type', [
    struct.object({ type: struct.literal('text').alias('kind'), body: struct.string() }),
    struct.object({ type: struct.literal('count').alias('event_type'), count: struct.number() }),
  ])

  expect(() => decodeJson(Message, { kind: 'text', event_type: 'count', count: 1 })).toThrow('ambiguous discriminated union discriminator')
})
```

- [ ] **Step 3: Keep dangerous key regression**

In `packages/core/src/struct/parse.security.spec.ts`, ensure there is a test equivalent to:

```ts
it('keeps dangerous wire keys as own data properties during alias decode', () => {
  const Payload = struct.object({
    proto: struct.string().alias('__proto__'),
    constructorValue: struct.string().alias('constructor'),
  })

  const raw: { [key: string]: unknown } = Object.create(null)
  raw['__proto__'] = 'safe'
  raw.constructor = 'value'

  const output = decodeJson(Payload, raw)

  expect(output).toEqual({ proto: 'safe', constructorValue: 'value' })
  expect(({} as { proto?: string }).proto).toBeUndefined()
})
```

- [ ] **Step 4: Implement discriminator wire-key routing**

In `packages/core/src/struct/codec/common.ts`, add helper:

```ts
function readDiscriminatorWireValue(
  definition: DiscriminatedUnionDefinition,
  value: unknown,
): { ok: true; option: RuntimeStruct } | { ok: false; ambiguous: boolean } {
  if (!isPlainObject(value)) {
    return { ambiguous: false, ok: false }
  }

  let matched: RuntimeStruct | undefined
  for (const option of definition.options) {
    const runtime = option as unknown as RuntimeStruct
    const optionDefinition = runtime[DEFINITION]
    if (optionDefinition.kind !== 'object') {
      continue
    }
    const fields = resolveStructFields(runtime, optionDefinition)
    const discriminator = fields.find((field) => field.key === definition.discriminator)
    const wireKey = discriminator?.wireKey ?? definition.discriminator
    if (!hasOwnKey(value, wireKey)) {
      continue
    }

    const candidate = definition.map.get(value[wireKey]) as RuntimeStruct | undefined
    if (!candidate) {
      continue
    }
    if (matched && matched !== candidate) {
      return { ambiguous: true, ok: false }
    }
    matched = candidate
  }

  return matched ? { ok: true, option: matched } : { ambiguous: false, ok: false }
}
```

Update `case 'discriminatedUnion'` in `decodeAliasedField()`:

```ts
case 'discriminatedUnion': {
  const routed = readDiscriminatorWireValue(definition, value)
  if (routed.ok) {
    return decodeAliasedField(routed.option, value, label, path)
  }
  if (routed.ambiguous) {
    throw new TypeError('ambiguous discriminated union discriminator')
  }
  return value
}
```

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/codec/json.spec.ts packages/core/src/struct/parse.security.spec.ts
```

Expected: discriminated union alias routing and dangerous key tests pass.

- [ ] **Step 6: Check walker complexity**

Run:

```bash
rg -n "case 'array'|case 'tuple'|case 'record'|case 'or'|case 'discriminatedUnion'|case 'intersection'" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/codec/common.ts
```

Expected: this task may still show cases, but `discriminatedUnion` should no longer loop through every option with `tryDecodeAliasedField()` before routing.

---

### Task 9: Introduce flat projection kernel and preserve target-specific value policies

**Files:**

- Modify: `packages/core/src/struct/codec/flat.ts`
- Modify: `packages/core/src/struct/codec/query.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.ts`
- Modify: `packages/core/src/struct/codec/multipart.ts`
- Modify: `packages/core/src/struct/codec/query.spec.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.spec.ts`
- Modify: `packages/core/src/struct/codec/multipart.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface EncodedWireField {
  readonly key: string
  readonly value: unknown
}

export function forEachEncodedWireField(
  struct: AnyStructLike,
  value: unknown,
  label: string,
  visit: (field: EncodedWireField) => void,
): void
```

- `encodeFlatByAlias()` remains as a thin wrapper over this kernel.

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add target policy regression tests**

In `packages/core/src/struct/codec/urlencoded.spec.ts`, ensure nested array behavior is explicitly covered:

```ts
it('keeps urlencoded array handling non-recursive for nested arrays', () => {
  const Body = struct.object({ value: struct.unknown() })

  expect(() => encodeUrlencoded(Body, { value: [['x']] })).toThrow('urlencoded value for "value" requires an explicit serializer')
})
```

In `packages/core/src/struct/codec/multipart.spec.ts`, ensure multipart repeated write remains recursive:

```ts
it('keeps multipart repeated array handling recursive', () => {
  const Body = struct.object({ value: struct.unknown() })

  const form = encodeMultipart(Body, { value: [['x'], undefined, ['y']] })

  expect(Array.from(form.entries())).toEqual([
    ['value', 'x'],
    ['value', 'y'],
  ])
})
```

- [ ] **Step 3: Add projection kernel**

In `packages/core/src/struct/codec/flat.ts`, add:

```ts
export interface EncodedWireField {
  readonly key: string
  readonly value: unknown
}

export function forEachEncodedWireField(
  struct: AnyStructLike,
  value: unknown,
  label: string,
  visit: (field: EncodedWireField) => void,
): void {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${label} encode expects object struct`)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  for (const field of resolveStructFields(
    struct as unknown as RuntimeStruct,
    (struct as unknown as RuntimeStruct)[DEFINITION] as ObjectDefinition,
  )) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    const encoded = encodeStructValue(field.struct, fieldValue)
    if (typeof encoded === 'undefined') {
      continue
    }

    visit({ key: field.wireKey, value: encoded })
  }
}
```

Adjust imports for `DEFINITION`, `ObjectDefinition`, `RuntimeStruct`, `resolveStructFields`, and `hasOwnKey`.

Then implement `encodeFlatByAlias()` as:

```ts
export function encodeFlatByAlias<TOutput>(struct: AnyStructLike, value: unknown, options: FlatEncodeOptions<TOutput>): TOutput {
  const output = options.create()
  forEachEncodedWireField(struct, value, options.label, ({ key, value: encoded }) => {
    options.put(output, key, encoded)
  })
  return output
}
```

- [ ] **Step 4: Keep query/urlencoded/multipart target policies unchanged**

Do not move `normalizeScalarRecordValue()`, `appendSearchParam()`, or `appendFormData()` into the kernel in this task. Their policy remains in target files.

- [ ] **Step 5: Run tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/codec/query.spec.ts packages/core/src/struct/codec/urlencoded.spec.ts packages/core/src/struct/codec/multipart.spec.ts
```

Expected: target-specific scalar and repeated-value behavior remains unchanged.

---

### Task 10: Lock request builder explicit projection versus whole-source alias boundaries

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`
- Modify: `packages/core/src/http/request.spec.ts`
- Modify: `packages/core/src/sse/request.spec.ts`
- Modify: `packages/core/src/web_socket/build.spec.ts`

**Interfaces:**

- Consumes: alias-aware JSON/flat codecs and bound input values
- Produces: explicit object literal keys stay literal; whole-source bound values use source struct alias

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add explicit JSON projection test**

In `packages/core/src/internal/request_builder.spec.ts`, add a request build case equivalent to:

```ts
it('does not rewrite explicit JSON object literal keys with source alias', () => {
  const Input = struct.request({
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  })

  const request = defineRequest({
    input: Input,
    method: 'POST',
    path: '/users',
    build(ctx, input) {
      ctx.setJson({ explicit_name: input.body.displayName })
    },
  })

  expect(buildRequest(request, { body: { displayName: 'Miao' } }).body).toEqual({ explicit_name: 'Miao' })
})
```

Use the existing local test helpers in `request_builder.spec.ts` for `defineRequest` and `buildRequest`; keep the assertion shape identical.

- [ ] **Step 3: Add whole-source JSON projection test**

In the same file, add:

```ts
it('applies alias recursively for whole-source JSON bound objects', () => {
  const Input = struct.request({
    body: struct.json(
      struct.object({
        profile: struct.object({ displayName: struct.string().alias('display_name') }),
      }),
    ),
  })

  const request = defineRequest({
    input: Input,
    method: 'POST',
    path: '/users',
    build(ctx, input) {
      ctx.setJson(input.body)
    },
  })

  expect(buildRequest(request, { body: { profile: { displayName: 'Miao' } } }).body).toEqual({
    profile: { display_name: 'Miao' },
  })
})
```

- [ ] **Step 4: Add flat projection tests**

Add tests for query/path/header explicit literal keys and whole-source bound values:

```ts
it('keeps explicit query projection keys literal', () => {
  const Input = struct.request({ query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }) })
  const request = defineRequest({
    input: Input,
    method: 'GET',
    path: '/users',
    build(ctx, input) {
      ctx.setQueryParams({ include: input.query.includeProfile })
    },
  })

  expect(buildRequest(request, { query: { includeProfile: true } }).query).toEqual({ include: true })
})

it('applies alias for whole-source query bound object', () => {
  const Input = struct.request({ query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }) })
  const request = defineRequest({
    input: Input,
    method: 'GET',
    path: '/users',
    build(ctx, input) {
      ctx.setQueryParams(input.query)
    },
  })

  expect(buildRequest(request, { query: { includeProfile: true } }).query).toEqual({ include_profile: true })
})
```

- [ ] **Step 5: Run RED/GREEN tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/internal/request_builder.spec.ts packages/core/src/http/request.spec.ts packages/core/src/sse/request.spec.ts packages/core/src/web_socket/build.spec.ts
```

Expected: after implementation, explicit projection keys are literal and whole-source bound values apply alias.

- [ ] **Step 6: Implement only if tests expose drift**

If tests fail, update `packages/core/src/internal/request_builder.ts` so projection handling follows this rule:

```ts
// Pseudocode shape to map onto existing functions:
if (isExplicitObjectLiteralProjection(value)) {
  // Keep user-written keys exactly as written.
  writeLiteralObjectKeys(value)
} else if (isBoundStructObject(value)) {
  // Use the source struct and target codec to encode aliases recursively.
  writeEncodedBoundStruct(value)
} else {
  // Scalar bound values keep the explicit destination key chosen by the caller.
  writeScalarValue(value)
}
```

Do not add this pseudocode as a comment. Implement it by editing the existing branch names and helper functions in `request_builder.ts`.

---

### Task 11: Shrink public struct API surface and update type contracts

**Files:**

- Modify: `packages/core/src/struct/public_api.ts`
- Modify: `packages/core/src/struct/types.runtime.type.test.ts`
- Modify or create: `packages/core/src/struct/types.public.type.test.ts`
- Modify: `packages/core/src/public_api.ts` if it re-exports struct internals indirectly

**Interfaces:**

- Produces minimal public API:
  - `struct`
  - `Infer`
  - `StructError`
  - `setErrorMap`
  - `ErrorMap`
  - `StructIssue`
  - `FormattedStructError`
  - `FlattenedStructError`
  - `Struct` and `AnyStruct` as opaque public constraints only if endpoint signatures need named types

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add public API type tests**

Create or update `packages/core/src/struct/types.public.type.test.ts`:

```ts
import { describe, expectTypeOf, it } from 'vitest'
import { struct, StructError, type ErrorMap, type Infer, type StructIssue } from './index'

describe('struct public API', () => {
  it('exports struct, Infer, and error types', () => {
    const User = struct.object({ id: struct.string() })
    expectTypeOf<Infer<typeof User>>().toEqualTypeOf<{ id: string }>()
    expectTypeOf(StructError).toBeConstructibleWith([] as StructIssue[])
    expectTypeOf<ErrorMap>().toBeFunction()
  })

  it('does not export internal struct modeling types from the public entry', async () => {
    const api = await import('./index')
    expectTypeOf(api).not.toHaveProperty('ObjectShape')
    expectTypeOf(api).not.toHaveProperty('RequestShape')
    expectTypeOf(api).not.toHaveProperty('RequestBodyCodec')
  })
})
```

If `expectTypeOf(api).not.toHaveProperty` is not supported by current Vitest types, replace it with negative import tests in `types.runtime.type.test.ts`:

```ts
// @ts-expect-error ObjectShape is internal
import type { ObjectShape } from './index'
// @ts-expect-error RequestShape is internal
import type { RequestShape } from './index'
// @ts-expect-error RequestBodyCodec is internal
import type { RequestBodyCodec } from './index'
```

- [ ] **Step 3: Update public_api.ts**

Change `packages/core/src/struct/public_api.ts` to:

```ts
export type { ErrorMap } from './errors'
export { StructError, setErrorMap } from './errors'
export { struct } from './facade'
export type { FlattenedStructError, FormattedStructError, Infer, Struct as Struct, AnyStruct as AnyStruct, StructIssue } from './types'
```

Do not export concrete `ArrayStruct`, `ObjectStruct`, `ObjectShape`, `RequestBodyCodec`, `RequestBodyStruct`, `RequestStruct`, `RequestShape`, or `StructLike as StructLike` from this public file.

If internal production files import these types through the public entry, update those imports to concrete internal modules such as `./types` or `../struct/types`.

- [ ] **Step 4: Run type tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test:type
```

Expected: public API negative tests pass and internal files compile by importing internal types from internal modules.

- [ ] **Step 5: Check public API stale exports**

Run:

```bash
rg -n "ArrayStruct|ObjectShape|RequestBodyCodec|RequestBodyStruct|RequestStruct|RequestShape|StructLike" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/public_api.ts /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/types.public.type.test.ts /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/types.runtime.type.test.ts
```

Expected: `public_api.ts` does not export these names. Type tests may contain negative references with `@ts-expect-error`.

---

### Task 12: Update struct docs for alias-only and minimal public API

**Files:**

- Modify: `packages/core/src/struct/README.md`
- Modify: `packages/core/design.md`
- Modify: `README.md`
- Modify: `doc/core/struct.md`
- Modify: localized `doc/**/core/struct.md`
- Modify: `doc/**/guide/examples.md`
- Modify: `doc/**/guide/getting-started.md`

**Interfaces:**

- Consumes: Task 11 public API decision
- Produces: docs that teach `import { struct, type Infer } from '@defjs/core'` and alias-only wire names

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Remove `struct.Infer` examples**

Run:

```bash
rg -n "struct\.Infer" /Users/munmunmiao/Documents/web/zen-kit/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md || true
```

Expected before edit: any hits must be changed to top-level `Infer`.

Replace examples with:

```ts
import { struct, type Infer } from '@defjs/core'

type User = Infer<typeof User>
```

- [ ] **Step 3: Remove tag/requireTag docs**

Run:

```bash
rg -n "\.tag\(|tag\.|requireTag|Field tags|Tag System|getFieldTag|getFieldTags|createTagNamespace|defineConfig" /Users/munmunmiao/Documents/web/zen-kit/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md || true
```

Expected before edit: any hits are replaced with `.alias(name)` or removed if they describe custom metadata.

- [ ] **Step 4: Add concise alias rule to primary docs**

In `packages/core/src/struct/README.md` and `doc/core/struct.md`, ensure this paragraph exists in local language:

```md
`.alias(name)` is the only built-in field wire-name mechanism. It changes the external key used by JSON, query, headers, path, urlencoded and FormData encoding/decoding. It does not change the TypeScript property name, output type, request section, body codec, or keys written explicitly inside `build(ctx, input)`.
```

For Chinese docs, use:

```md
`.alias(name)` 是唯一内建字段 wire-name 机制。它只改变 JSON、query、headers、path、urlencoded 和 FormData 编解码使用的外部 key；不改变 TypeScript 属性名、输出类型、request section、body codec，也不会改写 `build(ctx, input)` 中手写的对象 key。
```

- [ ] **Step 5: Run docs stale scan**

Run:

```bash
rg -n "struct\.Infer|\.tag\(|tag\.|requireTag|Field tags|Tag System|getFieldTag|getFieldTags|createTagNamespace|defineConfig" /Users/munmunmiao/Documents/web/zen-kit/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md || true
```

Expected: no public docs hits for old API or `struct.Infer`. Historical superpowers plans may still mention old symbols as migration history and are not part of this command.

---

### Task 13: Normalize request body descriptors and precompute request sections

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/request.ts`
- Modify: `packages/core/src/struct/parse.ts`
- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`
- Modify: `packages/core/src/struct/parse.spec.ts`
- Modify: `packages/core/src/struct/encode.spec.ts`

**Interfaces:**

- Produces:

```ts
export interface RequestBodyDescriptor {
  readonly codec: RequestBodyCodec
  readonly struct: RuntimeStruct
}

export interface RequestSection {
  readonly key: RequestSectionKey
  readonly struct: RuntimeStruct
}
```

- `getRequestSections(definition)` returns `readonly RequestSection[]` or tuple-compatible readonly entries.

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add binary body normalization tests**

In `packages/core/src/internal/request_builder.spec.ts`, add:

```ts
it('builds blob body through the same request body descriptor path', () => {
  const Input = struct.request({ body: struct.blob() })
  const body = new Blob(['hello'], { type: 'text/plain' })
  const request = defineRequest({ input: Input, method: 'POST', path: '/upload' })

  const built = buildRequest(request, { body })

  expect(built.body).toBe(body)
  expect(built.headers.get('content-type')).toBe('text/plain')
})

it('builds arrayBuffer body through the same request body descriptor path', () => {
  const Input = struct.request({ body: struct.arrayBuffer() })
  const body = new ArrayBuffer(4)
  const request = defineRequest({ input: Input, method: 'POST', path: '/upload' })

  const built = buildRequest(request, { body })

  expect(built.body).toBe(body)
  expect(built.headers.get('content-type')).toBe('application/octet-stream')
})
```

Adapt `headers.get()` to the existing header container API in the spec file.

- [ ] **Step 3: Add request section order test**

In `packages/core/src/struct/parse.spec.ts`, add:

```ts
it('keeps request section output order path query headers body', () => {
  const Input = struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
    headers: struct.object({ trace: struct.string() }),
    path: struct.object({ id: struct.string() }),
    query: struct.object({ page: struct.number() }),
  })

  const [error, value] = parseStructTuple(Input, {})

  expect(error).toBeNull()
  expect(Object.keys(value)).toEqual(['path', 'query', 'headers', 'body'])
})
```

- [ ] **Step 4: Extend RequestDefinition types**

In `packages/core/src/struct/types.ts`, add internal request descriptors:

```ts
export type RequestSectionKey = 'body' | 'headers' | 'path' | 'query'

export type RequestBodyDescriptor = {
  codec: RequestBodyCodec
  struct: RuntimeStruct
}

export type RequestSection = {
  key: RequestSectionKey
  struct: RuntimeStruct
}
```

Update `RequestDefinition`:

```ts
export type RequestDefinition = BaseDefinition & {
  body?: StructLike<unknown, unknown, boolean>
  bodyDescriptor?: RequestBodyDescriptor
  headers?: ObjectStruct<ObjectShape>
  kind: 'request'
  path?: ObjectStruct<ObjectShape>
  query?: ObjectStruct<ObjectShape>
  sections: readonly RequestSection[]
}
```

- [ ] **Step 5: Normalize body descriptor in constructors**

In `packages/core/src/struct/constructors.ts`, add helper:

```ts
function createRequestBodyDescriptor(body: StructLike<unknown, unknown, boolean> | undefined): RequestBodyDescriptor | undefined {
  if (!body) {
    return undefined
  }

  const definition = (body as unknown as RuntimeStruct)[DEFINITION]
  if (definition.kind === 'requestBody') {
    return { codec: definition.codec, struct: definition.struct as unknown as RuntimeStruct }
  }
  if (definition.kind === 'blob') {
    return { codec: 'blob', struct: body as unknown as RuntimeStruct }
  }
  if (definition.kind === 'arrayBuffer') {
    return { codec: 'arrayBuffer', struct: body as unknown as RuntimeStruct }
  }

  throw new TypeError('body must use a body wrapper struct')
}
```

Add helper for sections:

```ts
function createRequestSections(definition: Omit<RequestDefinition, 'kind' | 'flags' | 'sections'>): readonly RequestSection[] {
  const sections: RequestSection[] = []
  if (definition.path) sections.push({ key: 'path', struct: definition.path as unknown as RuntimeStruct })
  if (definition.query) sections.push({ key: 'query', struct: definition.query as unknown as RuntimeStruct })
  if (definition.headers) sections.push({ key: 'headers', struct: definition.headers as unknown as RuntimeStruct })
  if (definition.body) sections.push({ key: 'body', struct: definition.body as unknown as RuntimeStruct })
  return Object.freeze(sections)
}
```

When calling `makeStruct`, include `bodyDescriptor` and `sections`.

- [ ] **Step 6: Update request.ts**

In `packages/core/src/struct/request.ts`, change `getRequestSections()` to return precomputed sections:

```ts
export function getRequestSections(definition: RequestDefinition): readonly RequestSection[] {
  return definition.sections
}
```

Keep `RequestSectionKey` exported from `types.ts` or re-export it from `request.ts` if current imports expect it there.

- [ ] **Step 7: Update parse/encode loops for section object shape**

In `parse.ts` and `encode.ts`, update loops from tuple destructuring to object section shape:

```ts
for (const section of getRequestSections(definition)) {
  const key = section.key
  const sectionStruct = section.struct
  // existing body unchanged
}
```

- [ ] **Step 8: Update request_builder body codec resolution**

In `packages/core/src/internal/request_builder.ts`, when resolving body codec, prefer `definition.bodyDescriptor` over checking `requestBody/blob/arrayBuffer` branches separately.

Use this shape inside the existing request body branch:

```ts
const descriptor = requestDefinition.bodyDescriptor
if (descriptor) {
  switch (descriptor.codec) {
    case 'json':
    case 'urlencoded':
    case 'formData':
    case 'text':
    case 'blob':
    case 'arrayBuffer':
      // call existing per-codec writer with descriptor.struct and body value
      break
  }
}
```

Map this pseudocode to existing helper names; do not add it as a comment.

- [ ] **Step 9: Run tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/internal/request_builder.spec.ts packages/core/src/struct/parse.spec.ts packages/core/src/struct/encode.spec.ts packages/core/src/http packages/core/src/sse packages/core/src/web_socket
```

Expected: binary body public writing stays compatible; request section output order remains path/query/headers/body.

---

### Task 14: Remove duplicate `[TYPES]` phantom and harden `isStruct`

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/runtime.ts`
- Modify: `packages/core/src/struct/symbols.ts`
- Modify: `packages/core/src/struct/guards.ts`
- Modify: `packages/core/src/struct/runtime.spec.ts`
- Modify: `packages/core/src/struct/coverage.spec.ts`
- Modify: `packages/core/src/struct/types.runtime.type.test.ts`

**Interfaces:**

- Produces: `_struct` is the only phantom carrier.
- Produces: `isStruct(value)` only accepts own `[DEFINITION]` with known kind and flags.

- [ ] **Step 1: Record working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output.

- [ ] **Step 2: Add type inference guard tests**

In `packages/core/src/struct/types.runtime.type.test.ts`, ensure these assertions exist:

```ts
const User = struct.object({
  id: struct.string(),
  name: struct.string().optional(),
})

type UserOutput = Infer<typeof User>
expectTypeOf<UserOutput>().toEqualTypeOf<{ id: string; name?: string }>()
```

- [ ] **Step 3: Add isStruct hardening runtime tests**

In `packages/core/src/struct/runtime.spec.ts`, add:

```ts
it('does not accept inherited struct definition brand', () => {
  const base = struct.string() as object
  const fake = Object.create(base)

  expect(isStruct(fake)).toBe(false)
})

it('does not accept malformed struct definition brand', () => {
  const fake = { [DEFINITION]: { kind: 'object' } }

  expect(isStruct(fake)).toBe(false)
})
```

Import `DEFINITION` from `./symbols` and `isStruct` from `./guards` if needed.

- [ ] **Step 4: Remove TYPES carrier from type definitions**

In `packages/core/src/struct/types.ts`:

- Remove `TYPES` from the import line.
- Change `StructLike` to:

```ts
export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly _struct: StructTypes<I, O, OO>
}
```

- Remove every `readonly [TYPES]: ...` member from specialized struct interfaces.
- Change `RuntimeStruct` to remove `readonly [TYPES]`.

- [ ] **Step 5: Remove TYPES runtime materialization**

In `packages/core/src/struct/runtime.ts`:

- Remove `TYPES` from imports.
- Remove `[TYPES]: undefined as never,` from `struct` object.

In `packages/core/src/struct/symbols.ts`, remove the `TYPES` export if no other production file imports it.

- [ ] **Step 6: Harden isStruct**

In `packages/core/src/struct/guards.ts`, replace the implementation with:

```ts
import { DEFINITION } from './symbols'
import type { StructDefinition } from './types'

const KNOWN_KINDS = new Set<StructDefinition['kind']>([
  'any',
  'array',
  'arrayBuffer',
  'bigint',
  'blob',
  'boolean',
  'date',
  'discriminatedUnion',
  'enum',
  'file',
  'intersection',
  'literal',
  'null',
  'number',
  'object',
  'or',
  'record',
  'request',
  'requestBody',
  'string',
  'tuple',
  'unknown',
])

export function isStruct(value: unknown): boolean {
  if (typeof value !== 'object' || value === null || !Object.hasOwn(value, DEFINITION)) {
    return false
  }

  const definition = (value as { [DEFINITION]?: Partial<StructDefinition> })[DEFINITION]
  if (typeof definition !== 'object' || definition === null) {
    return false
  }

  if (!KNOWN_KINDS.has(definition.kind as StructDefinition['kind'])) {
    return false
  }

  const flags = definition.flags as { nullable?: unknown; optional?: unknown } | undefined
  return typeof flags === 'object' && flags !== null && typeof flags.nullable === 'boolean' && typeof flags.optional === 'boolean'
}
```

- [ ] **Step 7: Remove or update coverage smoke for TYPES**

In `packages/core/src/struct/coverage.spec.ts`, remove tests that assert `typeof TYPES === 'symbol'` or runtime struct has `[TYPES]`.

- [ ] **Step 8: Run runtime and type tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct/runtime.spec.ts packages/core/src/struct/coverage.spec.ts
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test:type
```

Expected: runtime tests pass; type inference still works through `_struct` only.

- [ ] **Step 9: Scan TYPES references**

Run:

```bash
rg -n "\bTYPES\b|\[TYPES\]" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal || true
```

Expected: no production references. Negative historical tests should not reference `[TYPES]` unless intentionally testing removal.

---

### Task 15: Final struct repair verification and stale cleanup

**Files:**

- Inspect only first; modify only stale docs/tests if a scan finds symbols that belong to this plan.

**Interfaces:**

- Consumes: all previous tasks
- Produces: evidence package for final report

- [ ] **Step 1: Record final changed files**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: dirty tree output. Verify all new/modified files are expected from this plan or pre-existing user edits.

- [ ] **Step 2: Run production stale scan**

Run:

```bash
rg -n "\brequireTag\b|\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|tagKind|getFieldTag|getFieldTags|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: no production code matches. Matches in negative type tests are allowed only if the line includes `@ts-expect-error` or test text explicitly asserting old API removal.

- [ ] **Step 3: Run docs stale scan**

Run:

```bash
rg -n "struct\.Infer|\.tag\(|tag\.|requireTag|Field tags|Tag System|getFieldTag|getFieldTags|createTagNamespace|defineConfig" /Users/munmunmiao/Documents/web/zen-kit/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md || true
```

Expected: no public documentation hits.

- [ ] **Step 4: Run full struct runtime tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run packages/core/src/struct
```

Expected: all struct tests pass. If coverage threshold fails on subset command, run the package-level test in Step 7 before claiming pass.

- [ ] **Step 5: Run type tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test:type
```

Expected: command exits 0.

- [ ] **Step 6: Run typecheck**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
```

Expected: command exits 0.

- [ ] **Step 7: Run full core test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test
```

Expected: command exits 0. This is the only command that proves coverage thresholds for core package.

- [ ] **Step 8: Run docs verification if docs changed**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter doc run typecheck
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter doc run docs:build
```

Expected: both commands exit 0. If the repo has no `doc` package filter, record the package-manager error and run the documented docs command from root package scripts.

- [ ] **Step 9: Final diff review**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff --stat
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only | sort
```

Expected: changed files match the plan. Report any pre-existing unrelated dirty files separately.

---

## Self-Review

### Spec coverage

- Wave 1 correctness: Tasks 1-4 cover flat missing skip, nullable encode, wire-key conflict, and union ambiguity.
- Wave 2 internal convergence: Tasks 5-7 cover missing policy, field resolution cache, and branch selector.
- Wave 3 codec walker: Task 8 covers discriminatedUnion routing and narrows JSON alias decode responsibility.
- Wave 4 projection: Tasks 9-10 cover flat kernel and request builder explicit/whole-source boundaries.
- Wave 5 public API/docs: Tasks 11-12 cover public API shrink and docs.
- Wave 6 request/body: Task 13 covers body descriptor and request sections.
- Wave 7 phantom/isStruct: Task 14 covers `[TYPES]` removal and guard hardening.
- Final verification: Task 15 covers stale scans and full commands.

### Placeholder scan

This plan contains no `TBD`, no `TODO`, no “implement later”, and no bare “write tests for the above” step. Large implementation tasks include concrete signatures, code shapes, target files, and commands.

### Type consistency

The plan consistently uses:

- `ResolvedStructField`
- `resolveStructFields()`
- `getWireKey()`
- `matchesRuntimeValue()`
- `selectUnionOption()`
- `RequestBodyDescriptor`
- `RequestSection`

Later tasks consume these names as defined in earlier tasks.
