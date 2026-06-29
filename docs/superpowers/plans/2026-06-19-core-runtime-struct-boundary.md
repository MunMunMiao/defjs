# Core Runtime Struct Boundary 实施计划

> **面向 agent worker：** 必须使用 `superpowers:subagent-driven-development`（推荐）或 `superpowers:executing-plans` 逐任务执行本计划。步骤使用 checkbox（`- [ ]`）语法跟踪。

**目标：** 删除目前没有真实解析语义的 `resolveRuntimeStruct()`，让内部 `StructDefinition` 的子 struct 字段直接保存 `RuntimeStruct`，并在 `packages/core/src/struct` 源码中消除 `as unknown as` 双重断言，同时保持对外 `StructLike` / `StructLike` 类型面不暴露 runtime metadata。

**架构：** public constructor 继续接受 `StructLike`，保证外部 API 不变；constructor 是 public struct 进入 runtime AST 的边界，负责校验并把子 struct 存成 `RuntimeStruct`。parse / encode / codec 等 runtime consumer 只面对 `RuntimeStruct`，不再散落 `as unknown as RuntimeStruct` 或 fake resolve helper；确实需要跨越 TypeScript 推导边界时，只允许单层 `as`，并把它限制在 constructor/public API 边界。

**技术栈：** TypeScript、Vitest type tests、Vitest runtime tests、`tsgo`、`tsdown`、pnpm。

---

## 设计决策

不要把 `[DEFINITION]` 加到 public `StructLike` 上。这样虽然会少很多 cast，但会把 runtime metadata 暴露到 public type surface，破坏当前 struct 对外只暴露推导信息和链式方法的边界。

更合适的边界是：

```ts
// public surface：保持不变
export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly [TYPES]: StructTypes<I, O, OO>
  readonly _struct: StructTypes<I, O, OO>
}

// internal runtime surface：内部才持有 metadata
export type RuntimeStruct = {
  readonly [DEFINITION]: StructDefinition
  readonly [TYPES]: StructTypes<unknown, unknown, boolean>
  readonly _struct: StructTypes<unknown, unknown, boolean>
  null(): RuntimeStruct
  nullish(): RuntimeStruct
  optional(): RuntimeStruct
  tag(...options: FieldTagOption[]): RuntimeStruct
}
```

为避免样板类型泛滥，只新增两个内部别名：

```ts
export type RuntimeStructList = readonly [RuntimeStruct, ...RuntimeStruct[]]
export type RuntimeObjectShape = { [key: string]: RuntimeStruct }
```

再加一个 constructor 层共享 helper。注意这个 helper 也不使用 `as unknown as`：

```ts
function toRuntimeStructList(
  structs: readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
  label: string,
): RuntimeStructList {
  const [first, ...rest] = structs
  assertStruct(first, label)
  const output: RuntimeStructList = [first]
  for (const struct of rest) {
    assertStruct(struct, label)
    output.push(struct)
  }
  return output
}
```

这个 helper 通过先取 `first` 来建立 non-empty tuple，不需要 tuple cast。后续如果遇到 TypeScript 无法证明的 generic output 类型，优先改成单层 `as SomeType`；不得新增 `as unknown as SomeType`。

## 文件范围

- 修改：`packages/core/src/struct/types.ts`
  - 新增 `RuntimeStructList`、`RuntimeObjectShape`。
  - 把 internal definition child fields 从 `StructLike` 改成 `RuntimeStruct`。
- 修改：`packages/core/src/struct/guards.ts`
  - 新增 internal `isRuntimeStruct`。
  - 保持 public `isStruct` 行为不变。
- 修改：`packages/core/src/struct/shape.ts`
  - 删除 `resolveRuntimeStruct`。
  - `assertStruct` 改为收窄到 `RuntimeStruct`。
  - `resolveObjectShape` 返回 `RuntimeObjectShape`。
