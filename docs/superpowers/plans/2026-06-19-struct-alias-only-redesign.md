# Struct Alias-Only Redesign Implementation Plan

> Historical note: this plan describes the migration away from the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 删除 core struct 的 `tag` 系统和 `requireTag` 过滤语义，新增 `struct.alias(name: string)`，并让自动 codec/request builder 使用 `field.alias ?? fieldKey`。

**Architecture:** 字段 placement 只由 `struct.request({ path, query, headers, body })` 和 `build(ctx, input)` 决定；body codec 只由 `struct.json(...)`、`struct.urlencoded(...)`、`struct.formData(...)` 等 wrapper 决定；alias 只是一份挂在 struct definition 上的单一 wire name。实现顺序是：先加入 struct alias 元数据，再把 introspection、JSON codec、flat codec、request builder 逐层切到 alias，最后删除 tag public API 并迁移测试和文档。

**Tech Stack:** TypeScript, pnpm 11.6.0, Node >=26, Vitest, tsgo, oxlint, oxfmt, VitePress docs。

## Global Constraints

- 这是破坏性变更：完整删除 `.tag(...)`、`tag.*(...)`、`createTagNamespace`、`tagKind`、`FieldTag*`、`TagNamespace*`、`JsonTag`、`QueryTag`、`HeaderTag`、`UriTag`、`UrlencodedTag`、`MultipartTag`。
- 不再支持 struct custom metadata extension；不要保留 custom tag namespace、config tag、metadata map 或 alias 入口。
- 新 API 只有 `struct.alias(name: string)`；只支持一个 string name。
- `alias` 不改变 `Infer`、parse output、request input/output 类型。
- `alias` 不决定 placement、field exposure、field filtering 或 body codec。
- 删除 `requireTag`；不要引入 `requireAlias`、`taggedOnly`、`explicitFieldsOnly` 或任何 aliased-only filter。
- 无 alias 时所有自动 codec/request builder 使用 TypeScript 字段名。
- Explicit build projection 的 object literal key 是最终 wire key，不能被 source field alias 自动改写。
- Whole-source bound value 自动展开时使用 source struct alias。
- 不新增 omit/private/expose/hide 字段能力。
- 不新增 per-target alias，例如 `alias({ json, query })`、`alias.json(...)`、`alias.header(...)`。
- 本轮不主动设计 alias 冲突检测；自然出现的冲突行为未定义，测试不得依赖冲突覆盖顺序。
- 保持现有错误 label：query/path/headers/urlencoded/formData 的 scalar 和 nested object 错误信息仍带 target 名称，并且错误 key 使用 alias 后的 wire key。
- alias name 允许任意 string；`__proto__`、`constructor` 等危险 wire key 必须通过 own-key/null-prototype/URLSearchParams/FormData 安全处理，不能污染全局原型。
- 当前工作区已有用户未提交变更；执行计划时不要提交，不要 broad-stage。只有用户明确要求提交时，才在核对 baseline 后使用 patch/hunk 级暂存。
- 每个任务开始前运行 `git status --short`，将输出记录在对话/任务输出中，不写入新文件。
- 每个任务按“先证明旧行为失败，再实现，再验证”的节奏执行；这里的验证步骤是完成条件，不是 commit 条件。
- 所有期望“无输出”的 `rg` stale scan 都允许原始 exit code 为 1；命令使用 `|| true`，以输出内容为准。

---

## File Structure

### Core struct runtime and type surface

- `packages/core/src/struct/types.ts`
  - 移除 `FieldTagOption` import、`StructMethods.tag(...)`、`BaseDefinition.tagOptions`、`RuntimeStruct.tag(...)`。
  - 新增 `BaseDefinition.alias?: string`、`StructMethods.alias(name: string)`、`RuntimeStruct.alias(name: string)`。
- `packages/core/src/struct/runtime.ts`
  - 移除 tag option 运行时校验和累积逻辑。
  - 新增不可变链式方法 `alias(name: string)`。
- `packages/core/src/struct/introspection.ts`
  - 移除 `getFieldTags`、`getFieldTag` 和 tag materialization。
  - `StructField` 改为 `key`、`struct`、`alias`。
  - 不新增 public `getFieldAlias`；避免扩大 spec 未确认的 public API。
- `packages/core/src/struct/public_api.ts`
  - 删除所有 tag 类型和值导出。
  - 导出 `getStructFields`、`isObjectStruct`。
- `packages/core/src/struct/tag.ts`
  - 删除文件。

### Codec and request builder

- `packages/core/src/struct/codec/common.ts`
  - `encodeObjectByTag` → `encodeObjectByAlias`。
  - `decodeObjectByTag` → `decodeObjectByAlias`。
  - `mapTaggedObjectFields` → `mapAliasedObjectFields`。
  - `getWireKey(fieldKey, fieldTag)` → `getWireKey(fieldKey, alias)`。
  - 删除 `requireTag` 分支。
- `packages/core/src/struct/codec/json.ts`
  - 删除 `JsonTag` 和 `JsonCodecOptions.requireTag`。
  - `encodeJson` / `decodeJson` 只走 alias helper。
- `packages/core/src/struct/codec/flat.ts`
  - `encodeFlatByTag` → `encodeFlatByAlias`。
  - 删除 `tagKind` option。
- `packages/core/src/struct/codec/query.ts`
  - 删除 `HeaderTag`、`QueryTag`、`UriTag`、`TagNamespace` import。
  - query/path/headers 都使用 shared alias key。
- `packages/core/src/struct/codec/urlencoded.ts`
  - 删除 `UrlencodedTag` import，调用 alias flat helper。
  - 保持 `put: appendSearchParam`，不要把 `appendSearchParam` 包进 `writeRepeated`，避免数组重复 key 被 `set` 覆盖。
- `packages/core/src/struct/codec/multipart.ts`
  - 删除 `MultipartTag` import，调用 alias flat helper。
- `packages/core/src/internal/request_builder.ts`
  - 删除所有 tag imports 和 `getFlatTargetTagKind()`。
  - JSON whole-source encode 使用 `mapAliasedObjectFields`。
  - flat whole-source encode 使用 `field.alias ?? field.key`。

### Tests

- Create `packages/core/src/struct/alias.spec.ts`
  - 覆盖 alias runtime metadata、immutability、runtime guard、`getStructFields(...).alias`。
- Create `packages/core/src/struct/types.alias.type.test.ts`
  - 覆盖 alias 类型正向。
- Create `packages/core/src/struct/types.removed-tag.type.test.ts`
  - 覆盖旧 tag public API 类型负向。
- Modify `packages/core/src/struct/runtime.spec.ts`
  - 覆盖旧 tag runtime public surface 不再存在。
- Delete `packages/core/src/struct/tag.spec.ts`
  - custom tag metadata 不迁移。
- Delete `packages/core/src/struct/types.tag.type.test.ts`
  - XML removed negative checks 如仍需要，移动到 `types.removed-tag.type.test.ts`。
- Modify runtime/coverage/codec/request/http/sse/websocket tests listed below。

### Docs

- `packages/core/src/struct/README.md`
- `packages/core/design.md`
- `packages/core/README.md`
- `README.md`
- VitePress public docs under `doc/**/core/struct.md`、`doc/**/guide/examples.md`、`doc/**/guide/getting-started.md`
- Superpowers docs under `docs/superpowers/**/*.md`

---

## Execution Safety

- Do not run `git commit` from this plan unless the user explicitly asks for commits.
- Do not run broad staging commands such as `git add doc` or `git add packages/core/src/struct` in the dirty working tree.
- If a later user asks for commits, first compare against the Task 0 baseline and use interactive/patch-equivalent hunk staging. Before any commit, run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only --cached
```

Expected: staged files and hunks are only the task-owned changes. If target files already contain unrelated user edits, stop and report the conflict instead of committing.

---

### Task 0: Implementation Preflight

**Files:**

- Inspect only: repository working tree

**Interfaces:**

- Consumes: confirmed spec `docs/superpowers/specs/2026-06-19-struct-alias-only-design.md`
- Produces: baseline inventory for safe implementation

- [ ] **Step 1: Record current working tree**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
```

Expected: output may contain existing user changes. Record the output in the conversation/task output. Do not write a baseline file.

- [ ] **Step 2: Locate old TypeScript tag references**

Run:

```bash
rg -n "\brequireTag\b|\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|tagKind|getFieldTag|getFieldTags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: many baseline hits in `packages/core/src/struct`, codec files, request builder, tests, and type tests.

- [ ] **Step 3: Locate old docs references**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|\btag\(struct|Tag System|Field tags|field tag system|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md /Users/munmunmiao/Documents/web/zen-kit/README.md --glob '*.md' --glob '!**/plans/2026-06-19-struct-alias-only-redesign.md' || true
```

Expected: baseline hits in public docs and historical/planning docs. The current implementation plan is excluded because it intentionally names old API symbols as migration targets.

---

### Task 1: Add alias metadata and chain method to struct runtime

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/runtime.ts`
- Create: `packages/core/src/struct/alias.spec.ts`
- Create: `packages/core/src/struct/types.alias.type.test.ts`

**Interfaces:**

- Consumes: existing struct chain pattern from `null()`、`nullish()`、`optional()`
- Produces:
  - `BaseDefinition.alias?: string`
  - `StructMethods.alias(name: string): Struct<I, O, OO>`
  - `RuntimeStruct.alias(name: string): RuntimeStruct`
  - runtime error message `alias() requires a string name`

- [ ] **Step 1: Write failing runtime tests for alias metadata**

Create `packages/core/src/struct/alias.spec.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { getStructFields, struct } from './index'
import { DEFINITION } from './symbols'
import type { RuntimeStruct } from './types'

function runtime(value: unknown): RuntimeStruct {
  return value as RuntimeStruct
}

function aliasOf(value: unknown): string | undefined {
  return runtime(value)[DEFINITION].alias
}

