# Core Type Unsafety Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 `packages/core` 实际运行行为的前提下，修复、收敛或明确标注 core 中的类型不安全边界，并保护当前依赖 TypeScript 推理的特殊写法。

**Architecture:** 本计划把“类型层修复”和“运行时行为变化”严格分层：普通类型边界优先使用类型注解、类型测试、erased assertion、`import type`、注释和测试类型辅助；但 `!` 非空断言 / definite assignment assertion 不能因为“零 JS diff”而默认保留，必须优先用条件分支判断或初始化数据消除。任何会改变可观察运行行为的修复都禁止；`!` 清理若产生局部 JS diff，必须证明该 diff 只表达已成立的不变量，不改变成功路径、错误路径、时序或公开 API。

**Tech Stack:** TypeScript 6 / tsgo, pnpm 11, Vitest runtime tests, Vitest `--typecheck.only` type tests, Oxlint/Oxfmt, tsdown.

## Global Constraints

- **硬约束：不得为了修正类型而改变 `packages/core` 生产运行时代码行为。**
- 生产源码改动默认必须满足“构建产物等价”检查：改动前后 `packages/core/dist` 的 JS 输出应保持一致；如果 JS diff 非空，停止并说明原因，不继续扩大修改。
- `!` 非空断言和 definite assignment assertion 是例外中的重点治理对象：不能只因为删除它会产生 JS diff 就保留；必须先尝试用条件分支判断、早返回/抛错、局部初始化数据、状态对象初始化或更精确的类型建模消除。
- `!` 清理允许产生最小 JS diff，但必须证明不改变可观察行为：成功路径返回值不变、错误类型/错误消息不变、序列化输出不变、Promise/queue/abort 时序不变、公开 API 不变。无法证明时停止并单独汇报。
- 只有在“没有任何可表达方式”或“需求必须依赖该断言表示 TypeScript 无法表达的不变量”时，才允许保留 `!`；保留处必须写明为什么条件分支或初始化数据不可行。
- 允许的生产源码改动类型：类型注解、类型别名、`import type`、接口/类型定义调整、`as` 目标类型调整、`as unknown as` 收敛为直接 assertion、`as unknown` 标注 JSON 边界、注释、用于移除 `!` 的最小条件分支或初始化重写。
- 禁止的生产源码改动类型：无关运行时函数调用、改变既有 `switch` 业务分支、改变对象对外字段、改变错误类型/错误消息、改变序列化结果、改变默认值、改变 promise/queue/abort 时序。
- 不新增依赖。
- 不机械删除 `as const` 和 `satisfies`；它们是字面量保持与推理锚点。
- 不机械删除 `*.type.test.ts` 中的 `@ts-expect-error`；负向 public API 测试应继续用 TypeScript 证明错误调用无法通过。
- 不把 `AnyStruct = Struct<any, any, boolean>`、`createAnyStruct(): Struct<unknown, any>`、`ObjectShape = { [key: string]: any }` 直接改成 `unknown`；这些是当前 `struct.any()` 与对象 shape 推理边界。
- 不破坏 Go `encoding/json` 对齐语义：缺字段填零值、partial input、`.optional()` 输出可省、`.nullable()` 输出可为 `null`。
- 不改宽 public builder 推理：`defineRequest`、`defineEventStream`、`defineWebSocket`、`Client.execute()`、`RequestBuildInput<TInput>` 的调用点推理必须保持。
- 不提交 commit，除非用户明确要求提交。若用户授权提交，每个任务独立提交。

---

## Source Audit Baseline

本计划基于：

- 审查清单：`docs/superpowers/plans/2026-06-18-core-type-unsafety-audit.md`
- Scope：`packages/core/src/**/*.ts`、`packages/core/test/**/*.ts`、`packages/core/tsdown.config.ts`、`packages/core/vitest.config*.ts`
- 排除：`packages/core/dist/**`
- 扫描基线：171 个 TypeScript 文件，514 条 inventory 行，其中 500 条需要清理或复核，14 条是明确保护的 `as const` / `satisfies` 推理锚点。

---

## Runtime-Impact Classification