- 修改：`packages/core/src/struct/constructors.ts`
  - constructor 边界存 runtime child struct。
  - 新增 `toRuntimeStructList`。
- 修改：`packages/core/src/struct/introspection.ts`
  - 删除 `resolveRuntimeStruct` 用法。
  - public entry 用 `assertStruct` / `isRuntimeStruct` 收窄。
- 修改：`packages/core/src/struct/encode.ts`
  - 删除 definition child access 上的 runtime casts。
- 修改：`packages/core/src/struct/parse.ts`
  - 删除 definition child access 上的 runtime casts。
- 修改：`packages/core/src/struct/codec/common.ts`
  - tagged encode/decode 递归 helper 内部改用 `RuntimeStruct`。
- 修改：`packages/core/src/struct/utils.ts`
  - `isObjectIntersectionStruct` 直接接受 `RuntimeStruct`。
- 修改：`packages/core/src/struct/types.runtime.type.test.ts`
  - 锁定 `RuntimeStruct` 不进入 public API。

---

### Task 1：锁定 public API 边界

**文件：**

- 修改：`packages/core/src/struct/types.runtime.type.test.ts`

- [ ] **Step 1：添加 public API 类型边界测试**

在已有 forbidden public type imports 附近加入：

```ts
// @ts-expect-error RuntimeStruct is internal runtime metadata, not public struct API.
import type { RuntimeStruct } from './index'
```

在已有 missing type alias 附近加入：

```ts
export type MissingRuntimeStruct = RuntimeStruct
```

- [ ] **Step 2：运行类型边界测试**

运行：

```bash
pnpm --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/struct/types.runtime.type.test.ts"
```

预期：

```text
Test Files  1 passed (1)
Type Errors  no errors
```

这是 characterization test，用于锁定当前 public API 边界。重构前后都应该通过。

---

### Task 2：把内部 child struct 建模为 RuntimeStruct

**文件：**

- 修改：`packages/core/src/struct/types.ts`

- [ ] **Step 1：新增内部 runtime 别名**

在 `RuntimeStruct` 附近加入：

```ts
export type RuntimeStructList = readonly [RuntimeStruct, ...RuntimeStruct[]]

export type RuntimeObjectShape = { [key: string]: RuntimeStruct }
```

- [ ] **Step 2：修改内部 definition child fields**

把相关 definition 改成：

```ts
export type ArrayDefinition = BaseDefinition & {
  kind: 'array'
  item: RuntimeStruct
}

export type ObjectDefinition = BaseDefinition & {
  cache: WeakMap<RuntimeStruct, RuntimeObjectShape>
  kind: 'object'
  shape: ObjectShape
}

export type RequestBodyDefinition = BaseDefinition & {
  codec: RequestBodyCodec
  kind: 'requestBody'
  struct: RuntimeStruct
}

export type RequestDefinition = BaseDefinition & {
  body?: RuntimeStruct
  headers?: RuntimeStruct
  kind: 'request'
  path?: RuntimeStruct
  query?: RuntimeStruct
}

export type RecordDefinition = BaseDefinition & {
  kind: 'record'
  value: RuntimeStruct
}

export type TupleDefinition = BaseDefinition & {
  kind: 'tuple'
  items: RuntimeStructList
}

export type UnionDefinition = BaseDefinition & {
  kind: 'or'
  options: RuntimeStructList
}

export type DiscriminatedUnionDefinition = BaseDefinition & {
  kind: 'discriminatedUnion'
  discriminator: string
  expected: string
  map: Map<unknown, RuntimeStruct>
  options: RuntimeStructList
}

export type IntersectionDefinition = BaseDefinition & {
  kind: 'intersection'
  left: RuntimeStruct
  right: RuntimeStruct
}
```

- [ ] **Step 3：运行 typecheck，确认进入 red phase**

运行：

```bash
pnpm --filter @defjs/core typecheck
```