describe('struct alias metadata', () => {
  test('stores one wire name without mutating the base struct', () => {
    const base = struct.string()
    const aliased = base.alias('display_name')

    expect(aliasOf(base)).toBeUndefined()
    expect(aliasOf(aliased)).toBe('display_name')
  })

  test('keeps alias chaining immutable', () => {
    const base = struct.string()
    const first = base.alias('first_name')
    const second = first.alias('second_name')

    expect(aliasOf(base)).toBeUndefined()
    expect(aliasOf(first)).toBe('first_name')
    expect(aliasOf(second)).toBe('second_name')
  })

  test('rejects non-string alias names at runtime', () => {
    const alias = struct.string().alias as (name?: unknown) => unknown

    expect(() => alias()).toThrow('alias() requires a string name')
    expect(() => alias(1)).toThrow('alias() requires a string name')
    expect(() => alias(null)).toThrow('alias() requires a string name')
  })

  test('exposes aliases through getStructFields', () => {
    const user = struct.object({
      displayName: struct.string().alias('display_name'),
      id: struct.number(),
    })

    expect(getStructFields(user).map(({ alias, key }) => ({ alias, key }))).toEqual([
      { alias: 'display_name', key: 'displayName' },
      { alias: undefined, key: 'id' },
    ])
  })
})
```

- [ ] **Step 2: Write failing type tests for alias inference**

Create `packages/core/src/struct/types.alias.type.test.ts`:

```ts
import type { Infer } from './index'
import { struct } from './index'

type IsAny<T> = 0 extends 1 & T ? true : false
type StrictEqual<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? (IsAny<A> extends IsAny<B> ? true : false) : false
type Expect<T extends true> = T

const aliasedString = struct.string().alias('display_name')
type AliasedStringCase = Expect<StrictEqual<Infer<typeof aliasedString>, string>>

const user = struct.object({
  displayName: struct.string().alias('display_name'),
  id: struct.number().alias('id'),
  nickname: struct.string().optional().alias('nick_name'),
})

type UserCase = Expect<
  StrictEqual<
    Infer<typeof user>,
    {
      displayName: string
      id: number
      nickname?: string
    }
  >
>

struct.string().alias('wire_name')

// @ts-expect-error alias requires a string name.
struct.string().alias(1)

// @ts-expect-error alias requires an explicit name.
struct.string().alias()

export type Cases = AliasedStringCase | UserCase
```

- [ ] **Step 3: Run the failing alias tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/alias.spec.ts
```

Expected: FAIL because structs do not have `alias` yet.

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.alias.type.test.ts"
```

Expected: FAIL because `alias` does not exist in type surface yet.

- [ ] **Step 4: Update struct method and definition types**

In `packages/core/src/struct/types.ts`, remove:

```ts
import type { FieldTagOption } from './tag'
```

Replace `StructMethods` with:

```ts
export interface StructMethods<I, O, OO extends boolean> {
  alias(name: string): Struct<I, O, OO>
  null(): Struct<I | null, O | null, OO>
  nullish(): Struct<I | null | undefined, O | null | undefined, true>
  optional(): Struct<I | undefined, O | undefined, true>
}
```

Replace `BaseDefinition` with:

```ts
export type BaseDefinition = {
  alias?: string
  flags: StructFlags
}
```

Replace the method section of `RuntimeStruct` with:

```ts
export type RuntimeStruct = {
  readonly [DEFINITION]: StructDefinition
  readonly [TYPES]: StructTypes<unknown, unknown, boolean>
  readonly _struct: StructTypes<unknown, unknown, boolean>
  alias(name: string): RuntimeStruct
  null(): RuntimeStruct
  nullish(): RuntimeStruct
  optional(): RuntimeStruct
}
```

- [ ] **Step 5: Update runtime struct construction**

In `packages/core/src/struct/runtime.ts`, remove:

```ts
import type { FieldTagOption } from './tag'
```

Replace `PrimitiveDefinitionInput` with:

```ts
export interface PrimitiveDefinitionInput<K extends PrimitiveKind, TInput, TOutput = TInput> {
  alias?: string
  decode?: (value: TInput, path: Path) => ParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  zero: () => TOutput
}
```

In `makeStruct`, add `alias(name: string)` before `null()` and remove old `tag(...options)`:

```ts
const struct: RuntimeStruct = {
  [DEFINITION]: definition,
  [TYPES]: undefined as never,
  _struct: undefined as never,
  alias(name: string) {
    if (typeof name !== 'string') {
      throw new TypeError('alias() requires a string name')
    }

    return makeStruct({
      ...definition,
      alias: name,
    })
  },
  null() {
    return withFlags({ nullable: true })
  },
  nullish() {
    return withFlags({ nullable: true, optional: true })
  },
  optional() {
    return withFlags({ optional: true })
  },
}
```

- [ ] **Step 6: Verify Task 1**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/alias.spec.ts
```

Expected: PASS for `alias.spec.ts`.

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.alias.type.test.ts"
```

Expected: PASS.

---

### Task 2: Replace struct introspection tags with field aliases

**Files:**

- Modify: `packages/core/src/struct/introspection.ts`
- Modify: `packages/core/src/struct/public_api.ts`
- Modify: `packages/core/src/struct/alias.spec.ts`

**Interfaces:**

- Consumes: `BaseDefinition.alias?: string` from Task 1
- Produces:
  - `StructField.alias: string | undefined`
  - `getStructFields()` no longer returns `tags`
  - no public `getFieldAlias`

- [ ] **Step 1: Run current failing alias introspection test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/alias.spec.ts
```

Expected: FAIL on the `getStructFields` alias assertion because fields still expose `tags` and no `alias`.

- [ ] **Step 2: Rewrite introspection to read alias metadata**

In `packages/core/src/struct/introspection.ts`, delete:

```ts
import type { FieldTag } from './tag'
import { materializeFieldTags } from './tag'
```

Delete `getFieldTags` and `getFieldTag` completely.

Replace `StructField` with:

```ts
export interface StructField {
  readonly alias: string | undefined
  readonly key: string
  readonly struct: StructLike<unknown, unknown, boolean>
}
```

Replace the `Object.entries(shape).map(...)` body in `getStructFields` with:

```ts
return Object.entries(shape).map(([key, field]) => {
  const fieldStruct = field as unknown as StructLike<unknown, unknown, boolean>
  const fieldRuntime = resolveRuntimeStruct(field as unknown as RuntimeStruct)
  return {
    alias: fieldRuntime[DEFINITION].alias,
    key,
    struct: fieldStruct,
  }
})
```

- [ ] **Step 3: Update public API exports without adding helper APIs**

In `packages/core/src/struct/public_api.ts`, replace the introspection export lines with:

```ts
export type { StructField } from './introspection'
export { getStructFields, isObjectStruct } from './introspection'
```

Keep existing tag exports only until Task 6 removes the old public API surface.

- [ ] **Step 4: Verify Task 2**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/alias.spec.ts
```

Expected: PASS for all alias tests.

Run:

```bash
rg -n "getFieldAlias|field\.tags|getFieldTag|getFieldTags" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/introspection.ts /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/alias.spec.ts || true
```

Expected: no output.

---

### Task 3: Migrate object and JSON codecs to alias-only

**Files:**

- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/json.ts`
- Modify: `packages/core/src/struct/codec/json.spec.ts`
- Modify: `packages/core/src/struct/coverage.spec.ts`
- Modify: `packages/core/src/struct/parse.security.spec.ts`

**Interfaces:**

- Consumes:
  - `StructField.alias`
  - `getWireKey(fieldKey: string, alias: string | undefined): string`
- Produces:
  - `encodeObjectByAlias(struct, value, label?)`
  - `decodeObjectByAlias(struct, value, label?)`
  - `mapAliasedObjectFields(struct, value, encodeChild)`
  - `encodeJson(struct, value)` with no options
  - `decodeJson(struct, value)` with no options

- [ ] **Step 1: Replace JSON codec tests with alias-only behavior**

Rewrite `packages/core/src/struct/codec/json.spec.ts`:

```ts
import { describe, expect, test } from 'vitest'
import { struct } from '../index'
import { decodeJson, encodeJson } from './json'

describe('codec/json.ts', () => {
  const profile = struct.object({
    displayName: struct.string().alias('display_name'),
    secret: struct.string().optional(),
  })

  test('maps aliased JSON field names and falls back to field names', () => {
    const user = struct.object({
      displayName: struct.string().alias('display_name'),
      id: struct.number(),
    })

    expect(encodeJson(user, { displayName: 'Miao', id: 1 })).toEqual({ display_name: 'Miao', id: 1 })
    expect(decodeJson(user, { display_name: 'Miao', id: 1 })).toEqual({ displayName: 'Miao', id: 1 })
  })

  test('unknown JSON wire keys are ignored', () => {
    const query = struct.object({ pageSize: struct.number().alias('page_size') })

    expect(decodeJson(query, { page_size: 20, pageSize: 99 })).toEqual({ pageSize: 20 })
  })

  test('unaliased fields participate with their TypeScript field names', () => {
    const query = struct.object({
      internal: struct.string(),
      pageSize: struct.number().alias('page_size'),
    })

    expect(encodeJson(query, { internal: 'visible', pageSize: 20 })).toEqual({ internal: 'visible', page_size: 20 })
    expect(decodeJson(query, { internal: 'visible', page_size: 20 })).toEqual({ internal: 'visible', pageSize: 20 })
  })

  test('recurses into nested JSON objects and arrays', () => {
    const user = struct.object({
      profile: profile.alias('user_profile'),
      team: struct.array(profile).alias('team_members'),
    })

    expect(
      encodeJson(user, {
        profile: { displayName: 'Miao', secret: 'local' },
        team: [{ displayName: 'Core', secret: 'local-team' }],
      }),
    ).toEqual({
      user_profile: { display_name: 'Miao', secret: 'local' },
      team_members: [{ display_name: 'Core', secret: 'local-team' }],
    })

    expect(
      decodeJson(user, {
        user_profile: { display_name: 'Miao', secret: 'local' },
        team_members: [{ display_name: 'Core', secret: 'local-team' }],
      }),
    ).toEqual({
      profile: { displayName: 'Miao', secret: 'local' },
      team: [{ displayName: 'Core', secret: 'local-team' }],
    })
  })

  test('recurses into tuple items and record values', () => {
    const tupleStruct = struct.tuple([profile])
    const recordStruct = struct.record(profile)

    expect(encodeJson(tupleStruct, [{ displayName: 'Tuple' }])).toEqual([{ display_name: 'Tuple' }])
    expect(decodeJson(tupleStruct, [{ display_name: 'Tuple' }])).toEqual([{ displayName: 'Tuple' }])
    expect(encodeJson(recordStruct, { owner: { displayName: 'Record' } })).toEqual({ owner: { display_name: 'Record' } })
    expect(decodeJson(recordStruct, { owner: { display_name: 'Record' } })).toEqual({ owner: { displayName: 'Record' } })
  })

  test('decodes aliased union objects symmetrically', () => {
    const event = struct.or(
      struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
      struct.object({ count: struct.number(), type: struct.literal('count').alias('kind') }),
    )

    expect(encodeJson(event, { payload: 'hello', type: 'message' })).toEqual({ body: 'hello', kind: 'message' })
    expect(encodeJson(event, { count: 3, type: 'count' })).toEqual({ count: 3, kind: 'count' })
    expect(decodeJson(event, { body: 'hello', kind: 'message' })).toEqual({ payload: 'hello', type: 'message' })
    expect(decodeJson(event, { count: 3, kind: 'count' })).toEqual({ count: 3, type: 'count' })
  })

  test('selects aliased union branches by scalar field type without a discriminator', () => {
    const event = struct.or(
      struct.object({ value: struct.string().alias('text') }),
      struct.object({ value: struct.number().alias('count') }),
    )

    expect(encodeJson(event, { value: 'hello' })).toEqual({ text: 'hello' })
    expect(encodeJson(event, { value: 3 })).toEqual({ count: 3 })
    expect(decodeJson(event, { count: 3 })).toEqual({ value: 3 })
  })

  test('selects aliased union branches through collection field types', () => {
    const arrayEvent = struct.or(
      struct.object({ value: struct.array(struct.string()).alias('texts') }),
      struct.object({ value: struct.array(struct.number()).alias('counts') }),
    )
    const recordEvent = struct.or(
      struct.object({ value: struct.record(struct.string()).alias('labels') }),
      struct.object({ value: struct.record(struct.number()).alias('totals') }),
    )
    const tupleEvent = struct.or(
      struct.object({ value: struct.tuple([struct.string()]).alias('label_tuple') }),
      struct.object({ value: struct.tuple([struct.number()]).alias('count_tuple') }),
    )

    expect(encodeJson(arrayEvent, { value: [1, 2] })).toEqual({ counts: [1, 2] })
    expect(decodeJson(arrayEvent, { counts: [1, 2] })).toEqual({ value: [1, 2] })
    expect(encodeJson(recordEvent, { value: { total: 3 } })).toEqual({ totals: { total: 3 } })
    expect(decodeJson(recordEvent, { totals: { total: 3 } })).toEqual({ value: { total: 3 } })
    expect(encodeJson(tupleEvent, { value: [3] })).toEqual({ count_tuple: [3] })
    expect(decodeJson(tupleEvent, { count_tuple: [3] })).toEqual({ value: [3] })
  })

  test('keeps aliased union option order for uninformative fields', () => {
    const arrayEvent = struct.or(
      struct.object({ value: struct.array(struct.string()).alias('texts') }),
      struct.object({ value: struct.array(struct.number()).alias('counts') }),
    )
    const recordEvent = struct.or(
      struct.object({ value: struct.record(struct.string()).alias('labels') }),
      struct.object({ value: struct.record(struct.number()).alias('totals') }),
    )
    const stringEvent = struct.or(
      struct.object({ value: struct.string().alias('text') }),
      struct.object({ value: struct.string().alias('raw') }),
    )

    expect(encodeJson(arrayEvent, { value: [] })).toEqual({ texts: [] })
    expect(encodeJson(recordEvent, { value: {} })).toEqual({ labels: {} })
    expect(encodeJson(stringEvent, { value: 'hello' })).toEqual({ text: 'hello' })
  })

  test('decodes discriminated union after alias normalization', () => {
    const event = struct.discriminatedUnion('type', [
      struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
      struct.object({ count: struct.number(), type: struct.literal('count').alias('kind') }),
    ])

    expect(encodeJson(event, { payload: 'hello', type: 'message' })).toEqual({ body: 'hello', kind: 'message' })
    expect(encodeJson(event, { count: 3, type: 'count' })).toEqual({ count: 3, kind: 'count' })
    expect(decodeJson(event, { body: 'hello', kind: 'message' })).toEqual({ payload: 'hello', type: 'message' })
    expect(decodeJson(event, { count: 3, kind: 'count' })).toEqual({ count: 3, type: 'count' })
  })

  test('encodes and decodes aliased intersection object sides', () => {
    const account = struct.object({ accountId: struct.string().alias('account_id') })
    const namedProfile = struct.object({ displayName: struct.string().alias('display_name') })
    const struct = struct.intersection(account, namedProfile)

    expect(encodeJson(struct, { accountId: 'a_1', displayName: 'Miao' })).toEqual({ account_id: 'a_1', display_name: 'Miao' })
    expect(decodeJson(struct, { account_id: 'a_1', display_name: 'Miao' })).toEqual({ accountId: 'a_1', displayName: 'Miao' })
  })
})
```

- [ ] **Step 2: Run the failing JSON tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/codec/json.spec.ts
```

Expected: FAIL because JSON codec still reads tag metadata.

- [ ] **Step 3: Rewrite common object codec helpers**

In `packages/core/src/struct/codec/common.ts`, remove tag imports. Replace tag helper exports with alias helper exports:

```ts
export function encodeObjectByAlias(struct: StructLike<unknown, unknown, boolean>, value: unknown, label = 'json'): unknown {
  if (!isObjectStruct(struct)) {
    return encodeAliasedField(struct, value)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  return mapAliasedObjectFields(struct as unknown as RuntimeStruct, value, (fieldStruct, fieldValue) =>
    encodeAliasedField(fieldStruct, fieldValue),
  )
}

export function decodeObjectByAlias(struct: StructLike<unknown, unknown, boolean>, value: unknown, label = 'json'): unknown {
  if (!isObjectStruct(struct)) {
    return parseStructValue(struct, decodeAliasedField(struct, value, []))
  }

  return parseStructValue(struct, normalizeObjectByAlias(struct, value, label, []))
}

function normalizeObjectByAlias(
  struct: StructLike<unknown, unknown, boolean>,
  value: unknown,
  label: string,
  path: Path,
): { [key: string]: unknown } {
  assertPlainObject(value, `${label} decode expects object value`)

  const normalized: { [key: string]: unknown } = Object.create(null)
  for (const field of getStructFields(struct)) {
    const wireKey = getWireKey(field.key, field.alias)
    if (!hasOwnKey(value, wireKey)) {
      continue
    }

    normalized[field.key] = decodeAliasedField(field.struct, value[wireKey], [...path, field.key])
  }

  return normalized
}

export function mapAliasedObjectFields(
  struct: RuntimeStruct,
  value: { [key: string]: unknown },
  encodeChild: (struct: RuntimeStruct, value: unknown) => unknown,
): { [key: string]: unknown } {
  const output: { [key: string]: unknown } = Object.create(null)

  for (const field of getStructFields(struct)) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    output[getWireKey(field.key, field.alias)] = encodeChild(field.struct as unknown as RuntimeStruct, fieldValue)
  }

  return output
}

export function getWireKey(fieldKey: string, alias: string | undefined): string {
  return alias ?? fieldKey
}
```

Replace recursive private helpers with alias-only names and remove all `options.requireTag` branches. The recursive switch must preserve existing behavior for `object`、`array`、`tuple`、`record`、`or`、`discriminatedUnion`、`intersection`.

- [ ] **Step 4: Rewrite JSON codec entry points**

Replace `packages/core/src/struct/codec/json.ts` with:

```ts
import type { StructLike } from '../types'
import { decodeObjectByAlias, encodeObjectByAlias } from './common'

export function encodeJson(struct: StructLike<unknown, unknown, boolean>, value: unknown): unknown {
  return encodeObjectByAlias(struct, value, 'json')
}

export function decodeJson(struct: StructLike<unknown, unknown, boolean>, value: unknown): unknown {
  return decodeObjectByAlias(struct, value, 'json')
}
```

- [ ] **Step 5: Migrate coverage helper tests in the same codec task**

In `packages/core/src/struct/coverage.spec.ts`:

- Replace imports `encodeObjectByTag` / `decodeObjectByTag` with `encodeObjectByAlias` / `decodeObjectByAlias`.
- Remove `JsonTag` import.
- Replace the test title `tagged object codec covers skip, non-object, primitive, and nested paths` with `aliased object codec covers skip, non-object, primitive, and nested paths`.
- Replace the test body with:

```ts
const profile = struct.object({
  internal: struct.string(),
  name: struct.string().alias('full_name'),
  omitted: struct.string().alias('omitted'),
})

expect(encodeObjectByAlias(struct.string(), 'x')).toBe('x')
expect(encodeObjectByAlias(profile, { name: 'Miao', omitted: undefined })).toEqual({ full_name: 'Miao' })
expect(() => encodeObjectByAlias(profile, 'bad')).toThrow('json encode expects object value')

const profiles = struct.array(profile)
expect(encodeObjectByAlias(profiles, [{ name: 'Miao', omitted: undefined }])).toEqual([{ full_name: 'Miao' }])

expect(decodeObjectByAlias(struct.string(), 'x')).toBe('x')
expect(decodeObjectByAlias(profile, { full_name: 'Miao' })).toEqual({ internal: '', name: 'Miao', omitted: '' })
expect(() => decodeObjectByAlias(profile, 'bad')).toThrow('json decode expects object value')

expect(() => decodeObjectByAlias(struct.array(profile), 'bad')).toThrow(StructError)
expect(() => decodeObjectByAlias(struct.tuple([profile]), 'bad')).toThrow(StructError)
expect(decodeObjectByAlias(struct.tuple([profile]), [{ full_name: 'Miao' }, { untouched: true }])).toEqual([
  { internal: '', name: 'Miao', omitted: '' },
])
expect(() => decodeObjectByAlias(struct.record(profile), 'bad')).toThrow(StructError)

const event = struct.or(
  struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
  struct.object({ count: struct.number(), type: struct.literal('count').alias('kind') }),
)
expect(() => decodeObjectByAlias(event, 'bad')).toThrow(StructError)