| 类别                       | 允许进入本计划          | 类型方式                                                      | 实现方式                               | 实际影响                                             |
| -------------------------- | ----------------------- | ------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------- |
| Type-only lock             | 是                      | `expectTypeOf` / 条件类型断言 / `@ts-expect-error`            | 修改 `*.type.test.ts`                  | 不进入生产 JS；只增强类型回归保护                    |
| Erased assertion cleanup   | 是                      | `as unknown`、`as RuntimeStruct`、删除多余 `unknown` 跳板     | 修改 TypeScript assertion 文本         | TypeScript 编译后擦除；生产 JS 应等价                |
| Type alias narrowing       | 是                      | 更窄的 `type` / `interface` / `import type`                   | 修改类型声明                           | 可能影响消费者类型；不影响运行时                     |
| `!` assertion removal      | 是，优先级高            | 条件分支收窄、初始化数据、状态对象建模                        | 最小化改写 `let x!`、`value!` 等断言点 | 可能产生 JS diff；必须证明可观察行为不变             |
| Commented boundary         | 仅在无解/需求必须时允许 | 保留不可避免 assertion，并写明原因                            | 只加注释或移动注释                     | 不影响运行时，但必须解释为什么不能用判断或初始化替代 |
| Test-only mock typing      | 有条件允许              | 给 mock 加类型签名或测试 helper                               | 修改测试代码                           | 不影响生产运行时；会影响测试运行代码，需跑测试       |
| Runtime helper / guard     | 本计划禁止              | 例如 `toRuntimeStruct()`、`parseJsonUnknown()` 被生产路径调用 | 新增函数调用或分支                     | 会改变 JS 输出或执行路径；需另开计划审批             |
| Runtime behavior hardening | 本计划禁止              | 新增验证、抛错、默认值、默认分支                              | 改变控制流                             | 可能改变用户可见行为；不在本计划内                   |

---

## `!` Assertion Removal Contract

`!` 包含两类必须治理的写法：

- 非空断言：`value!`
- definite assignment assertion：`let resolve!: ...`、`class field!: ...`

处理顺序固定如下：

1. **先用初始化数据规避。** 如果变量在创建时就能有合法初值，直接初始化，不允许先声明再用 `!`。
2. **再用条件分支判断。** 如果值可能为空或尚未赋值，使用 `if` 分支、早返回或保持既有错误语义的 `throw` 来收窄类型。
3. **再用更精确的状态建模。** 例如把“未初始化/已初始化”拆成 discriminated union，或把 builder/deferred 状态放入一个对象并在返回前检查。
4. **最后才考虑保留。** 只有 TypeScript 无法表达同步初始化不变量，且条件分支/初始化会引入错误语义、时序或 API 变化时，才允许保留 `!`。保留必须写注释解释“为什么没有任何更安全写法”。

禁止理由：

- “这是常见写法”不是保留理由。
- “改了会有 JS diff”不是保留理由；`!` 本来就是类型系统盲点，清理它允许最小 JS diff。
- “测试现在能过”不是保留理由；需要证明不存在可表达的初始化或分支收窄。

当前审查基线中 `!` 断言只有 4 处，均为 definite assignment assertion：

```text
packages/core/src/sse/transport/event_stream.ts:413: let resolve!: Deferred<T>['resolve']
packages/core/src/sse/transport/event_stream.ts:414: let reject!: Deferred<T>['reject']
packages/core/src/web_socket/web_socket.ts:703: let resolve!: Deferred<T>['resolve']
packages/core/src/web_socket/web_socket.ts:704: let reject!: Deferred<T>['reject']
```

这些点必须优先尝试删除；不能只加注释作为完成状态。

---

## Type Inference Preservation Contract

这些约束优先级高于“减少 assertion 数量”。如果某个 cleanup 会破坏以下推理，保留 assertion 并标记为 intentional type boundary。

```ts
export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly [TYPES]: StructTypes<I, O, OO>
  readonly _struct: StructTypes<I, O, OO>
}
```

必须保持行为稳定：

- `Infer<T>`
- `FieldOutput<S>`
- `ObjectInput<T>`
- `ObjectOutput<T>`
- `TupleOutput<T>`
- `UnionOutput<T>`
- `RequestInput<T>`
- `RequestOutput<T>`
- `EndpointInput<T>`
- `ParsedInput<T>`
- `RequestBuildInput<TInput>`
- `Client['execute']`

必须保护的写法：

- `as const`：用于 tuple、enum、literal、test matrix 的字面量保持。
- `satisfies`：用于不改变推理的结构约束。
- `@ts-expect-error`：用于负向 public API 类型测试。
- `struct.any()` 的 `any` 输出：表示“无静态保证”，不是待修 bug。
- `ObjectShape = { [key: string]: any }`：目前是对象 shape 推理边界，不能未验证替换。

---

## File Structure Map

### 只允许 type-only / erased cleanup 的生产源码