预期：出现 constructor / shape / introspection 等位置的类型错误，因为这些位置还在把 `StructLike` 塞进 `RuntimeStruct` 字段。

---

### Task 3：用 runtime guard 替换 fake resolve

**文件：**

- 修改：`packages/core/src/struct/guards.ts`
- 修改：`packages/core/src/struct/shape.ts`

- [ ] **Step 1：新增 internal runtime guard**

把 `packages/core/src/struct/guards.ts` 改成：

```ts
import { DEFINITION } from './symbols'
import type { AnyStruct, RuntimeStruct } from './types'

export function isRuntimeStruct(value: unknown): value is RuntimeStruct {
  return typeof value === 'object' && value !== null && DEFINITION in value
}

export function isStruct(value: unknown): value is AnyStruct {
  return isRuntimeStruct(value)
}
```

- [ ] **Step 2：删除 `resolveRuntimeStruct`，让 `assertStruct` 收窄到 RuntimeStruct**

把 `packages/core/src/struct/shape.ts` 调整为：

```ts
import { isRuntimeStruct } from './guards'
import type { ObjectDefinition, ObjectShape, RuntimeObjectShape, RuntimeStruct } from './types'

export function resolveObjectShape(struct: RuntimeStruct, definition: ObjectDefinition): RuntimeObjectShape {
  const cached = definition.cache.get(struct)
  if (cached) {
    return cached
  }

  const rawShape = readObjectShape(definition.shape)
  const runtimeShape: { [key: string]: RuntimeStruct } = Object.create(null)
  for (const [key, value] of Object.entries(rawShape)) {
    assertStruct(value, `object field "${key}"`)
    runtimeShape[key] = value
  }

  definition.cache.set(struct, runtimeShape)
  return runtimeShape
}

export function readObjectShape(shape: ObjectShape): { [key: string]: unknown } {
  const output: { [key: string]: unknown } = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value
    output[key] = value
  }

  return output
}

export function assertStruct(value: unknown, label: string): asserts value is RuntimeStruct {
  if (!isRuntimeStruct(value)) {
    throw new TypeError(`${label} must be a struct`)
  }
}
```

- [ ] **Step 3：运行 typecheck，看剩余错误**

运行：

```bash
pnpm --filter @defjs/core typecheck
```

预期：`shape.ts` 不再是主要错误来源；剩余错误集中在 constructors / introspection / codec 消费端。

---

### Task 4：constructor 统一存 RuntimeStruct

**文件：**

- 修改：`packages/core/src/struct/constructors.ts`

- [ ] **Step 1：补充类型 import**

确保 type import 包含：

```ts
import type {
  ArrayStruct,
  DiscriminatedUnionStruct,
  IntersectionOutput,
  LiteralValue,
  NumberStruct,
  ObjectStruct,
  ObjectShape,
  RecordStruct,
  RequestBodyCodec,
  RequestBodyStruct,
  RequestStruct,
  RequestShape,
  RuntimeStruct,
  RuntimeStructList,
  Struct,
  StructLike,
  StringStruct,
  TupleStruct,
  UnionStruct,
} from './types'
```

- [ ] **Step 2：新增共享 list conversion helper**

放在 `snapshotObjectShape` 附近：

```ts
function toRuntimeStructList(
  structs: readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
  label: string,
): RuntimeStructList {
  const [first, ...rest] = structs
  assertStruct(first, label)
  const output: RuntimeStructList = [first]
  for (const struct of rest) {
    assertStruct(struct, label)
    output.push(struct)
  }
  return output
}
```

- [ ] **Step 3：更新单 child constructor**

`createArrayStruct`：

```ts
export function createArrayStruct<S extends StructLike<unknown, unknown, boolean>>(item: S): ArrayStruct<S> {
  assertStruct(item, 'array item')

  return castStruct<ArrayStruct<S>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      item,
      kind: 'array',
    }),
  )
}
```

`createRecordStruct`：