const discriminated = struct.discriminatedUnion('type', [
  struct.object({ payload: struct.string().alias('body'), type: struct.literal('message').alias('kind') }),
])
expect(() => decodeObjectByAlias(discriminated, { kind: 'unknown' })).toThrow(StructError)
```

- [ ] **Step 6: Update parse security tests for alias naming**

In `packages/core/src/struct/parse.security.spec.ts`, replace every `.tag(tag.json('wire'))` with `.alias('wire')` and remove `tag` imports. Preserve inherited-key security assertions. Update imports to include the alias codec helpers used below:

```ts
import { decodeJson, encodeJson } from './codec/json'
import { encodeMultipart } from './codec/multipart'
import { encodeHeaders, encodePathParams, encodeQueryParams } from './codec/query'
import { encodeUrlencoded } from './codec/urlencoded'
import { struct } from './index'
```

The inherited-key alias security pattern is:

```ts
const struct = struct.object({
  displayName: struct.string().alias('display_name'),
})
const input = Object.create({ display_name: 'from-prototype' }) as { [key: string]: unknown }

expect(decodeJson(struct, input)).toEqual({ displayName: '' })
```

Add dangerous wire-key coverage:

```ts
test('JSON aliases for dangerous keys do not pollute prototypes', () => {
  const struct = struct.object({
    constructorValue: struct.string().alias('constructor'),
    protoValue: struct.string().alias('__proto__'),
  })

  const encoded = encodeJson(struct, { constructorValue: 'ctor', protoValue: 'proto' }) as { [key: string]: unknown }
  expect(Object.hasOwn(encoded, '__proto__')).toBe(true)
  expect(Object.hasOwn(encoded, 'constructor')).toBe(true)
  expect(encoded['__proto__']).toBe('proto')
  expect(encoded['constructor']).toBe('ctor')
  expect((Object.prototype as { [key: string]: unknown })['proto']).toBeUndefined()

  const decoded = decodeJson(struct, JSON.parse('{"__proto__":"proto","constructor":"ctor"}'))
  expect(decoded).toEqual({ constructorValue: 'ctor', protoValue: 'proto' })
  expect(Object.getPrototypeOf(decoded)).toBeNull()
  expect((Object.prototype as { [key: string]: unknown })['proto']).toBeUndefined()
})

test('flat aliases for dangerous keys do not pollute prototypes', () => {
  const flat = struct.object({ protoValue: struct.string().alias('__proto__') })
  const query = encodeQueryParams(flat, { protoValue: 'query' })
  const path = encodePathParams(flat, { protoValue: 'path' })
  const headers = encodeHeaders(flat, { protoValue: 'header' })

  expect(Object.hasOwn(query, '__proto__')).toBe(true)
  expect(Object.hasOwn(path, '__proto__')).toBe(true)
  expect(Object.hasOwn(headers, '__proto__')).toBe(true)
  expect(Object.getPrototypeOf(query)).toBeNull()
  expect(Object.getPrototypeOf(path)).toBeNull()
  expect(Object.getPrototypeOf(headers)).toBeNull()

  const params = encodeUrlencoded(flat, { protoValue: 'form' })
  expect(params.get('__proto__')).toBe('form')

  const form = encodeMultipart(flat, { protoValue: 'multipart' })
  expect(form.get('__proto__')).toBe('multipart')
  expect((Object.prototype as { [key: string]: unknown })['proto']).toBeUndefined()
})
```

- [ ] **Step 7: Verify Task 3**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/codec/json.spec.ts src/struct/coverage.spec.ts src/struct/parse.security.spec.ts
```

Expected: PASS or only failures from other still-unmigrated test blocks in `coverage.spec.ts`. There must be no failure for `encodeObjectByAlias`、`decodeObjectByAlias`、JSON alias recursion、tuple、record、or discriminated union.

Run:

```bash
rg -n "requireTag|JsonTag|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/codec /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/coverage.spec.ts /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/parse.security.spec.ts || true
```

Expected: no output.

---

### Task 4: Migrate flat, query, urlencoded, and multipart codecs to alias-only

**Files:**

- Modify: `packages/core/src/struct/codec/flat.ts`
- Modify: `packages/core/src/struct/codec/query.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.ts`
- Modify: `packages/core/src/struct/codec/multipart.ts`
- Modify: `packages/core/src/struct/codec/query.spec.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.spec.ts`
- Modify: `packages/core/src/struct/codec/multipart.spec.ts`
- Modify: `packages/core/src/struct/coverage.spec.ts`

**Interfaces:**

- Consumes:
  - `getWireKey(field.key, field.alias)` from Task 3
  - `StructField.alias` from Task 2
- Produces:
  - `encodeFlatByAlias(...)`
  - query/path/headers/urlencoded/multipart encoding that ignores tag namespaces and reads only alias

- [ ] **Step 1: Add failing flat codec alias assertions**

In `packages/core/src/struct/codec/query.spec.ts`, remove `tag` imports and add:

```ts
test('uses aliases for query, path, and headers', () => {
  const query = struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
    page: struct.number(),
  })
  const path = struct.object({ userId: struct.string().alias('user_id') })
  const headers = struct.object({ traceId: struct.string().alias('x-trace-id') })

  expect(encodeQueryParams(query, { includeProfile: true, page: 2 })).toEqual({ include_profile: true, page: 2 })
  expect(encodePathParams(path, { userId: 'u_1' })).toEqual({ user_id: 'u_1' })
  expect(encodeHeaders(headers, { traceId: 't_1' })).toEqual({ 'x-trace-id': 't_1' })
})
```

In `packages/core/src/struct/codec/urlencoded.spec.ts`, add:

```ts
test('uses aliases for urlencoded fields and preserves repeated array keys', () => {
  const form = struct.object({
    displayName: struct.string().alias('display_name'),
    tags: struct.array(struct.string()).alias('tag'),
  })

  const output = encodeUrlencoded(form, { displayName: 'Miao', tags: ['a', 'b'] })

  expect(output.toString()).toBe('display_name=Miao&tag=a&tag=b')
  expect(output.getAll('tag')).toEqual(['a', 'b'])
})
```

In `packages/core/src/struct/codec/multipart.spec.ts`, add:

```ts
test('uses aliases for multipart fields', () => {
  const form = struct.object({
    avatarFile: struct.blob().alias('avatar'),
    displayName: struct.string().alias('display_name'),
  })
  const file = new Blob(['avatar'])

  const output = encodeMultipart(form, { avatarFile: file, displayName: 'Miao' })

  expect(output.get('avatar')).toBe(file)
  expect(output.get('display_name')).toBe('Miao')
})
```

Also add alias-aware error-label assertions.

In `packages/core/src/struct/codec/query.spec.ts`, add:

```ts
test('uses aliases in path and header error messages', () => {
  const path = struct.object({
    meta: struct.object({ page: struct.number() }).alias('filter'),
  })
  const headers = struct.object({
    meta: struct.object({ page: struct.number() }).alias('x-meta'),
  })

  expect(() => encodePathParams(path, { meta: { page: 1 } })).toThrow('uri value for "filter" requires a scalar value')
  expect(() => encodeHeaders(headers, { meta: { page: 1 } })).toThrow('header value for "x-meta" requires a scalar value')
})
```

In `packages/core/src/struct/codec/urlencoded.spec.ts`, add:

```ts
test('uses aliases in urlencoded error messages', () => {
  const form = struct.object({
    meta: struct.object({ page: struct.number() }).alias('wire'),
  })

  expect(() => encodeUrlencoded(form, { meta: { page: 1 } })).toThrow('urlencoded value for "wire" requires an explicit serializer')
})
```

In `packages/core/src/struct/codec/multipart.spec.ts`, add:

```ts
test('uses aliases in multipart error messages', () => {
  const form = struct.object({
    meta: struct.object({ page: struct.number() }).alias('wire'),
  })

  expect(() => encodeMultipart(form, { meta: { page: 1 } })).toThrow('multipart value for "wire" requires a scalar, Blob, or File')
})
```

- [ ] **Step 2: Run failing flat codec tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/codec/query.spec.ts src/struct/codec/urlencoded.spec.ts src/struct/codec/multipart.spec.ts
```

Expected: FAIL because flat codecs still read tag namespaces.

- [ ] **Step 3: Rewrite flat helper**

In `packages/core/src/struct/codec/flat.ts`, replace `FlatEncodeOptions` and `encodeFlatByTag` with:

```ts
export interface FlatEncodeOptions<TOutput> {
  create(): TOutput
  label: string
  put(output: TOutput, key: string, value: unknown): void
}