- Modify: `packages/core/src/struct/types.ts` — 增强或注释类型边界；不改变 `AnyStruct` / `ObjectShape` 语义。
- Modify: `packages/core/src/struct/runtime.ts` — 保持 `castStruct()` 作为唯一 struct construction boundary；不新增运行时 `toRuntimeStruct()` helper。
- Modify: `packages/core/src/struct/constructors.ts` — 只做 erased assertion 文本调整或注释；不改变 struct definition 对象字段。
- Modify: `packages/core/src/struct/parse.ts` — 只做 erased assertion 文本调整或注释；不改变 parse 分支、zero value、issue 生成。
- Modify: `packages/core/src/struct/encode.ts` — 只做 erased assertion 文本调整或注释；不改变 union/encode 分支。
- Modify: `packages/core/src/struct/shape.ts` — 只做 erased assertion 文本调整或注释；不改变 descriptor 读取逻辑。
- Modify: `packages/core/src/struct/introspection.ts` — 只做 erased assertion 文本调整或注释；不改变 `[error, value]` tuple 语义。
- Modify: `packages/core/src/struct/codec/common.ts` and `packages/core/src/struct/codec/query.ts` — 只做 erased assertion 文本调整或注释；不改变 wire key 与 codec 输出。
- Modify: `packages/core/src/internal/context.ts` — 把 `Function` 类型换成更窄 type alias；JS 输出应等价。
- Modify: `packages/core/src/{handler,http,sse,web_socket}/**/*.ts` JSON boundary — 只在返回处加 `as unknown` 或改返回类型；不改变 parse/catch 行为。
- Modify: `packages/core/tsdown.config.ts` — 只调整 `JSON.parse` 的类型标注；不改变 package rewrite 输出。

### 测试代码，可做 test-only typing cleanup

- Modify: `packages/core/test/shared.ts` — 可加入测试 mock 类型辅助；不得被生产源码 import。
- Modify: `packages/core/src/**/*.spec.ts` and `packages/core/src/**/*.browser.spec.ts` — 替换部分 test-only 双重断言；测试行为必须通过 runtime specs 验证。
- Preserve: `packages/core/src/**/*.type.test.ts` — 负向 `@ts-expect-error` 默认保留，除非它测试的是已删除 API。

### 需要谨慎处理的生产行为点

- `createDeferred()` 中的 `let resolve!` / `let reject!`：这是当前唯一的 `!` 断言来源，必须优先清理。允许采用条件分支或初始化对象建模来删除 `!`，但不得改变 Promise executor 同步赋值语义、resolve/reject 调用时序或错误路径。
- `request_builder.ts` 中新增 runtime guard：会改变错误时机或错误消息。本计划不新增 guard；只允许 type-only 边界整理。
- `JSON.parse` 增加 struct guard：可能改变错误传播路径。本计划只把返回类型标成 `unknown`，不新增验证。

---

## Task 1: 建立零运行时变更验证门

**Files:**

- No source file modification in this task.

**Interfaces:**

- Consumes: current `packages/core` build output.
- Produces: `/tmp/zen-kit-core-dist-before` baseline used by later tasks.

- [ ] **Step 1: 确认工作树干净或只包含本计划文件。**

Run:

```bash
git status --short
```

Expected: 若已有用户改动，记录路径并不要覆盖；若只有计划文件变更，可以继续。

- [ ] **Step 2: 生成 core 当前构建产物基线。**

Run:

```bash
rm -rf /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
pnpm --filter @defjs/core build
cp -R packages/core/dist /tmp/zen-kit-core-dist-before
```

Expected: build exits 0 and `/tmp/zen-kit-core-dist-before` exists.

- [ ] **Step 3: 为后续每个生产源码任务使用同一检查。**

Run after each task touching `packages/core/src` or `packages/core/tsdown.config.ts`:

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: `diff` 输出为空。若非空，说明改动影响生产 JS 输出；停止并撤销该任务改动，除非用户明确批准 runtime change。唯一例外是专门清理 `!` 的任务：该任务允许 JS diff，但 diff 必须只局限于去除 `!` 所需的初始化/条件分支，并且必须用 focused tests 证明成功路径、错误路径和时序不变。

---

## Task 2: 锁住类型推理矩阵

**Files:**

- Modify: `packages/core/src/struct/types.runtime.type.test.ts`
- Modify: `packages/core/src/internal/request_builder.type.test.ts`
- Modify: `packages/core/src/http/http.type.test.ts`
- Modify: `packages/core/src/sse/sse.type.test.ts`
- Modify: `packages/core/src/web_socket/web_socket.type.test.ts`
- Modify: `packages/core/src/client/client.type.test.ts`

**Interfaces:**

- Consumes: current public API types.
- Produces: type-only regression matrix; no production JS impact.

**Type approach:** 使用 `expectTypeOf`、`StrictEqual`、`IsAny` 和直接 `@ts-expect-error` 表达式锁定推理。

**Implementation approach:** 只改 `*.type.test.ts`；不改生产源码。

**Actual impact:** 不影响运行时代码；Vitest typecheck 会捕获推理退化。

- [ ] **Step 1: 在 `packages/core/src/struct/types.runtime.type.test.ts` 增加 tuple、any、request shape 推理断言。**