```ts
export function createRecordStruct<S extends StructLike<unknown, unknown, boolean>>(value: S): RecordStruct<S> {
  assertStruct(value, 'record value')

  return castStruct<RecordStruct<S>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'record',
      value,
    }),
  )
}
```

- [ ] **Step 4：更新 tuple / union constructor**

`createTupleStruct`：

```ts
export function createTupleStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(items: T): TupleStruct<T> {
  const tupleItems = toRuntimeStructList(items, 'tuple item')

  return castStruct<TupleStruct<T>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      items: tupleItems,
      kind: 'tuple',
    }),
  )
}
```

`createUnionStruct`：

```ts
export function createUnionStruct<
  const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]],
>(options: T): UnionStruct<T> {
  const unionOptions = toRuntimeStructList(options, 'or option')

  return castStruct<UnionStruct<T>>(
    makeStruct({
      flags: DEFAULT_FLAGS,
      kind: 'or',
      options: unionOptions,
    }),
  )
}
```

- [ ] **Step 5：更新 discriminated union constructor**

替换 setup / loop 部分：

```ts
const unionOptions = toRuntimeStructList(options, 'discriminatedUnion option')
const map = new Map<unknown, RuntimeStruct>()
const values: unknown[] = []

for (const option of unionOptions) {
  const optionDef = option[DEFINITION]
  /* istanbul ignore next -- type-safe: createDiscriminatedUnionStruct only accepts ObjectStruct */
  if (optionDef.kind !== 'object') {
    throw new TypeError('discriminatedUnion options must be object structs')
  }
  const fieldStruct = optionDef.shape[discriminator]
  if (!fieldStruct) {
    throw new TypeError(`discriminatedUnion option missing discriminator field "${discriminator}"`)
  }
  assertStruct(fieldStruct, `discriminatedUnion option discriminator "${discriminator}"`)
  const fieldDef = fieldStruct[DEFINITION]
  /* istanbul ignore next -- type-safe: discriminator is checked at compile time */
  if (fieldDef.kind !== 'literal') {
    throw new TypeError(`discriminatedUnion option discriminator "${discriminator}" must be a literal struct`)
  }
  if (map.has(fieldDef.value)) {
    throw new TypeError(`discriminatedUnion duplicate discriminator value: ${JSON.stringify(fieldDef.value)}`)
  }
  map.set(fieldDef.value, option)
  values.push(fieldDef.value)
}
```

- [ ] **Step 6：更新 intersection constructor**

保留空参数 guard，后续替换为：

```ts
const items = toRuntimeStructList(structs, 'intersection item')

let current = items[0]
for (const right of items.slice(1)) {
  current = makeStruct({
    flags: DEFAULT_FLAGS,
    kind: 'intersection',
    left: current,
    right,
  })
}

return castStruct<Struct<unknown, IntersectionOutput<T>>>(current)
```

- [ ] **Step 7：运行 constructor 聚焦测试**

运行：

```bash
pnpm --filter @defjs/core exec vitest run --config vitest.config.node.ts src/struct/constructors.primitives.spec.ts src/struct/constructors.discriminated_union.spec.ts
```

预期：

```text
Test Files  2 passed (2)
```

---

### Task 5：清理 runtime consumer 里的 cast

**文件：**

- 修改：`packages/core/src/struct/introspection.ts`
- 修改：`packages/core/src/struct/encode.ts`
- 修改：`packages/core/src/struct/parse.ts`
- 修改：`packages/core/src/struct/codec/common.ts`
- 修改：`packages/core/src/struct/utils.ts`

- [ ] **Step 1：更新 introspection public entry**

删除 `resolveRuntimeStruct` import。核心函数改成：