export function encodeFlatByAlias<TOutput>(
  struct: StructLike<unknown, unknown, boolean>,
  value: unknown,
  options: FlatEncodeOptions<TOutput>,
): TOutput {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${options.label} encode expects object struct`)
  }

  const output = options.create()
  assertPlainObject(value, `${options.label} encode expects object value`)

  for (const field of getStructFields(struct)) {
    const encoded = encodeStructValue(field.struct, value[field.key])
    if (typeof encoded === 'undefined') {
      continue
    }

    options.put(output, getWireKey(field.key, field.alias), encoded)
  }

  return output
}
```

- [ ] **Step 4: Rewrite query/path/header codec**

In `packages/core/src/struct/codec/query.ts`, remove tag imports and replace `encodeFlatByTag` with `encodeFlatByAlias`. Replace `encodeTaggedRecord` with:

```ts
function encodeAliasedRecord(
  struct: StructLike<unknown, unknown, boolean>,
  value: unknown,
  label: string,
  options: QueryCodecOptions & { scalarOnly?: boolean } = {},
): { [key: string]: RequestBuildValue } {
  return encodeFlatByAlias(struct, value, {
    create: () => Object.create(null) as { [key: string]: RequestBuildValue },
    label,
    put: (record, key, encoded) => {
      record[key] = options.scalarOnly
        ? normalizeScalarRecordValue(label, key, encoded)
        : normalizeRecordValue(label, key, encoded, options)
    },
  })
}
```

The public functions call it as:

```ts
return encodeAliasedRecord(struct, value, 'query', options)
return encodeAliasedRecord(struct, value, 'uri', { scalarOnly: true })
return encodeAliasedRecord(struct, value, 'header')
```

- [ ] **Step 5: Rewrite urlencoded and multipart codec calls**

In `packages/core/src/struct/codec/urlencoded.ts`:

- Remove `UrlencodedTag` import.
- Replace `encodeFlatByTag` with `encodeFlatByAlias`.
- Keep `put: appendSearchParam`.
- Do not use `writeRepeated` in this file.

The function should be:

```ts
export function encodeUrlencoded(struct: StructLike<unknown, unknown, boolean>, value: unknown): URLSearchParams {
  return encodeFlatByAlias(struct, value, {
    create: () => new URLSearchParams(),
    label: 'urlencoded',
    put: appendSearchParam,
  })
}
```

In `packages/core/src/struct/codec/multipart.ts`:

- Remove `MultipartTag` import.
- Replace `encodeFlatByTag` with `encodeFlatByAlias`.
- Keep existing repeated append behavior for arrays.
- Remove `tagKind` from the options object.

- [ ] **Step 6: Migrate flat codec coverage block**

In `packages/core/src/struct/coverage.spec.ts`, replace the query/urlencoded tag-based struct block with:

```ts
const query = struct.object({
  filter: struct.object({ page: struct.number() }).alias('filter'),
  include: struct.boolean(),
  missing: struct.string(),
  optional: struct.string().optional().alias('optional'),
  tags: struct.array(struct.string()).alias('tag'),
})
```

Keep the existing assertions that prove complex query, missing/optional skip, and repeated tag arrays. Update expected keys only where needed; `tag` remains the wire key for `tags`.

Add coverage assertions that error labels use alias wire keys:

```ts
const path = struct.object({ meta: struct.object({ page: struct.number() }).alias('filter') })
expect(() => encodePathParams(path, { meta: { page: 1 } })).toThrow('uri value for "filter" requires a scalar value')

const headers = struct.object({ meta: struct.object({ page: struct.number() }).alias('x-meta') })
expect(() => encodeHeaders(headers, { meta: { page: 1 } })).toThrow('header value for "x-meta" requires a scalar value')

const urlencoded = struct.object({ meta: struct.object({ page: struct.number() }).alias('wire') })
expect(() => encodeUrlencoded(urlencoded, { meta: { page: 1 } })).toThrow('urlencoded value for "wire" requires an explicit serializer')

const multipart = struct.object({ meta: struct.object({ page: struct.number() }).alias('wire') })
expect(() => encodeMultipart(multipart, { meta: { page: 1 } })).toThrow('multipart value for "wire" requires a scalar, Blob, or File')
```

- [ ] **Step 7: Verify Task 4**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/codec/query.spec.ts src/struct/codec/urlencoded.spec.ts src/struct/codec/multipart.spec.ts src/struct/coverage.spec.ts
```

Expected: PASS or only failures from unrelated still-unmigrated tests in `coverage.spec.ts`; no failure may reference `encodeFlatByAlias`、alias flat keys、or urlencoded repeated arrays.

Run:

```bash
rg -n "TagNamespace|HeaderTag|QueryTag|UriTag|UrlencodedTag|MultipartTag|encodeFlatByTag|tagKind|field\.tags" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/codec || true
```

Expected: no output.

---

### Task 5: Migrate request builder alias behavior and projection boundary

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`
- Verify: `packages/core/src/internal/request_builder.type.test.ts`

**Interfaces:**

- Consumes:
  - `mapAliasedObjectFields` from Task 3
  - `getWireKey(field.key, field.alias)` from Task 3
- Produces:
  - default `struct.request(...)` path/query/headers/body alias encoding
  - build whole-source binding alias encoding
  - explicit projection key preservation

- [ ] **Step 1: Add failing request builder tests for aliases**

In `packages/core/src/internal/request_builder.spec.ts`, remove `tag` imports and add:

```ts
test('default request shape uses aliases inside each section', () => {
  const input = struct.request({
    body: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
    headers: struct.object({ traceId: struct.string().alias('x-trace-id') }),
    path: struct.object({ userId: struct.string().alias('user_id') }),
    query: struct.object({ includeProfile: struct.boolean().alias('include_profile'), page: struct.number() }),
  })

  const request = buildRequest(
    {
      body: { displayName: 'Miao' },
      headers: { traceId: 't_1' },
      path: { userId: 'u_1' },
      query: { includeProfile: true, page: 2 },
    },
    undefined,
    { input },
  )

  expect(request.params).toEqual({ user_id: 'u_1' })
  expect(request.query).toEqual({ include_profile: true, page: 2 })
  expect(request.headers?.get('x-trace-id')).toBe('t_1')
  expect(JSON.parse(request.body as string)).toEqual({ display_name: 'Miao' })
})

test('bound JSON source uses aliases while explicit projection keys stay final', () => {
  const input = struct.request({
    body: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
  })

  const bound = buildRequest(
    { body: { displayName: 'Miao' } },
    (request, view) => {
      request.setJson(view.body)
    },
    { input },
  )
  expect(JSON.parse(bound.body as string)).toEqual({ display_name: 'Miao' })

  const projected = buildRequest(
    { body: { displayName: 'Miao' } },
    (request, view) => {
      request.setJson({ name: view.body.displayName })
    },
    { input },
  )
  expect(JSON.parse(projected.body as string)).toEqual({ name: 'Miao' })
})

test('bound flat source uses aliases while explicit projection keys stay final', () => {
  const input = struct.request({
    path: struct.object({ userId: struct.string().alias('user_id') }),
    query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }),
  })

  const bound = buildRequest(
    { path: { userId: 'u_1' }, query: { includeProfile: true } },
    (request, view) => {
      request.setPathParams(view.path)
      request.setQueryParams(view.query)
    },
    { input },
  )
  expect(bound.params).toEqual({ user_id: 'u_1' })
  expect(bound.query).toEqual({ include_profile: true })

  const projected = buildRequest(
    { path: { userId: 'u_1' }, query: { includeProfile: true } },
    (request, view) => {
      request.setPathParams({ id: view.path.userId })
      request.setQueryParams({ include: view.query.includeProfile })
    },
    { input },
  )
  expect(projected.params).toEqual({ id: 'u_1' })
  expect(projected.query).toEqual({ include: true })
})

test('bound headers source uses aliases while explicit projection keys stay final', () => {
  const input = struct.request({
    headers: struct.object({ traceId: struct.string().alias('x-trace-id') }),
  })

  const bound = buildRequest(
    { headers: { traceId: 't_1' } },
    (request, view) => {
      request.setHeaders(view.headers)
    },
    { input },
  )
  expect(bound.headers?.get('x-trace-id')).toBe('t_1')

  const projected = buildRequest(
    { headers: { traceId: 't_1' } },
    (request, view) => {
      request.setHeaders({ trace: view.headers.traceId })
    },
    { input },
  )
  expect(projected.headers?.get('trace')).toBe('t_1')
  expect(projected.headers?.get('x-trace-id')).toBeNull()
})

test('bound urlencoded source uses aliases while explicit projection keys stay final', () => {
  const input = struct.request({
    body: struct.urlencoded({
      displayName: struct.string().alias('display_name'),
      tags: struct.array(struct.string()).alias('tag'),
    }),
  })

  const bound = buildRequest(
    { body: { displayName: 'Miao', tags: ['a', 'b'] } },
    (request, view) => {
      request.setFormUrlEncoded(view.body as never)
    },
    { input },
  )
  const boundBody = bound.body as URLSearchParams
  expect(boundBody.get('display_name')).toBe('Miao')
  expect(boundBody.getAll('tag')).toEqual(['a', 'b'])

  const projected = buildRequest(
    { body: { displayName: 'Miao', tags: ['a', 'b'] } },
    (request, view) => {
      request.setFormUrlEncoded({ labels: view.body.tags, name: view.body.displayName })
    },
    { input },
  )
  const projectedBody = projected.body as URLSearchParams
  expect(projectedBody.get('name')).toBe('Miao')
  expect(projectedBody.getAll('labels')).toEqual(['a', 'b'])
  expect(projectedBody.get('display_name')).toBeNull()
})

test('bound formData source uses aliases while explicit projection keys stay final', () => {
  const file = new Blob(['avatar'])
  const input = struct.request({
    body: struct.formData({
      avatarFile: struct.blob().alias('avatar'),
      displayName: struct.string().alias('display_name'),
    }),
  })

  const bound = buildRequest(
    { body: { avatarFile: file, displayName: 'Miao' } },
    (request, view) => {
      request.setFormData(view.body as never)
    },
    { input },
  )
  const boundForm = bound.body as FormData
  expect(boundForm.get('avatar')).toBe(file)
  expect(boundForm.get('display_name')).toBe('Miao')

  const projected = buildRequest(
    { body: { avatarFile: file, displayName: 'Miao' } },
    (request, view) => {
      request.setFormData({ file: view.body.avatarFile, name: view.body.displayName })
    },
    { input },
  )
  const projectedForm = projected.body as FormData
  expect(projectedForm.get('file')).toBe(file)
  expect(projectedForm.get('name')).toBe('Miao')
  expect(projectedForm.get('avatar')).toBeNull()
})
```

- [ ] **Step 2: Run failing request builder tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/internal/request_builder.spec.ts
```

Expected: FAIL because request builder still imports tag namespaces and reads `field.tags`.

- [ ] **Step 3: Rewrite request builder imports and keyed encoders**

In `packages/core/src/internal/request_builder.ts`, replace:

```ts
import { getWireKey, mapTaggedObjectFields } from '../struct/codec/common'
```

with:

```ts
import { getWireKey, mapAliasedObjectFields } from '../struct/codec/common'
```

Delete the tag import:

```ts
import { HeaderTag, JsonTag, MultipartTag, QueryTag, UriTag, UrlencodedTag } from '../struct/tag'
```

Replace `encodeKeyedValue` with:

```ts
function encodeKeyedValue(struct: RuntimeStruct, value: unknown): unknown {
  return encodeValue(struct, value, {
    encodeObject: (objectStruct, objectValue, encodeChild) => mapAliasedObjectFields(objectStruct, objectValue, encodeChild),
  })
}
```

Inside `encodeFlatRecord`, replace:

```ts
const outputKey = getWireKey(field.key, field.tags.get(getFlatTargetTagKind(target)))
```

with:

```ts
const outputKey = getWireKey(field.key, field.alias)
```

Delete the entire `getFlatTargetTagKind` function.

- [ ] **Step 4: Verify request builder runtime tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/internal/request_builder.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Verify request builder type test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/internal/request_builder.type.test.ts"
```

Expected: PASS. Current `request_builder.type.test.ts` has no tag usage; if it gains alias-specific examples, they must be explicit projection examples and keep literal keys final.

- [ ] **Step 6: Verify request builder tag references are gone**

Run:

```bash
rg -n "JsonTag|HeaderTag|QueryTag|UriTag|UrlencodedTag|MultipartTag|mapTaggedObjectFields|getFlatTargetTagKind|field\.tags" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/internal/request_builder.ts || true
```

Expected: no output.

---

### Task 6: Remove tag public API and lock old surface as unavailable

**Files:**

- Delete: `packages/core/src/struct/tag.ts`
- Delete: `packages/core/src/struct/tag.spec.ts`
- Delete: `packages/core/src/struct/types.tag.type.test.ts`
- Create: `packages/core/src/struct/types.removed-tag.type.test.ts`
- Modify: `packages/core/src/struct/public_api.ts`
- Modify: `packages/core/src/struct/runtime.spec.ts`
- Modify: `packages/core/src/struct/types.runtime.type.test.ts`

**Interfaces:**

- Consumes: all internal tag imports removed in Tasks 1-5
- Produces:
  - no public tag export
  - no `.tag(...)` method
  - negative type tests for old surface

- [ ] **Step 1: Create removed tag negative type test**

Create `packages/core/src/struct/types.removed-tag.type.test.ts`:

```ts
import * as publicApi from './index'
import { struct } from './index'

// @ts-expect-error tag was removed from the public struct API.
publicApi.tag

// @ts-expect-error createTagNamespace was removed from the public struct API.
publicApi.createTagNamespace

// @ts-expect-error tagKind was removed from the public struct API.
publicApi.tagKind

// @ts-expect-error JsonTag was removed from the public struct API.
publicApi.JsonTag

// @ts-expect-error QueryTag was removed from the public struct API.
publicApi.QueryTag

// @ts-expect-error HeaderTag was removed from the public struct API.
publicApi.HeaderTag

// @ts-expect-error UriTag was removed from the public struct API.
publicApi.UriTag

// @ts-expect-error UrlencodedTag was removed from the public struct API.
publicApi.UrlencodedTag

// @ts-expect-error MultipartTag was removed from the public struct API.
publicApi.MultipartTag

// @ts-expect-error getFieldTag was removed from the public struct API.
publicApi.getFieldTag

// @ts-expect-error getFieldTags was removed from the public struct API.
publicApi.getFieldTags

// @ts-expect-error FieldTag was removed from the public struct API.
type MissingFieldTag = import('./index').FieldTag

// @ts-expect-error FieldTagOption was removed from the public struct API.
type MissingFieldTagOption = import('./index').FieldTagOption

// @ts-expect-error TagNamespace was removed from the public struct API.
type MissingTagNamespace = import('./index').TagNamespace

// @ts-expect-error struct.tag was removed; use struct.alias(name) for wire names.
struct.string().tag()

void publicApi

export type RemovedTagTypes = MissingFieldTag | MissingFieldTagOption | MissingTagNamespace
```

This test intentionally uses namespace property access and `import('./index').TypeName` checks instead of failing named imports. A failed named import may not create a local binding reliably enough for later `void tag` or type-union references, which makes the test brittle.

If `types.tag.type.test.ts` contains XML removed checks that are still valuable, move only these lines into `types.removed-tag.type.test.ts` before deleting the file:

```ts
// @ts-expect-error XmlTag was removed from public exports.
type MissingXmlTag = import('./index').XmlTag

// @ts-expect-error XML object encoder was removed from public exports.
type MissingEncodeXmlObject = typeof import('./index').encodeXmlObject

// @ts-expect-error XML object decoder was removed from public exports.
type MissingDecodeXmlObject = typeof import('./index').decodeXmlObject

export type MissingXmlTypes = MissingXmlTag | MissingEncodeXmlObject | MissingDecodeXmlObject
```

- [ ] **Step 2: Run failing removed API type test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.removed-tag.type.test.ts"
```

Expected: FAIL while old tag exports still exist, because some `@ts-expect-error` directives are unused.

- [ ] **Step 3: Remove tag exports from public API**

In `packages/core/src/struct/public_api.ts`, delete all exports from `./tag` and ensure the file does not export:

```ts
tag
createTagNamespace
tagKind
JsonTag
QueryTag
HeaderTag
UriTag
UrlencodedTag
MultipartTag
FieldTag
FieldTagContext
FieldTagOption
MutableFieldTag
TagNamespace
TagScalar
getFieldTag
getFieldTags
```

- [ ] **Step 4: Delete tag implementation and old tests without staging**

Run:

```bash
rm /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/tag.ts \
  /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/tag.spec.ts \
  /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/types.tag.type.test.ts
```

Expected: files are deleted in the working tree only. This command must not write to the git index.

Then verify the index stayed untouched by this deletion task:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff --cached --name-only
```

Expected: no new staged paths from this plan. If output contains these deleted files, stop and unstage before continuing; commits/staging are outside this plan unless the user explicitly asks.

- [ ] **Step 5: Update runtime chain method tests**

In `packages/core/src/struct/types.runtime.type.test.ts`, replace:

```ts
// @ts-expect-error key was removed; Go-style wire names must use tag.*().
const missingKeyMethod = struct.string().key
void missingKeyMethod
```

with:

```ts
// @ts-expect-error key was removed; wire names must use alias(name).
const missingKeyMethod = struct.string().key
void missingKeyMethod

// @ts-expect-error tag was removed; wire names must use alias(name).
struct.string().tag()
```

In `packages/core/src/struct/runtime.spec.ts`, remove `tag` from imports, add a namespace import for runtime surface checks, and replace the old tag test with:

```ts
import * as publicApi from './index'
```

```ts
test('alias stores metadata without changing parse output', () => {
  const user = struct.object({
    name: struct.string().alias('full_name'),
  })

  const [err, val] = parse(user, { name: 'Miao' })
  if (err) {
    throw err
  }
  expect(val).toEqual({ name: 'Miao' })
})

test('removed tag runtime surface is not exposed', () => {
  expect('tag' in struct.string()).toBe(false)
  expect('tag' in publicApi).toBe(false)
  expect('createTagNamespace' in publicApi).toBe(false)
  expect('tagKind' in publicApi).toBe(false)
  expect('JsonTag' in publicApi).toBe(false)
  expect('QueryTag' in publicApi).toBe(false)
  expect('HeaderTag' in publicApi).toBe(false)
  expect('UriTag' in publicApi).toBe(false)
  expect('UrlencodedTag' in publicApi).toBe(false)
  expect('MultipartTag' in publicApi).toBe(false)
  expect('getFieldTag' in publicApi).toBe(false)
  expect('getFieldTags' in publicApi).toBe(false)
})
```

- [ ] **Step 6: Verify Task 6 type boundaries**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.removed-tag.type.test.ts"
```

Expected: PASS.

Run runtime surface lock tests:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/runtime.spec.ts
```

Expected: PASS, including `removed tag runtime surface is not exposed`.

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.runtime.type.test.ts"
```

Expected: PASS.

Run:

```bash
rg -n "from './tag'|from '../tag'|from '../struct/tag'|from './struct/tag'" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: no output.

---

### Task 7: Migrate remaining struct tests to alias-only

**Files:**

- Modify: `packages/core/src/struct/runtime.spec.ts`
- Modify: `packages/core/src/struct/coverage.spec.ts`
- Modify: `packages/core/src/struct/parse.spec.ts`
- Modify: `packages/core/src/struct/parse.security.spec.ts`
- Modify: `packages/core/src/struct/constructors.primitives.spec.ts`
- Modify: `packages/core/src/struct/encode.spec.ts`

**Interfaces:**

- Consumes:
  - `.alias(name)` from Task 1
  - no public `.tag(...)` from Task 6
- Produces: all struct tests express alias-only semantics

- [ ] **Step 1: Collect exact remaining struct test references**

Run:

```bash
rg -n "\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|getFieldTag|getFieldTags|field\.tags|requireTag|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct --glob '*.spec.ts' --glob '*.type.test.ts' || true
```

Expected: output only in files listed for this task and in `types.removed-tag.type.test.ts` negative checks. Any positive runtime test hit must be migrated in Steps 2-4.

- [ ] **Step 2: Replace old tag aliases in runtime tests**

In the files listed for this task, use these exact replacement rules:

```ts
// before
field: struct.string().tag(tag.json('wire_name'))
field: struct.string().tag(tag.query('wire_name'))
field: struct.string().tag(tag.header('wire_name'))
field: struct.string().tag(tag.uri('wire_name'))
field: struct.string().tag(tag.urlencoded('wire_name'))
field: struct.string().tag(tag.multipart('wire_name'))

// after
field: struct.string().alias('wire_name')
```

If the old wire name equals the field key, remove the alias call:

```ts
// before
id: struct.number().tag(tag.json('id'))

// after
id: struct.number()
```

Remove imports named `tag`、`createTagNamespace`、`HeaderTag`、`JsonTag`、`getFieldTags`、`getFieldTag` unless they are in `types.removed-tag.type.test.ts` negative checks.

- [ ] **Step 3: Delete custom metadata behavior tests**

Delete tests whose only assertion is one of these removed behaviors:

```text
custom config tags
tag.defineConfig
createTagNamespace
tag.kind
tag.query/header/uri explicit-name runtime error
tag.multipart() or tag.json() implicit field-key default
getFieldTag/getFieldTags
field.tags
requireTag ignores untagged fields
```

Replace tag guard coverage with:

```ts
test('runtime alias guard rejects invalid alias names', () => {
  const alias = struct.string().alias as (name?: unknown) => unknown

  expect(() => alias()).toThrow('alias() requires a string name')
  expect(() => alias(1)).toThrow('alias() requires a string name')
})
```

- [ ] **Step 4: Keep positive semantic assertions for alias-only**

Where tests previously asserted renamed wire keys, preserve the same wire key expectation with `.alias(...)`. Where tests previously asserted namespace mismatch field-key behavior, rewrite the expected behavior to single-alias semantics:

```ts
const field = struct.object({
  value: struct.string().alias('wire_value'),
})

expect(encodeJson(field, { value: 'x' })).toEqual({ wire_value: 'x' })
expect(encodeQueryParams(field, { value: 'x' })).toEqual({ wire_value: 'x' })
```

This proves alias applies uniformly within whichever section/codec consumes the struct.

- [ ] **Step 5: Verify Task 7**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/runtime.spec.ts src/struct/coverage.spec.ts src/struct/parse.spec.ts src/struct/parse.security.spec.ts src/struct/constructors.primitives.spec.ts src/struct/encode.spec.ts
```

Expected: PASS.

Run:

```bash
rg -n "\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|getFieldTag|getFieldTags|field\.tags|requireTag|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct --glob '*.spec.ts' --glob '*.type.test.ts' || true
```

Expected: no output except intentional negative references in `types.removed-tag.type.test.ts`.

---

### Task 8: Migrate HTTP, SSE, and WebSocket integration tests

**Files:**

- Modify: `packages/core/src/http/request.spec.ts`
- Modify: `packages/core/src/http/http.spec.ts`
- Modify: `packages/core/src/sse/request.spec.ts`
- Modify: `packages/core/src/sse/sse.spec.ts`
- Modify: `packages/core/src/web_socket/codec.spec.ts`

**Interfaces:**

- Consumes:
  - JSON codec alias behavior from Task 3
  - request builder alias behavior from Task 5
- Produces: integration tests prove alias-only works through HTTP/SSE/WebSocket public behavior

- [ ] **Step 1: Replace stale tag imports and calls**

In all Task 8 files, remove `tag` imports and apply:

```ts
// before
userId: struct.string().tag(tag.uri('user_id'))
traceId: struct.string().tag(tag.header('x-trace-id'))
displayName: struct.string().tag(tag.json('display_name'))
text: struct.string().tag(tag.json('message_text'))

// after
userId: struct.string().alias('user_id')
traceId: struct.string().alias('x-trace-id')
displayName: struct.string().alias('display_name')
text: struct.string().alias('message_text')
```

If the old wire name equals the TypeScript field key, remove the alias call.

- [ ] **Step 2: Add or update HTTP request alias integration assertion**

In `packages/core/src/http/request.spec.ts`, add a test near existing request-shaped input tests using the real helper already imported in that file, `createHttpRequest`:

```ts
test('builds request-shaped input with aliases in path query headers and JSON body', () => {
  const input = struct.request({
    body: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
    headers: struct.object({ traceId: struct.string().alias('x-trace-id') }),
    path: struct.object({ userId: struct.string().alias('user_id') }),
    query: struct.object({ includeProfile: struct.boolean().alias('include_profile') }),
  })

  const request = createHttpRequest(
    'POST',
    '/users/:user_id/profile',
    {
      body: { displayName: 'Miao' },
      headers: { traceId: 't_1' },
      path: { userId: 'u_1' },
      query: { includeProfile: true },
    },
    undefined,
    {
      abort: new AbortController().signal,
      baseEndpoint: 'https://api.example.com',
      input,
      queryParamsSerializer: (params) => params.toString(),
    },
  )

  expect(request.endpoint).toBe('/users/u_1/profile')
  expect(request.queryString).toBe('include_profile=true')
  expect(request.headers?.get('x-trace-id')).toBe('t_1')
  expect(request.body).toBe('{"display_name":"Miao"}')
})
```

The endpoint placeholder intentionally uses the alias wire key `:user_id`, not the local field name `:userId`.

- [ ] **Step 3: Add or update HTTP response alias decode assertion**

In `packages/core/src/http/http.spec.ts`, migrate the existing `should decode response bodies with struct key aliases` test from `.tag(tag.json(...))` to `.alias(...)`, or replace it with this equivalent public HTTP response test:

```ts
test('should decode response bodies with struct key aliases', async () => {
  const client = createClient(
    withEndpoint('https://example.com'),
    withInterceptors(
      createHttpInterceptor(async () =>
        makeResponse({
          body: {
            display_name: 'Miao',
          },
          status: 200,
        }),
      ),
    ),
  )

  const useUser = defineRequest({
    method: 'GET',
    output: {
      200: struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    },
    path: '/user',
  })

  const [error, result] = await client.execute(useUser())

  expect(error).toBeNull()
  expect(result).toEqual({ displayName: 'Miao' })
})
```

- [ ] **Step 4: Update SSE request alias test**

In `packages/core/src/sse/request.spec.ts`, change the existing header alias struct from:

```ts
token: struct.string().tag(tag.header('x-token'))
```

to:

```ts
token: struct.string().alias('x-token')
```

Add query/path aliases to the same test and change the endpoint placeholder to the wire key:

```ts
path: struct.object({
  id: struct.number().alias('user_id'),
}),
query: struct.object({
  include: struct.boolean().alias('include_profile'),
}),
```

The `createEventStreamRequest(...)` call must use:

```ts
'/users/:user_id/events'
```

Update assertions:

```ts
expect(request.endpoint).toBe('/users/1/events')
expect(request.queryString).toBe('include_profile=true')
expect(request.headers?.get('x-token')).toBe('secret')
```

The endpoint remains `/users/1/events` because endpoint placeholder replacement uses the encoded path param record, whose key is the alias wire key `user_id`.

- [ ] **Step 5: Update SSE event data alias decode test**

In `packages/core/src/sse/sse.spec.ts`, the existing test `should decode event payloads with struct key aliases` already has the correct shape. Replace:

```ts
import { struct, tag } from '../struct'
...
displayName: struct.string().tag(tag.json('display_name'))
```

with:

```ts
import { struct } from '../struct'
...
displayName: struct.string().alias('display_name')
```

Keep the existing event stream response:

```ts
controller.enqueue(new TextEncoder().encode('event: profile\ndata: {"display_name":"Miao"}\n\n'))
```

Keep the assertion:

```ts
expect(events).toEqual([
  {
    data: { displayName: 'Miao' },
    event: 'profile',
    id: undefined,
    retry: undefined,
  },
])
```

- [ ] **Step 6: Update WebSocket alias tests with real helper names**

In `packages/core/src/web_socket/codec.spec.ts`, remove `tag` import and replace the outgoing alias test with:

```ts
test('serializes outgoing messages with struct key aliases', () => {
  const structs = {
    msg: struct.object({ text: struct.string().alias('message_text') }),
  }
  const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: { text: 'hello' } })
  expect(JSON.parse(result)).toEqual({ message_text: 'hello', type: 'msg' })
})
```

Replace the incoming alias test with:

```ts
test('transforms incoming messages with struct key aliases', async () => {
  const incoming = {
    msg: struct.object({ text: struct.string().alias('message_text') }),
  }
  const result = await transformWebSocketMessage(incoming, '{"type":"msg","message_text":"hello"}')
  expect(result).toEqual({ type: 'msg', text: 'hello' })
})
```

- [ ] **Step 7: Verify Task 8**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/http/request.spec.ts src/http/http.spec.ts src/sse/request.spec.ts src/sse/sse.spec.ts src/web_socket/codec.spec.ts
```