Add near existing type cases:

```ts
const tuple = struct.tuple([struct.literal('ok'), struct.number()] as const)
type TupleCase = Expect<StrictEqual<Infer<typeof tuple>, ['ok', number]>>

const anyStruct = struct.any()
type AnyCase = Expect<StrictEqual<IsAny<Infer<typeof anyStruct>>, true>>

const requestShape = struct.request({
  path: struct.object({ id: struct.number() }),
  query: struct.object({ q: struct.string().optional() }),
  body: struct.json(struct.object({ name: struct.string() })),
})
type RequestShapeCase = Expect<
  StrictEqual<
    Infer<typeof requestShape>,
    {
      path: { id: number }
      query: { q?: string }
      body: { name: string }
    }
  >
>
```

Update the final export:

```ts
export type Cases = AnyCase | AnyGuard | DateCase | MatrixCase | ProfileCase | RequestShapeCase | TupleCase | UnionCase
```

- [ ] **Step 2: 在 `packages/core/src/http/http.type.test.ts` 增加 `Client.execute()` HTTP 返回值推理断言。**

Add imports:

```ts
import { expectTypeOf } from 'vitest'
import { createClient } from '../client'
import type { HttpAwaitResult } from './http'
```

Add case:

```ts
const client = createClient()
expectTypeOf(client.execute(useGetUser({ id: 1 }))).toEqualTypeOf<Promise<HttpAwaitResult<{ name: string }, unknown>>>()

// @ts-expect-error required input must stay required
useGetUser()
```

- [ ] **Step 3: 在 `packages/core/src/internal/request_builder.type.test.ts` 保留现有负向测试，并增加 array map 正向输出。**

Add inside existing positive `buildRequest(...)` callback:

```ts
request.setJson({
  users: view.body.users.map((user) => ({
    id: user.id,
    label: user.name,
  })),
})
```

Expected: `user.id` remains `BuildOutput<number>` compatible with projection; `user.name` remains accessible; `user.missing` remains rejected by existing `@ts-expect-error`.

- [ ] **Step 4: 在 `packages/core/src/sse/sse.type.test.ts` 增加 event 推理断言。**

Add or preserve equivalent:

```ts
import { expectTypeOf } from 'vitest'
import { struct } from '../struct'
import { defineEventStream } from './sse'

const events = defineEventStream({
  path: '/events',
  events: {
    default: struct.string(),
    user: struct.object({ id: struct.string() }),
  },
})

expectTypeOf(events).toBeCallableWith()
```

- [ ] **Step 5: 在 `packages/core/src/web_socket/web_socket.type.test.ts` 增加 socket 推理断言。**

Add or preserve equivalent:

```ts
import { expectTypeOf } from 'vitest'
import { struct } from '../struct'
import { defineWebSocket } from './web_socket'

const socket = defineWebSocket({
  path: '/socket',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

expectTypeOf(socket).toBeCallableWith()
```

- [ ] **Step 6: Run type tests.**

```bash
pnpm --filter @defjs/core test:type
```

Expected: `Type Errors  no errors`.

---

## Task 3: 把 JSON.parse 边界标成 unknown，不改变 parse 行为

**Files:**

- Modify: `packages/core/src/handler/util.ts:31`
- Modify: `packages/core/src/http/transport/utils.ts:37`
- Modify: `packages/core/src/http/transport/fetch.ts:223`
- Modify: `packages/core/src/sse/sse.ts:364`
- Modify: `packages/core/src/web_socket/codec.ts:83`
- Modify: `packages/core/tsdown.config.ts:6`

**Interfaces:**

- Consumes: raw JSON strings.
- Produces: `unknown` typed parsed values, preserving existing runtime return values and thrown errors.

**Type approach:** `JSON.parse()` 的 lib 类型返回 `any`；在返回点用 `as unknown` 阻止 `any` 扩散。

**Implementation approach:** 不新增 `parseJsonUnknown()` 函数，因为生产路径新增函数调用会改变 JS 输出；只在现有 `return JSON.parse(...)` 表达式上加 erased assertion。

**Actual impact:** TypeScript 层阻断 `any`；编译后 JS 与原逻辑等价，`JSON.parse` 成功/失败行为不变。

- [ ] **Step 1: 修改 direct return JSON.parse。**

Use this exact pattern in each existing parse return:

```ts
return JSON.parse(text) as unknown
```

For `packages/core/src/http/transport/fetch.ts`, preserve empty-body behavior:

```ts
return text === '' ? null : (JSON.parse(text) as unknown)
```

For `packages/core/tsdown.config.ts`, keep mutable object typing:

```ts
const pkg = JSON.parse(raw) as unknown as Record<string, unknown>
```