```ts
export function getFieldTags(field: StructLike<unknown, unknown, boolean>, fieldKey: string): ReadonlyMap<symbol, FieldTag> {
  assertStruct(field, 'field')
  const definition = field[DEFINITION]
  return materializeFieldTags(fieldKey, definition.tagOptions ?? [])
}

export function isObjectStruct(value: unknown): value is ObjectStruct<ObjectShape> {
  return isRuntimeStruct(value) && value[DEFINITION].kind === 'object'
}

export function getStructFields(struct: StructLike<unknown, unknown, boolean>): readonly StructField[] {
  assertStruct(struct, 'struct')
  const definition = struct[DEFINITION]
  if (definition.kind !== 'object') {
    throw new TypeError('object struct is required')
  }

  const shape = resolveObjectShape(struct, definition)
  return Object.entries(shape).map(([key, field]) => ({
    key,
    struct: field,
    tags: getFieldTags(field, key),
  }))
}

export function encodeStructValue(struct: StructLike<unknown, unknown, boolean>, value: unknown): unknown {
  assertStruct(struct, 'struct')
  return encodeValue(struct, value)
}

export function parseStructTuple<S extends StructLike<unknown, unknown, boolean>>(
  struct: S,
  value: unknown,
): ParseTuple<S['_struct']['output']> {
  assertStruct(struct, 'struct')
  const result = parseValue(struct, value, [], 'value')
  if (result.ok) {
    return [null, result.value as S['_struct']['output']]
  }
  return [new StructError(result.issues), safeZeroValue(struct) as S['_struct']['output']]
}
```

- [ ] **Step 2：更新 encode intersection 和 match 逻辑**

`encodeValue` 的 intersection 分支：

```ts
case 'intersection': {
  const leftEncoded = encodeValue(definition.left, value, options)
  const rightEncoded = encodeValue(definition.right, value, options)
  return isObjectIntersectionStruct(definition.left) &&
    isObjectIntersectionStruct(definition.right) &&
    isPlainObject(leftEncoded) &&
    isPlainObject(rightEncoded)
    ? { ...leftEncoded, ...rightEncoded }
    : rightEncoded
}
```

`matchesDefinition` 的 intersection 分支：

```ts
case 'intersection':
  return (
    matchesDefinition(definition.left[DEFINITION], value, definition.left) &&
    matchesDefinition(definition.right[DEFINITION], value, definition.right)
  )
```

然后清理 array / tuple / record / request body / union / object field child access 上多余的 `as unknown as RuntimeStruct`。

- [ ] **Step 3：更新 parse child access**

把 child struct 直接传入：

```ts
const result = parseValue(definition.item, input[index], [...path, index], 'value')
const result = parseValue(definition.value, value, [...path, key], 'field')
const leftResult = parseValue(definition.left, input, path, 'value')
const rightResult = parseValue(definition.right, input, path, 'value')
```

request section assembly 直接使用 runtime fields：

```ts
if (definition.path) {
  sections.push(['path', definition.path])
}
if (definition.query) {
  sections.push(['query', definition.query])
}
if (definition.headers) {
  sections.push(['headers', definition.headers])
}
if (definition.body) {
  sections.push(['body', definition.body])
}
```

- [ ] **Step 4：更新 tagged codec helper**

public entry 先 assert，递归 helper 内部接收 `RuntimeStruct`：

```ts
function decodeTaggedField(
  struct: RuntimeStruct,
  value: unknown,
  path: Path,
): unknown {
  const definition = struct[DEFINITION]
  // 保留现有 switch 逻辑
}
```

`decodeObjectByAlias` 的 public entry 形状：