Expected: PASS.

Run:

```bash
rg -n "\.tag\b|\btag\.|createTagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|requireTag" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/http /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/sse /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/web_socket --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: no output.

---

### Task 9: Update core package docs to alias-only

**Files:**

- Modify: `packages/core/src/struct/README.md`
- Modify: `packages/core/design.md`
- Modify: `packages/core/README.md`
- Modify: `README.md`

**Interfaces:**

- Consumes: accepted design and implemented API
- Produces: package-level docs no longer advertise tag as current API

- [ ] **Step 1: Replace struct README Tag section**

In `packages/core/src/struct/README.md`:

- Delete `tag` from import examples.
- Rename `## Tag` to `## Alias`.
- Replace the section body with:

````md
## Alias

`alias(name)` maps a TypeScript field name to one wire field name. It does not control request placement, field exposure, or codec selection.

Placement is expressed by `struct.request({ path, query, headers, body })`. Body codec is expressed by body wrappers such as `struct.json(...)`, `struct.urlencoded(...)`, and `struct.formData(...)`.

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.string().alias('user_id'),
  }),
  query: struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Unaliased fields use their TypeScript field name as the wire key.
````

- [ ] **Step 2: Update `packages/core/design.md`**

Replace all current-state text that says Go-style tag or tag-based wire key with:

```md
Field wire names are expressed with `struct.alias(name)`.

- `struct.request(...)` decides whether a field belongs to `path`, `query`, `headers`, or `body`.
- Body wrappers decide body codec.
- `alias(name)` maps a TypeScript field name to one wire field name inside the current section or codec.
- `alias(name)` does not control placement, exposure, or filtering.
- Explicit `build(ctx, input)` object projection keys are final wire keys.
```

Replace every code sample using `.tag(tag.json('x'))`、`.tag(tag.query('x'))`、`.tag(tag.header('x'))`、`.tag(tag.uri('x'))` with `.alias('x')`. Remove `tag` imports.

- [ ] **Step 3: Add package and root README migration rows**

In both `packages/core/README.md` and root `README.md`, add this bullet to the 0.4 migration section:

```md
- Struct field tags were removed. Use `struct.alias(name)` for one wire field name. `alias(name)` does not select request placement, body codec, exposure, or filtering. Custom tag metadata and tag introspection are no longer supported.
```

Also delete or rewrite current-state prose that still calls tag markers the active wire-key contract, for example `tag 标记` or `tag.*(...)` as recommended usage.

- [ ] **Step 4: Check root README examples**

If `README.md` contains stale public examples, replace them with `.alias(name)` using the same rules as Step 2. If it contains no tag examples beyond the explicit removed-API migration row from Step 3, leave the examples unchanged.