Do not add runtime validation in this task.

- [ ] **Step 2: Run runtime tests for affected paths.**

```bash
pnpm --filter @defjs/core test -- src/handler src/http src/sse src/web_socket
```

Expected: all selected specs pass.

- [ ] **Step 3: Run no-runtime-change gate.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

---

## Task 4: 把 `Function` 边界改成窄函数类型

**Files:**

- Modify: `packages/core/src/internal/context.ts:1-15`
- Test: `packages/core/src/internal/context.spec.ts`

**Interfaces:**

- Consumes: `HttpContextToken<T>` runtime functions.
- Produces: narrower registry typing without changing `WeakSet` runtime behavior.

**Type approach:** 用 `(...args: never[]) => unknown` 表达“不可任意调用的函数值”，替代过宽 `Function`。

**Implementation approach:** 只改类型参数和 assertion 目标；JS 输出应等价。

**Actual impact:** 不改变 token registry 逻辑；`typeof value === 'function'` guard 和 `WeakSet.has` 行为不变。

- [ ] **Step 1: Replace top-level registry typing.**

Replace:

```ts
const contextTokenRegistry = new WeakSet<Function>()
```

With:

```ts
type ContextTokenRuntime = (...args: never[]) => unknown
const contextTokenRegistry = new WeakSet<ContextTokenRuntime>()
```

- [ ] **Step 2: Replace `Function` assertion target.**

Replace:

```ts
return typeof value === 'function' && contextTokenRegistry.has(value as Function)
```

With:

```ts
return typeof value === 'function' && contextTokenRegistry.has(value as ContextTokenRuntime)
```

- [ ] **Step 3: Run context tests and typecheck.**

```bash
pnpm --filter @defjs/core test -- src/internal/context.spec.ts
pnpm --filter @defjs/core typecheck
```

Expected: both commands pass.

- [ ] **Step 4: Run no-runtime-change gate.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

---

## Task 5: 收敛 struct runtime casts，但不新增运行时 helper

**Files:**

- Modify: `packages/core/src/struct/runtime.ts`
- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/parse.ts`
- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/shape.ts`
- Modify: `packages/core/src/struct/introspection.ts`
- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/query.ts`

**Interfaces:**

- Consumes: `StructLike<unknown, unknown, boolean>`, `RuntimeStruct`, `StructDefinition`.
- Produces: fewer anonymous double assertions; unavoidable boundaries are explicit and documented.

**Type approach:** 优先把 `as unknown as RuntimeStruct` 改成直接 `as RuntimeStruct`；如果 TypeScript 拒绝直接 assertion，保留 double assertion，但必须写明它保护的是“runtime struct object 与 public generic struct surface 同一表示”。

**Implementation approach:** 不新增 `toRuntimeStruct(struct)` 函数。函数调用不是 erased type change，会改变生产 JS；本计划禁止。

**Actual impact:** 只改变 TypeScript 类型文本或注释；生产 JS 应等价。

- [ ] **Step 1: 在 `packages/core/src/struct/runtime.ts` 强化现有 `castStruct()` 注释，不改变函数体。**

Keep body exactly:

```ts
return struct as TStruct
```

Allowed comment shape:

```ts
// Type boundary: struct runtime objects are produced by makeStruct/createPrimitiveStruct.
// Public generics exist only in the phantom _struct/[TYPES] surface and are erased at runtime.
```

- [ ] **Step 2: 在 `constructors.ts` 中保留 tuple/enum/union 的 const tuple boundary。**

Do not change these patterns unless type tests prove tuple inference is identical:

```ts
const enumValues = [...values] as unknown as T
const tupleItems = [...items] as unknown as T
const unionOptions = [...options] as unknown as T
```

Add a boundary comment if absent:

```ts
// Type boundary: copying preserves runtime immutability while the const generic preserves tuple inference.
```

- [ ] **Step 3: 在 `parse.ts` / `encode.ts` / `introspection.ts` 中把可直接 assertion 的 `as unknown as RuntimeStruct` 收敛为 `as RuntimeStruct`。**

Example allowed replacement:

```ts
parseValue(definition.item as RuntimeStruct, input[index], [...path, index], 'value')
```

Do not change any branch condition, return value, issue code, or zero-value construction.

- [ ] **Step 4: 在 `shape.ts` 保留 descriptor 读取逻辑，只调整类型边界注释。**

Current runtime logic must remain:

```ts
const output: { [key: string]: unknown } = Object.create(null)
const descriptors = Object.getOwnPropertyDescriptors(shape)
```

Allowed final return:

```ts
// Type boundary: each field is validated by resolveObjectShape()/assertStruct() before consumers use it.
return output as unknown as ObjectShape
```

Do not replace `Object.create(null)` with `{}`.

- [ ] **Step 5: Run struct tests and inference tests.**

```bash
pnpm --filter @defjs/core test -- src/struct
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass.