```ts
export function decodeObjectByAlias(
  struct: StructLike<unknown, unknown, boolean>,
  value: unknown,
  label = 'json',
): unknown {
  assertStruct(struct, 'struct')
  if (struct[DEFINITION].kind !== 'object') {
    return parseStructValue(struct, decodeTaggedField(struct, value, []))
  }
```

  return parseStructValue(struct, normalizeObjectByAlias(struct, value, label, []))
}
```

- [ ] **Step 5：更新 `isObjectIntersectionStruct`**

```ts
export function isObjectIntersectionStruct(struct: RuntimeStruct): boolean {
  const definition = struct[DEFINITION]
  if (definition.kind === 'object') {
    return true
  }
  if (definition.kind === 'intersection') {
    return isObjectIntersectionStruct(definition.left) && isObjectIntersectionStruct(definition.right)
  }
  return false
}
```

- [ ] **Step 6：清理测试里的双重断言**

如果 `constructors.primitives.spec.ts` 里仍用双重断言调用空参数 intersection：

```ts
expect(() => (struct.intersection as unknown as (...structs: unknown[]) => unknown)()).toThrow(
  new TypeError('intersection requires at least one struct'),
)
```

改成不需要断言的 `Reflect.apply`：

```ts
expect(() => Reflect.apply(struct.intersection, undefined, [])).toThrow(new TypeError('intersection requires at least one struct'))
```

如果其他 spec 里为了构造非法输入使用 `as unknown as`，优先改成 `Reflect.apply(...)`、`unknown` 临时变量、或单层明确断言。不要新增双重断言。

- [ ] **Step 7：确认 fake resolve 和双重断言已删除**

运行：

```bash
rg -n "resolveRuntimeStruct|as unknown as" packages/core/src/struct
```

预期：

```text
没有 resolveRuntimeStruct 命中。
packages/core/src/struct 源码里没有 as unknown as。
```

如果仍有命中，先列出每一处命中原因；只有在证明它不属于 `packages/core/src/struct` 当前重构边界时，才允许保留到后续任务。

---

### Task 6：结构化验证

**文件：**

- 不修改源文件。

- [ ] **Step 1：运行 struct 聚焦 runtime tests**

运行：

```bash
pnpm --filter @defjs/core exec vitest run --config vitest.config.node.ts \
  src/struct/encode.spec.ts \
  src/struct/codec/json.spec.ts \
  src/struct/constructors.primitives.spec.ts \
  src/struct/constructors.discriminated_union.spec.ts \
  src/struct/parse.spec.ts \
  src/struct/parse.security.spec.ts
```

预期：

```text
Test Files  6 passed (6)
```

- [ ] **Step 2：运行 core type tests**

运行：

```bash
pnpm --filter @defjs/core test:type
```

预期：

```text
Test Files  9 passed (9)
Type Errors  no errors
```

- [ ] **Step 3：运行 core typecheck**

运行：

```bash
pnpm --filter @defjs/core typecheck
```

预期：命令 exit code 为 0。

---

### Task 7：完整验证

**文件：**

- 不修改源文件。

- [ ] **Step 1：运行完整 core tests**

运行：

```bash
pnpm --filter @defjs/core test
```

预期：

```text
Test Files  66 passed (66)
Type Errors  no errors
Coverage summary: 100%
```

- [ ] **Step 2：运行 build no-emit**

运行：

```bash
pnpm --filter @defjs/core exec tsgo --project tsconfig.build.json --noEmit
```

预期：exit code 为 0。

- [ ] **Step 3：运行 package build**

运行：

```bash
pnpm --filter @defjs/core build
```

预期：

```text
Build complete
```

- [ ] **Step 4：运行 diff whitespace check**

运行：

```bash
git diff --check
```

预期：无输出，exit code 为 0。

---

## 自检

- 需求覆盖：本计划删除 `resolveRuntimeStruct()`，避免 public metadata 泄漏，支持当前 variadic `struct.intersection`，并保持 parse / encode / codec 行为不变。
- 样板控制：只新增两个内部类型别名和一个 list helper；不为每种 struct 写独立 helper 类型。
- 类型一致性：public constructor 仍基于 `StructLike` 推导；internal definition 统一保存 `RuntimeStruct`；`RuntimeObjectShape` 只在 object getter shape materialize 后使用。
- 风险边界：不修改 parse 零值设计，不修改 bigint 设计，不修改 public `StructLike` surface。