- [ ] **Step 5: Verify package docs**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|Tag System|Field tags|field tag system|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags" /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md /Users/munmunmiao/Documents/web/zen-kit/README.md || true
```

Expected: no stale public docs output except migration prose that explicitly says the old API was removed.

---

### Task 10: Update public VitePress docs to alias-only

**Files:**

- Modify all existing files matching:
  - `doc/**/core/struct.md`
  - `doc/**/guide/examples.md`
  - `doc/**/guide/getting-started.md`

**Interfaces:**

- Consumes: final public alias API
- Produces: public docs across locales no longer publish removed tag API

- [ ] **Step 1: List exact docs files**

Run:

```bash
find /Users/munmunmiao/Documents/web/zen-kit/doc -path '*/core/struct.md' -o -path '*/guide/examples.md' -o -path '*/guide/getting-started.md'
```

Expected: output includes English docs and locale copies under `zh-Hans`、`zh-Hant-TW`、`zh-Hant-HK`、`de-DE`、`ja-JP`、`ko-KR`、`ar`、`es-ES`、`ru-RU`、`fr-FR`.

- [ ] **Step 2: Apply canonical alias section to every `core/struct.md`**

For every `doc/**/core/struct.md` file from Step 1:

- Frontmatter description must not say `field tag system`.
- Delete the old `Tag System` section, custom tag config examples, `getFieldTag` / `getFieldTags` / `field.tags` examples.
- Insert this canonical section in place of the old tag section. Use this exact English text in every locale for this migration; localization can be handled later without keeping stale API docs.

````md
## Alias

`struct.alias(name)` maps a TypeScript field name to one wire field name.

It does not decide whether a field belongs to path params, query params, headers, or body. `struct.request(...)` decides placement. Body wrappers such as `struct.json(...)`, `struct.urlencoded(...)`, and `struct.formData(...)` decide body codec.

```ts
const Input = struct.request({
  query: struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Unaliased fields use their TypeScript field name as the wire key.
````

- [ ] **Step 3: Update examples docs code blocks**

For every `doc/**/guide/examples.md` file from Step 1:

- Remove `tag` from imports.
- Replace JSON alias examples with `.alias(...)`.
- If a field wire name equals the TypeScript field key, remove the alias call.
- Replace path/query/header examples with request-shaped input sections.
- Use this canonical request-shaped example wherever the old example demonstrates uri/query/header tags:

```ts
const GetUserInput = struct.request({
  path: struct.object({
    userId: struct.string().alias('user_id'),
  }),
  query: struct.object({
    includeProfile: struct.boolean().alias('include_profile'),
  }),
})
```

If an example uses explicit `build(ctx, input)` projection, keep object literal keys as final wire keys and do not add alias to source fields solely to affect those keys.

- [ ] **Step 4: Update getting started docs code blocks**

For every `doc/**/guide/getting-started.md` file from Step 1:

- Remove old examples that call `tag(struct.string(), { kind: 'header' })` or import `tag`.
- Replace quick reference rows mentioning `tag` with `struct.alias(name)`.
- Use this canonical request input snippet where header/body field names are demonstrated:

```ts
const CreateUserInput = struct.request({
  headers: struct.object({
    requestId: struct.string().alias('X-Request-ID'),
  }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

- [ ] **Step 5: Verify public docs stale scan**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|\btag\(struct|import .*[, ]tag[, }]|Tag System|Field tags|field tag system|字段标签|字段元数据标签|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags" /Users/munmunmiao/Documents/web/zen-kit/doc --glob '*.md' || true
```

Expected: no stale public docs output. If a changelog-style sentence remains, it must explicitly say the old API was removed and point to `alias(name)`.

- [ ] **Step 6: Verify docs build surface**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: both commands PASS.

---

### Task 11: Update docs/superpowers historical and planning docs

**Files:**

- Modify matching files under `docs/superpowers/**/*.md`
- Modify: `docs/2026-06-19-struct-json-requiretag-analysis.md` only if it presents old API as current rather than historical evidence

**Interfaces:**

- Consumes: final alias-only design
- Produces: planning/spec docs do not mislead future implementers into reintroducing tag/requireTag

- [ ] **Step 1: Scan superpowers and analysis docs**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers /Users/munmunmiao/Documents/web/zen-kit/docs/2026-06-19-struct-json-requiretag-analysis.md --glob '*.md' --glob '!**/plans/2026-06-19-struct-alias-only-redesign.md' || true
```

Expected: output in historical analysis, specs, and earlier plans. The current implementation plan is excluded because it intentionally contains old API names as migration targets.

- [ ] **Step 2: Mark historical docs explicitly**

For historical analysis docs that intentionally discuss old `tag`/`requireTag` behavior, add this note immediately below the title:

```md
> Historical note: this document analyzes the pre-alias struct tag system. The accepted redesign removes `tag.*(...)`, `.tag(...)`, custom tag metadata, and `requireTag`; current field wire names use `struct.alias(name)`.
```

Do not rewrite old/new examples that are clearly labeled historical evidence.

- [ ] **Step 3: Update current/future planning docs**

For current specs or plans under `docs/superpowers` that describe future/current work, replace active instructions using tag with alias-only rules:

```md
Use `struct.alias(name)` for one wire field name. `alias(name)` does not decide request placement, exposure, filtering, or codec. Do not use `.tag(...)`, `tag.*(...)`, custom tag metadata, or `requireTag`.
```

- [ ] **Step 4: Verify superpowers docs scan**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers /Users/munmunmiao/Documents/web/zen-kit/docs/2026-06-19-struct-json-requiretag-analysis.md --glob '*.md' --glob '!**/plans/2026-06-19-struct-alias-only-redesign.md' || true
```

Expected: remaining output is only in documents containing the `Historical note` from Step 2 or migration examples explicitly labeled as old API. The current implementation plan remains excluded for the same reason as Step 1.

---

### Task 12: Final stale search and full verification

**Files:**

- Verify: `packages/core/**`
- Verify: `doc/**`
- Verify: `docs/superpowers/**`
- Verify: `README.md`
- Verify: `packages/core/README.md`
- Use Task 0 git status output as baseline whenever reviewing final diff; this repository is expected to contain unrelated pre-existing dirty files.

**Interfaces:**

- Consumes: all implementation and docs tasks
- Produces: evidence that alias-only redesign is complete

- [ ] **Step 1: Search TypeScript for old tag and requireTag surface**

Run:

```bash
rg -n "\brequireTag\b|\.tag\b|\btag\.|createTagNamespace|FieldTag|TagNamespace|JsonTag|QueryTag|HeaderTag|UriTag|UrlencodedTag|MultipartTag|tagKind|getFieldTag|getFieldTags|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/packages/core --glob '*.{ts,tsx,mts,cts}' || true
```

Expected: no output except intentional negative type-test references in `packages/core/src/struct/types.removed-tag.type.test.ts`. Inspect every hit. A valid negative hit must be directly covered by an adjacent `@ts-expect-error` stating the old API was removed.

- [ ] **Step 2: Search public docs for old tag API**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|\btag\(struct|import .*[, ]tag[, }]|Tag System|Field tags|field tag system|字段标签|字段元数据标签|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags" /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md /Users/munmunmiao/Documents/web/zen-kit/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md --glob '*.md' || true
```

Expected: no stale public docs output except migration prose that explicitly says the old API was removed.

- [ ] **Step 3: Search superpowers docs for unmarked old API references**

Run:

```bash
rg -n "\.tag\(|tag\.(json|header|uri|query|urlencoded|multipart|defineConfig|createTagNamespace|kind)|requireTag|getFieldTag|getFieldTags|createTagNamespace|defineConfig|field\.tags|encodeObjectByTag|decodeObjectByTag|mapTaggedObjectFields" /Users/munmunmiao/Documents/web/zen-kit/docs/superpowers /Users/munmunmiao/Documents/web/zen-kit/docs/2026-06-19-struct-json-requiretag-analysis.md --glob '*.md' --glob '!**/plans/2026-06-19-struct-alias-only-redesign.md' || true
```

Expected: remaining output only in documents with an explicit historical note or old/new migration example. The current implementation plan is excluded because it necessarily names old symbols as migration targets.

- [ ] **Step 4: Confirm alias docs exist**

Run:

```bash
rg -n "alias\(" /Users/munmunmiao/Documents/web/zen-kit/doc /Users/munmunmiao/Documents/web/zen-kit/packages/core/src/struct/README.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/design.md /Users/munmunmiao/Documents/web/zen-kit/packages/core/README.md --glob '*.md'
```

Expected: output includes alias examples in struct docs, guide examples, getting started docs, `packages/core/src/struct/README.md`, `packages/core/design.md`, and `packages/core/README.md` migration prose.

- [ ] **Step 5: Run focused core runtime tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/alias.spec.ts src/struct/runtime.spec.ts src/struct/coverage.spec.ts src/struct/codec/json.spec.ts src/struct/codec/query.spec.ts src/struct/codec/urlencoded.spec.ts src/struct/codec/multipart.spec.ts src/struct/parse.spec.ts src/struct/parse.security.spec.ts src/internal/request_builder.spec.ts src/http/request.spec.ts src/http/http.spec.ts src/sse/request.spec.ts src/sse/sse.spec.ts src/web_socket/codec.spec.ts
```

Expected: PASS.

- [ ] **Step 6: Run core type tests**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test:type
```

Expected: PASS. Confirm removed tag API `@ts-expect-error` directives are consumed.

- [ ] **Step 7: Run core typecheck**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run typecheck
```

Expected: PASS.

- [ ] **Step 8: Run core full test**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit --filter @defjs/core run test
```

Expected: PASS with Vitest runtime tests and type tests passing.

- [ ] **Step 9: Run docs checks**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run typecheck
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/doc run docs:build
```

Expected: both commands PASS.

- [ ] **Step 10: Run repository check**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit check
```

Expected: PASS for lint, formatting check, and typecheck.

- [ ] **Step 11: Review final diff without staging**

Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit status --short
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only
git -C /Users/munmunmiao/Documents/web/zen-kit diff --name-only --cached
```

Expected: compare the final `status --short` and `diff --name-only` output against the Task 0 baseline. Only paths owned by this plan should have new or changed status due to this work. `diff --name-only --cached` must not contain plan-owned files unless the user explicitly asked for staging.

Then review only the plan-owned paths that changed during this implementation. Build the owned path list from the file lists in Tasks 1-11, excluding unrelated paths that were already dirty in Task 0 and not touched by this plan. Run:

```bash
git -C /Users/munmunmiao/Documents/web/zen-kit diff -- <owned-path-1> <owned-path-2> ...
```

Expected: reviewed hunks contain only alias-only redesign changes and docs updates. If a file contains unrelated pre-existing user edits, report it as mixed ownership and do not stage or commit. Do not commit unless the user explicitly asks.