- [ ] **Step 6: Run no-runtime-change gate.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

---

## Task 6: 收敛 request builder 类型边界，不改变 materialization 行为

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts`
- Test: `packages/core/src/internal/request_builder.spec.ts`
- Test: `packages/core/src/internal/request_builder.type.test.ts`

**Interfaces:**

- Consumes: `RequestBuildInput<TInput>`, `BuildBoundRef<T>`, `BuildArrayProjection<T>`, `RequestBuildValue`, `RequestFormDataValue`.
- Produces: documented type boundaries around proxy build input and materialized values.

**Type approach:** 保留 `createTypedBuildInput()` 作为 proxy 类型边界；局部改 assertion 目标或添加注释，不新增 guard。

**Implementation approach:** 不新增 `isRequestBuildValue()`、`assertFormDataValue()` 或任何 runtime validation；这些会改变错误时机和 JS 输出。

**Actual impact:** 只改变 TypeScript 类型文本或注释；`build()` 输出、错误消息、序列化行为必须不变。

- [ ] **Step 1: 保持 `createTypedBuildInput()` 的 runtime 代码不变。**

Allowed comment:

```ts
// Type boundary: createBoundView builds a runtime proxy from the same struct that RequestBuildInput<TInput>
// uses for compile-time field projection. The assertion is erased and must stay localized here.
```

Keep the return expression runtime-equivalent:

```ts
return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
```

- [ ] **Step 2: 对 `materializeBuildPlan()` 中的 casts 只加注释或改 erased assertion。**

Examples that must not become runtime guards in this task:

```ts
materializeRecordProjection(step.projection, input, scope, 'formData', owner) as { [key: string]: RequestFormDataValue }
body as HttpRequest['body']
encoded as RequestBuildValue
```

- [ ] **Step 3: Run request builder runtime and type tests.**

```bash
pnpm --filter @defjs/core test -- src/internal/request_builder.spec.ts
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass.

- [ ] **Step 4: Run no-runtime-change gate.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

---

## Task 7: 收敛 command dispatch / endpoint builder 类型边界

**Files:**

- Modify: `packages/core/src/client/client.ts`
- Modify: `packages/core/src/http/http.ts`
- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Test: `packages/core/src/client/client.type.test.ts`
- Test: `packages/core/src/http/http.type.test.ts`
- Test: `packages/core/src/sse/sse.type.test.ts`
- Test: `packages/core/src/web_socket/web_socket.type.test.ts`

**Interfaces:**

- Consumes: `Command`, `HttpCommand`, `EventStreamCommand`, `WebSocketCommand`, endpoint command builders.
- Produces: documented, localized generic boundaries without public API widening.

**Type approach:** 保持 public overloads；对 implementation signature 中无法表达的泛型返回值使用局部 erased assertion。

**Implementation approach:** 不把 `Command = BaseCommand<string>` 改成运行时 tagged union；不新增 `isHttpCommand()` / `isSSECommand()` / `isWebSocketCommand()` runtime guard。只允许注释和 erased assertion cleanup。

**Actual impact:** `client.execute(...)` 的 runtime switch、执行函数调用和返回 Promise 行为不变。

- [ ] **Step 1: 保持 `Client` overload surface 不变。**

Do not remove this broad overload from `packages/core/src/client/resolve.ts`:

```ts
execute(command: Command, options?: unknown): Promise<unknown>
```

- [ ] **Step 2: 在 `packages/core/src/client/client.ts` 给 dispatch casts 加边界说明。**

Allowed comment before switch:

```ts
// Type boundary: command.kind is the runtime discriminator; generic payload types are restored by the public Client.execute overloads.
```

Keep switch behavior unchanged:

```ts
switch (command.kind) {
  case 'http':
    return executeHttpCommand(config, command as DispatchHttpCommand, options as HttpExecuteOptions)
  case 'event-stream':
    return executeEventStreamCommand(
      config,
      command as DispatchEventStreamCommand,
      options as EventStreamExecuteOptions,
    ) as Promise<unknown>
  case 'web-socket':
    return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions) as Promise<unknown>
}
```

- [ ] **Step 3: 保持 `defineRequest` / `defineEventStream` / `defineWebSocket` overloads 不变。**

Do not collapse overloads into one broad signature.

- [ ] **Step 4: Run command type and runtime tests.**

```bash
pnpm --filter @defjs/core test -- src/client src/http src/sse src/web_socket
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass.

- [ ] **Step 5: Run no-runtime-change gate.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

---

## Task 8: 测试 mock 类型化，仅限 test-only 影响

**Files:**

- Modify: `packages/core/test/shared.ts`
- Modify: test files from Appendix A with `as unknown as typeof fetch`, `as unknown as typeof WebSocket`, or runtime-negative `as never`.

**Interfaces:**

- Produces: test-only helpers; production code must not import them.

**Type approach:** 用 `Parameters<typeof fetch>`、`ReturnType<typeof fetch>`、测试专用 constructor 类型减少 mock 双重断言。

**Implementation approach:** 只触碰测试代码。若 helper 会改变 mock runtime shape，则必须确认对应 spec 仍覆盖原行为。

**Actual impact:** 不影响生产运行时代码；测试运行代码可能变化，因此必须跑完整 core tests。

- [ ] **Step 1: 在 `packages/core/test/shared.ts` 增加 typed fetch helper。**

Append:

```ts
export type FetchMock = typeof fetch

export function defineFetchMock(fetchMock: FetchMock): FetchMock {
  return fetchMock
}
```

This helper is intentionally test-only. It must not be imported by `packages/core/src/**/*.ts` production files.

- [ ] **Step 2: Replace simple fetch mock casts in specs.**

Replace this pattern:

```ts
const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
```

With:

```ts
const customFetch = defineFetchMock(vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch)
```

If this does not reduce assertion count for a specific mock, keep the original cast and add a comment explaining which `typeof fetch` structural member Vitest cannot model.

- [ ] **Step 3: Do not force WebSocket mocks to fully implement browser `WebSocket` if that adds runtime fields.**

Allowed classification comment:

```ts
// Test boundary: this mock only implements the WebSocket surface exercised by this spec.
```

Do not add methods solely to satisfy `typeof WebSocket` unless tests need those methods at runtime.

- [ ] **Step 4: Keep runtime-negative `as never` where replacing it would hide the invalid call being tested.**

Allowed classification comment:

```ts
// Test boundary: invalid runtime input; type system correctly rejects this in normal code.
```

- [ ] **Step 5: Run all core tests and typecheck.**

```bash
pnpm --filter @defjs/core test
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass.

---

## Task 9: Remove `!` definite assignment assertions from deferred helpers

**Files:**

- Modify: `packages/core/src/sse/transport/event_stream.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Test: `packages/core/src/sse/transport/event_stream.spec.ts`
- Test: `packages/core/src/web_socket/**/*.spec.ts`

**Interfaces:**

- Consumes: existing local `Deferred<T>` type and `createDeferred<T>()` helper in both files.
- Produces: `createDeferred<T>()` implementations with no `let resolve!` / `let reject!`.

**Type approach:** 用局部初始化状态表达 Promise executor 同步赋值后的不变量，而不是用 definite assignment assertion 欺骗类型系统。

**Implementation approach:** 优先使用初始化对象 + 返回前条件分支检查。条件分支只覆盖理论上的“不可能初始化失败”路径，不改变正常 Promise executor 同步执行路径。

**Actual impact:** 会产生极小 JS diff，但成功路径的 promise、resolve、reject identity 与调用时序不变。若新增错误分支可被触发，说明实现方式不合格；应停止并重新设计。

- [ ] **Step 1: Replace `createDeferred()` in `packages/core/src/sse/transport/event_stream.ts`.**

Replace the local helper body with:

```ts
function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] | undefined
  let reject: Deferred<T>['reject'] | undefined
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  if (!resolve || !reject) {
    throw new Error('Deferred promise executor did not initialize synchronously')
  }

  return {
    promise,
    resolve,
    reject,
  }
}
```

Do not change the `Deferred<T>` type, caller code, close/retry timing, abort handling, or error message anywhere else.

- [ ] **Step 2: Replace `createDeferred()` in `packages/core/src/web_socket/web_socket.ts` with the same pattern.**

Use the same implementation:

```ts
function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] | undefined
  let reject: Deferred<T>['reject'] | undefined
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  if (!resolve || !reject) {
    throw new Error('Deferred promise executor did not initialize synchronously')
  }

  return {
    promise,
    reject,
    resolve,
  }
}
```

Keep the property order matching the surrounding file if formatting expects it.

- [ ] **Step 3: Verify there is no remaining `!` assertion in core.**

Run:

```bash
node --input-type=module <<'NODE'
import ts from 'typescript'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (name === 'node_modules' || name === 'dist') continue
    const stat = statSync(path)
    if (stat.isDirectory()) walk(path, out)
    else if (path.endsWith('.ts') || path.endsWith('.tsx')) out.push(path)
  }
  return out
}
const files = [...walk('packages/core/src'), ...walk('packages/core/test')]
let count = 0
for (const file of files) {
  const text = readFileSync(file, 'utf8')
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true)
  function visit(node) {
    if (ts.isNonNullExpression(node)) count++
    if ((ts.isVariableDeclaration(node) || ts.isPropertyDeclaration(node)) && node.exclamationToken) count++
    ts.forEachChild(node, visit)
  }
  visit(sf)
}
console.log(`bangAssertions=${count}`)
if (count !== 0) process.exit(1)
NODE
```

Expected:

```text
bangAssertions=0
```

- [ ] **Step 4: Run focused runtime tests for deferred users.**

```bash
pnpm --filter @defjs/core test -- src/sse/transport/event_stream.spec.ts src/sse/transport/event_stream.advanced.spec.ts src/web_socket
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass. If a test involving close/retry/abort timing fails, revert and redesign; do not hide the regression.

- [ ] **Step 5: Review emitted JS diff for this task manually.**

Run:

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: diff may show only the two `createDeferred()` helper bodies. It must not show unrelated changes to SSE/WebSocket state transitions, abort handling, queue logic, serialization, or public exports.

---

## Task 10: Explicitly defer runtime-changing cleanup points

**Files:**

- Modify only comments if the boundary is currently undocumented:
  - `packages/core/src/internal/request_builder.ts`

**Interfaces:**

- Produces: clear list of remaining unsafe-looking patterns that are intentionally not changed in this plan.

**Type approach:** Document rather than mutate where mutation would change behavior.

**Implementation approach:** Comments only. Do not change executable statements.

**Actual impact:** No runtime behavior change.

- [ ] **Step 1: Mark request builder materialization casts that would require new runtime guards.**

Allowed comment near materialization assertions:

```ts
// Type boundary: runtime validation already happens through assertFlatValue/assertSingleBodyValue on the existing path.
// Adding new guards here would change error timing and is outside the zero-runtime-change cleanup.
```

- [ ] **Step 2: Record remaining deferred points in the final summary.**

Use this exact classification:

```text
Deferred because zero-runtime-change constraint forbids executable rewrites.
```

---

## Task 11: Final verification and audit delta

**Files:**

- No new production changes unless a previous task failed verification and must be reverted.

**Interfaces:**

- Produces: verified cleanup result with no runtime JS diff.

- [ ] **Step 1: Run full core verification.**

```bash
pnpm --filter @defjs/core test
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

Expected: all commands pass.

- [ ] **Step 2: Run no-runtime-change gate one final time.**

```bash
pnpm --filter @defjs/core build
rm -rf /tmp/zen-kit-core-dist-after
cp -R packages/core/dist /tmp/zen-kit-core-dist-after
diff -ru /tmp/zen-kit-core-dist-before /tmp/zen-kit-core-dist-after
```

Expected: empty diff.

- [ ] **Step 3: Re-run the type-unsafety AST scan from the audit plan.**

Expected result:

```text
- `as const` and `satisfies` remain protected.
- `@ts-expect-error` in type tests remains when it proves negative API behavior.
- JSON.parse boundaries no longer leak unmarked `any` from return positions.
- `Function` type boundary is gone from `internal/context.ts`.
- `!` non-null / definite-assignment assertions are gone from `packages/core/src` and `packages/core/test`, unless a remaining occurrence is explicitly justified as impossible to express without violating requirements.
- Remaining production assertions are documented as intentional type boundaries or deferred runtime-changing cleanup points.
```

- [ ] **Step 4: Report with three lists.**

Use this structure:

```text
Changed with zero production runtime impact:
- ...

Intentionally preserved for inference:
- ...

Deferred because it would change emitted JS or runtime behavior:
- ...
```

---

## Non-Goals for This Plan

These are real cleanup opportunities, but not safe under the user's zero-runtime-change constraint:

- Adding `parseJsonUnknown()` as a shared production helper and routing all JSON parsing through it.
- Adding runtime guards to `request_builder.ts` materialization paths.
- Replacing command dispatch casts with new runtime type guards.
- Fully implementing browser `WebSocket` shape in test mocks just to satisfy `typeof WebSocket`.
- Changing `ObjectShape` from `any` to `unknown` without proving object-literal inference and public consumer compatibility.

---

## Self-Review Checklist

- Spec coverage: this plan explicitly addresses zero runtime behavior change, `!` assertion removal priority, type strategy, implementation strategy, and actual impact for each task.
- Placeholder scan: no task depends on unspecified implementation details; runtime-changing work is classified as non-goal rather than left open.
- Type consistency: all named surfaces match existing code: `StructLike`, `RuntimeStruct`, `RequestBuildInput`, `HttpAwaitResult`, `defineRequest`, `defineEventStream`, `defineWebSocket`, `Client.execute`.
- Risk boundary: where type unsafety cannot be removed without executable rewrites, the plan preserves or documents it instead of hiding behavior changes inside a “type fix”.
