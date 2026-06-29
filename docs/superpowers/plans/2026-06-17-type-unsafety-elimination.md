# Type Unsafety Elimination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove or explicitly justify every audited TypeScript type-safety escape hatch in production code, tests, configuration scripts, and documentation examples.

**Architecture:** The work replaces scattered assertions with typed runtime struct definitions, discriminated command builders, typed mocks, runtime guards, and type-level negative assertions. Truly intentional public type boundaries are moved into small named helpers with comments and tests so unsafe constructs do not leak across the codebase.

**Tech Stack:** TypeScript 6, pnpm 11, Vitest, Oxlint/Oxfmt, tsdown, VitePress/Twoslash, React, Vue, Angular.

## Global Constraints

- Do not change runtime behavior unless a test in this plan states the behavior change.
- Do not add new dependencies.
- Do not introduce new `as unknown as`, `as any`, non-null assertions, or undocumented `@ts-*` directives.
- Treat `docs/superpowers/plans/**`, `docs/superpowers/specs/**`, and `packages/core/research/**` as historical text: update code blocks only when they are intended as reusable examples; otherwise add explicit `<!-- historical-unsafe-example -->` markers and exclude them from executable docs checks.
- Keep `as const` and `satisfies`; they are not part of the unsafe audit.
- Each implementation task must end with `pnpm --filter <package> typecheck` or the nearest available package typecheck plus the focused Vitest command listed in the task.
- Any task touching `StructLike`, `Infer`, `EndpointInput`, command builders, `Client.execute()`, or wrapper hook generics must also run Vitest type tests with `--typecheck.only`; `pnpm typecheck` alone is not enough for this plan.
- The exhaustive checklist in Appendix A contains 852 unchecked modification points generated from the verified audit. Mark an item complete only after the corresponding source line is removed, replaced, or explicitly reclassified in the plan.

## Type Inference Preservation Contract

These rules override any mechanical “修复后目标” snippet in Appendix A. If a proposed unsafe-code cleanup conflicts with these rules, keep the inference-preserving boundary and document it as an intentional type boundary instead of forcing a cosmetic removal.

- Do not weaken or optionalize the public phantom generic surface: `StructLike<I, O, OO>`, `Struct<Input, Output, OptionalOut>`, `[TYPES]`, and `_struct` must keep carrying exact `input`, `output`, and `optionalOut` types.
- Do not change `Infer<T>`, `FieldOutput<S>`, `ObjectInput<T>`, `ObjectOutput<T>`, `TupleOutput<T>`, `UnionOutput<T>`, `RequestInput<T>`, or `RequestOutput<T>` unless a type test proves the exact inferred type before and after.
- Do not replace `AnyStruct = Struct<any, any, boolean>` or `createAnyStruct(): Struct<unknown, any>` with `unknown`. `struct.any()` intentionally means “decoded value has no static type information”; this `any` is an allowed public API boundary.
- Do not blindly replace `ObjectShape = { [key: string]: any }` if it changes object-literal inference. Prefer adding a separate runtime-only `RuntimeObjectShape` while keeping the public `ObjectShape` alias stable until the type matrix below passes.
- Do not widen const tuples to arrays. Enum values, tuple structs, union options, and discriminated-union options must preserve `const T extends readonly [...]` inference.
- Do not remove overload/conditional call signatures from `defineRequest()`, `defineEventStream()`, `defineWebSocket()`, `Client['execute']`, or framework wrappers. A single broad implementation signature is acceptable only behind the existing public overload surface.
- Do not replace type-test `@ts-expect-error` directives with indirect conditional-type checks. Negative public API tests should keep `@ts-expect-error` when the directive is the thing proving the expression does not typecheck.
- A small number of named type boundaries are allowed when TypeScript cannot connect runtime validation with generic inference: `castStruct()`, `toRuntimeStruct()`, builder implementation casts, `parseEndpointInput()` output casts, and test-only invalid fixtures. Each must remain localized, named, commented, and covered by type tests.

## Required Type Inference Matrix

Before marking any inference-sensitive item complete, run or add type tests covering these exact cases. The type spellings may use the project’s exported aliases, but the inferred behavior must not change.

```ts
import { expectTypeOf } from 'vitest'
import { createClient } from '../client'
import type { HttpAwaitResult } from '../http'
import { defineRequest } from '../http'
import { defineEventStream } from '../sse'
import { defineWebSocket } from '../web_socket'
import { struct, type Infer } from '../struct'

const objectStruct = struct.object({
  id: struct.string(),
  nickname: struct.string().optional(),
  count: struct.number(),
})
expectTypeOf<Infer<typeof objectStruct>>().toEqualTypeOf<{ id: string; nickname?: string; count: number }>()

const tupleStruct = struct.tuple([struct.literal('ok'), struct.number()] as const)
expectTypeOf<Infer<typeof tupleStruct>>().toEqualTypeOf<['ok', number]>()

const unionStruct = struct.or(struct.literal('a'), struct.literal('b'), struct.number())
expectTypeOf<Infer<typeof unionStruct>>().toEqualTypeOf<'a' | 'b' | number>()

const request = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({ id: struct.number() }),
  output: { 200: struct.object({ name: struct.string() }) },
})
expectTypeOf(request).toBeCallableWith({ id: 1 })
// @ts-expect-error required input must stay required
request()

const optionalRequest = defineRequest({ method: 'GET', path: '/users', output: { 200: struct.object({}) } })
expectTypeOf(optionalRequest).toBeCallableWith()

const client = createClient()
expectTypeOf(client.execute(request({ id: 1 }))).toEqualTypeOf<Promise<HttpAwaitResult<{ name: string }, unknown>>>()

const events = defineEventStream({
  path: '/events',
  events: { user: struct.object({ id: struct.string() }), default: struct.string() },
})
expectTypeOf(events).toBeCallableWith()

const socket = defineWebSocket({
  path: '/socket',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})
expectTypeOf(socket).toBeCallableWith()
```

Add the same matrix to the nearest package-level type test when an implementation task touches the corresponding public inference surface.

## Vitest Type Test Contract

This repository currently stores type tests as `src/**/*.type.test.ts`. Vitest 4 can typecheck these files, but its default `typecheck.include` only matches `**/*.{test,spec}-d.?(c|m)[jt]s?(x)`, so the plan must either pass an explicit include or add package scripts/config that do so.

Use these commands as the source of truth for type-unit-test verification:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
```

Expected successful output shape:

```text
Test Files  9 passed (9)
Tests  no tests
Type Errors  no errors
```

for `@defjs/core`, and:

```text
Test Files  1 passed (1)
Tests  no tests
Type Errors  no errors
```

for `@defjs/opentelemetry-server`.

Rules for writing or editing type tests:

- Prefer `expectTypeOf()` from Vitest for positive inference assertions.
- Keep `@ts-expect-error` for negative public API assertions; Vitest typecheck catches unused directives when an API becomes too permissive.
- Do not require `describe()`/`it()` in pure type-test files. Under `--typecheck.only`, “Tests no tests” is acceptable when “Type Errors no errors” is present.
- Do not rely on `vitest run --config vitest.config.ts` alone to execute `.type.test.ts`; runtime project includes currently target `src/**/*.spec.ts` and browser specs.
- If a package gains new `.type.test.ts` files, add a `test:type` script or `typecheck.include` config rather than depending on accidental `tsconfig` coverage.

Suggested package scripts:

```json
{
  "scripts": {
    "test:type": "vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'"
  }
}
```

---

## Audit Baseline---

## Audit Baseline

- Audit date: 2026-06-17.
- Files with findings: 135.
- Total findings: 852.
- By category: as-any=1, as-never=93, definite-assignment=4, double-assertion=127, explicit-any=57, non-null-assertion=1, ts-directive=94, type-assertion=475.
- By location: 文档/代码块=307, 测试=341, 生产源码=204.
- Source evidence: `/tmp/zen-kit-type-unsafety-audit.json` and `/tmp/zen-kit-type-unsafety-audit.md` were generated by a TypeScript AST scan plus ultracode cross-check.

## File Structure Map

### Core struct/runtime files

- Modify: `packages/core/src/struct/types.ts` — introduce runtime-only struct definition types and remove avoidable public `any`.
- Modify: `packages/core/src/struct/guards.ts` — make `isStruct()` narrow to `RuntimeStruct` instead of `AnyStruct`.
- Modify: `packages/core/src/struct/shape.ts` — make object-shape resolution return runtime structs without double assertions.
- Modify: `packages/core/src/struct/runtime.ts` — move phantom type fields behind one named helper or remove runtime phantom assignment.
- Modify: `packages/core/src/struct/constructors.ts` — build runtime definitions with typed tuple/object helpers.
- Modify: `packages/core/src/struct/parse.ts` — consume typed runtime definitions without `as RuntimeStruct`.
- Modify: `packages/core/src/struct/encode.ts` — consume typed runtime definitions and add typed enum/primitive helpers.
- Modify: `packages/core/src/struct/introspection.ts` — use `RuntimeStruct` guards and typed `parseStructValue` output.
- Modify: `packages/core/src/struct/codec/*.ts` — replace struct double assertions with runtime definition helpers.
- Modify: `packages/core/src/struct/utils.ts` — replace generic clone casts with overloads.

### Client / HTTP / SSE / WebSocket files

- Modify: `packages/core/src/client/client.ts` — replace dispatch casts with typed command dispatch overloads.
- Modify: `packages/core/src/client/config.ts` — replace bound `fetch` cast with a typed wrapper.
- Modify: `packages/core/src/http/http.ts` — replace command builder and response body casts with typed builders.
- Modify: `packages/core/src/http/transport/fetch.ts` — isolate `duplex` compatibility and typed default fetch.
- Modify: `packages/core/src/sse/sse.ts` — replace command builder casts and event output casts.
- Modify: `packages/core/src/sse/transport/event_stream.ts` — replace deferred definite assignment with resolver helper.
- Modify: `packages/core/src/web_socket/web_socket.ts` — replace builder/session/listener casts and deferred definite assignment.
- Modify: `packages/core/src/web_socket/codec.ts`, `packages/core/src/web_socket/heartbeat.ts` — use typed incoming/outgoing helpers.

### Test helpers and tests

- Modify: `packages/core/test/setup.ts`, `packages/react/test/setup.ts`, `packages/vue/test/setup.ts`, `packages/angular/test/setup.ts` — add shared JSON/error guards and typed server cleanup helpers.
- Modify: all `*.spec.ts`, `*.type.test.ts`, and `*.browser.spec.tsx` files listed in Appendix A — replace casts with typed mocks, `Reflect.apply` runtime-negative helpers, or type-level assertions.

### Documentation and scripts

- Modify: `doc/scripts/twoslash-check.ts`, `packages/core/tsdown.config.ts`, and Markdown code blocks listed in Appendix A.
- Modify: localized VitePress docs consistently; do not fix only the English copy when the same unsafe snippet appears in translations.

---

## Task 1: Create typed runtime-struct boundaries

**Files:**

- Modify: `packages/core/src/struct/types.ts`
- Modify: `packages/core/src/struct/guards.ts`
- Modify: `packages/core/src/struct/shape.ts`
- Modify: `packages/core/src/struct/runtime.ts`
- Test: `packages/core/src/struct/types.runtime.type.test.ts`

**Interfaces:**

- Produces: `RuntimeObjectShape`, `RuntimeRequestShape`, and `isStruct(value): value is RuntimeStruct`.
- Produces: `assertStruct(value, label): asserts value is RuntimeStruct`.
- Consumes: existing `StructLike`, `RuntimeStruct`, `StructDefinition`, `DEFINITION`, and `TYPES` symbols.

- [ ] **Step 1: Preserve public `ObjectShape` inference and add a separate runtime shape**

Before (`packages/core/src/struct/types.ts`):

```ts
export type ObjectShape = { [key: string]: any }
```

After:

```ts
// Type boundary: ObjectShape is a public generic inference surface. The `any` keeps object-literal fields
// indexable as their exact struct types in ObjectInput/ObjectOutput; do not replace it with `unknown`.
// oxlint-disable-next-line typescript/no-explicit-any
export type ObjectShape = { [key: string]: any }

// Runtime-only shape used after constructors have validated every field as a RuntimeStruct.
export type RuntimeObjectShape = { [key: string]: RuntimeStruct }
```

Validation required before this step is checked:

```ts
const struct = struct.object({ id: struct.string(), nickname: struct.string().optional() })
expectTypeOf<Infer<typeof struct>>().toEqualTypeOf<{ id: string; nickname?: string }>()
```

- [ ] **Step 2: Make runtime definitions store runtime structs**

Before:

```ts
export type ArrayDefinition = BaseDefinition & {
  kind: 'array'
  item: StructLike<unknown, unknown, boolean>
}
```

After:

```ts
export type ArrayDefinition = BaseDefinition & {
  kind: 'array'
  item: RuntimeStruct
}
```

Apply the same change to `ObjectDefinition.shape`, `RequestBodyDefinition.struct`, `RequestDefinition.path`, `RequestDefinition.query`, `RequestDefinition.headers`, `RequestDefinition.body`, `RecordDefinition.value`, `TupleDefinition.items`, `UnionDefinition.options`, `DiscriminatedUnionDefinition.map`, `DiscriminatedUnionDefinition.options`, and `IntersectionDefinition.left/right`.

- [ ] **Step 3: Narrow `isStruct()` to `RuntimeStruct`**

Before (`packages/core/src/struct/guards.ts`):

```ts
import type { AnyStruct } from './types'

export function isStruct(value: unknown): value is AnyStruct {
  return typeof value === 'object' && value !== null && DEFINITION in value
}
```

After:

```ts
import type { RuntimeStruct } from './types'

export function isStruct(value: unknown): value is RuntimeStruct {
  return typeof value === 'object' && value !== null && DEFINITION in value
}
```

- [ ] **Step 4: Make `assertStruct()` return a runtime struct**

Before (`packages/core/src/struct/shape.ts`):

```ts
export function assertStruct(value: unknown, label: string): asserts value is StructLike<unknown, unknown, boolean> {
  if (!isStruct(value)) {
    throw new TypeError(`${label} must be a struct`)
  }
}
```

After:

```ts
export function assertStruct(value: unknown, label: string): asserts value is RuntimeStruct {
  if (!isStruct(value)) {
    throw new TypeError(`${label} must be a struct`)
  }
}
```

- [ ] **Step 5: Resolve object shapes as runtime shapes**

Before:

```ts
export function readObjectShape(shape: ObjectShape): ObjectShape {
  const output: { [key: string]: unknown } = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value

    output[key] = value
  }

  return output as unknown as ObjectShape
}
```

After:

```ts
export function readObjectShape(shape: ObjectShape): RuntimeObjectShape {
  const output: RuntimeObjectShape = Object.create(null)
  const descriptors = Object.getOwnPropertyDescriptors(shape)

  for (const [key, descriptor] of Object.entries(descriptors)) {
    const value = typeof descriptor.get === 'function' ? descriptor.get.call(shape) : descriptor.value
    assertStruct(value, `object field "${key}"`)
    output[key] = value
  }

  return output
}
```

- [ ] **Step 6: Keep phantom generic brands inference-safe and localize the boundary**

Before (`packages/core/src/struct/runtime.ts`):

```ts
const struct: RuntimeStruct = {
  [DEFINITION]: definition,
  [TYPES]: undefined as never,
  _struct: undefined as never,
  null() {
```

After target:

```ts
const TYPE_BRAND = undefined as never

const struct: RuntimeStruct = {
  [DEFINITION]: definition,
  [TYPES]: TYPE_BRAND,
  _struct: TYPE_BRAND,
  null() {
```

Do not make `[TYPES]` or `_struct` optional and do not widen them to `StructTypes<unknown, unknown, boolean> | undefined` on the public `StructLike` surface. If TypeScript cannot express this runtime phantom field without one assertion, keep the assertion in this single `TYPE_BRAND` constant with a Type boundary comment and remove duplicate `undefined as never` occurrences elsewhere.

- [ ] **Step 7: Run focused typecheck**

Run:

```bash
pnpm --filter @defjs/core typecheck
```

Expected: type errors now point to the call sites that still pass `StructLike` where `RuntimeStruct` is required. Fix those call sites in Tasks 2-4, not by reintroducing double assertions.

## Task 2: Rewrite struct constructors, parser, encoder, and codec internals

**Files:**

- Modify: `packages/core/src/struct/constructors.ts`
- Modify: `packages/core/src/struct/parse.ts`
- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/introspection.ts`
- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/query.ts`
- Modify: `packages/core/src/struct/utils.ts`
- Test: `packages/core/src/struct/*.spec.ts`

**Interfaces:**

- Consumes: `RuntimeObjectShape`, runtime struct definitions from Task 1.
- Produces: assertion-free `parseValue()`, `encodeValue()`, and `matchesDefinition()` internals.

- [ ] **Step 1: Preserve const tuple inference while localizing tuple-copy boundaries**

Before:

```ts
const tupleItems = [...items] as unknown as T
const unionOptions = [...options] as unknown as T
const enumValues = [...values] as unknown as T
```

After target:

```ts
const tupleItems = copyStructTuple(items)
const unionOptions = copyStructTuple(options)
const enumValues = copyStringTuple(values)
```

Helpers:

```ts
function copyStructTuple<const T extends readonly [StructLike<unknown, unknown, boolean>, ...StructLike<unknown, unknown, boolean>[]]>(
  items: T,
): T {
  // Type boundary: Array.prototype.map/slice cannot preserve variadic tuple length; callers need exact T for Infer<>.
  return items.slice() as unknown as T
}

function copyStringTuple<const T extends readonly [string, ...string[]]>(items: T): T {
  // Type boundary: Array.prototype.slice cannot preserve the literal tuple; struct.enum() inference depends on exact T.
  return items.slice() as unknown as T
}
```

Do not replace these with `satisfies T`: `satisfies` checks assignability but does not convert a copied array back into the original variadic tuple type.

- [ ] **Step 2: Replace runtime struct reads in constructors**

Before:

```ts
const definition = (struct as unknown as RuntimeStruct)[DEFINITION]
```

After:

```ts
assertStruct(struct, 'struct')
const definition = struct[DEFINITION]
```

- [ ] **Step 3: Replace bigint/date primitive casts**

Before:

```ts
return success(BigInt(input as string))
const date = input instanceof Date ? input : new Date(input as never)
```

After:

```ts
return success(BigInt(input))
const date = input instanceof Date ? input : new Date(input)
```

- [ ] **Step 4: Remove parser `as RuntimeStruct` calls after Task 1 definition changes**

Before:

```ts
const result = parseValue(definition.item as RuntimeStruct, input[index], [...path, index], 'value')
```

After:

```ts
const result = parseValue(definition.item, input[index], [...path, index], 'value')
```

Apply the same pattern to request sections, tuple items, union options, intersections, record values, and request body struct.

- [ ] **Step 5: Replace encoder primitive `as never` with a narrowed helper**

Before:

```ts
return definition.encode ? definition.encode(value as never) : value
```

After:

```ts
return encodePrimitiveValue(definition, value)
```

Add:

```ts
function encodePrimitiveValue(definition: PrimitiveDefinition<PrimitiveKind, unknown, unknown>, value: unknown): unknown {
  if (!definition.encode) {
    return value
  }
  if (!definition.is(value)) {
    return value
  }
  return definition.encode(value)
}
```

- [ ] **Step 6: Replace enum `includes(value as never)` checks**

Before:

```ts
return definition.values.includes(value as never)
```

After:

```ts
return isEnumValue(definition.values, value)
```

Add:

```ts
function isEnumValue(values: readonly (number | string)[], value: unknown): value is number | string {
  return (typeof value === 'number' || typeof value === 'string') && values.includes(value)
}
```

- [ ] **Step 7: Replace object record casts with guards**

Before:

```ts
const matched = definition.map.get((value as { [key: string]: unknown })[definition.discriminator])
```

After:

```ts
const matched = definition.map.get(value[definition.discriminator])
```

This is valid because the branch already checks `isPlainObject(value)`.

- [ ] **Step 8: Replace generic clone casts with overloads**

Before:

```ts
return value.map((item) => cloneValue(item)) as T
return new Date(value.getTime()) as T
return value.slice(0) as T
return output as T
```

After:

```ts
export function cloneValue<T extends readonly unknown[]>(value: T): T
export function cloneValue<T extends Date>(value: T): T
export function cloneValue<T extends ArrayBuffer>(value: T): T
export function cloneValue<T extends { [key: string]: unknown }>(value: T): T
export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item)) as T
  }
  if (value instanceof Date) {
    return new Date(value.getTime()) as T
  }
  if (value instanceof ArrayBuffer) {
    return value.slice(0) as T
  }
  if (isPlainObject(value)) {
    const output: { [key: string]: unknown } = Object.create(null)
    for (const [key, item] of Object.entries(value)) {
      output[key] = cloneValue(item)
    }
    return output as T
  }
  return value
}
```

If this overload still requires localized `as T`, keep the assertions inside this single clone helper and remove all call-site casts listed in Appendix A.

- [ ] **Step 9: Run focused tests**

Run:

```bash
pnpm --filter @defjs/core test -- --run packages/core/src/struct
pnpm --filter @defjs/core typecheck
```

Expected: all struct parser/encoder/constructor tests pass; no `as unknown as RuntimeStruct` remains in `packages/core/src/struct/**`.

## Task 3: Remove request builder struct/body casts

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/internal/request_builder.spec.ts`
- Modify: `packages/core/src/internal/request_builder.type.test.ts`

**Interfaces:**

- Consumes: runtime struct definitions and `assertStruct()` from Task 1.
- Produces: typed `RequestBuildInput<TInput>` and body materialization helpers.

- [ ] **Step 1: Replace input struct double assertion**

Before:

```ts
return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
```

After:

```ts
assertStruct(struct, 'request input')
return createBoundInputView<TInput>(struct, owner)
```

Add:

```ts
function createBoundInputView<TInput extends AnyStruct>(struct: RuntimeStruct, owner: RequestBuildOwner): RequestBuildInput<TInput> {
  return createBoundView(struct, [], owner)
}
```

- [ ] **Step 2: Remove request section runtime casts**

Before:

```ts
setPathParamsState(state, encodeFlatRecord(definition.path as unknown as RuntimeStruct, requestInput['path'], 'path'))
```

After:

```ts
setPathParamsState(state, encodeFlatRecord(definition.path, requestInput['path'], 'path'))
```

- [ ] **Step 3: Replace form-data record assertions with return types**

Before:

```ts
setFormDataBody(state, encodeFlatRecord(body.struct, bodyValue, 'formData') as { [key: string]: RequestFormDataValue })
```

After:

```ts
setFormDataBody(state, encodeFormDataRecord(body.struct, bodyValue))
```

Add:

```ts
function encodeFormDataRecord(struct: RuntimeStruct, value: unknown): { [key: string]: RequestFormDataValue } {
  const encoded = encodeFlatRecord(struct, value, 'formData')
  return normalizeFormDataRecord(encoded)
}
```

- [ ] **Step 4: Replace raw body assertions with explicit body normalizer**

Before:

```ts
setRawBody(state, encodeValue(body.struct, bodyValue) as HttpRequest['body'])
```

After:

```ts
setRawBody(state, normalizeHttpRequestBody(encodeValue(body.struct, bodyValue)))
```

Add:

```ts
function normalizeHttpRequestBody(value: unknown): HttpRequest['body'] {
  if (
    typeof value === 'string' ||
    value instanceof ArrayBuffer ||
    value instanceof Blob ||
    value instanceof FormData ||
    value instanceof URLSearchParams
  ) {
    return value
  }
  return JSON.stringify(value)
}
```

- [ ] **Step 5: Replace projection output casts with typed materializers**

Before:

```ts
output[key] = materialized as RequestBuildValue
```

After:

```ts
output[key] = normalizeRequestBuildValue(materialized)
```

Add:

```ts
function normalizeRequestBuildValue(value: unknown): RequestBuildValue {
  return value
}
```

If `RequestBuildValue` is currently too wide for this to compile, narrow it in `request_builder.ts` so the helper returns the exact union used by request construction.

- [ ] **Step 6: Run focused tests**

Run:

```bash
pnpm --filter @defjs/core test -- --run packages/core/src/internal/request_builder.spec.ts
pnpm --filter @defjs/core typecheck
```

Expected: request builder behavior remains unchanged and no `as unknown as RuntimeStruct` remains in `packages/core/src/internal/request_builder.ts`.

## Task 4: Remove command builder and execute-path casts

**Files:**

- Modify: `packages/core/src/client/client.ts`
- Modify: `packages/core/src/client/config.ts`
- Modify: `packages/core/src/http/http.ts`
- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/http/transport/fetch.ts`

**Interfaces:**

- Produces: `createCommandBuilder()` for optional/required input builder functions.
- Produces: typed default fetch wrapper.

- [ ] **Step 1: Replace default fetch cast**

Before:

```ts
const DEFAULT_FETCH = globalThis.fetch.bind(globalThis) as typeof fetch
```

After:

```ts
const DEFAULT_FETCH: typeof fetch = (...args) => globalThis.fetch(...args)
```

- [ ] **Step 2: Replace HTTP command object assertion**

Before:

```ts
return {
  kind: 'http',
  definition,
  input,
} as HttpCommand<TInput, TOutput>
```

After:

```ts
return {
  kind: 'http',
  definition,
  input,
}
```

If the return type still rejects, update `RequestDefinition<TInput, TOutput>` so the `definition` value is already the endpoint definition type accepted by `HttpCommand<TInput, TOutput>`.

- [ ] **Step 3: Replace command builder assertion with overload helper**

Before:

```ts
return ((input?: EndpointInput<TInput>) => create(input)) as RequestCommandBuilder<TInput, TOutput>
```

After:

```ts
return createRequestCommandBuilder<TInput, TOutput>(create)
```

Add:

```ts
function createRequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  create: (input?: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput> {
  function builder(input?: EndpointInput<TInput>): HttpCommand<TInput, TOutput> {
    return create(input)
  }
  return builder
}
```

If conditional function assignability still requires a boundary, keep it in this helper and remove all endpoint-level assertions.

- [ ] **Step 4: Replace `dispatchCommand()` casts with discriminated command unions**

Before:

```ts
return executeHttpCommand(config, command as DispatchHttpCommand, options as HttpExecuteOptions)
```

After:

```ts
return executeHttpCommand(config, command, normalizeHttpOptions(options))
```

Add command union types:

```ts
type DispatchCommand = DispatchHttpCommand | DispatchEventStreamCommand | DispatchWebSocketCommand

function normalizeHttpOptions(options: unknown): HttpExecuteOptions | undefined {
  return typeof options === 'object' || typeof options === 'undefined' ? (options as HttpExecuteOptions | undefined) : undefined
}
```

Then replace the remaining `options as ...` with transport-specific option guards. Do not leave casts at the switch call sites.

- [ ] **Step 5: Replace response casts with typed response constructors**

Before:

```ts
const ignoredResponse = {
  ...settledResponse,
  body: null,
} as SettledResponse<undefined>

return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
```

After:

```ts
const ignoredResponse: SettledResponse<undefined> = {
  ...settledResponse,
  body: undefined,
}

return [null, undefined, ignoredResponse]
```

- [ ] **Step 6: Replace parsed body casts with branch-local typed variables**

Before:

```ts
body: parsedBody as RequestSuccessData<TOutput>,
return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
```

After:

```ts
const successBody = parsedBody as RequestSuccessData<TOutput>
const successResponse: SettledResponse<RequestSuccessData<TOutput>> = {
  ...settledResponse,
  body: successBody,
}
return [null, successBody, successResponse]
```

Then move the single cast into `parseSuccessBody<TOutput>()` and add focused tests for status/body inference.

- [ ] **Step 7: Replace SSE/WebSocket builder casts with helpers matching HTTP**

Before:

```ts
return ((input?: EndpointInput<TInput>) => create(input)) as EventStreamCommandBuilder<TInput, TEvents>
```

After:

```ts
return createEventStreamCommandBuilder<TInput, TEvents>(create)
```

Before:

```ts
return ((input?: EndpointInput<TInput>) => create(input)) as WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
```

After:

```ts
return createWebSocketCommandBuilder<TInput, TIncoming, TOutgoing>(create)
```

- [ ] **Step 8: Replace Deferred definite assignments**

Before:

```ts
let resolve!: Deferred<T>['resolve']
let reject!: Deferred<T>['reject']
const promise = new Promise<T>((innerResolve, innerReject) => {
  resolve = innerResolve
  reject = innerReject
})
```

After:

```ts
const { promise, resolve, reject } = createPromiseWithResolvers<T>()
```

Add:

```ts
function createPromiseWithResolvers<T>(): Deferred<T> {
  let resolveValue: Deferred<T>['resolve'] | undefined
  let rejectValue: Deferred<T>['reject'] | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolveValue = resolve
    rejectValue = reject
  })
  if (!resolveValue || !rejectValue) {
    throw new Error('Promise resolver initialization failed')
  }
  return { promise, reject: rejectValue, resolve: resolveValue }
}
```

- [ ] **Step 9: Run transport tests**

Run:

```bash
pnpm --filter @defjs/core test -- --run packages/core/src/http packages/core/src/sse packages/core/src/web_socket packages/core/src/client
pnpm --filter @defjs/core typecheck
```

Expected: client, HTTP, SSE, and WebSocket tests pass; no command builder call site uses `as unknown as`.

## Task 5: Remove small production-source escape hatches

**Files:**

- Modify: `packages/core/src/error/factory.ts`
- Modify: `packages/core/src/http/transport/utils.ts`
- Modify: `packages/core/src/internal/async_queue.ts`
- Modify: `packages/core/src/internal/context.ts`
- Modify: `packages/core/src/internal/endpoint_input.ts`
- Modify: `packages/core/src/sse/transport/parser.ts`
- Modify: `packages/core/tsdown.config.ts`
- Modify: `packages/opentelemetry-server/src/interceptor/web_socket.ts`
- Modify: `packages/opentelemetry-server/src/option.ts`

**Interfaces:**

- Produces: small runtime guards for JSON parse, Node error, context token, and queue pop.
- Preserves: `EndpointInput<TInput>` and `ParsedInput<TInput>` conditional inference. Do not remove `parseEndpointInput()` casts unless a replacement keeps the exact `ParsedInput<TInput>` return type proven by type tests.

- [ ] **Step 1: Replace queue `shift() as T`**

Before:

```ts
value: this.values.shift() as T,
```

After:

```ts
const value = this.values[0]
this.values.splice(0, 1)
return { done: false, value }
```

- [ ] **Step 2: Replace context map value cast**

Before:

```ts
return ctx.has(token) ? (ctx.get(token) as T) : token()
```

After:

```ts
if (!ctx.has(token)) {
  return token()
}
return ctx.get(token)
```

Make the backing map type `Map<HttpContextToken<unknown>, unknown>` and expose a typed `getContextValue<T>()` helper if the compiler cannot infer `T` from the token.

- [ ] **Step 3: Replace JSON parse config cast**

Before:

```ts
const pkg = JSON.parse(raw) as Record<string, unknown>
```

After:

```ts
const pkg = parsePackageJson(JSON.parse(raw))

function parsePackageJson(value: unknown): { name?: unknown; peerDependencies?: unknown; version?: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('package.json must contain an object')
  }
  return value
}
```

- [ ] **Step 4: Replace optional cause cast**

Before:

```ts
return (closeInfo as { cause?: unknown }).cause
```

After:

```ts
return 'cause' in closeInfo ? closeInfo.cause : undefined
```

- [ ] **Step 5: Run focused checks**

Run:

```bash
pnpm --filter @defjs/core test -- --run packages/core/src/internal packages/core/src/error packages/core/src/http/transport packages/core/src/sse/transport
pnpm --filter @defjs/opentelemetry-server test -- --run
pnpm --filter @defjs/core typecheck
pnpm --filter @defjs/opentelemetry-server typecheck
```

Expected: no explicit `any`, non-null assertion, or unguarded JSON parse cast remains in these files.

## Task 6: Replace test casts with typed helpers and type-level assertions

**Files:**

- Modify: every test file listed under `测试` in Appendix A.
- Modify: `packages/core/test/setup.ts`
- Modify: `packages/core/test/vite-xsrf-plugin.ts`
- Modify: `packages/react/test/setup.ts`
- Modify: `packages/vue/test/setup.ts`
- Modify: `packages/angular/test/setup.ts`

**Interfaces:**

- Produces: `createTypedFetchMock()`, `createMockWebSocketConstructor()`, `callRuntimeOnly()`, `parseJsonObject()`, `isErrnoException()`.

- [ ] **Step 1: Add typed fetch mock helper**

Before:

```ts
const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
```

After:

```ts
const customFetch = vi.fn<typeof fetch>(async () => new Response('ok', { status: 200 }))
```

- [ ] **Step 2: Add complete WebSocket constructor mock**

Before:

```ts
withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket)
```

After:

```ts
withWebSocketHandle(createMockWebSocketConstructor())
```

Helper shape:

```ts
function createMockWebSocketConstructor(): typeof WebSocket {
  class MockWebSocket extends EventTarget implements WebSocket {
    static readonly CLOSED = WebSocket.CLOSED
    static readonly CLOSING = WebSocket.CLOSING
    static readonly CONNECTING = WebSocket.CONNECTING
    static readonly OPEN = WebSocket.OPEN
    binaryType: BinaryType = 'blob'
    readonly bufferedAmount = 0
    readonly extensions = ''
    onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null
    onerror: ((this: WebSocket, ev: Event) => unknown) | null = null
    onmessage: ((this: WebSocket, ev: MessageEvent) => unknown) | null = null
    onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
    readonly protocol = ''
    readonly readyState = WebSocket.OPEN
    readonly url: string
    constructor(url: string | URL) {
      super()
      this.url = String(url)
    }
    close(): void {}
    send(): void {}
  }
  return MockWebSocket
}
```

- [ ] **Step 3: Replace `as never` negative runtime calls**

Before:

```ts
expect(() => struct.object(null as never)).toThrow('object struct requires a plain object')
```

After:

```ts
expect(() => callRuntimeOnly(struct.object, null)).toThrow('object struct requires a plain object')
```

Helper:

```ts
function callRuntimeOnly(fn: Function, ...args: readonly unknown[]): unknown {
  return Reflect.apply(fn, undefined, args)
}
```

- [ ] **Step 4: Replace JSON/DOM boundary casts in tests**

Before:

```ts
const { token } = (await tokenResponse.json()) as { token: string }
```

After:

```ts
const { token } = parseTokenResponse(await tokenResponse.json())

function parseTokenResponse(value: unknown): { token: string } {
  if (typeof value !== 'object' || value === null || Array.isArray(value) || typeof value['token'] !== 'string') {
    throw new TypeError('expected token response')
  }
  return { token: value['token'] }
}
```

- [ ] **Step 5: Replace Node error casts**

Before:

```ts
if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
```

After:

```ts
if (isErrnoException(error) && error.code === 'ERR_SERVER_NOT_RUNNING') {
```

Helper:

```ts
function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error
}
```

- [ ] **Step 6: Preserve public API negative type tests; migrate only runtime defensive directives**

Public `.type.test.ts` files should usually keep `@ts-expect-error`, because the directive proves the next expression really fails to typecheck and TypeScript reports an unused directive if the API becomes too permissive.

Before:

```ts
// @ts-expect-error withEndpoint expects a string
withEndpoint(1)
```

After target:

```ts
// @ts-expect-error withEndpoint expects a string
withEndpoint(1)
```

Runtime specs that use `@ts-expect-error` only to manufacture invalid runtime values should migrate to explicit invalid fixtures instead:

```ts
expect(() => callRuntimeOnly(withEndpoint, 1)).toThrow('endpoint must be a string')
```

Rule: keep directives in `*.type.test.ts` when they assert public API rejection; remove directives from runtime `*.spec.ts` only when a typed invalid-fixture helper preserves the runtime test intent.

- [ ] **Step 7: Run test suite by package**

Run:

```bash
pnpm --filter @defjs/core test -- --run
pnpm --filter @defjs/react test -- --run
pnpm --filter @defjs/vue test -- --run
pnpm --filter @defjs/angular test -- --run
pnpm --filter @defjs/opentelemetry-server test -- --run
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
pnpm typecheck
```

Expected: all test packages pass; Appendix A test items are marked complete after their source lines are removed or replaced.

## Task 7: Clean documentation examples and config scripts

**Files:**

- Modify: every Markdown/code-script file listed under `文档/代码块` in Appendix A.
- Modify: `doc/scripts/twoslash-check.ts`
- Modify: `packages/core/research/*.md` only when the code block is intended as a current example.

**Interfaces:**

- Produces: safe documentation snippets that compile under docs Twoslash checks.

- [ ] **Step 1: Replace `Record<string, any>` documentation snippets**

Before:

```ts
const packageJson: Record<string, any> = await Bun.file('package.json').json()
```

After:

```ts
const packageJson = parsePackageJson(await Bun.file('package.json').json())

type PackageJson = {
  exports?: Record<string, unknown>
  module?: string
  typings?: string
}

function parsePackageJson(value: unknown): PackageJson {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('package.json must be an object')
  }
  return value
}
```

- [ ] **Step 2: Replace Vue/React docs `as` snippets with typed `execute()` examples**

Before:

```ts
users.value = result as Users
```

After:

```ts
users.value = result
```

This requires the preceding command definition to declare the response struct so `execute()` infers `Users`.

- [ ] **Step 3: Mark historical unsafe snippets instead of pretending they are current guidance**

Before:

```ts
const ref = useRequest({ id: 1 } as never)
```

After:

```md
<!-- historical-unsafe-example: kept to document the migration source; not current guidance -->
```

Then replace the code block with a safe current example:

```ts
const ref = useRequest({ id: 1 })
```

- [ ] **Step 4: Replace Twoslash error cast**

Before:

```ts
return result.errors as RawTwoslashError[]
```

After:

```ts
return result.errors.filter(isRawTwoslashError)

function isRawTwoslashError(value: unknown): value is RawTwoslashError {
  return typeof value === 'object' && value !== null && 'text' in value
}
```

- [ ] **Step 5: Run documentation checks**

Run:

```bash
pnpm --filter ./doc test -- --run
pnpm --filter ./doc typecheck
```

Expected: docs script tests pass and updated examples remain typecheckable.

## Task 8: Final audit and checklist closure

**Files:**

- Modify: `docs/superpowers/plans/2026-06-17-type-unsafety-elimination.md` — check completed boxes after implementation.
- No source file changes except checklist updates.

**Interfaces:**

- Consumes: all previous task outputs.
- Produces: verified zero-regression evidence.

- [ ] **Step 1: Re-run AST audit**

Run the same AST scanner used to generate `/tmp/zen-kit-type-unsafety-audit.json`, then compare counts by category.

Expected:

```text
double-assertion=0
as-any=0
non-null-assertion=0
undocumented-ts-directive=0
production-source as-never=0
```

- [ ] **Step 2: Re-run project checks**

Run:

```bash
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
pnpm --dir /Users/munmunmiao/Documents/web/zen-kit/packages/opentelemetry-server exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include 'src/**/*.type.test.ts'
pnpm check
pnpm test
```

Expected: Vitest typecheck reports `Type Errors  no errors`, then `pnpm check` and `pnpm test` exit 0.

- [ ] **Step 3: Update Appendix A checkboxes**

For each Appendix A entry, mark `[x]` only when one of these is true:

```text
1. The unsafe snippet no longer exists at that file/line after nearby context is checked.
2. The snippet was replaced by the exact target pattern listed under 修复后.
3. The entry was reclassified as an intentional boundary and moved into a named helper with tests and comments.
```

---

## Appendix A: Exhaustive Modification Ledger

每个条目都是一个未完成 checkbox。实现时按文件逐项勾选；不要批量勾选。

Important inference note: Appendix A 的“修复后目标”是审计总账的机械初稿。凡是目标片段会改变 `any` 公共边界、const tuple 字面量、conditional builder overload、`Infer<>`/`EndpointInput<>`/`Client.execute()` 推理，必须以 “Type Inference Preservation Contract” 为准，并把该 finding 标记为 named boundary 或改成 inference-safe helper。

格式：`路径:行:列` — 分类 — 位置。

### 生产源码

#### `packages/core/src/client/client.ts`

- [ ] `packages/core/src/client/client.ts:23:41` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeHttpCommand(config, command as DispatchHttpCommand, options as HttpExecuteOptions)
  ```

  修复后目标：

  ```ts
  return executeHttpCommand(config, command satisfies DispatchHttpCommand, options satisfies HttpExecuteOptions)
  ```

- [ ] `packages/core/src/client/client.ts:23:73` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeHttpCommand(config, command as DispatchHttpCommand, options as HttpExecuteOptions)
  ```

  修复后目标：

  ```ts
  return executeHttpCommand(config, command satisfies DispatchHttpCommand, options satisfies HttpExecuteOptions)
  ```

- [ ] `packages/core/src/client/client.ts:25:14` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeEventStreamCommand(
  ```

  修复后目标：

  ```ts
  return executeEventStreamCommand(
  ```

- [ ] `packages/core/src/client/client.ts:27:9` — `type-assertion` — `source`
      修复前：

  ```ts
  command as DispatchEventStreamCommand,
  ```

  修复后目标：

  ```ts
  command satisfies DispatchEventStreamCommand,
  ```

- [ ] `packages/core/src/client/client.ts:28:9` — `type-assertion` — `source`
      修复前：

  ```ts
  options as EventStreamExecuteOptions,
  ```

  修复后目标：

  ```ts
  options satisfies EventStreamExecuteOptions,
  ```

- [ ] `packages/core/src/client/client.ts:31:14` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions)
  ```

- [ ] `packages/core/src/client/client.ts:31:46` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions)
  ```

- [ ] `packages/core/src/client/client.ts:31:83` — `type-assertion` — `source`
      修复前：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeWebSocketCommand(config, command as DispatchWebSocketCommand, options as WebSocketExecuteOptions)
  ```

- [ ] `packages/core/src/client/client.ts:39:14` — `type-assertion` — `source`
      修复前：

  ```ts
  execute: ((command: Command, options?: unknown) => dispatchCommand(config, command, options)) as Client['execute'],
  ```

  修复后目标：

  ```ts
  execute: ((command: Command, options?: unknown) => dispatchCommand(config, command, options)) satisfies Client['execute'],
  ```

#### `packages/core/src/client/config.ts`

- [ ] `packages/core/src/client/config.ts:137:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const DEFAULT_FETCH = globalThis.fetch.bind(globalThis) as typeof fetch
  ```

  修复后目标：

  ```ts
  const DEFAULT_FETCH = (...args) => globalThis.fetch(...args)
  ```

#### `packages/core/src/error/factory.ts`

- [ ] `packages/core/src/error/factory.ts:55:11` — `type-assertion` — `source`
      修复前：

  ```ts
  data: data as TErrorData,
  ```

  修复后目标：

  ```ts
  data: dataErrorData,
  ```

#### `packages/core/src/http/http.ts`

- [ ] `packages/core/src/http/http.ts:137:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `packages/core/src/http/http.ts:144:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>) => create(input)) as RequestCommandBuilder<TInput, TOutput>
  ```

  修复后目标：

  ```ts
  return createCommandBuilder(create)
  ```

- [ ] `packages/core/src/http/http.ts:164:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(definitionError)
  ```

- [ ] `packages/core/src/http/http.ts:173:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(transportError)
  ```

- [ ] `packages/core/src/http/http.ts:178:19` — `type-assertion` — `source`
      修复前：

  ```ts
  parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  parsedInput = await parseEndpointInput(definition.input, input)
  ```

- [ ] `packages/core/src/http/http.ts:181:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(definitionError)
  ```

- [ ] `packages/core/src/http/http.ts:202:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(definitionError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(definitionError)
  ```

- [ ] `packages/core/src/http/http.ts:212:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(transportError)
  ```

- [ ] `packages/core/src/http/http.ts:219:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(transportError as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(transportError)
  ```

- [ ] `packages/core/src/http/http.ts:223:29` — `type-assertion` — `source`
      修复前：

  ```ts
  const ignoredResponse = {
  ```

  修复后目标：

  ```ts
  const ignoredResponse = {
  ```

- [ ] `packages/core/src/http/http.ts:229:21` — `type-assertion` — `source`
      修复前：

  ```ts
  return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
  ```

  修复后目标：

  ```ts
  return [null, undefined, ignoredResponse]
  ```

- [ ] `packages/core/src/http/http.ts:234:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const httpError = createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestError<RequestErrorData<TOutput>>
  ```

  修复后目标：

  ```ts
  const httpError = createHttpStatusError(response.status, errorMessage, ignoredResponse)
  ```

- [ ] `packages/core/src/http/http.ts:242:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(definitionError as RequestError<RequestErrorData<TOutput>>, settledResponse)
  ```

  修复后目标：

  ```ts
  return fail(definitionError, settledResponse)
  ```

- [ ] `packages/core/src/http/http.ts:250:17` — `type-assertion` — `source`
      修复前：

  ```ts
  return fail(definitionError as RequestError<RequestErrorData<TOutput>>, settledResponse)
  ```

  修复后目标：

  ```ts
  return fail(definitionError, settledResponse)
  ```

- [ ] `packages/core/src/http/http.ts:256:13` — `type-assertion` — `source`
      修复前：

  ```ts
  body: parsedBody as RequestSuccessData<TOutput>,
  ```

  修复后目标：

  ```ts
  body: successBody,
  ```

- [ ] `packages/core/src/http/http.ts:258:19` — `type-assertion` — `source`
      修复前：

  ```ts
  return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  ```

  修复后目标：

  ```ts
  return [null, successBody, successResponse]
  ```

- [ ] `packages/core/src/http/http.ts:263:21` — `type-assertion` — `source`
      修复前：

  ```ts
  const httpError = createHttpStatusError(
  ```

  修复后目标：

  ```ts
  const httpError = createHttpStatusError(
  ```

- [ ] `packages/core/src/http/http.ts:267:5` — `type-assertion` — `source`
      修复前：

  ```ts
  parsedBody as RequestErrorData<TOutput>,
  ```

  修复后目标：

  ```ts
  errorBody,
  ```

#### `packages/core/src/http/transport/fetch.ts`

- [ ] `packages/core/src/http/transport/fetch.ts:40:56` — `type-assertion` — `source`
      修复前：

  ```ts
  const request = new Request('https://example.com', {
  ```

  修复后目标：

  ```ts
  const request = new Request('https://example.com', {
  ```

- [ ] `packages/core/src/http/transport/fetch.ts:238:29` — `type-assertion` — `source`
      修复前：

  ```ts
  fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis) as typeof fetch,
  ```

  修复后目标：

  ```ts
  fetchImpl: typeof fetch = ((...args) => globalThis.fetch(...args)),
  ```

#### `packages/core/src/http/transport/utils.ts`

- [ ] `packages/core/src/http/transport/utils.ts:24:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
  ```

  修复后目标：

  ```ts
  return buffer.slice(byteOffset, byteOffset + byteLength)
  ```

#### `packages/core/src/internal/async_queue.ts`

- [ ] `packages/core/src/internal/async_queue.ts:86:20` — `type-assertion` — `source`
      修复前：

  ```ts
  value: this.values.shift() as T,
  ```

  修复后目标：

  ```ts
  value: this.values.shift(),
  ```

#### `packages/core/src/internal/context.ts`

- [ ] `packages/core/src/internal/context.ts:11:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return defaultValue as HttpContextToken<T>
  ```

  修复后目标：

  ```ts
  return defaultValue satisfies HttpContextToken<T>
  ```

- [ ] `packages/core/src/internal/context.ts:15:66` — `type-assertion` — `source`
      修复前：

  ```ts
  return typeof value === 'function' && contextTokenRegistry.has(value as Function)
  ```

  修复后目标：

  ```ts
  return typeof value === 'function' && contextTokenRegistry.has(value satisfies Function)
  ```

- [ ] `packages/core/src/internal/context.ts:70:32` — `type-assertion` — `source`
      修复前：

  ```ts
  return ctx.has(token) ? (ctx.get(token) as T) : token()
  ```

  修复后目标：

  ```ts
  return ctx.has(token) ? ctx.get(token) : token()
  ```

#### `packages/core/src/internal/endpoint_input.ts`

- [ ] `packages/core/src/internal/endpoint_input.ts:15:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return input as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return input
  ```

- [ ] `packages/core/src/internal/endpoint_input.ts:18:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return parseStructValue(struct, input) as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return parseStructValue(struct, input)
  ```

#### `packages/core/src/internal/request_builder.ts`

- [ ] `packages/core/src/internal/request_builder.ts:183:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return (transport ?? 'http') as TTransport
  ```

  修复后目标：

  ```ts
  return (transport ?? 'http')Transport
  ```

- [ ] `packages/core/src/internal/request_builder.ts:192:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return createBuildPlanBuilder(plan) as RequestBuildContext<TTransport>
  ```

  修复后目标：

  ```ts
  return createBuildPlanBuilder(plan) satisfies RequestBuildContext<TTransport>
  ```

- [ ] `packages/core/src/internal/request_builder.ts:200:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
  ```

  修复后目标：

  ```ts
  return createBoundView(struct as unknown, [], owner) as RequestBuildInput<TInput>
  ```

- [ ] `packages/core/src/internal/request_builder.ts:200:26` — `double-assertion` — `source`
      修复前：

  ```ts
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
  ```

  修复后目标：

  ```ts
  return createBoundView(struct, [], owner) as RequestBuildInput<TInput>
  ```

- [ ] `packages/core/src/internal/request_builder.ts:208:19` — `double-assertion` — `source`
      修复前：

  ```ts
  const runtime = options.input as unknown as RuntimeStruct
  ```

  修复后目标：

  ```ts
  const runtime = options.input
  ```

- [ ] `packages/core/src/internal/request_builder.ts:231:48` — `double-assertion` — `source`
      修复前：

  ```ts
  setPathParamsState(state, encodeFlatRecord(definition.path as unknown as RuntimeStruct, requestInput['path'], 'path'))
  ```

  修复后目标：

  ```ts
  setPathParamsState(state, encodeFlatRecord(definition.path, requestInput['path'], 'path'))
  ```

- [ ] `packages/core/src/internal/request_builder.ts:234:49` — `double-assertion` — `source`
      修复前：

  ```ts
  setQueryParamsState(state, encodeFlatRecord(definition.query as unknown as RuntimeStruct, requestInput['query'], 'query'))
  ```

  修复后目标：

  ```ts
  setQueryParamsState(state, encodeFlatRecord(definition.query, requestInput['query'], 'query'))
  ```

- [ ] `packages/core/src/internal/request_builder.ts:237:45` — `double-assertion` — `source`
      修复前：

  ```ts
  setHeadersState(state, encodeFlatRecord(definition.headers as unknown as RuntimeStruct, requestInput['headers'], 'headers'))
  ```

  修复后目标：

  ```ts
  setHeadersState(state, encodeFlatRecord(definition.headers, requestInput['headers'], 'headers'))
  ```

- [ ] `packages/core/src/internal/request_builder.ts:240:32` — `type-assertion` — `source`
      修复前：

  ```ts
  setRequestShapeBody(state, definition.body as RuntimeStruct, requestInput['body'])
  ```

  修复后目标：

  ```ts
  setRequestShapeBody(state, definition.body, requestInput['body'])
  ```

- [ ] `packages/core/src/internal/request_builder.ts:257:30` — `type-assertion` — `source`
      修复前：

  ```ts
  setFormDataBody(state, encodeFlatRecord(body.struct, bodyValue, 'formData') as { [key: string]: RequestFormDataValue })
  ```

  修复后目标：

  ```ts
  setFormDataBody(state, encodeFlatRecord(body.struct, bodyValue, 'formData') satisfies { [key: string]: RequestFormDataValue })
  ```

- [ ] `packages/core/src/internal/request_builder.ts:264:25` — `type-assertion` — `source`
      修复前：

  ```ts
  setRawBody(state, encodeValue(body.struct, bodyValue) as HttpRequest['body'])
  ```

  修复后目标：

  ```ts
  setRawBody(state, encodeValue(body.struct, bodyValue) satisfies HttpRequest['body'])
  ```

- [ ] `packages/core/src/internal/request_builder.ts:270:18` — `type-assertion` — `source`
      修复前：

  ```ts
  setBody(state, JSON.stringify(value) as HttpRequest['body'], resolveBodyContentTypeOption(options, 'application/json'))
  ```

  修复后目标：

  ```ts
  setBody(state, JSON.stringify(value) satisfies HttpRequest['body'], resolveBodyContentTypeOption(options, 'application/json'))
  ```

- [ ] `packages/core/src/internal/request_builder.ts:410:11` — `type-assertion` — `source`
      修复前：

  ```ts
  materializeRecordProjection(step.projection, input, scope, 'formData', owner) as { [key: string]: RequestFormDataValue },
  ```

  修复后目标：

  ```ts
  materializeRecordProjection(step.projection, input, scope, 'formData', owner) satisfies { [key: string]: RequestFormDataValue },
  ```

- [ ] `packages/core/src/internal/request_builder.ts:424:27` — `type-assertion` — `source`
      修复前：

  ```ts
  setRawBody(state, body as HttpRequest['body'], { contentType: step.contentType })
  ```

  修复后目标：

  ```ts
  setRawBody(state, body satisfies HttpRequest['body'], { contentType: step.contentType })
  ```

- [ ] `packages/core/src/internal/request_builder.ts:430:11` — `type-assertion` — `source`
      修复前：

  ```ts
  materializeRecordProjection(step.projection, input, scope, 'formData', owner) as { [key: string]: RequestFormDataValue },
  ```

  修复后目标：

  ```ts
  materializeRecordProjection(step.projection, input, scope, 'formData', owner) satisfies { [key: string]: RequestFormDataValue },
  ```

- [ ] `packages/core/src/internal/request_builder.ts:463:28` — `type-assertion` — `source`
      修复前：

  ```ts
  return createBoundView(definition.struct as RuntimeStruct, path, owner)
  ```

  修复后目标：

  ```ts
  return createBoundView(definition.struct, path, owner)
  ```

- [ ] `packages/core/src/internal/request_builder.ts:484:36` — `type-assertion` — `source`
      修复前：

  ```ts
  get: () => createBoundView(field as RuntimeStruct, [...path, key], owner),
  ```

  修复后目标：

  ```ts
  get: () => createBoundView(field, [...path, key], owner),
  ```

- [ ] `packages/core/src/internal/request_builder.ts:494:42` — `type-assertion` — `source`
      修复前：

  ```ts
  const itemView = createBoundView(definition.item as RuntimeStruct, [itemToken], owner)
  ```

  修复后目标：

  ```ts
  const itemView = createBoundView(definition.item, [itemToken], owner)
  ```

- [ ] `packages/core/src/internal/request_builder.ts:499:21` — `type-assertion` — `source`
      修复前：

  ```ts
  source: view as BoundSource,
  ```

  修复后目标：

  ```ts
  source: view satisfies BoundSource,
  ```

- [ ] `packages/core/src/internal/request_builder.ts:521:32` — `type-assertion` — `source`
      修复前：

  ```ts
  get: () => createBoundView(struct as RuntimeStruct, [...path, key], owner),
  ```

  修复后目标：

  ```ts
  get: () => createBoundView(struct, [...path, key], owner),
  ```

- [ ] `packages/core/src/internal/request_builder.ts:556:21` — `type-assertion` — `source`
      修复前：

  ```ts
  output[key] = materialized as RequestBuildValue
  ```

  修复后目标：

  ```ts
  output[key] = materialized satisfies RequestBuildValue
  ```

- [ ] `packages/core/src/internal/request_builder.ts:627:67` — `type-assertion` — `source`
      修复前：

  ```ts
  current = isPlainObject(current) || Array.isArray(current) ? (current as { [key: string]: unknown })[segment] : undefined
  ```

  修复后目标：

  ```ts
  current = isPlainObject(current) || Array.isArray(current) ? current[segment] : undefined
  ```

- [ ] `packages/core/src/internal/request_builder.ts:657:83` — `type-assertion` — `source`
      修复前：

  ```ts
  output[getWireKey(field.key, field.tags.get(JsonTag.kind))] = encodeChild(field.struct as RuntimeStruct, fieldValue)
  ```

  修复后目标：

  ```ts
  output[getWireKey(field.key, field.tags.get(JsonTag.kind))] = encodeChild(field.struct, fieldValue)
  ```

- [ ] `packages/core/src/internal/request_builder.ts:682:33` — `type-assertion` — `source`
      修复前：

  ```ts
  const encoded = encodeValue(field.struct as RuntimeStruct, value[field.key])
  ```

  修复后目标：

  ```ts
  const encoded = encodeValue(field.struct, value[field.key])
  ```

- [ ] `packages/core/src/internal/request_builder.ts:688:25` — `type-assertion` — `source`
      修复前：

  ```ts
  output[outputKey] = encoded as RequestBuildValue
  ```

  修复后目标：

  ```ts
  output[outputKey] = encoded satisfies RequestBuildValue
  ```

- [ ] `packages/core/src/internal/request_builder.ts:736:15` — `type-assertion` — `source`
      修复前：

  ```ts
  struct: definition.struct as RuntimeStruct,
  ```

  修复后目标：

  ```ts
  struct: definition.struct,
  ```

- [ ] `packages/core/src/internal/request_builder.ts:848:48` — `type-assertion` — `source`
      修复前：

  ```ts
  appendRequestFormDataItem(formData, key, item as RequestFormDataArrayItem)
  ```

  修复后目标：

  ```ts
  appendRequestFormDataItem(formData, key, item satisfies RequestFormDataArrayItem)
  ```

- [ ] `packages/core/src/internal/request_builder.ts:853:44` — `type-assertion` — `source`
      修复前：

  ```ts
  appendRequestFormDataItem(formData, key, value as RequestFormDataScalar | RequestFormDataFileLike)
  ```

  修复后目标：

  ```ts
  appendRequestFormDataItem(formData, key, value satisfies RequestFormDataScalar | RequestFormDataFileLike)
  ```

#### `packages/core/src/sse/sse.ts`

- [ ] `packages/core/src/sse/sse.ts:146:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `packages/core/src/sse/sse.ts:153:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>) => create(input)) as EventStreamCommandBuilder<TInput, TEvents>
  ```

  修复后目标：

  ```ts
  return createCommandBuilder(create)
  ```

- [ ] `packages/core/src/sse/sse.ts:158:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return value as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `packages/core/src/sse/sse.ts:231:7` — `type-assertion` — `source`
      修复前：

  ```ts
  fetchEventStream(req, {
  ```

  修复后目标：

  ```ts
  fetchEventStream(req, {
  ```

- [ ] `packages/core/src/sse/sse.ts:242:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const stream = (await sseChain(request, sseHandler)) as EventStreamHandle<EventStreamData<TEvents>>
  ```

  修复后目标：

  ```ts
  const stream = (await sseChain(request, sseHandler)) satisfies EventStreamHandle<EventStreamData<TEvents>>
  ```

- [ ] `packages/core/src/sse/sse.ts:269:27` — `type-assertion` — `source`
      修复前：

  ```ts
  return [null, stream, state.open as StreamOpenInfo]
  ```

  修复后目标：

  ```ts
  return [null, stream, state.open satisfies StreamOpenInfo]
  ```

- [ ] `packages/core/src/sse/sse.ts:303:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

#### `packages/core/src/sse/transport/event_stream.ts`

- [ ] `packages/core/src/sse/transport/event_stream.ts:248:105` — `type-assertion` — `source`
      修复前：

  ```ts
  const transformed = options.transformMessage ? await options.transformMessage(message) : (message as TEvent)
  ```

  修复后目标：

  ```ts
  const transformed = options.transformMessage ? await options.transformMessage(message) : messageEvent
  ```

- [ ] `packages/core/src/sse/transport/event_stream.ts:413:7` — `definite-assignment` — `source`
      修复前：

  ```ts
  let resolve!: Deferred<T>['resolve']
  ```

  修复后目标：

  ```ts
  const { promise, resolve, reject } = createPromiseWithResolvers<T>()
  ```

- [ ] `packages/core/src/sse/transport/event_stream.ts:414:7` — `definite-assignment` — `source`
      修复前：

  ```ts
  let reject!: Deferred<T>['reject']
  ```

  修复后目标：

  ```ts
  const { promise, resolve, reject } = createPromiseWithResolvers<T>()
  ```

#### `packages/core/src/sse/transport/parser.ts`

- [ ] `packages/core/src/sse/transport/parser.ts:150:17` — `type-assertion` — `source`
      修复前：

  ```ts
  let message = { id: '', event: '', data: '', retry: undefined } as EventStreamMessage
  ```

  修复后目标：

  ```ts
  let message = { id: '', event: '', data: '', retry: undefined } satisfies EventStreamMessage
  ```

- [ ] `packages/core/src/sse/transport/parser.ts:156:17` — `type-assertion` — `source`
      修复前：

  ```ts
  message = { id: '', event: '', data: '', retry: undefined } as EventStreamMessage
  ```

  修复后目标：

  ```ts
  message = { id: '', event: '', data: '', retry: undefined } satisfies EventStreamMessage
  ```

#### `packages/core/src/struct/codec/common.ts`

- [ ] `packages/core/src/struct/codec/common.ts:113:22` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(struct as unknown as RuntimeStruct, value, {
  ```

  修复后目标：

  ```ts
  return encodeValue(struct, value, {
  ```

- [ ] `packages/core/src/struct/codec/common.ts:131:63` — `double-assertion` — `source`
      修复前：

  ```ts
  output[getWireKey(field.key, fieldTag)] = encodeChild(field.struct as unknown as RuntimeStruct, fieldValue)
  ```

  修复后目标：

  ```ts
  output[getWireKey(field.key, fieldTag)] = encodeChild(field.struct, fieldValue)
  ```

- [ ] `packages/core/src/struct/codec/common.ts:145:40` — `double-assertion` — `source`
      修复前：

  ```ts
  const runtime = resolveRuntimeStruct(struct as unknown as RuntimeStruct)
  ```

  修复后目标：

  ```ts
  const runtime = resolveRuntimeStruct(struct)
  ```

- [ ] `packages/core/src/struct/codec/common.ts:182:52` — `double-assertion` — `source`
      修复前：

  ```ts
  const optionRuntime = resolveRuntimeStruct(option as unknown as RuntimeStruct)
  ```

  修复后目标：

  ```ts
  const optionRuntime = resolveRuntimeStruct(option)
  ```

#### `packages/core/src/struct/codec/query.ts`

- [ ] `packages/core/src/struct/codec/query.ts:65:12` — `double-assertion` — `source`
      修复前：

  ```ts
  return value as unknown as { [key: string]: unknown }
  ```

  修复后目标：

  ```ts
  return value satisfies { [key: string]: unknown }
  ```

#### `packages/core/src/struct/constructors.ts`

- [ ] `packages/core/src/struct/constructors.ts:70:52` — `explicit-any` — `source`
      修复前：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

  修复后目标：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

- [ ] `packages/core/src/struct/constructors.ts:74:37` — `explicit-any` — `source`
      修复前：

  ```ts
  return castStruct<Struct<unknown, any>>(
  ```

  修复后目标：

  ```ts
  return castStruct<Struct<unknown, any>>(
  ```

- [ ] `packages/core/src/struct/constructors.ts:103:22` — `double-assertion` — `source`
      修复前：

  ```ts
  const enumValues = [...values] as unknown as T
  ```

  修复后目标：

  ```ts
  const enumValues = copyStringTuple(values)
  ```

- [ ] `packages/core/src/struct/constructors.ts:128:15` — `type-assertion` — `source`
      修复前：

  ```ts
  values: values as [T[keyof T], ...T[keyof T][]],
  ```

  修复后目标：

  ```ts
  values: toNonEmptyEnumValues(values),
  ```

- [ ] `packages/core/src/struct/constructors.ts:216:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const definition = (struct as unknown as RuntimeStruct)[DEFINITION]
  ```

  修复后目标：

  ```ts
  const definition = struct[DEFINITION]
  ```

- [ ] `packages/core/src/struct/constructors.ts:255:22` — `double-assertion` — `source`
      修复前：

  ```ts
  const tupleItems = [...items] as unknown as T
  ```

  修复后目标：

  ```ts
  const tupleItems = copyStructTuple(items)
  ```

- [ ] `packages/core/src/struct/constructors.ts:272:24` — `double-assertion` — `source`
      修复前：

  ```ts
  const unionOptions = [...options] as unknown as T
  ```

  修复后目标：

  ```ts
  const unionOptions = copyStructTuple(options)
  ```

- [ ] `packages/core/src/struct/constructors.ts:290:24` — `double-assertion` — `source`
      修复前：

  ```ts
  const unionOptions = [...options] as unknown as TOptions
  ```

  修复后目标：

  ```ts
  const unionOptions = copyStructTuple(options)
  ```

- [ ] `packages/core/src/struct/constructors.ts:296:24` — `double-assertion` — `source`
      修复前：

  ```ts
  const optionDef = (option as unknown as RuntimeStruct)[DEFINITION]
  ```

  修复后目标：

  ```ts
  const optionDef = option[DEFINITION]
  ```

- [ ] `packages/core/src/struct/constructors.ts:301:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const fieldStruct = optionDef.shape[discriminator] as unknown as RuntimeStruct | undefined
  ```

  修复后目标：

  ```ts
  const fieldStruct = optionDef.shape[discriminator] | undefined
  ```

- [ ] `packages/core/src/struct/constructors.ts:332:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return snapshot as T
  ```

  修复后目标：

  ```ts
  return snapshot
  ```

- [ ] `packages/core/src/struct/constructors.ts:345:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return createPrimitiveStruct({
  ```

  修复后目标：

  ```ts
  return createPrimitiveStruct({
  ```

- [ ] `packages/core/src/struct/constructors.ts:351:31` — `type-assertion` — `source`
      修复前：

  ```ts
  return success(BigInt(input as string))
  ```

  修复后目标：

  ```ts
  return success(BigInt(input satisfies string))
  ```

- [ ] `packages/core/src/struct/constructors.ts:365:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return createPrimitiveStruct({
  ```

  修复后目标：

  ```ts
  return createPrimitiveStruct({
  ```

- [ ] `packages/core/src/struct/constructors.ts:367:61` — `as-never` — `source`
      修复前：

  ```ts
  const date = input instanceof Date ? input : new Date(input as never)
  ```

  修复后目标：

  ```ts
  const date = input instanceof Date ? input : new Date(input)
  ```

- [ ] `packages/core/src/struct/constructors.ts:418:8` — `double-assertion` — `source`
      修复前：

  ```ts
  if ((value as unknown as RuntimeStruct)[DEFINITION].kind !== 'object') {
  ```

  修复后目标：

  ```ts
  if ((value)[DEFINITION].kind !== 'object') {
  ```

#### `packages/core/src/struct/encode.ts`

- [ ] `packages/core/src/struct/encode.ts:31:52` — `as-never` — `source`
      修复前：

  ```ts
  return definition.encode ? definition.encode(value as never) : value
  ```

  修复后目标：

  ```ts
  return definition.encode ? definition.encode(value) : value
  ```

- [ ] `packages/core/src/struct/encode.ts:34:69` — `double-assertion` — `source`
      修复前：

  ```ts
  return Array.isArray(value) ? value.map((item) => encodeValue(definition.item as unknown as RuntimeStruct, item, options)) : value
  ```

  修复后目标：

  ```ts
  return Array.isArray(value) ? value.map((item) => encodeValue(definition.item, item, options)) : value
  ```

- [ ] `packages/core/src/struct/encode.ts:39:59` — `double-assertion` — `source`
      修复前：

  ```ts
  index < definition.items.length ? encodeValue(definition.items[index] as unknown as RuntimeStruct, item, options) : item,
  ```

  修复后目标：

  ```ts
  index < definition.items.length ? encodeValue(definition.items[index], item, options) : item,
  ```

- [ ] `packages/core/src/struct/encode.ts:49:35` — `double-assertion` — `source`
      修复前：

  ```ts
  output[key] = encodeValue(definition.value as unknown as RuntimeStruct, entry, options)
  ```

  修复后目标：

  ```ts
  output[key] = encodeValue(definition.value, entry, options)
  ```

- [ ] `packages/core/src/struct/encode.ts:67:35` — `double-assertion` — `source`
      修复前：

  ```ts
  output[key] = encodeValue(fieldStruct as unknown as RuntimeStruct, value[key], options)
  ```

  修复后目标：

  ```ts
  output[key] = encodeValue(fieldStruct, value[key], options)
  ```

- [ ] `packages/core/src/struct/encode.ts:78:38` — `double-assertion` — `source`
      修复前：

  ```ts
  output['path'] = encodeValue(definition.path as unknown as RuntimeStruct, value['path'], options)
  ```

  修复后目标：

  ```ts
  output['path'] = encodeValue(definition.path, value['path'], options)
  ```

- [ ] `packages/core/src/struct/encode.ts:81:39` — `double-assertion` — `source`
      修复前：

  ```ts
  output['query'] = encodeValue(definition.query as unknown as RuntimeStruct, value['query'], options)
  ```

  修复后目标：

  ```ts
  output['query'] = encodeValue(definition.query, value['query'], options)
  ```

- [ ] `packages/core/src/struct/encode.ts:84:41` — `double-assertion` — `source`
      修复前：

  ```ts
  output['headers'] = encodeValue(definition.headers as unknown as RuntimeStruct, value['headers'], options)
  ```

  修复后目标：

  ```ts
  output['headers'] = encodeValue(definition.headers, value['headers'], options)
  ```

- [ ] `packages/core/src/struct/encode.ts:87:38` — `double-assertion` — `source`
      修复前：

  ```ts
  output['body'] = encodeValue(definition.body as unknown as RuntimeStruct, value['body'], options)
  ```

  修复后目标：

  ```ts
  output['body'] = encodeValue(definition.body, value['body'], options)
  ```

- [ ] `packages/core/src/struct/encode.ts:93:26` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(definition.struct as unknown as RuntimeStruct, value, options)
  ```

  修复后目标：

  ```ts
  return encodeValue(definition.struct, value, options)
  ```

- [ ] `packages/core/src/struct/encode.ts:97:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const optDef = (opt as unknown as RuntimeStruct)[DEFINITION]
  ```

  修复后目标：

  ```ts
  const optDef = opt[DEFINITION]
  ```

- [ ] `packages/core/src/struct/encode.ts:98:46` — `double-assertion` — `source`
      修复前：

  ```ts
  if (matchesDefinition(optDef, value, opt as unknown as RuntimeStruct)) {
  ```

  修复后目标：

  ```ts
  if (matchesDefinition(optDef, value, opt)) {
  ```

- [ ] `packages/core/src/struct/encode.ts:99:30` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(opt as unknown as RuntimeStruct, value, options)
  ```

  修复后目标：

  ```ts
  return encodeValue(opt, value, options)
  ```

- [ ] `packages/core/src/struct/encode.ts:107:45` — `type-assertion` — `source`
      修复前：

  ```ts
  const matched = definition.map.get((value as { [key: string]: unknown })[definition.discriminator])
  ```

  修复后目标：

  ```ts
  const matched = definition.map.get(value[definition.discriminator])
  ```

- [ ] `packages/core/src/struct/encode.ts:109:30` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(matched as unknown as RuntimeStruct, value, options)
  ```

  修复后目标：

  ```ts
  return encodeValue(matched, value, options)
  ```

- [ ] `packages/core/src/struct/encode.ts:116:26` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(definition.right as unknown as RuntimeStruct, value, options)
  ```

  修复后目标：

  ```ts
  return encodeValue(definition.right, value, options)
  ```

- [ ] `packages/core/src/struct/encode.ts:149:41` — `as-never` — `source`
      修复前：

  ```ts
  return definition.values.includes(value as never)
  ```

  修复后目标：

  ```ts
  return isEnumValue(definition.values, value)
  ```

- [ ] `packages/core/src/struct/encode.ts:154:26` — `double-assertion` — `source`
      修复前：

  ```ts
  const itemStruct = definition.item as unknown as RuntimeStruct
  ```

  修复后目标：

  ```ts
  const itemStruct = definition.item
  ```

- [ ] `packages/core/src/struct/encode.ts:167:32` — `double-assertion` — `source`
      修复前：

  ```ts
  if (!matchesFieldValue(definition.items[index] as unknown as RuntimeStruct, value[index])) {
  ```

  修复后目标：

  ```ts
  if (!matchesFieldValue(definition.items[index], value[index])) {
  ```

- [ ] `packages/core/src/struct/encode.ts:182:32` — `double-assertion` — `source`
      修复前：

  ```ts
  return matchesFieldValue(definition.struct as unknown as RuntimeStruct, value)
  ```

  修复后目标：

  ```ts
  return matchesFieldValue(definition.struct, value)
  ```

- [ ] `packages/core/src/struct/encode.ts:188:27` — `double-assertion` — `source`
      修复前：

  ```ts
  const valueStruct = definition.value as unknown as RuntimeStruct
  ```

  修复后目标：

  ```ts
  const valueStruct = definition.value
  ```

- [ ] `packages/core/src/struct/encode.ts:198:28` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((opt as unknown as RuntimeStruct)[DEFINITION], value, opt as unknown as RuntimeStruct),
  ```

  修复后目标：

  ```ts
  matchesDefinition((opt)[DEFINITION], value, opt),
  ```

- [ ] `packages/core/src/struct/encode.ts:198:81` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((opt as unknown as RuntimeStruct)[DEFINITION], value, opt as unknown as RuntimeStruct),
  ```

  修复后目标：

  ```ts
  matchesDefinition((opt)[DEFINITION], value, opt),
  ```

- [ ] `packages/core/src/struct/encode.ts:201:58` — `type-assertion` — `source`
      修复前：

  ```ts
  return isPlainObject(value) && definition.map.has((value as { [key: string]: unknown })[definition.discriminator])
  ```

  修复后目标：

  ```ts
  return isPlainObject(value) && definition.map.has(value[definition.discriminator])
  ```

- [ ] `packages/core/src/struct/encode.ts:204:28` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((definition.left as unknown as RuntimeStruct)[DEFINITION], value, definition.left as unknown as RuntimeStruct) &&
  ```

  修复后目标：

  ```ts
  matchesDefinition((definition.left)[DEFINITION], value, definition.left) &&
  ```

- [ ] `packages/core/src/struct/encode.ts:204:93` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((definition.left as unknown as RuntimeStruct)[DEFINITION], value, definition.left as unknown as RuntimeStruct) &&
  ```

  修复后目标：

  ```ts
  matchesDefinition((definition.left)[DEFINITION], value, definition.left) &&
  ```

- [ ] `packages/core/src/struct/encode.ts:205:28` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((definition.right as unknown as RuntimeStruct)[DEFINITION], value, definition.right as unknown as RuntimeStruct)
  ```

  修复后目标：

  ```ts
  matchesDefinition(definition.right[DEFINITION], value, definition.right)
  ```

- [ ] `packages/core/src/struct/encode.ts:205:94` — `double-assertion` — `source`
      修复前：

  ```ts
  matchesDefinition((definition.right as unknown as RuntimeStruct)[DEFINITION], value, definition.right as unknown as RuntimeStruct)
  ```

  修复后目标：

  ```ts
  matchesDefinition(definition.right[DEFINITION], value, definition.right)
  ```

- [ ] `packages/core/src/struct/encode.ts:218:30` — `double-assertion` — `source`
      修复前：

  ```ts
  const fieldDefinition = (fieldStruct as unknown as RuntimeStruct)[DEFINITION]
  ```

  修复后目标：

  ```ts
  const fieldDefinition = fieldStruct[DEFINITION]
  ```

- [ ] `packages/core/src/struct/encode.ts:230:77` — `as-never` — `source`
      修复前：

  ```ts
  if (fieldDefinition.kind === 'enum' && !fieldDefinition.values.includes(fieldValue as never)) {
  ```

  修复后目标：

  ```ts
  if (fieldDefinition.kind === 'enum' && !isEnumValue(fieldDefinition.values, fieldValue)) {
  ```

- [ ] `packages/core/src/struct/encode.ts:233:28` — `double-assertion` — `source`
      修复前：

  ```ts
  if (!matchesFieldValue(fieldStruct as unknown as RuntimeStruct, fieldValue)) {
  ```

  修复后目标：

  ```ts
  if (!matchesFieldValue(fieldStruct, fieldValue)) {
  ```

#### `packages/core/src/struct/facade.ts`

- [ ] `packages/core/src/struct/facade.ts:41:29` — `type-assertion` — `source`
      修复前：

  ```ts
  return createEnumStruct(value as readonly [string, ...string[]])
  ```

  修复后目标：

  ```ts
  return createEnumStruct(value satisfies readonly [string, ...string[]])
  ```

- [ ] `packages/core/src/struct/facade.ts:44:33` — `type-assertion` — `source`
      修复前：

  ```ts
  return createObjectEnumStruct(value as { [key: string]: number | string })
  ```

  修复后目标：

  ```ts
  return createObjectEnumStruct(value satisfies { [key: string]: number | string })
  ```

#### `packages/core/src/struct/introspection.ts`

- [ ] `packages/core/src/struct/introspection.ts:13:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const definition = (field as unknown as RuntimeStruct)[DEFINITION]
  ```

  修复后目标：

  ```ts
  const definition = field[DEFINITION]
  ```

- [ ] `packages/core/src/struct/introspection.ts:28:50` — `double-assertion` — `source`
      修复前：

  ```ts
  return isStruct(value) && resolveRuntimeStruct(value as unknown as RuntimeStruct)[DEFINITION].kind === 'object'
  ```

  修复后目标：

  ```ts
  return isStruct(value) && resolveRuntimeStruct(value)[DEFINITION].kind === 'object'
  ```

- [ ] `packages/core/src/struct/introspection.ts:33:40` — `double-assertion` — `source`
      修复前：

  ```ts
  const runtime = resolveRuntimeStruct(struct as unknown as RuntimeStruct)
  ```

  修复后目标：

  ```ts
  const runtime = resolveRuntimeStruct(struct)
  ```

- [ ] `packages/core/src/struct/introspection.ts:42:13` — `double-assertion` — `source`
      修复前：

  ```ts
  struct: field as unknown as StructLike<unknown, unknown, boolean>,
  ```

  修复后目标：

  ```ts
  struct: field satisfies StructLike<unknown, unknown, boolean>,
  ```

- [ ] `packages/core/src/struct/introspection.ts:43:24` — `double-assertion` — `source`
      修复前：

  ```ts
  tags: getFieldTags(field as unknown as StructLike<unknown, unknown, boolean>, key),
  ```

  修复后目标：

  ```ts
  tags: getFieldTags(field satisfies StructLike<unknown, unknown, boolean>, key),
  ```

- [ ] `packages/core/src/struct/introspection.ts:49:22` — `double-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(struct as unknown as RuntimeStruct, value)
  ```

  修复后目标：

  ```ts
  return encodeValue(struct, value)
  ```

- [ ] `packages/core/src/struct/introspection.ts:57:19` — `double-assertion` — `source`
      修复前：

  ```ts
  const runtime = struct as unknown as RuntimeStruct
  ```

  修复后目标：

  ```ts
  const runtime = struct
  ```

- [ ] `packages/core/src/struct/introspection.ts:60:19` — `double-assertion` — `source`
      修复前：

  ```ts
  return [null, result.value as unknown as S['_struct']['output']]
  ```

  修复后目标：

  ```ts
  return [null, result.value satisfies S['_struct']['output']]
  ```

- [ ] `packages/core/src/struct/introspection.ts:62:43` — `double-assertion` — `source`
      修复前：

  ```ts
  return [new StructError(result.issues), safeZeroValue(runtime) as unknown as S['_struct']['output']]
  ```

  修复后目标：

  ```ts
  return [new StructError(result.issues), safeZeroValue(runtime) satisfies S['_struct']['output']]
  ```

#### `packages/core/src/struct/parse.ts`

- [ ] `packages/core/src/struct/parse.ts:127:37` — `type-assertion` — `source`
      修复前：

  ```ts
  return definition.values.includes(input as string | number)
  ```

  修复后目标：

  ```ts
  return definition.values.includes(input satisfies string | number)
  ```

- [ ] `packages/core/src/struct/parse.ts:145:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const result = parseValue(definition.item as RuntimeStruct, input[index], [...path, index], 'value')
  ```

  修复后目标：

  ```ts
  const result = parseValue(definition.item, input[index], [...path, index], 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:172:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const result = parseValue(itemStruct as RuntimeStruct, hasOwnInput ? input[key] : undefined, [...path, key], 'field')
  ```

  修复后目标：

  ```ts
  const result = parseValue(itemStruct, hasOwnInput ? input[key] : undefined, [...path, key], 'field')
  ```

- [ ] `packages/core/src/struct/parse.ts:199:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const result = parseValue(definition.value as RuntimeStruct, value, [...path, key], 'field')
  ```

  修复后目标：

  ```ts
  const result = parseValue(definition.value, value, [...path, key], 'field')
  ```

- [ ] `packages/core/src/struct/parse.ts:222:24` — `type-assertion` — `source`
      修复前：

  ```ts
  const sectionKey = key as string
  ```

  修复后目标：

  ```ts
  const sectionKey = key satisfies string
  ```

- [ ] `packages/core/src/struct/parse.ts:237:21` — `type-assertion` — `source`
      修复前：

  ```ts
  return parseValue(definition.struct as RuntimeStruct, input, path, mode)
  ```

  修复后目标：

  ```ts
  return parseValue(definition.struct, input, path, mode)
  ```

- [ ] `packages/core/src/struct/parse.ts:249:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const result = parseValue(definition.items[index] as RuntimeStruct, input[index], [...path, index], 'value')
  ```

  修复后目标：

  ```ts
  const result = parseValue(definition.items[index], input[index], [...path, index], 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:262:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const result = parseValue(option as RuntimeStruct, input, path, 'value')
  ```

  修复后目标：

  ```ts
  const result = parseValue(option, input, path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:282:21` — `type-assertion` — `source`
      修复前：

  ```ts
  return parseValue(target as RuntimeStruct, input, path, 'value')
  ```

  修复后目标：

  ```ts
  return parseValue(target, input, path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:286:33` — `type-assertion` — `source`
      修复前：

  ```ts
  const leftResult = parseValue(definition.left as RuntimeStruct, input, path, 'value')
  ```

  修复后目标：

  ```ts
  const leftResult = parseValue(definition.left, input, path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:291:34` — `type-assertion` — `source`
      修复前：

  ```ts
  const rightResult = parseValue(definition.right as RuntimeStruct, input, path, 'value')
  ```

  修复后目标：

  ```ts
  const rightResult = parseValue(definition.right, input, path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:332:39` — `type-assertion` — `source`
      修复前：

  ```ts
  const leftZero = buildZeroValue(definition.left as RuntimeStruct, path)
  ```

  修复后目标：

  ```ts
  const leftZero = buildZeroValue(definition.left, path)
  ```

- [ ] `packages/core/src/struct/parse.ts:333:40` — `type-assertion` — `source`
      修复前：

  ```ts
  const rightZero = buildZeroValue(definition.right as RuntimeStruct, path)
  ```

  修复后目标：

  ```ts
  const rightZero = buildZeroValue(definition.right, path)
  ```

- [ ] `packages/core/src/struct/parse.ts:345:41` — `type-assertion` — `source`
      修复前：

  ```ts
  const value = buildMissingValue(itemStruct as RuntimeStruct, [...path, key], 'field')
  ```

  修复后目标：

  ```ts
  const value = buildMissingValue(itemStruct, [...path, key], 'field')
  ```

- [ ] `packages/core/src/struct/parse.ts:355:32` — `type-assertion` — `source`
      修复前：

  ```ts
  return buildMissingValue(definition.options[0] as RuntimeStruct, path, 'value')
  ```

  修复后目标：

  ```ts
  return buildMissingValue(definition.options[0], path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:358:32` — `type-assertion` — `source`
      修复前：

  ```ts
  return buildMissingValue(definition.options[0] as RuntimeStruct, path, 'value')
  ```

  修复后目标：

  ```ts
  return buildMissingValue(definition.options[0], path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:375:32` — `type-assertion` — `source`
      修复前：

  ```ts
  return buildMissingValue(definition.struct as RuntimeStruct, path, 'value')
  ```

  修复后目标：

  ```ts
  return buildMissingValue(definition.struct, path, 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:380:43` — `type-assertion` — `source`
      修复前：

  ```ts
  output[index] = buildMissingValue(definition.items[index] as RuntimeStruct, [...path, index], 'value')
  ```

  修复后目标：

  ```ts
  output[index] = buildMissingValue(definition.items[index], [...path, index], 'value')
  ```

- [ ] `packages/core/src/struct/parse.ts:410:28` — `double-assertion` — `source`
      修复前：

  ```ts
  sections.push(['path', definition.path as unknown as RuntimeStruct])
  ```

  修复后目标：

  ```ts
  sections.push(['path', definition.path])
  ```

- [ ] `packages/core/src/struct/parse.ts:413:29` — `double-assertion` — `source`
      修复前：

  ```ts
  sections.push(['query', definition.query as unknown as RuntimeStruct])
  ```

  修复后目标：

  ```ts
  sections.push(['query', definition.query])
  ```

- [ ] `packages/core/src/struct/parse.ts:416:31` — `double-assertion` — `source`
      修复前：

  ```ts
  sections.push(['headers', definition.headers as unknown as RuntimeStruct])
  ```

  修复后目标：

  ```ts
  sections.push(['headers', definition.headers])
  ```

- [ ] `packages/core/src/struct/parse.ts:419:28` — `double-assertion` — `source`
      修复前：

  ```ts
  sections.push(['body', definition.body as unknown as RuntimeStruct])
  ```

  修复后目标：

  ```ts
  sections.push(['body', definition.body])
  ```

#### `packages/core/src/struct/runtime.ts`

- [ ] `packages/core/src/struct/runtime.ts:10:16` — `type-assertion` — `source`
      修复前：

  ```ts
  makeStruct({
  ```

  修复后目标：

  ```ts
  makeStruct({
  ```

- [ ] `packages/core/src/struct/runtime.ts:22:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return struct as TStruct
  ```

  修复后目标：

  ```ts
  return structStruct
  ```

- [ ] `packages/core/src/struct/runtime.ts:28:14` — `as-never` — `source`
      修复前：

  ```ts
  [TYPES]: undefined as never,
  ```

  修复后目标：

  ```ts
  [TYPES]: undefined,
  ```

- [ ] `packages/core/src/struct/runtime.ts:29:14` — `as-never` — `source`
      修复前：

  ```ts
  _struct: undefined as never,
  ```

  修复后目标：

  ```ts
  _struct: undefined,
  ```

#### `packages/core/src/struct/shape.ts`

- [ ] `packages/core/src/struct/shape.ts:34:10` — `double-assertion` — `source`
      修复前：

  ```ts
  return output as unknown as ObjectShape
  ```

  修复后目标：

  ```ts
  return output satisfies ObjectShape
  ```

#### `packages/core/src/struct/tag.ts`

- [ ] `packages/core/src/struct/tag.ts:85:11` — `type-assertion` — `source`
      修复前：

  ```ts
  header: defineValueTag(HeaderTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  ```

  修复后目标：

  ```ts
  header: defineValueTag(HeaderTag, { requireExplicitName: true }) satisfies RequiredValueTagFactory,
  ```

- [ ] `packages/core/src/struct/tag.ts:89:10` — `type-assertion` — `source`
      修复前：

  ```ts
  query: defineValueTag(QueryTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  ```

  修复后目标：

  ```ts
  query: defineValueTag(QueryTag, { requireExplicitName: true }) satisfies RequiredValueTagFactory,
  ```

- [ ] `packages/core/src/struct/tag.ts:90:8` — `type-assertion` — `source`
      修复前：

  ```ts
  uri: defineValueTag(UriTag, { requireExplicitName: true }) as RequiredValueTagFactory,
  ```

  修复后目标：

  ```ts
  uri: defineValueTag(UriTag, { requireExplicitName: true }) satisfies RequiredValueTagFactory,
  ```

- [ ] `packages/core/src/struct/tag.ts:108:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return existing as MutableFieldTag<TName>
  ```

  修复后目标：

  ```ts
  return existing satisfies MutableFieldTag<TName>
  ```

#### `packages/core/src/struct/types.ts`

- [ ] `packages/core/src/struct/types.ts:60:32` — `explicit-any` — `source`
      修复前：

  ```ts
  export type AnyStruct = Struct<any, any, boolean>
  ```

  修复后目标：

  ```ts
  export type AnyStruct = Struct<any, any, boolean>
  ```

- [ ] `packages/core/src/struct/types.ts:60:37` — `explicit-any` — `source`
      修复前：

  ```ts
  export type AnyStruct = Struct<any, any, boolean>
  ```

  修复后目标：

  ```ts
  export type AnyStruct = Struct<any, any, boolean>
  ```

- [ ] `packages/core/src/struct/types.ts:81:44` — `explicit-any` — `source`
      修复前：

  ```ts
  export type ObjectShape = { [key: string]: any }
  ```

  修复后目标：

  ```ts
  // Type boundary: keep public ObjectShape as any for exact object-literal struct inference; add RuntimeObjectShape separately.
  // oxlint-disable-next-line typescript/no-explicit-any
  export type ObjectShape = { [key: string]: any }
  export type RuntimeObjectShape = { [key: string]: RuntimeStruct }
  ```

#### `packages/core/src/struct/utils.ts`

- [ ] `packages/core/src/struct/utils.ts:24:37` — `type-assertion` — `source`
      修复前：

  ```ts
  return `array<${expectedType((definition.item as RuntimeStruct)[DEFINITION])}>`
  ```

  修复后目标：

  ```ts
  return `array<${expectedType(definition.item[DEFINITION])}>`
  ```

- [ ] `packages/core/src/struct/utils.ts:46:31` — `type-assertion` — `source`
      修复前：

  ```ts
  return `${expectedType((definition.left as RuntimeStruct)[DEFINITION])} & ${expectedType((definition.right as RuntimeStruct)[DEFINITION])}`
  ```

  修复后目标：

  ```ts
  return `${expectedType(definition.left[DEFINITION])} & ${expectedType(definition.right[DEFINITION])}`
  ```

- [ ] `packages/core/src/struct/utils.ts:46:97` — `type-assertion` — `source`
      修复前：

  ```ts
  return `${expectedType((definition.left as RuntimeStruct)[DEFINITION])} & ${expectedType((definition.right as RuntimeStruct)[DEFINITION])}`
  ```

  修复后目标：

  ```ts
  return `${expectedType(definition.left[DEFINITION])} & ${expectedType(definition.right[DEFINITION])}`
  ```

- [ ] `packages/core/src/struct/utils.ts:52:63` — `type-assertion` — `source`
      修复前：

  ```ts
  return definition.options.map((option) => expectedType((option as RuntimeStruct)[DEFINITION])).join(' | ')
  ```

  修复后目标：

  ```ts
  return definition.options.map((option) => expectedType(option[DEFINITION])).join(' | ')
  ```

- [ ] `packages/core/src/struct/utils.ts:58:38` — `type-assertion` — `source`
      修复前：

  ```ts
  return `record<${expectedType((definition.value as RuntimeStruct)[DEFINITION])}>`
  ```

  修复后目标：

  ```ts
  return `record<${expectedType(definition.value[DEFINITION])}>`
  ```

- [ ] `packages/core/src/struct/utils.ts:114:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return value.map((item) => cloneValue(item)) as T
  ```

  修复后目标：

  ```ts
  return value.map((item) => cloneValue(item))
  ```

- [ ] `packages/core/src/struct/utils.ts:118:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return new Date(value.getTime()) as T
  ```

  修复后目标：

  ```ts
  return new Date(value.getTime())
  ```

- [ ] `packages/core/src/struct/utils.ts:122:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return value.slice(0) as T
  ```

  修复后目标：

  ```ts
  return value.slice(0)
  ```

- [ ] `packages/core/src/struct/utils.ts:130:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return output as T
  ```

  修复后目标：

  ```ts
  return output
  ```

#### `packages/core/src/web_socket/codec.ts`

- [ ] `packages/core/src/web_socket/codec.ts:58:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return normalizeSocketPayload(messageType, value) as WebSocketIncomingData<TIncoming>
  ```

  修复后目标：

  ```ts
  return normalizeSocketPayload(messageType, value) satisfies WebSocketIncomingData<TIncoming>
  ```

#### `packages/core/src/web_socket/heartbeat.ts`

- [ ] `packages/core/src/web_socket/heartbeat.ts:43:70` — `type-assertion` — `source`
      修复前：

  ```ts
  const serialized = serializeOutgoingWebSocketMessage(outgoing, nextMessage as WebSocketOutgoingData<TOutgoing>)
  ```

  修复后目标：

  ```ts
  const serialized = serializeOutgoingWebSocketMessage(outgoing, nextMessage satisfies WebSocketOutgoingData<TOutgoing>)
  ```

- [ ] `packages/core/src/web_socket/heartbeat.ts:87:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return message() as T
  ```

  修复后目标：

  ```ts
  return message()
  ```

#### `packages/core/src/web_socket/web_socket.ts`

- [ ] `packages/core/src/web_socket/web_socket.ts:229:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return value as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:253:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:260:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>) => create(input)) as WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
  ```

  修复后目标：

  ```ts
  return createCommandBuilder(create)
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:337:24` — `type-assertion` — `source`
      修复前：

  ```ts
  currentSocket: undefined as WebSocket | undefined,
  ```

  修复后目标：

  ```ts
  currentSocket: undefined satisfies WebSocket | undefined,
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:338:20` — `type-assertion` — `source`
      修复前：

  ```ts
  heartbeat: undefined as HeartbeatRuntime<WebSocketIncomingData<TIncoming>> | undefined,
  ```

  修复后目标：

  ```ts
  heartbeat: undefined satisfies HeartbeatRuntime<WebSocketIncomingData<TIncoming>> | undefined,
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:342:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const session = createWebSocketSession(
  ```

  修复后目标：

  ```ts
  const session = createWebSocketSession(
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:360:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const heartbeatConfig = (config?.heartbeat ?? clientConfig.webSocket.heartbeat) as
  ```

  修复后目标：

  ```ts
  const heartbeatConfig = (config?.heartbeat ?? clientConfig.webSocket.heartbeat) as
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:527:30` — `type-assertion` — `source`
      修复前：

  ```ts
  resolveSession(session as WebSocketSessionLike)
  ```

  修复后目标：

  ```ts
  resolveSession(session satisfies WebSocketSessionLike)
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:673:19` — `type-assertion` — `source`
      修复前：

  ```ts
  return [null, session as WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>, session.connection]
  ```

  修复后目标：

  ```ts
  return [null, session satisfies WebSocketSession<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>, session.connection]
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:676:13` — `type-assertion` — `source`
      修复前：

  ```ts
  return [error as RequestError<unknown>, undefined, state.connection]
  ```

  修复后目标：

  ```ts
  return [error as RequestError<unknown>, undefined, state.connection]
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:703:7` — `definite-assignment` — `source`
      修复前：

  ```ts
  let resolve!: Deferred<T>['resolve']
  ```

  修复后目标：

  ```ts
  const { promise, resolve, reject } = createPromiseWithResolvers<T>()
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:704:7` — `definite-assignment` — `source`
      修复前：

  ```ts
  let reject!: Deferred<T>['reject']
  ```

  修复后目标：

  ```ts
  const { promise, resolve, reject } = createPromiseWithResolvers<T>()
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:754:40` — `type-assertion` — `source`
      修复前：

  ```ts
  state.listeners.runtimeError.add(listener as (error: unknown) => void)
  ```

  修复后目标：

  ```ts
  state.listeners.runtimeError.add(listener satisfies (error: unknown) => void)
  ```

- [ ] `packages/core/src/web_socket/web_socket.ts:756:45` — `type-assertion` — `source`
      修复前：

  ```ts
  state.listeners.runtimeError.delete(listener as (error: unknown) => void)
  ```

  修复后目标：

  ```ts
  state.listeners.runtimeError.delete(listener satisfies (error: unknown) => void)
  ```

#### `packages/core/tsdown.config.ts`

- [ ] `packages/core/tsdown.config.ts:6:15` — `type-assertion` — `source`
      修复前：

  ```ts
  const pkg = JSON.parse(raw) as Record<string, unknown>
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

#### `packages/opentelemetry-server/src/interceptor/web_socket.ts`

- [ ] `packages/opentelemetry-server/src/interceptor/web_socket.ts:137:11` — `type-assertion` — `source`
      修复前：

  ```ts
  return (closeInfo as { cause?: unknown }).cause
  ```

  修复后目标：

  ```ts
  return (closeInfo satisfies { cause?: unknown }).cause
  ```

#### `packages/opentelemetry-server/src/option.ts`

- [ ] `packages/opentelemetry-server/src/option.ts:119:25` — `type-assertion` — `source`
      修复前：

  ```ts
  const unsafeOptions = options as OpenTelemetryServerOptions & {
  ```

  修复后目标：

  ```ts
  const unsafeOptions = options satisfies OpenTelemetryServerOptions & {
  ```

### 测试

#### `packages/angular/src/core.browser.spec.ts`

- [ ] `packages/angular/src/core.browser.spec.ts:136:62` — `type-assertion` — `source`
      修复前：

  ```ts
  const usersRequest = TestBed.runInInjectionContext(() => injectClient().execute(getUsers()) as Promise<UsersResult>)
  ```

  修复后目标：

  ```ts
  const usersRequest = TestBed.runInInjectionContext(() => injectClient().execute(getUsers())
  ```

- [ ] `packages/angular/src/core.browser.spec.ts:191:24` — `type-assertion` — `source`
      修复前：

  ```ts
  outerRequest = this.client.execute(getUsers()) as Promise<UsersResult>
  ```

  修复后目标：

  ```ts
  outerRequest = this.client.execute(getUsers())
  ```

- [ ] `packages/angular/src/core.browser.spec.ts:218:24` — `type-assertion` — `source`
      修复前：

  ```ts
  innerRequest = this.client.execute(getUsers()) as Promise<UsersResult>
  ```

  修复后目标：

  ```ts
  innerRequest = this.client.execute(getUsers())
  ```

#### `packages/angular/test/setup.ts`

- [ ] `packages/angular/test/setup.ts:87:14` — `type-assertion` — `source`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

#### `packages/core/src/client/client.spec.ts`

- [ ] `packages/core/src/client/client.spec.ts:63:34` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => getClientConfig({} as never)).toThrowError()
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/client/client.spec.ts:75:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
  ```

  修复后目标：

  ```ts
  const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) satisfies typeof fetch
  ```

- [ ] `packages/core/src/client/client.spec.ts:100:27` — `double-assertion` — `source`
      修复前：

  ```ts
  withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
  ```

  修复后目标：

  ```ts
  withWebSocketHandle(MockWebSocket),
  ```

- [ ] `packages/core/src/client/client.spec.ts:158:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch
  ```

  修复后目标：

  ```ts
  const customFetch = vi.fn(async () => new Response('ok', { status: 200 })) satisfies typeof fetch
  ```

- [ ] `packages/core/src/client/client.spec.ts:222:20` — `double-assertion` — `source`
      修复前：

  ```ts
  WebSocket: MockWebSocket as unknown as typeof WebSocket,
  ```

  修复后目标：

  ```ts
  WebSocket: MockWebSocket,
  ```

- [ ] `packages/core/src/client/client.spec.ts:251:27` — `double-assertion` — `source`
      修复前：

  ```ts
  withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
  ```

  修复后目标：

  ```ts
  withWebSocketHandle(MockWebSocket),
  ```

#### `packages/core/src/client/client.type.test.ts`

- [ ] `packages/core/src/client/client.type.test.ts:39:21` — `type-assertion` — `source`
      修复前：

  ```ts
  const customFetch = Object.assign(
  ```

  修复后目标：

  ```ts
  const customFetch = Object.assign(
  ```

- [ ] `packages/core/src/client/client.type.test.ts:64:23` — `double-assertion` — `source`
      修复前：

  ```ts
  withWebSocketHandle(MockWebSocket as unknown as typeof WebSocket),
  ```

  修复后目标：

  ```ts
  withWebSocketHandle(MockWebSocket),
  ```

- [ ] `packages/core/src/client/client.type.test.ts:100:16` — `double-assertion` — `source`
      修复前：

  ```ts
  WebSocket: MockWebSocket as unknown as typeof WebSocket,
  ```

  修复后目标：

  ```ts
  WebSocket: MockWebSocket,
  ```

- [ ] `packages/core/src/client/client.type.test.ts:130:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withEndpoint expects a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:135:6` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error serializer must return a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:139:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withHTTPHandle expects a fetch implementation
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:142:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withSSEHandle expects a fetch implementation
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:145:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketHandle expects a WebSocket constructor
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:148:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketProtocols expects a string array
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:151:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketHeartbeat requires an interval
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:154:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketBeforeConnect expects a function
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:157:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketQueue overflow must be a known strategy
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:160:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withWebSocketReconnect attempts must be numeric
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:163:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withXSRF cookieName must be a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/client/client.type.test.ts:166:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error withXSRF tokenProvider must be synchronous and return a token or nullish value
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/client/execute.spec.ts`

- [ ] `packages/core/src/client/execute.spec.ts:20:33` — `type-assertion` — `source`
      修复前：

  ```ts
  await expect(client.execute({ kind: 'test' } as Command)).rejects.toThrow('Unsupported command kind: test')
  ```

  修复后目标：

  ```ts
  await expect(client.execute({ kind: 'test' } satisfies Command)).rejects.toThrow('Unsupported command kind: test')
  ```

#### `packages/core/src/error/error.type.test.ts`

- [ ] `packages/core/src/error/error.type.test.ts:25:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error invalid definition error code
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/http/http.browser.spec.ts`

- [ ] `packages/core/src/http/http.browser.spec.ts:87:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const fetchMock = vi.fn(async (request: Request) => {
  ```

  修复后目标：

  ```ts
  const fetchMock = vi.fn(async (request: Request) => {
  ```

#### `packages/core/src/http/http.client.spec.ts`

- [ ] `packages/core/src/http/http.client.spec.ts:47:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const fetchMock = vi.fn(async (request: Request) => {
  ```

  修复后目标：

  ```ts
  const fetchMock = vi.fn(async (request: Request) => {
  ```

#### `packages/core/src/http/http.error.spec.ts`

- [ ] `packages/core/src/http/http.error.spec.ts:59:80` — `as-never` — `source`
      修复前：

  ```ts
  const [error, result, response] = await client.execute(useValidatedRequest({ id: 'oops' } as never))
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/http.error.spec.ts:202:71` — `as-never` — `source`
      修复前：

  ```ts
  const [error, result, response] = await client.execute(useRequest({ id: 1 } as never), {
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/http.error.spec.ts:202:92` — `as-never` — `source`
      修复前：

  ```ts
  const [error, result, response] = await client.execute(useRequest({ id: 1 } as never), {
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/http.error.spec.ts:225:83` — `as-never` — `source`
      修复前：

  ```ts
  const [error, result, response] = await client.execute(useRequest(undefined), { abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/http.error.spec.ts:235:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const signal = { aborted: true, reason: undefined } as AbortSignal
  ```

  修复后目标：

  ```ts
  const signal = { aborted: true, reason: undefined } satisfies AbortSignal
  ```

- [ ] `packages/core/src/http/http.error.spec.ts:330:56` — `as-never` — `source`
      修复前：

  ```ts
  const [error] = await client.execute(useBadRequest({ id: 'invalid' } as never))
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/http/http.spec.ts`

- [ ] `packages/core/src/http/http.spec.ts:108:29` — `type-assertion` — `source`
      修复前：

  ```ts
  capturedRequest = request as typeof capturedRequest
  ```

  修复后目标：

  ```ts
  capturedRequest = request satisfies typeof capturedRequest
  ```

- [ ] `packages/core/src/http/http.spec.ts:196:29` — `type-assertion` — `source`
      修复前：

  ```ts
  capturedRequest = request as typeof capturedRequest
  ```

  修复后目标：

  ```ts
  capturedRequest = request satisfies typeof capturedRequest
  ```

- [ ] `packages/core/src/http/http.spec.ts:229:39` — `as-never` — `source`
      修复前：

  ```ts
  const useRawInput = defineRequest({
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/http/request.spec.ts`

- [ ] `packages/core/src/http/request.spec.ts:186:23` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(JSON.parse(request.body as string)).toEqual({ name: 'baby', uid: 1 })
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `packages/core/src/http/request.spec.ts:255:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((encodedRequest.body as URLSearchParams).toString()).toBe('ids=1&ids=2')
  ```

  修复后目标：

  ```ts
  expect((encodedRequest.body satisfies URLSearchParams).toString()).toBe('ids=1&ids=2')
  ```

- [ ] `packages/core/src/http/request.spec.ts:391:25` — `as-never` — `source`
      修复前：

  ```ts
  builder.setJson(input.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/request.spec.ts:407:25` — `as-never` — `source`
      修复前：

  ```ts
  builder.setJson(input.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/request.spec.ts:423:25` — `as-never` — `source`
      修复前：

  ```ts
  builder.setJson(input.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/request.spec.ts:439:25` — `as-never` — `source`
      修复前：

  ```ts
  builder.setJson(input.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/request.spec.ts:506:42` — `as-never` — `source`
      修复前：

  ```ts
  builder.setFormData({ profile: input.body.profile as never })
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/http/transport/body.spec.ts`

- [ ] `packages/core/src/http/transport/body.spec.ts:39:30` — `as-never` — `source`
      修复前：

  ```ts
  expect(serializeHttpBody((() => 'noop') as never)).toBeNull()
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/transport/body.spec.ts:74:34` — `as-never` — `source`
      修复前：

  ```ts
  expect(detectHttpContentType((() => 'noop') as never)).toBeNull()
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/http/transport/body.spec.ts:116:49` — `as-never` — `source`
      修复前：

  ```ts
  applyRequestContentType(makeRequest({ body: (() => 'noop') as never }), headers)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/http/transport/fetch.response.spec.ts`

- [ ] `packages/core/src/http/transport/fetch.response.spec.ts:109:7` — `double-assertion` — `source`
      修复前：

  ```ts
  fetchMock as unknown as typeof fetch,
  ```

  修复后目标：

  ```ts
  fetchMock satisfies typeof fetch,
  ```

#### `packages/core/src/http/transport/fetch.spec.ts`

- [ ] `packages/core/src/http/transport/fetch.spec.ts:20:24` — `type-assertion` — `source`
      修复前：

  ```ts
  const documentStub = {} as { [key: string]: unknown }
  ```

  修复后目标：

  ```ts
  const documentStub = {}
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:53:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('cookie-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('X-XSRF-TOKEN')).toBe('cookie-token')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:70:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('cookie-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('X-XSRF-TOKEN')).toBe('cookie-token')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:85:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:101:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:116:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:131:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:145:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:161:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:178:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:194:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:202:26` — `type-assertion` — `source`
      修复前：

  ```ts
  const documentStub = {} as { [key: string]: unknown }
  ```

  修复后目标：

  ```ts
  const documentStub = {}
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:221:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:237:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('provider-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('X-XSRF-TOKEN')).toBe('provider-token')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:255:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('existing-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('X-XSRF-TOKEN')).toBe('existing-token')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:273:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('X-XSRF-TOKEN')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:290:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((init.headers as Headers).get('X-XSRF-TOKEN')).toBe('provider-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('X-XSRF-TOKEN')).toBe('provider-token')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:377:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((createFetchRequestInit(jsonRequest).headers as Headers).get('content-type')).toBe('application/json')
  ```

  修复后目标：

  ```ts
  expect((createFetchRequestInit(jsonRequest).headers satisfies Headers).get('content-type')).toBe('application/json')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:378:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((createFetchRequestInit(builderRequest).headers as Headers).get('content-type')).toBe('application/json')
  ```

  修复后目标：

  ```ts
  expect((createFetchRequestInit(builderRequest).headers satisfies Headers).get('content-type')).toBe('application/json')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:379:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((createFetchRequestInit(binaryRequest).headers as Headers).get('content-type')).toBe('application/octet-stream')
  ```

  修复后目标：

  ```ts
  expect((createFetchRequestInit(binaryRequest).headers satisfies Headers).get('content-type')).toBe('application/octet-stream')
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:402:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((createFetchRequestInit(formDataRequest).headers as Headers).has('content-type')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((createFetchRequestInit(formDataRequest).headers satisfies Headers).has('content-type')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:403:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((createFetchRequestInit(suppressedRequest).headers as Headers).has('content-type')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((createFetchRequestInit(suppressedRequest).headers satisfies Headers).has('content-type')).toBe(false)
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:607:27` — `type-assertion` — `source`
      修复前：

  ```ts
  const wrappedStream = init.body as ReadableStream<Uint8Array>
  ```

  修复后目标：

  ```ts
  const wrappedStream = init.body satisfies ReadableStream<Uint8Array>
  ```

- [ ] `packages/core/src/http/transport/fetch.spec.ts:639:27` — `type-assertion` — `source`
      修复前：

  ```ts
  const wrappedStream = init.body as ReadableStream<Uint8Array>
  ```

  修复后目标：

  ```ts
  const wrappedStream = init.body satisfies ReadableStream<Uint8Array>
  ```

#### `packages/core/src/http/transport/utils.spec.ts`

- [ ] `packages/core/src/http/transport/utils.spec.ts:101:40` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(Array.from(new Uint8Array(result as ArrayBuffer))).toEqual([1, 2, 3])
  ```

  修复后目标：

  ```ts
  expect(Array.from(new Uint8Array(result))).toEqual([1, 2, 3])
  ```

#### `packages/core/src/http/xsrf.server.spec.ts`

- [ ] `packages/core/src/http/xsrf.server.spec.ts:15:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const { token } = (await response.json()) as { token: string }
  ```

  修复后目标：

  ```ts
  const { token } = (await response.json()) satisfies { token: string }
  ```

- [ ] `packages/core/src/http/xsrf.server.spec.ts:22:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const { token } = (await tokenResponse.json()) as { token: string }
  ```

  修复后目标：

  ```ts
  const { token } = (await tokenResponse.json()) satisfies { token: string }
  ```

- [ ] `packages/core/src/http/xsrf.server.spec.ts:70:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const { token } = (await tokenResponse.json()) as { token: string }
  ```

  修复后目标：

  ```ts
  const { token } = (await tokenResponse.json()) satisfies { token: string }
  ```

#### `packages/core/src/interceptor/basic_auth.spec.ts`

- [ ] `packages/core/src/interceptor/basic_auth.spec.ts:74:14` — `type-assertion` — `source`
      修复前：

  ```ts
  return {} as EventStreamHandle<unknown>
  ```

  修复后目标：

  ```ts
  return {} satisfies EventStreamHandle<unknown>
  ```

- [ ] `packages/core/src/interceptor/basic_auth.spec.ts:85:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error temporarily removing btoa to test unsupported-runtime behavior
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/interceptor/interceptor.runtime.spec.ts`

- [ ] `packages/core/src/interceptor/interceptor.runtime.spec.ts:34:14` — `type-assertion` — `source`
      修复前：

  ```ts
  return {} as EventStreamHandle<unknown>
  ```

  修复后目标：

  ```ts
  return {} satisfies EventStreamHandle<unknown>
  ```

- [ ] `packages/core/src/interceptor/interceptor.runtime.spec.ts:46:24` — `double-assertion` — `source`
      修复前：

  ```ts
  const fakeStream = {
  ```

  修复后目标：

  ```ts
  const fakeStream = {
  ```

- [ ] `packages/core/src/interceptor/interceptor.runtime.spec.ts:52:14` — `double-assertion` — `source`
      修复前：

  ```ts
  return { ...stream, wrapped: true } as unknown as EventStreamHandle<unknown>
  ```

  修复后目标：

  ```ts
  return { ...stream, wrapped: true } satisfies EventStreamHandle<unknown>
  ```

- [ ] `packages/core/src/interceptor/interceptor.runtime.spec.ts:58:13` — `double-assertion` — `source`
      修复前：

  ```ts
  expect((result as unknown as { wrapped: boolean }).wrapped).toBe(true)
  ```

  修复后目标：

  ```ts
  expect((result satisfies { wrapped: boolean }).wrapped).toBe(true)
  ```

#### `packages/core/src/interceptor/interceptor.spec.ts`

- [ ] `packages/core/src/interceptor/interceptor.spec.ts:84:26` — `type-assertion` — `source`
      修复前：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers as Headers
  ```

  修复后目标：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers satisfies Headers
  ```

- [ ] `packages/core/src/interceptor/interceptor.spec.ts:115:26` — `type-assertion` — `source`
      修复前：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers as Headers
  ```

  修复后目标：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers satisfies Headers
  ```

- [ ] `packages/core/src/interceptor/interceptor.spec.ts:146:26` — `type-assertion` — `source`
      修复前：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers as Headers
  ```

  修复后目标：

  ```ts
  finalHeaders = createFetchRequestInit(req).headers satisfies Headers
  ```

#### `packages/core/src/interceptor/interceptor.type.test.ts`

- [ ] `packages/core/src/interceptor/interceptor.type.test.ts:91:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error password is required
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/interceptor/interceptor.type.test.ts:96:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error encode must return a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/interceptor/interceptor.type.test.ts:99:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error password is required
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/interceptor/interceptor.websocket.spec.ts`

- [ ] `packages/core/src/interceptor/interceptor.websocket.spec.ts:34:14` — `double-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `packages/core/src/interceptor/interceptor.websocket.spec.ts:49:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const fakeSession = {
  ```

  修复后目标：

  ```ts
  const fakeSession = {
  ```

- [ ] `packages/core/src/interceptor/interceptor.websocket.spec.ts:62:13` — `double-assertion` — `source`
      修复前：

  ```ts
  expect((result as unknown as { wrapped: boolean }).wrapped).toBe(true)
  ```

  修复后目标：

  ```ts
  expect((result satisfies { wrapped: boolean }).wrapped).toBe(true)
  ```

#### `packages/core/src/internal/context.spec.ts`

- [ ] `packages/core/src/internal/context.spec.ts:9:30` — `double-assertion` — `source`
      修复前：

  ```ts
  expect(() => context.set({} as unknown as HttpContextToken<string>, 'value')).toThrowError()
  ```

  修复后目标：

  ```ts
  expect(() => context.set({} satisfies HttpContextToken<string>, 'value')).toThrowError()
  ```

- [ ] `packages/core/src/internal/context.spec.ts:15:30` — `double-assertion` — `source`
      修复前：

  ```ts
  expect(() => context.get({} as unknown as HttpContextToken<string>)).toThrowError()
  ```

  修复后目标：

  ```ts
  expect(() => context.get({} satisfies HttpContextToken<string>)).toThrowError()
  ```

- [ ] `packages/core/src/internal/context.spec.ts:95:8` — `double-assertion` — `source`
      修复前：

  ```ts
  [{} as unknown as HttpContextToken<string>, 'ignored'],
  ```

  修复后目标：

  ```ts
  [{} satisfies HttpContextToken<string>, 'ignored'],
  ```

#### `packages/core/src/internal/http_response.spec.ts`

- [ ] `packages/core/src/internal/http_response.spec.ts:32:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toContain('(unknown url)')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toContain('(unknown url)')
  ```

- [ ] `packages/core/src/internal/http_response.spec.ts:33:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toContain(': 0')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toContain(': 0')
  ```

- [ ] `packages/core/src/internal/http_response.spec.ts:44:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toContain('/api/users')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toContain('/api/users')
  ```

- [ ] `packages/core/src/internal/http_response.spec.ts:45:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toContain(': 404')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toContain(': 404')
  ```

- [ ] `packages/core/src/internal/http_response.spec.ts:46:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toContain('Not Found')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toContain('Not Found')
  ```

- [ ] `packages/core/src/internal/http_response.spec.ts:57:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((res.error as Error).message).toBe('validation failed')
  ```

  修复后目标：

  ```ts
  expect((res.error satisfies Error).message).toBe('validation failed')
  ```

#### `packages/core/src/internal/request_builder.spec.ts`

- [ ] `packages/core/src/internal/request_builder.spec.ts:22:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:42:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((built.body as URLSearchParams).get('x')).toBe('y')
  ```

  修复后目标：

  ```ts
  expect((built.body satisfies URLSearchParams).get('x')).toBe('y')
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:322:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const form = built.body as FormData
  ```

  修复后目标：

  ```ts
  const form = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:342:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const form = built.body as FormData
  ```

  修复后目标：

  ```ts
  const form = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:360:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const form = built.body as FormData
  ```

  修复后目标：

  ```ts
  const form = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:378:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const form = built.body as FormData
  ```

  修复后目标：

  ```ts
  const form = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:392:38` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormData({ obj: view.body.obj as never })
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:412:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:429:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:447:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:464:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:598:23` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(JSON.parse(built.body as string)).toEqual({ name: 'baby', uid: 1 })
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:627:23` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(JSON.parse(built.body as string)).toEqual({ traceId: 'trace-1' })
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:699:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((urlencoded.body as URLSearchParams).toString()).toBe('name=Miao')
  ```

  修复后目标：

  ```ts
  expect((urlencoded.body satisfies URLSearchParams).toString()).toBe('name=Miao')
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:704:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((multipart.body as FormData).get('avatar')).toBeInstanceOf(Blob)
  ```

  修复后目标：

  ```ts
  expect((multipart.body satisfies FormData).get('avatar')).toBeInstanceOf(Blob)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:705:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(((multipart.body as FormData).get('avatar') as Blob).size).toBe(avatar.size)
  ```

  修复后目标：

  ```ts
  expect(((multipart.body satisfies FormData).get('avatar') satisfies Blob).size).toBe(avatar.size)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:705:14` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(((multipart.body as FormData).get('avatar') as Blob).size).toBe(avatar.size)
  ```

  修复后目标：

  ```ts
  expect(((multipart.body satisfies FormData).get('avatar') satisfies Blob).size).toBe(avatar.size)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:706:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((multipart.body as FormData).get('name')).toBe('Miao')
  ```

  修复后目标：

  ```ts
  expect((multipart.body satisfies FormData).get('name')).toBe('Miao')
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:873:23` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setJson({ name: 'literal' } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:901:30` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setQueryParams({ profile: view.body.profile } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:917:33` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setFormUrlEncoded({ profile: view.body.profile } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:935:26` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setHeaders(new Headers({ 'x-token': 'raw' }) as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:962:30` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setQueryParams({ id: captured } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:991:23` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setJson({ leaked } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1013:23` — `as-never` — `source`
      修复前：

  ```ts
  ctx.setBlob(view.body.payload as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1120:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1139:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1158:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as FormData
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1177:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as FormData
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies FormData
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1224:35` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormUrlEncoded(view.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1228:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1244:25` — `as-never` — `source`
      修复前：

  ```ts
  request.setJson(view.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1261:25` — `as-never` — `source`
      修复前：

  ```ts
  { body: { tags: 'not-an-array' as never } },
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1264:27` — `as-never` — `source`
      修复前：

  ```ts
  request.setJson({ items: (view.body.tags as unknown as string[]).map((item) => item) } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1264:37` — `double-assertion` — `source`
      修复前：

  ```ts
  request.setJson({ items: (view.body.tags as unknown as string[]).map((item) => item) } as never)
  ```

  修复后目标：

  ```ts
  request.setJson({ items: (view.body.tags satisfies string[]).map((item) => item) } as never)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1302:25` — `as-never` — `source`
      修复前：

  ```ts
  request.setJson({ missing: undefined } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1322:37` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormUrlEncoded(view.body.name as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1341:28` — `as-never` — `source`
      修复前：

  ```ts
  { body: { profile: 'not-an-object' as never } },
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1344:37` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormUrlEncoded(view.body.profile as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1365:30` — `as-never` — `source`
      修复前：

  ```ts
  request.setHeaders({ file: view.body.file } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1384:34` — `as-never` — `source`
      修复前：

  ```ts
  request.setArrayBuffer(view.body.name as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1441:27` — `as-never` — `source`
      修复前：

  ```ts
  request.setText(view.body.id as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1491:35` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormUrlEncoded(view.body as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1495:18` — `type-assertion` — `source`
      修复前：

  ```ts
  const body = built.body as URLSearchParams
  ```

  修复后目标：

  ```ts
  const body = built.body satisfies URLSearchParams
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1507:24` — `as-never` — `source`
      修复前：

  ```ts
  { headers: { id: 1n as never } },
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1509:28` — `as-never` — `source`
      修复前：

  ```ts
  request.setHeaders({ id: view.headers.id } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1526:37` — `as-never` — `source`
      修复前：

  ```ts
  request.setFormData({ id: view.body.id as never })
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1535:32` — `as-never` — `source`
      修复前：

  ```ts
  const built = buildRequest(null as never, undefined, { input })
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/request_builder.spec.ts:1555:26` — `as-never` — `source`
      修复前：

  ```ts
  { body: { profile: 'not-an-object' as never } },
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/internal/request_builder.type.test.ts`

- [ ] `packages/core/src/internal/request_builder.type.test.ts:36:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error unknown body fields are rejected by the typed build view.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/internal/url.spec.ts`

- [ ] `packages/core/src/internal/url.spec.ts:46:13` — `as-never` — `source`
      修复前：

  ```ts
  id: [{ value: 1 }] as never,
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/url.spec.ts:57:18` — `as-never` — `source`
      修复前：

  ```ts
  filters: [{ active: true }] as never,
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/url.spec.ts:67:26` — `as-never` — `source`
      修复前：

  ```ts
  tags: ['a', 'b', { active: true } as never],
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/url.spec.ts:80:14` — `as-never` — `source`
      修复前：

  ```ts
  tags: [undefined as never],
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/internal/url.spec.ts:113:69` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => appendRecordToHeaders(new Headers(), { 'x-object': [{ nested: true }] as never })).toThrow(
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/sse/request.spec.ts`

- [ ] `packages/core/src/sse/request.spec.ts:9:10` — `double-assertion` — `source`
      修复前：

  ```ts
  return build as unknown as RequestBuildHandler<TInput, 'sse'>
  ```

  修复后目标：

  ```ts
  return build satisfies RequestBuildHandler<TInput, 'sse'>
  ```

#### `packages/core/src/sse/sse.spec.ts`

- [ ] `packages/core/src/sse/sse.spec.ts:172:9` — `double-assertion` — `source`
      修复前：

  ```ts
  (async () =>
  ```

  修复后目标：

  ```ts
  (async () =>
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:258:65` — `as-never` — `source`
      修复前：

  ```ts
  const [error, stream, open] = await client.execute(command, {
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:282:69` — `as-never` — `source`
      修复前：

  ```ts
  const [error, stream, open] = await baseClient.execute(command, {
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:542:21` — `double-assertion` — `source`
      修复前：

  ```ts
  withSSEHandle((async () => new Response(null, { status: 503 })) as unknown as typeof fetch),
  ```

  修复后目标：

  ```ts
  withSSEHandle((async () => new Response(null, { status: 503 })) satisfies typeof fetch),
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:647:9` — `double-assertion` — `source`
      修复前：

  ```ts
  (async () =>
  ```

  修复后目标：

  ```ts
  (async () =>
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:695:9` — `double-assertion` — `source`
      修复前：

  ```ts
  (async () =>
  ```

  修复后目标：

  ```ts
  (async () =>
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:744:9` — `double-assertion` — `source`
      修复前：

  ```ts
  (async () =>
  ```

  修复后目标：

  ```ts
  (async () =>
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:815:9` — `double-assertion` — `source`
      修复前：

  ```ts
  (async () =>
  ```

  修复后目标：

  ```ts
  (async () =>
  ```

- [ ] `packages/core/src/sse/sse.spec.ts:872:12` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error testing runtime defensive behavior with invalid input type
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/sse/transport/event_stream.advanced.spec.ts`

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:25:19` — `double-assertion` — `source`
      修复前：

  ```ts
  events.push(event as unknown as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:61:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:76:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:89:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:154:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:176:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:256:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:287:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi
  ```

  修复后目标：

  ```ts
  const mockFetch = vi
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:309:19` — `double-assertion` — `source`
      修复前：

  ```ts
  events.push(event as unknown as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:330:19` — `type-assertion` — `source`
      修复前：

  ```ts
  events.push(event as EventStreamMessage)
  ```

  修复后目标：

  ```ts
  events.push(event satisfies EventStreamMessage)
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:337:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:355:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:374:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:411:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:430:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:466:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:486:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:505:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(async () => {
  ```

- [ ] `packages/core/src/sse/transport/event_stream.advanced.spec.ts:523:23` — `double-assertion` — `source`
      修复前：

  ```ts
  const mockFetch = vi.fn(
  ```

  修复后目标：

  ```ts
  const mockFetch = vi.fn(
  ```

#### `packages/core/src/struct/codec/multipart.spec.ts`

- [ ] `packages/core/src/struct/codec/multipart.spec.ts:22:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((form.get('avatar') as Blob).size).toBe(avatar.size)
  ```

  修复后目标：

  ```ts
  expect((form.get('avatar') satisfies Blob).size).toBe(avatar.size)
  ```

#### `packages/core/src/struct/constructors.browser.spec.ts`

- [ ] `packages/core/src/struct/constructors.browser.spec.ts:56:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((zeroBuffer as ArrayBuffer).byteLength).toBe(0)
  ```

  修复后目标：

  ```ts
  expect(zeroBuffer.byteLength).toBe(0)
  ```

#### `packages/core/src/struct/constructors.discriminated_union.spec.ts`

- [ ] `packages/core/src/struct/constructors.discriminated_union.spec.ts:72:9` — `as-never` — `source`
      修复前：

  ```ts
  struct.object({ type: struct.literal('a'), other: struct.number() }) as never,
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/constructors.discriminated_union.spec.ts:79:88` — `as-never` — `source`
      修复前：

  ```ts
  struct.discriminatedUnion('type', [struct.object({ type: struct.literal('a') }), struct.object({ other: struct.string() }) as never]),
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/constructors.discriminated_union.spec.ts:84:53` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.discriminatedUnion('type', [struct.object({ type: struct.string() }) as never])).toThrowError(
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/struct/constructors.primitives.spec.ts`

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:8:22` — `type-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(struct as RuntimeStruct, value)
  ```

  修复后目标：

  ```ts
  return encodeValue(struct, value)
  ```

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:52:36` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(encode(struct.bigint(), parsed as bigint)).toBe('9007199254740993')
  ```

  修复后目标：

  ```ts
  expect(encode(struct.bigint(), parsed satisfies bigint)).toBe('9007199254740993')
  ```

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:67:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((v2 as Date).getTime()).toBe(d.getTime())
  ```

  修复后目标：

  ```ts
  expect((v2 satisfies Date).getTime()).toBe(d.getTime())
  ```

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:73:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((v3 as Date).getTime()).toBe(d.getTime())
  ```

  修复后目标：

  ```ts
  expect((v3 satisfies Date).getTime()).toBe(d.getTime())
  ```

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:80:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((zero as Date).getTime()).toBe(0)
  ```

  修复后目标：

  ```ts
  expect((zero satisfies Date).getTime()).toBe(0)
  ```

- [ ] `packages/core/src/struct/constructors.primitives.spec.ts:106:34` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(encode(struct.date(), parsed as Date)).toBe('2026-05-12T10:00:00.000Z')
  ```

  修复后目标：

  ```ts
  expect(encode(struct.date(), parsed satisfies Date)).toBe('2026-05-12T10:00:00.000Z')
  ```

#### `packages/core/src/struct/coverage.spec.ts`

- [ ] `packages/core/src/struct/coverage.spec.ts:21:10` — `type-assertion` — `source`
      修复前：

  ```ts
  return value as RuntimeStruct
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:46:30` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(() => struct.enum({} as { [key: string]: never })).toThrow('enum struct requires at least one string or number value')
  ```

  修复后目标：

  ```ts
  expect(() => struct.enum({} satisfies { [key: string]: never })).toThrow('enum struct requires at least one string or number value')
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:47:32` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.object(null as never)).toThrow('object struct requires a plain object')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:48:33` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.request(null as never)).toThrow('request struct requires a plain object')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:49:41` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.request({ path: struct.string() as never })).toThrow('request.path must be an object struct')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:50:42` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.request({ query: struct.string() as never })).toThrow('request.query must be an object struct')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:51:44` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.request({ headers: struct.string() as never })).toThrow('request.headers must be an object struct')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:54:15` — `as-never` — `source`
      修复前：

  ```ts
  body: struct.object({
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:141:30` — `type-assertion` — `source`
      修复前：

  ```ts
  const objectDefinition = struct[DEFINITION] as ObjectDefinition
  ```

  修复后目标：

  ```ts
  const objectDefinition = struct[DEFINITION] satisfies ObjectDefinition
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:147:38` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => struct.string().tag(null as never)).toThrow('tag() requires tag option functions')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/struct/coverage.spec.ts:251:14` — `as-never` — `source`
      修复前：

  ```ts
  query: struct.object({ include: struct.boolean() }).optional() as never,
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/struct/encode.spec.ts`

- [ ] `packages/core/src/struct/encode.spec.ts:9:22` — `type-assertion` — `source`
      修复前：

  ```ts
  return encodeValue(struct as RuntimeStruct, value)
  ```

  修复后目标：

  ```ts
  return encodeValue(struct, value)
  ```

- [ ] `packages/core/src/struct/encode.spec.ts:50:22` — `type-assertion` — `source`
      修复前：

  ```ts
  const aEncoded = encode(s, { type: 'a', payload: new Date('2026-05-12T10:00:00Z') }) as { type: string; payload: string }
  ```

  修复后目标：

  ```ts
  const aEncoded = encode(s, { type: 'a', payload: new Date('2026-05-12T10:00:00Z') }) satisfies { type: string; payload: string }
  ```

- [ ] `packages/core/src/struct/encode.spec.ts:53:22` — `type-assertion` — `source`
      修复前：

  ```ts
  const bEncoded = encode(s, { type: 'b', payload: 42n }) as { type: string; payload: string }
  ```

  修复后目标：

  ```ts
  const bEncoded = encode(s, { type: 'b', payload: 42n }) satisfies { type: string; payload: string }
  ```

- [ ] `packages/core/src/struct/encode.spec.ts:61:21` — `type-assertion` — `source`
      修复前：

  ```ts
  const encoded = encode(s, { name: 'x', when: new Date('2026-05-12T10:00:00Z') }) as { name: string; when: string }
  ```

  修复后目标：

  ```ts
  const encoded = encode(s, { name: 'x', when: new Date('2026-05-12T10:00:00Z') }) satisfies { name: string; when: string }
  ```

- [ ] `packages/core/src/struct/encode.spec.ts:80:21` — `type-assertion` — `source`
      修复前：

  ```ts
  const encoded = encode(s, val) as { type: string; payload: string }
  ```

  修复后目标：

  ```ts
  const encoded = encode(s, val) satisfies { type: string; payload: string }
  ```

#### `packages/core/src/struct/facade.spec.ts`

- [ ] `packages/core/src/struct/facade.spec.ts:69:27` — `double-assertion` — `source`
      修复前：

  ```ts
  const booleanStruct = struct.boolean() as unknown as { [key: symbol]: unknown }
  ```

  修复后目标：

  ```ts
  const booleanStruct = struct.boolean() satisfies { [key: symbol]: unknown }
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:70:24` — `double-assertion` — `source`
      修复前：

  ```ts
  const nullStruct = struct.null() as unknown as { [key: symbol]: unknown }
  ```

  修复后目标：

  ```ts
  const nullStruct = struct.null() satisfies { [key: symbol]: unknown }
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:71:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const booleanDefinition = Object.getOwnPropertySymbols(booleanStruct)
  ```

  修复后目标：

  ```ts
  const booleanDefinition = Object.getOwnPropertySymbols(booleanStruct)
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:73:82` — `type-assertion` — `source`
      修复前：

  ```ts
  .find((value) => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
  ```

  修复后目标：

  ```ts
  .find((value) => typeof value === 'object' && value !== null && 'kind' in (value satisfies object)) satisfies {
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:76:28` — `type-assertion` — `source`
      修复前：

  ```ts
  const nullDefinition = Object.getOwnPropertySymbols(nullStruct)
  ```

  修复后目标：

  ```ts
  const nullDefinition = Object.getOwnPropertySymbols(nullStruct)
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:78:82` — `type-assertion` — `source`
      修复前：

  ```ts
  .find((value) => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
  ```

  修复后目标：

  ```ts
  .find((value) => typeof value === 'object' && value !== null && 'kind' in (value satisfies object)) satisfies {
  ```

- [ ] `packages/core/src/struct/facade.spec.ts:121:7` — `type-assertion` — `source`
      修复前：

  ```ts
  ;(shape as { [key: string]: unknown })['secret'] = struct.string()
  ```

  修复后目标：

  ```ts
  shape['secret'] = struct.string()
  ```

#### `packages/core/src/struct/parse.security.spec.ts`

- [ ] `packages/core/src/struct/parse.security.spec.ts:13:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((Object.prototype as { [key: string]: unknown })['polluted']).toBeUndefined()
  ```

  修复后目标：

  ```ts
  expect(objectPrototypeRecord['polluted']).toBeUndefined()
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:14:26` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(Object.hasOwn(val as object, '__proto__')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect(Object.hasOwn(val satisfies object, '__proto__')).toBe(false)
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:20:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((Object.prototype as { [key: string]: unknown })['polluted']).toBeUndefined()
  ```

  修复后目标：

  ```ts
  expect(objectPrototypeRecord['polluted']).toBeUndefined()
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:47:26` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(Object.hasOwn(val as object, '__proto__')).toBe(true)
  ```

  修复后目标：

  ```ts
  expect(Object.hasOwn(val satisfies object, '__proto__')).toBe(true)
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:48:13` — `type-assertion` — `source`
      修复前：

  ```ts
  expect((val as { [key: string]: unknown })['__proto__']).toBe('data')
  ```

  修复后目标：

  ```ts
  expect(val['__proto__']).toBe('data')
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:66:15` — `type-assertion` — `source`
      修复前：

  ```ts
  delete (Object.prototype as { [key: string]: unknown })['pollutedId']
  ```

  修复后目标：

  ```ts
  delete objectPrototypeRecord['pollutedId']
  ```

- [ ] `packages/core/src/struct/parse.security.spec.ts:85:15` — `type-assertion` — `source`
      修复前：

  ```ts
  delete (Object.prototype as { [key: string]: unknown })['pollutedId']
  ```

  修复后目标：

  ```ts
  delete objectPrototypeRecord['pollutedId']
  ```

#### `packages/core/src/struct/parse.spec.ts`

- [ ] `packages/core/src/struct/parse.spec.ts:212:19` — `double-assertion` — `source`
      修复前：

  ```ts
  const input = Object.assign(Object.create(null), {
  ```

  修复后目标：

  ```ts
  const input = Object.assign(Object.create(null), {
  ```

#### `packages/core/src/struct/shape.spec.ts`

- [ ] `packages/core/src/struct/shape.spec.ts:13:22` — `double-assertion` — `source`
      修复前：

  ```ts
  const category = struct.object({
  ```

  修复后目标：

  ```ts
  const category = struct.object({
  ```

- [ ] `packages/core/src/struct/shape.spec.ts:35:21` — `double-assertion` — `source`
      修复前：

  ```ts
  const comment = struct.object({
  ```

  修复后目标：

  ```ts
  const comment = struct.object({
  ```

#### `packages/core/src/struct/tag.spec.ts`

- [ ] `packages/core/src/struct/tag.spec.ts:36:31` — `double-assertion` — `source`
      修复前：

  ```ts
  const implicitQueryTag = (tag.query as unknown as () => FieldTagOption)()
  ```

  修复后目标：

  ```ts
  const implicitQueryTag = (tag.query satisfies () => FieldTagOption)()
  ```

#### `packages/core/src/struct/types.runtime.type.test.ts`

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:3:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error TypeOf is intentionally not part of the public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:6:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error InputOf is intentionally not part of the public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:9:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:12:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:55:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error primitive constraints were removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:58:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error primitive constraints were removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:61:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error primitive constraints were removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:64:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error transform was removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:70:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error refine was removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:73:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error parse is internal runtime behavior, not public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:76:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error key was removed; Go-style wire names must use tag.*().
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:80:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error async parsing is not part of the public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:83:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error request body requires a body wrapper or binary body struct.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:86:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error default was removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:89:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error passthrough was removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:92:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error strip was removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:95:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error object shape utilities were removed from the Go-style API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.runtime.type.test.ts:98:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error struct.recursive was removed from the public API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/struct/types.tag.type.test.ts`

- [ ] `packages/core/src/struct/types.tag.type.test.ts:3:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error XmlTag was removed from public exports.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.tag.type.test.ts:6:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error XML object encoder was removed from public exports.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.tag.type.test.ts:9:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error XML object decoder was removed from public exports.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.tag.type.test.ts:24:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error XML tag helper was removed from the struct surface.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/struct/types.tag.type.test.ts:27:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error XML tag kind was removed from the struct surface.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/web_socket/build.spec.ts`

- [ ] `packages/core/src/web_socket/build.spec.ts:9:10` — `double-assertion` — `source`
      修复前：

  ```ts
  return build as unknown as RequestBuildHandler<TInput, 'webSocket'>
  ```

  修复后目标：

  ```ts
  return build satisfies RequestBuildHandler<TInput, 'webSocket'>
  ```

- [ ] `packages/core/src/web_socket/build.spec.ts:144:75` — `as-never` — `source`
      修复前：

  ```ts
  expect(createWebSocketUrl('http://localhost', '/ws', undefined, { id: 1n as never }, (p) => p.toString())).toBe(
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/codec.spec.ts`

- [ ] `packages/core/src/web_socket/codec.spec.ts:25:19` — `type-assertion` — `source`
      修复前：

  ```ts
  const event = { code: 1000, reason: 'normal', wasClean: true } as CloseEvent
  ```

  修复后目标：

  ```ts
  const event = { code: 1000, reason: 'normal', wasClean: true } satisfies CloseEvent
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:87:46` — `type-assertion` — `source`
      修复前：

  ```ts
  const error = resolveAbortTransportError(signal as AbortSignal)
  ```

  修复后目标：

  ```ts
  const error = resolveAbortTransportError(signal satisfies AbortSignal)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:101:63` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(undefined, { type: 'msg' } as never)).toThrow('No outgoing WebSocket messages')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:106:61` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(structs, {} as never)).toThrow('must include a string type')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:107:61` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(structs, { type: '' } as never)).toThrow('must include a string type')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:108:61` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(structs, null as never)).toThrow('must include a string type')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:113:61` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(structs, { type: 'other' } as never)).toThrow('Undeclared outgoing message type: other')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:136:63` — `as-never` — `source`
      修复前：

  ```ts
  const result = serializeOutgoingWebSocketMessage(structs, { type: 'msg', text: 'hello' } as never)
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/codec.spec.ts:152:61` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => serializeOutgoingWebSocketMessage(structs, { type: 'msg', data: { text: 123 } } as never)).toThrow()
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/heartbeat.spec.ts`

- [ ] `packages/core/src/web_socket/heartbeat.spec.ts:9:12` — `double-assertion` — `source`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

#### `packages/core/src/web_socket/reconnect.spec.ts`

- [ ] `packages/core/src/web_socket/reconnect.spec.ts:25:36` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(config?.shouldReconnect({} as SocketLifecycleOutcome, 1)).toBe(true)
  ```

  修复后目标：

  ```ts
  expect(config?.shouldReconnect({} satisfies SocketLifecycleOutcome, 1)).toBe(true)
  ```

- [ ] `packages/core/src/web_socket/reconnect.spec.ts:67:39` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(shouldReconnect(undefined, {} as SocketLifecycleOutcome, 1)).toBe(false)
  ```

  修复后目标：

  ```ts
  expect(shouldReconnect(undefined, {} satisfies SocketLifecycleOutcome, 1)).toBe(false)
  ```

- [ ] `packages/core/src/web_socket/reconnect.spec.ts:72:36` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(shouldReconnect(config, { opened: false } as SocketLifecycleOutcome, 1)).toBe(false)
  ```

  修复后目标：

  ```ts
  expect(shouldReconnect(config, { opened: false } satisfies SocketLifecycleOutcome, 1)).toBe(false)
  ```

- [ ] `packages/core/src/web_socket/reconnect.spec.ts:77:36` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(shouldReconnect(config, { opened: true } as SocketLifecycleOutcome, 1)).toBe(true)
  ```

  修复后目标：

  ```ts
  expect(shouldReconnect(config, { opened: true } satisfies SocketLifecycleOutcome, 1)).toBe(true)
  ```

- [ ] `packages/core/src/web_socket/reconnect.spec.ts:89:36` — `type-assertion` — `source`
      修复前：

  ```ts
  expect(shouldReconnect(config, { opened: false } as SocketLifecycleOutcome, 1)).toBe(false)
  ```

  修复后目标：

  ```ts
  expect(shouldReconnect(config, { opened: false } satisfies SocketLifecycleOutcome, 1)).toBe(false)
  ```

#### `packages/core/src/web_socket/web_socket.browser.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.browser.spec.ts:19:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.browser.spec.ts:19:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/web_socket.heartbeat.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.heartbeat.spec.ts:18:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.heartbeat.spec.ts:18:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/web_socket.lifecycle.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.lifecycle.spec.ts:19:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.lifecycle.spec.ts:19:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/web_socket.node.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.node.spec.ts:115:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.node.spec.ts:115:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/web_socket.node.spec.ts:138:12` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error testing runtime defensive behavior when constructor throws a non-Error value
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/core/src/web_socket/web_socket.reconnect.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.reconnect.spec.ts:18:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.reconnect.spec.ts:18:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/src/web_socket/web_socket.spec.ts`

- [ ] `packages/core/src/web_socket/web_socket.spec.ts:20:12` — `type-assertion` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  return client.execute(command as never, options)
  ```

- [ ] `packages/core/src/web_socket/web_socket.spec.ts:20:27` — `as-never` — `source`
      修复前：

  ```ts
  return client.execute(command as never, options) as Promise<SocketAwaitResult<unknown, unknown>>
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/core/src/web_socket/web_socket.spec.ts:30:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error testing runtime defensive behavior with invalid client WebSocket constructor
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/core/src/web_socket/web_socket.spec.ts:434:61` — `as-never` — `source`
      修复前：

  ```ts
  const [error, socket, connection] = await run(useSocket({ id: 'bad' } as never))
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/core/test/setup.ts`

- [ ] `packages/core/test/setup.ts:378:27` — `type-assertion` — `source`
      修复前：

  ```ts
  const decoded = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data)) as { type?: string }
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `packages/core/test/setup.ts:513:31` — `type-assertion` — `source`
      修复前：

  ```ts
  const serverWithCleanup = testServer as ServerType & ServerConnectionCleanup
  ```

  修复后目标：

  ```ts
  const serverWithCleanup = testServer satisfies ServerType & ServerConnectionCleanup
  ```

- [ ] `packages/core/test/setup.ts:526:14` — `type-assertion` — `source`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

#### `packages/core/test/vite-xsrf-plugin.ts`

- [ ] `packages/core/test/vite-xsrf-plugin.ts:10:14` — `double-assertion` — `source`
      修复前：

  ```ts
  headers: req.headers as unknown as { [key: string]: string },
  ```

  修复后目标：

  ```ts
  headers: normalizeIncomingHeaders(req.headers),
  ```

- [ ] `packages/core/test/vite-xsrf-plugin.ts:11:30` — `double-assertion` — `source`
      修复前：

  ```ts
  body: body.length > 0 ? (body as unknown as BodyInit) : undefined,
  ```

  修复后目标：

  ```ts
  body: body.length > 0 ? new Uint8Array(body) : undefined,
  ```

#### `packages/opentelemetry-server/src/option.spec.ts`

- [ ] `packages/opentelemetry-server/src/option.spec.ts:16:23` — `type-assertion` — `source`
      修复前：

  ```ts
  const sharedFetch = globalThis.fetch.bind(globalThis) as typeof fetch
  ```

  修复后目标：

  ```ts
  const sharedFetch = (...args) => globalThis.fetch(...args)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:137:58` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, http: false as never })).toThrow('http: false has been removed')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:138:57` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, sse: false as never })).toThrow('sse: false has been removed')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:139:63` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, webSocket: false as never })).toThrow('webSocket: false has been removed')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:140:42` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, requestHook: vi.fn() } as never)).toThrow('requestHook has been moved')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:141:42` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, responseHook: vi.fn() } as never)).toThrow('responseHook has been moved')
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

- [ ] `packages/opentelemetry-server/src/option.spec.ts:142:42` — `as-never` — `source`
      修复前：

  ```ts
  expect(() => withOpenTelemetryServer({ tracer, webSocketQueryPropagation: false } as never)).toThrow(
  ```

  修复后目标：

  ```ts
  expect(() => callRuntimeOnly(() => originalCall())).toThrow(expectedMessage)
  ```

#### `packages/opentelemetry-server/src/option.type.test.ts`

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:136:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error tracer is required
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:139:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error invalid key — excess property checking on object literal
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:142:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old top-level requestHook is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:145:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old top-level responseHook is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:148:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old top-level webSocketQueryPropagation is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:151:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old boolean HTTP toggle is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:154:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old boolean SSE toggle is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:157:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error old boolean WebSocket toggle is not supported
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:160:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error queryPropagation belongs to webSocket options only
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/option.type.test.ts:163:4` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error queryPropagation belongs to webSocket options only
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/opentelemetry-server/src/propagation/carrier.spec.ts`

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:12:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be Headers, but setter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:18:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error key must be string, but setter defends against undefined
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:25:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error value must be string, but setter defends against undefined
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:40:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be Headers, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:50:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be Headers, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:56:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error key must be string, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:74:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be QueryStringCarrier, but setter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:80:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error key must be string, but setter defends against undefined
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:87:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error value must be string, but setter defends against undefined
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:102:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be QueryStringCarrier, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:112:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error carrier must be QueryStringCarrier, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `packages/opentelemetry-server/src/propagation/carrier.spec.ts:118:8` — `ts-directive` — `source`
      修复前：

  ```ts
  // @ts-expect-error key must be string, but getter defends against null
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `packages/react/src/core.browser.spec.tsx`

- [ ] `packages/react/src/core.browser.spec.tsx:15:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `packages/react/src/core.browser.spec.tsx:24:37` — `double-assertion` — `source`
      修复前：

  ```ts
  const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/react/src/core.browser.spec.tsx:29:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `packages/react/src/core.browser.spec.tsx:30:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const interceptor = (() => ({})) as unknown as () => Interceptor
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

#### `packages/react/src/e2e.browser.spec.tsx`

- [ ] `packages/react/src/e2e.browser.spec.tsx:27:18` — `type-assertion` — `source`
      修复前：

  ```ts
  setUsers(users as Array<{ id: number; name: string }>)
  ```

  修复后目标：

  ```ts
  setUsers(users satisfies Array<{ id: number; name: string }>)
  ```

- [ ] `packages/react/src/e2e.browser.spec.tsx:117:28` — `type-assertion` — `source`
      修复前：

  ```ts
  setCount(String((users as Array<{ id: number; name: string }>).length))
  ```

  修复后目标：

  ```ts
  setCount(String((users satisfies Array<{ id: number; name: string }>).length))
  ```

- [ ] `packages/react/src/e2e.browser.spec.tsx:146:28` — `type-assertion` — `source`
      修复前：

  ```ts
  setCount(String((users as Array<{ id: number; name: string }>).length))
  ```

  修复后目标：

  ```ts
  setCount(String((users satisfies Array<{ id: number; name: string }>).length))
  ```

#### `packages/react/test/setup.ts`

- [ ] `packages/react/test/setup.ts:92:14` — `type-assertion` — `source`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

#### `packages/vue/src/core.browser.spec.ts`

- [ ] `packages/vue/src/core.browser.spec.ts:143:25` — `type-assertion` — `source`
      修复前：

  ```ts
  users.value = result as Users
  ```

  修复后目标：

  ```ts
  users.value = result satisfies Users
  ```

- [ ] `packages/vue/src/core.browser.spec.ts:200:25` — `type-assertion` — `source`
      修复前：

  ```ts
  outerRequest = (outerClient.execute(getUsers()) as Promise<UsersResult>).then((result) => {
  ```

  修复后目标：

  ```ts
  outerRequest = (outerClient.execute(getUsers())
  ```

- [ ] `packages/vue/src/core.browser.spec.ts:202:48` — `type-assertion` — `source`
      修复前：

  ```ts
  userNames.value = error ? 'error' : (users as Users).map((user) => user.name).join(', ')
  ```

  修复后目标：

  ```ts
  userNames.value = error ? 'error' : (users satisfies Users).map((user) => user.name).join(', ')
  ```

- [ ] `packages/vue/src/core.browser.spec.ts:224:25` — `type-assertion` — `source`
      修复前：

  ```ts
  innerRequest = (innerLeafClient.execute(getUsers()) as Promise<UsersResult>).then((result) => {
  ```

  修复后目标：

  ```ts
  innerRequest = (innerLeafClient.execute(getUsers())
  ```

- [ ] `packages/vue/src/core.browser.spec.ts:226:48` — `type-assertion` — `source`
      修复前：

  ```ts
  userNames.value = error ? 'error' : (users as Users).map((user) => user.name).join(', ')
  ```

  修复后目标：

  ```ts
  userNames.value = error ? 'error' : (users satisfies Users).map((user) => user.name).join(', ')
  ```

#### `packages/vue/test/core.spec.ts`

- [ ] `packages/vue/test/core.spec.ts:16:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `packages/vue/test/core.spec.ts:25:37` — `double-assertion` — `source`
      修复前：

  ```ts
  const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/vue/test/core.spec.ts:30:20` — `type-assertion` — `source`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `packages/vue/test/core.spec.ts:31:25` — `double-assertion` — `source`
      修复前：

  ```ts
  const interceptor = (() => ({})) as unknown as () => Interceptor
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/vue/test/core.spec.ts:66:24` — `double-assertion` — `source`
      修复前：

  ```ts
  withInterceptors((() => ({})) as unknown as () => Interceptor),
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/vue/test/core.spec.ts:81:93` — `double-assertion` — `source`
      修复前：

  ```ts
  app.use(provideClient(withEndpoint(`http://localhost:${server.port}`), withInterceptors((() => ({})) as unknown as () => Interceptor)))
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/vue/test/core.spec.ts:104:51` — `double-assertion` — `source`
      修复前：

  ```ts
  const plugin = provideClient(withInterceptors((() => ({})) as unknown as () => Interceptor))
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `packages/vue/test/core.spec.ts:117:44` — `double-assertion` — `source`
      修复前：

  ```ts
  app.use(provideClient(withInterceptors((() => ({})) as unknown as () => Interceptor)))
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

#### `packages/vue/test/setup.ts`

- [ ] `packages/vue/test/setup.ts:92:14` — `type-assertion` — `source`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

### 文档/代码块

#### `doc/ar/guide/examples.md`

- [ ] `doc/ar/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/ar/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ar/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ar/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/ar/plugins/vue.md`

- [ ] `doc/ar/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ar/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ar/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ar/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/de-DE/guide/examples.md`

- [ ] `doc/de-DE/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/de-DE/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/de-DE/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/de-DE/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/de-DE/plugins/vue.md`

- [ ] `doc/de-DE/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/de-DE/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/de-DE/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/de-DE/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/es-ES/guide/examples.md`

- [ ] `doc/es-ES/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/es-ES/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/es-ES/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/es-ES/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/es-ES/plugins/vue.md`

- [ ] `doc/es-ES/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/es-ES/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/es-ES/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/es-ES/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/fr-FR/guide/examples.md`

- [ ] `doc/fr-FR/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/fr-FR/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/fr-FR/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/fr-FR/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/fr-FR/plugins/vue.md`

- [ ] `doc/fr-FR/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/fr-FR/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/fr-FR/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/fr-FR/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/guide/examples.md`

- [ ] `doc/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/ja-JP/guide/examples.md`

- [ ] `doc/ja-JP/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/ja-JP/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ja-JP/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ja-JP/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/ja-JP/plugins/vue.md`

- [ ] `doc/ja-JP/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ja-JP/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ja-JP/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ja-JP/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/ko-KR/guide/examples.md`

- [ ] `doc/ko-KR/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/ko-KR/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ko-KR/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ko-KR/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/ko-KR/plugins/vue.md`

- [ ] `doc/ko-KR/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ko-KR/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ko-KR/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ko-KR/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/plugins/vue.md`

- [ ] `doc/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/plugins/vue.md:105:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/plugins/vue.md:144:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/ru-RU/guide/examples.md`

- [ ] `doc/ru-RU/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/ru-RU/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ru-RU/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ru-RU/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/ru-RU/plugins/vue.md`

- [ ] `doc/ru-RU/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ru-RU/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/ru-RU/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/ru-RU/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/scripts/twoslash-check.ts`

- [ ] `doc/scripts/twoslash-check.ts:115:15` — `type-assertion` — `source`
      修复前：

  ```ts
  return result.errors as RawTwoslashError[]
  ```

  修复后目标：

  ```ts
  return result.errors satisfies RawTwoslashError[]
  ```

#### `doc/zh-Hans/guide/examples.md`

- [ ] `doc/zh-Hans/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/zh-Hans/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hans/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hans/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/zh-Hans/plugins/vue.md`

- [ ] `doc/zh-Hans/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hans/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hans/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hans/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/zh-Hant-HK/guide/examples.md`

- [ ] `doc/zh-Hant-HK/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/zh-Hant-HK/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-HK/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hant-HK/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/zh-Hant-HK/plugins/vue.md`

- [ ] `doc/zh-Hant-HK/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-HK/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hant-HK/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-HK/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `doc/zh-Hant-TW/guide/examples.md`

- [ ] `doc/zh-Hant-TW/guide/examples.md:447:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <!-- UserCard.vue -->
  ```

  修复后目标：

  ```ts
  <!-- UserCard.vue -->
  ```

- [ ] `doc/zh-Hant-TW/guide/examples.md:448:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-TW/guide/examples.md:470:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hant-TW/guide/examples.md:473:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

  修复后目标：

  ```ts
  <button @click="loadUser">Load User</button>
  ```

#### `doc/zh-Hant-TW/plugins/vue.md`

- [ ] `doc/zh-Hant-TW/plugins/vue.md:44:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-TW/plugins/vue.md:70:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `doc/zh-Hant-TW/plugins/vue.md:101:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `doc/zh-Hant-TW/plugins/vue.md:140:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

#### `docs/packages-vue-design.md`

- [ ] `docs/packages-vue-design.md:292:37` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  ```

  修复后目标：

  ```ts
  const packageJson: Record<string, unknown> = await Bun.file('package.json').json()
  ```

- [ ] `docs/packages-vue-design.md:341:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <script setup lang="ts">
  ```

  修复后目标：

  ```ts
  <script setup lang="ts">
  ```

- [ ] `docs/packages-vue-design.md:351:1` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </script>
  ```

  修复后目标：

  ```ts
  </script>
  ```

- [ ] `docs/packages-vue-design.md:354:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <button @click="fetchData">获取数据</button>
  ```

  修复后目标：

  ```ts
  <button @click="fetchData">获取数据</button>
  ```

#### `docs/superpowers/plans/2026-06-05-with-timeout-abort.md`

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:184:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error with.abort and with.timeout are mutually exclusive.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:187:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:190:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not an AbortController.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:193:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:228:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error with.abort and with.timeout are mutually exclusive.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:231:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error request-level fetch was removed; configure fetch on client.sse and pass client.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:234:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:237:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not an AbortController.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:240:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:288:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error with.abort and with.timeout are mutually exclusive.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:291:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:294:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not an AbortController.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:297:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error abort must be an AbortSignal, not a callback.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:390:12` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  fetch: (async () =>
  ```

  修复后目标：

  ```ts
  fetch: (async () =>
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:465:26` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useRequest({ id: 1 } as never).with({ abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useRequest({ id: 1 }).with({ abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:465:51` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useRequest({ id: 1 } as never).with({ abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useRequest({ id: 1 }).with({ abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:487:33` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useRequest().with({ abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useRequest().with({ abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:522:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  state.error = definitionError as RequestError<RequestErrorData<TOutput>>
  ```

  修复后目标：

  ```ts
  state.error = definitionError
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:524:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
  ```

  修复后目标：

  ```ts
  return [definitionError, undefined, undefined]
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:591:32` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useStream().with({ client, abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useStream().with({ client, abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:613:32` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useStream().with({ abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useStream().with({ abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:658:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  fetchEventStream(req, {
  ```

  修复后目标：

  ```ts
  fetchEventStream(req, {
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:708:32` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useSocket().with({
  ```

  修复后目标：

  ```ts
  const ref = useSocket().with({
  ```

- [ ] `docs/superpowers/plans/2026-06-05-with-timeout-abort.md:734:32` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useSocket().with({ abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useSocket().with({ abort: controller.signal, timeout: 1 })
  ```

#### `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md`

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:471:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error endpoint must be a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:475:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error withEndpoint expects a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:481:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error serializer must return a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:485:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error queryParamsSerializer must return a string
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:491:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error HTTP transport handler configuration was removed
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:499:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error HTTP transport handler configuration was removed from clone options
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:925:37` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  ```

  修复后目标：

  ```ts
  const packageJson: Record<string, unknown> = await Bun.file('package.json').json()
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:1071:26` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  span.recordException(error as Error)
  ```

  修复后目标：

  ```ts
  span.recordException(error satisfies Error)
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:1146:26` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  span.recordException(error as Error)
  ```

  修复后目标：

  ```ts
  span.recordException(error satisfies Error)
  ```

- [ ] `docs/superpowers/plans/2026-06-06-opentelemetry-option-mode.md:1158:24` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  span.recordException(error as Error)
  ```

  修复后目标：

  ```ts
  span.recordException(error satisfies Error)
  ```

#### `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md`

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:104:16` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  WebSocket: MockWebSocket as unknown as typeof WebSocket,
  ```

  修复后目标：

  ```ts
  WebSocket: MockWebSocket,
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:110:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error token providers are synchronous in v1
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:345:27` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  capturedRequest = request as HttpRequest
  ```

  修复后目标：

  ```ts
  capturedRequest = request satisfies HttpRequest
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:438:37` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const built = buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
  ```

  修复后目标：

  ```ts
  const built = buildRequest(input, build satisfies ((request: RequestBuilder, input: unknown) => void) | undefined, {
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:480:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  endpoint.build as ((request: RequestBuilder, input: unknown) => void) | undefined,
  ```

  修复后目标：

  ```ts
  endpoint.build satisfies ((request: RequestBuilder, input: unknown) => void) | undefined,
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:544:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('abc123')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('abc123')
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:561:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:578:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:597:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('provider-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('provider-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:616:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('manual-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('manual-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:641:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((withProvider.headers as Headers).get('x-xsrf-token')).toBe('server-token')
  ```

  修复后目标：

  ```ts
  expect((withProvider.headers satisfies Headers).get('x-xsrf-token')).toBe('server-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:642:11` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((withoutProvider.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((withoutProvider.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:657:21` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  const fetchStub = vi.fn(async (input) => {
  ```

  修复后目标：

  ```ts
  const fetchStub = vi.fn(async (input) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-11-defjs-xsrf-implementation.md:658:16` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  captured = input as Request
  ```

  修复后目标：

  ```ts
  captured = input satisfies Request
  ```

#### `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md`

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:121:16` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  WebSocket: MockWebSocket as unknown as typeof WebSocket,
  ```

  修复后目标：

  ```ts
  WebSocket: MockWebSocket,
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:127:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error token providers are synchronous in v1
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:362:27` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  capturedRequest = request as HttpRequest
  ```

  修复后目标：

  ```ts
  capturedRequest = request satisfies HttpRequest
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:455:37` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const built = buildRequest(input, build as ((request: RequestBuilder, input: unknown) => void) | undefined, {
  ```

  修复后目标：

  ```ts
  const built = buildRequest(input, build satisfies ((request: RequestBuilder, input: unknown) => void) | undefined, {
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:497:3` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  endpoint.build as ((request: RequestBuilder, input: unknown) => void) | undefined,
  ```

  修复后目标：

  ```ts
  endpoint.build satisfies ((request: RequestBuilder, input: unknown) => void) | undefined,
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:574:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123; theme=dark' } as Document)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123; theme=dark' } satisfies Document)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:575:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } as Location)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } satisfies Location)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:577:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const init = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const init = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:587:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('abc123')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('abc123')
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:591:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } satisfies Document)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:592:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } as Location)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } satisfies Location)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:594:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const init = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const init = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:604:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:608:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } satisfies Document)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:609:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('location', { origin: 'https://app.example.com' } as Location)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('location', { origin: 'https://app.example.com' } satisfies Location)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:611:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const init = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const init = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:621:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:625:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=cookie-token' } as Document)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=cookie-token' } satisfies Document)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:626:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } as Location)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } satisfies Location)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:628:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const init = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const init = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:640:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('provider-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('provider-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:645:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } as Document)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('document', { cookie: 'XSRF-TOKEN=abc123' } satisfies Document)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:646:31` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } as Location)
  ```

  修复后目标：

  ```ts
  vi.stubGlobal('location', { origin: 'https://example.com' } satisfies Location)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:648:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const init = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const init = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:659:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((init.headers as Headers).get('x-xsrf-token')).toBe('manual-token')
  ```

  修复后目标：

  ```ts
  expect((init.headers satisfies Headers).get('x-xsrf-token')).toBe('manual-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:663:49` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const withProvider = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const withProvider = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:674:52` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const withoutProvider = createFetchRequestInit({
  ```

  修复后目标：

  ```ts
  const withoutProvider = createFetchRequestInit({
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:684:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((withProvider.headers as Headers).get('x-xsrf-token')).toBe('server-token')
  ```

  修复后目标：

  ```ts
  expect((withProvider.headers satisfies Headers).get('x-xsrf-token')).toBe('server-token')
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:685:13` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  expect((withoutProvider.headers as Headers).has('x-xsrf-token')).toBe(false)
  ```

  修复后目标：

  ```ts
  expect((withoutProvider.headers satisfies Headers).has('x-xsrf-token')).toBe(false)
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:701:21` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  const fetchStub = vi.fn(async (input) => {
  ```

  修复后目标：

  ```ts
  const fetchStub = vi.fn(async (input) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-12-defjs-xsrf-implementation.md:702:16` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  captured = input as Request
  ```

  修复后目标：

  ```ts
  captured = input satisfies Request
  ```

#### `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md`

- [ ] `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md:208:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const pkg = JSON.parse(raw) as Record<string, unknown>
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md:394:14` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  headers: req.headers as Record<string, string>,
  ```

  修复后目标：

  ```ts
  headers: req.headers satisfies Record<string, string>,
  ```

- [ ] `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md:712:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const pkg = JSON.parse(raw) as Record<string, unknown>
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md:878:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const pkg = JSON.parse(raw) as Record<string, unknown>
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

- [ ] `docs/superpowers/plans/2026-06-13-migrate-to-node-pnpm-tsdown-playwright-tsgo.md:1204:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const pkg = JSON.parse(raw) as Record<string, unknown>
  ```

  修复后目标：

  ```ts
  const pkg = parsePackageJson(JSON.parse(raw))
  ```

#### `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md`

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:512:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error XmlTag was removed from public exports.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:519:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error XML object encoder was removed from public exports.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:530:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error TypeOf is intentionally not part of the public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:537:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error JSON codec helpers are internal runtime behavior, not public struct API.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:668:20` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const identity = ((req: HttpRequest, next: ChainHandler<TResult>) => next(req)) as TFn
  ```

  修复后目标：

  ```ts
  const identity = ((req: HttpRequest, next: ChainHandler<TResult>) => next(req))Fn
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:674:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  ((initReq: HttpRequest, finalHandlerFn: ChainHandler<TResult>) => interceptor(initReq, (req) => fn(req, finalHandlerFn))) as TFn,
  ```

  修复后目标：

  ```ts
  ((initReq: HttpRequest, finalHandlerFn: ChainHandler<TResult>) => interceptor(initReq, (req) => fn(req, finalHandlerFn)))Fn,
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:764:8` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error unknown body fields are rejected by the typed build view.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:804:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return createBuildPlanBuilder(plan) as RequestBuildContext<TTransport>
  ```

  修复后目标：

  ```ts
  return createBuildPlanBuilder(plan) satisfies RequestBuildContext<TTransport>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:812:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
  ```

  修复后目标：

  ```ts
  return createBoundView(struct as unknown, [], owner) as RequestBuildInput<TInput>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:812:26` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
  ```

  修复后目标：

  ```ts
  return createBoundView(struct, [], owner) as RequestBuildInput<TInput>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:821:36` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  const boundInput = createBoundView(options.input as unknown as RuntimeStruct, [], owner)
  ```

  修复后目标：

  ```ts
  const boundInput = createBoundView(options.input, [], owner)
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:837:12` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  ;(request: any, view: any) => {
  ```

  修复后目标：

  ```ts
  ;(request: unknown, view: unknown) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:837:23` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  ;(request: any, view: any) => {
  ```

  修复后目标：

  ```ts
  ;(request: unknown, view: unknown) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:869:12` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  ;(builder: any, input: any) => {
  ```

  修复后目标：

  ```ts
  ;(builder: unknown, input: unknown) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:869:24` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  ;(builder: any, input: any) => {
  ```

  修复后目标：

  ```ts
  ;(builder: unknown, input: unknown) => {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:927:71` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type StructInput<T> = T extends { readonly _struct: { readonly input: any } } ? T['_struct']['input'] : never
  ```

  修复后目标：

  ```ts
  type StructInput<T> = T extends { readonly _struct: { readonly input: unknown } } ? T['_struct']['input'] : never
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:928:73` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type StructOutput<T> = T extends { readonly _struct: { readonly output: any } } ? T['_struct']['output'] : never
  ```

  修复后目标：

  ```ts
  type StructOutput<T> = T extends { readonly _struct: { readonly output: unknown } } ? T['_struct']['output'] : never
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:948:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return struct as TStruct
  ```

  修复后目标：

  ```ts
  return structStruct
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:971:8` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  return createPrimitiveStruct({
  ```

  修复后目标：

  ```ts
  return createPrimitiveStruct({
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:999:52` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

  修复后目标：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1000:10` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  return makeStruct({
  ```

  修复后目标：

  ```ts
  return makeStruct({
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1003:36` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  }) as unknown as Struct<unknown, any>
  ```

  修复后目标：

  ```ts
  }) as unknown as Struct<unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1010:52` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

  修复后目标：

  ```ts
  export function createAnyStruct(): Struct<unknown, any> {
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1012:37` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  return castStruct<Struct<unknown, any>>(
  ```

  修复后目标：

  ```ts
  return castStruct<Struct<unknown, any>>(
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1067:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return value as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1078:8` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>) => createEventStreamRef(endpoint, input)) as UseEventStreamEndpointFn<TInput, TEvents>
  ```

  修复后目标：

  ```ts
  return ((input?: EndpointInput<TInput>) => createEventStreamRef(endpoint, input)) satisfies UseEventStreamEndpointFn<TInput, TEvents>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1092:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  parsedInput = await parseEndpointInput(endpoint.input, input)
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1116:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return value as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1127:8` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>) => createWebSocketRef(endpoint, input)) as UseWebSocketEndpointFn<TInput, TIncoming, TOutgoing>
  ```

  修复后目标：

  ```ts
  return ((input?: EndpointInput<TInput>) => createWebSocketRef(endpoint, input)) satisfies UseWebSocketEndpointFn<
    TInput,
    TIncoming,
    TOutgoing
  >
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1141:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  parsedInput = (await parseEndpointInput(endpoint.input, input)) as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  parsedInput = await parseEndpointInput(endpoint.input, input)
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1156:16` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const stream = (await sseChain(request, sseHandler)) as EventStreamHandle<EventStreamData<TEvents>>
  ```

  修复后目标：

  ```ts
  const stream = (await sseChain(request, sseHandler)) satisfies EventStreamHandle<EventStreamData<TEvents>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1166:30` — `as-never` — `markdown-code`
      修复前：

  ```ts
  const ref = useStream().with({ client, abort: controller.signal, timeout: 1 } as never)
  ```

  修复后目标：

  ```ts
  const ref = useStream().with({ client, abort: controller.signal, timeout: 1 })
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1172:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error with.abort and with.timeout are mutually exclusive.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1181:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return value as T
  ```

  修复后目标：

  ```ts
  return value
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1238:13` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  let server: any
  ```

  修复后目标：

  ```ts
  let server: unknown
  ```

- [ ] `docs/superpowers/plans/2026-06-13-oxlint-oxfmt-type-safety-implementation.md:1256:29` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  const basicSSEHandler = (c: any) => {
  ```

  修复后目标：

  ```ts
  const basicSSEHandler = (c: unknown) => {
  ```

#### `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md`

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:301:12` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:309:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>, config?: UseRequestConfig) => create(input, config)) as RequestCommandBuilder<TInput, TOutput>
  ```

  修复后目标：

  ```ts
  return createCommandBuilder(create)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:334:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createAbortTimeoutConflictError() as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(createAbortTimeoutConflictError())
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:339:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createTransportError(requestAbort.reason ?? ERR_ABORTED) as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(createTransportError(requestAbort.reason ?? ERR_ABORTED))
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:344:19` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  ```

  修复后目标：

  ```ts
  parsedInput = await parseEndpointInput(definition.input, input)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:346:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error) as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error))
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:366:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error) as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error))
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:375:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createTransportError(error) as RequestError<RequestErrorData<TOutput>>)
  ```

  修复后目标：

  ```ts
  return fail(createTransportError(error))
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:381:17` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return fail(createTransportError(response.error) as RequestError<RequestErrorData<TOutput>>, settledResponse)
  ```

  修复后目标：

  ```ts
  return fail(createTransportError(response.error), settledResponse)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:385:29` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const ignoredResponse = { ...settledResponse, body: null } as SettledResponse<undefined>
  ```

  修复后目标：

  ```ts
  const ignoredResponse: SettledResponse<undefined> = { ...settledResponse, body: undefined }
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:387:21` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
  ```

  修复后目标：

  ```ts
  return [null, undefined, ignoredResponse]
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:391:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestError<RequestErrorData<TOutput>>,
  ```

  修复后目标：

  ```ts
  createHttpStatusError(response.status, errorMessage, ignoredResponse),
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:399:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse) as RequestError<
  ```

  修复后目标：

  ```ts
  createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse) as RequestError<
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:411:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  createDefinitionError('RESPONSE_VALIDATION_FAILED', error, settledResponse) as RequestError<RequestErrorData<TOutput>>,
  ```

  修复后目标：

  ```ts
  createDefinitionError('RESPONSE_VALIDATION_FAILED', error, settledResponse),
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:417:57` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const successResponse = { ...settledResponse, body: parsedBody as RequestSuccessData<TOutput> }
  ```

  修复后目标：

  ```ts
  const successResponse = { ...settledResponse, body: successBody }
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:418:19` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  ```

  修复后目标：

  ```ts
  return [null, successBody, successResponse]
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:423:5` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  createHttpStatusError(response.status, errorMessage, settledResponse, parsedBody as RequestErrorData<TOutput>) as RequestError<
  ```

  修复后目标：

  ```ts
  createHttpStatusError(response.status, errorMessage, settledResponse, errorBody) as RequestError<
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:423:75` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  createHttpStatusError(response.status, errorMessage, settledResponse, parsedBody as RequestErrorData<TOutput>) as RequestError<
  ```

  修复后目标：

  ```ts
  createHttpStatusError(response.status, errorMessage, settledResponse, errorBody) as RequestError<
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:527:12` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:535:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return ((input?: EndpointInput<TInput>, config?: UseEventStreamConfig) => create(input, config)) as EventStreamCommandBuilder<
  ```

  修复后目标：

  ```ts
  return createCommandBuilder(create)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:700:12` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:708:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return ((
  ```

  修复后目标：

  ```ts
  return ((
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:804:56` — `as-any` — `markdown-code`
      修复前：

  ```ts
  const command = { kind: 'http' as const, definition: {} as any, input: undefined }
  ```

  修复后目标：

  ```ts
  const command = { kind: 'http' as const, definition: {} as unknown, input: undefined }
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:35` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:40` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:66` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:71` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:95` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:100` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:824:105` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
  ```

  修复后目标：

  ```ts
  export type Command = HttpCommand<unknown, unknown> | EventStreamCommand<unknown, unknown> | WebSocketCommand<unknown, unknown, unknown>
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:836:10` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:841:18` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return executeHttpCommand(config, command, options) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeHttpCommand(config, command, options)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:843:18` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return executeEventStreamCommand(config, command, options) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeEventStreamCommand(config, command, options)
  ```

- [ ] `docs/superpowers/plans/2026-06-16-command-execute-paradigm-migration.md:845:18` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return executeWebSocketCommand(config, command, options) as Promise<unknown>
  ```

  修复后目标：

  ```ts
  return executeWebSocketCommand(config, command, options)
  ```

#### `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md`

- [ ] `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md:117:26` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  setCount(String((users as Array<{ id: number; name: string }>).length))
  ```

  修复后目标：

  ```ts
  setCount(String((users satisfies Array<{ id: number; name: string }>).length))
  ```

- [ ] `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md:146:26` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  setCount(String((users as Array<{ id: number; name: string }>).length))
  ```

  修复后目标：

  ```ts
  setCount(String((users satisfies Array<{ id: number; name: string }>).length))
  ```

- [ ] `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md:698:14` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

- [ ] `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md:892:24` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  outerRequest = this.client.execute(getUsers()) as Promise<[unknown, unknown]>
  ```

  修复后目标：

  ```ts
  outerRequest = this.client.execute(getUsers())
  ```

- [ ] `docs/superpowers/plans/2026-06-17-multiframework-nested-di-tests.md:919:24` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  innerRequest = this.client.execute(getUsers()) as Promise<[unknown, unknown]>
  ```

  修复后目标：

  ```ts
  innerRequest = this.client.execute(getUsers())
  ```

#### `docs/superpowers/plans/2026-06-17-react-wrapper.md`

- [ ] `docs/superpowers/plans/2026-06-17-react-wrapper.md:370:14` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  if ((error as NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

  修复后目标：

  ```ts
  if ((error satisfies NodeJS.ErrnoException).code === 'ERR_SERVER_NOT_RUNNING') {
  ```

- [ ] `docs/superpowers/plans/2026-06-17-react-wrapper.md:491:20` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `docs/superpowers/plans/2026-06-17-react-wrapper.md:504:37` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  const option = withInterceptors((() => ({})) as unknown as () => Interceptor)
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

- [ ] `docs/superpowers/plans/2026-06-17-react-wrapper.md:509:20` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const config = {} as ClientConfig
  ```

  修复后目标：

  ```ts
  const config = {} satisfies ClientConfig
  ```

- [ ] `docs/superpowers/plans/2026-06-17-react-wrapper.md:510:25` — `double-assertion` — `markdown-code`
      修复前：

  ```ts
  const interceptor = (() => ({})) as unknown as () => Interceptor
  ```

  修复后目标：

  ```ts
  const interceptor = createNoopInterceptor()
  ```

#### `docs/superpowers/plans/2026-06-17-vitepress-twoslash-docs.md`

- [ ] `docs/superpowers/plans/2026-06-17-vitepress-twoslash-docs.md:908:15` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return result.errors as RawTwoslashError[]
  ```

  修复后目标：

  ```ts
  return result.errors satisfies RawTwoslashError[]
  ```

#### `docs/superpowers/specs/2026-06-05-with-timeout-abort-design.md`

- [ ] `docs/superpowers/specs/2026-06-05-with-timeout-abort-design.md:189:4` — `ts-directive` — `markdown-code`
      修复前：

  ```ts
  // @ts-expect-error with.abort and with.timeout are mutually exclusive.
  ```

  修复后目标：

  ```ts
  type NegativeCase = AssertFalse<IsCallableWith<typeof subject, readonly [unknown]>>
  ```

#### `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md`

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:610:37` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  ```

  修复后目标：

  ```ts
  const packageJson: Record<string, unknown> = await Bun.file('package.json').json()
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:762:43` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const HTTP_CLIENT: InjectionKey<Client> = Symbol() as InjectionKey<Client>
  ```

  修复后目标：

  ```ts
  const HTTP_CLIENT: InjectionKey<Client> = Symbol() satisfies InjectionKey<Client>
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:763:59` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const HTTP_INTERCEPTOR_FNS: InjectionKey<Interceptor[]> = Symbol() as InjectionKey<Interceptor[]>
  ```

  修复后目标：

  ```ts
  const HTTP_INTERCEPTOR_FNS: InjectionKey<Interceptor[]> = Symbol() satisfies InjectionKey<Interceptor[]>
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:764:41` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  const HTTP_HOST: InjectionKey<string> = Symbol() as InjectionKey<string>
  ```

  修复后目标：

  ```ts
  const HTTP_HOST: InjectionKey<string> = Symbol() satisfies InjectionKey<string>
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:883:37` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  const packageJson: Record<string, any> = await Bun.file('package.json').json()
  ```

  修复后目标：

  ```ts
  const packageJson: Record<string, unknown> = await Bun.file('package.json').json()
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:989:15` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  let server: any
  ```

  修复后目标：

  ```ts
  let server: unknown
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:1028:15` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  let server: any
  ```

  修复后目标：

  ```ts
  let server: unknown
  ```

- [ ] `docs/superpowers/specs/2026-06-10-vue-wrapper-design.md:1067:15` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  let server: any
  ```

  修复后目标：

  ```ts
  let server: unknown
  ```

#### `docs/superpowers/specs/2026-06-17-react-wrapper-design.md`

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:350:5` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <ul data-testid="user-list">
  ```

  修复后目标：

  ```ts
  <ul data-testid="user-list">
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:352:9` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <li key={user.id} data-testid={`user-${user.id}`}>{user.name}</li>
  ```

  修复后目标：

  ```ts
  <li key={user.id} data-testid={`user-${user.id}`}>{user.name}</li>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:354:5` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </ul>
  ```

  修复后目标：

  ```ts
  </ul>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:360:5` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <ClientProvider options={[withEndpoint(endpoint)]}>
  ```

  修复后目标：

  ```ts
  <ClientProvider options={[withEndpoint(endpoint)]}>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:361:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <div>
  ```

  修复后目标：

  ```ts
  <div>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:362:9` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <h1>Users</h1>
  ```

  修复后目标：

  ```ts
  <h1>Users</h1>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:364:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  </div>
  ```

  修复后目标：

  ```ts
  </div>
  ```

- [ ] `docs/superpowers/specs/2026-06-17-react-wrapper-design.md:377:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  <App endpoint={endpoint} />,
  ```

  修复后目标：

  ```ts
  <App endpoint={endpoint} />,
  ```

#### `packages/core/research/defjs-build-options.md`

- [ ] `packages/core/research/defjs-build-options.md:316:41` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type OutputOf<S> = S extends StructLike<any, infer O, any> ? O : never
  ```

  修复后目标：

  ```ts
  type OutputOf<S> = S extends StructLike<unknown, infer O, unknown> ? O : never
  ```

- [ ] `packages/core/research/defjs-build-options.md:316:55` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type OutputOf<S> = S extends StructLike<any, infer O, any> ? O : never
  ```

  修复后目标：

  ```ts
  type OutputOf<S> = S extends StructLike<unknown, infer O, unknown> ? O : never
  ```

- [ ] `packages/core/research/defjs-build-options.md:334:36` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundRef<S extends StructLike<any, any, any>, Root> = {
  ```

  修复后目标：

  ```ts
  type BoundRef<S extends StructLike<unknown, unknown, unknown>, Root> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:334:41` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundRef<S extends StructLike<any, any, any>, Root> = {
  ```

  修复后目标：

  ```ts
  type BoundRef<S extends StructLike<unknown, unknown, unknown>, Root> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:334:46` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundRef<S extends StructLike<any, any, any>, Root> = {
  ```

  修复后目标：

  ```ts
  type BoundRef<S extends StructLike<unknown, unknown, unknown>, Root> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:341:77` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<any, any, any>, Root> & {
  ```

  修复后目标：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<unknown, unknown, unknown>, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:341:82` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<any, any, any>, Root> & {
  ```

  修复后目标：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<unknown, unknown, unknown>, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:341:87` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<any, any, any>, Root> & {
  ```

  修复后目标：

  ```ts
  type BoundFor<TTarget extends StructBindTarget, Root> = BoundRef<StructLike<unknown, unknown, unknown>, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:345:41` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type BoundObject<S extends ObjectStruct<any>, TShape, Root> = BoundRef<S, Root> & {
  ```

  修复后目标：

  ```ts
  type BoundObject<S extends ObjectStruct<unknown>, TShape, Root> = BoundRef<S, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:349:89` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type ObjectSourceFor<TTarget extends StructBindTarget, Root> = BoundObject<ObjectStruct<any>, any, Root> & {
  ```

  修复后目标：

  ```ts
  type ObjectSourceFor<TTarget extends StructBindTarget, Root> = BoundObject<ObjectStruct<unknown>, unknown, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:349:95` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type ObjectSourceFor<TTarget extends StructBindTarget, Root> = BoundObject<ObjectStruct<any>, any, Root> & {
  ```

  修复后目标：

  ```ts
  type ObjectSourceFor<TTarget extends StructBindTarget, Root> = BoundObject<ObjectStruct<unknown>, unknown, Root> & {
  ```

- [ ] `packages/core/research/defjs-build-options.md:367:29` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  : S extends ArrayStruct<any>
  ```

  修复后目标：

  ```ts
  : S extends ArrayStruct<unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:369:30` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  : S extends StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  : S extends StructLike<unknown, unknown, unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:369:35` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  : S extends StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  : S extends StructLike<unknown, unknown, unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:369:40` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  : S extends StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  : S extends StructLike<unknown, unknown, unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:387:49` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type HttpBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type HttpBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:402:56` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type EventStreamBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type EventStreamBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:408:54` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type WebSocketBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type WebSocketBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

- [ ] `packages/core/research/defjs-build-options.md:427:22` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  struct: StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  struct: StructLike<unknown, unknown, unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:427:27` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  struct: StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  struct: StructLike<unknown, unknown, unknown>
  ```

- [ ] `packages/core/research/defjs-build-options.md:427:32` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  struct: StructLike<any, any, any>
  ```

  修复后目标：

  ```ts
  struct: StructLike<unknown, unknown, unknown>
  ```

#### `packages/core/research/go-style-endpoint-practices.md`

- [ ] `packages/core/research/go-style-endpoint-practices.md:273:49` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type HttpBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type HttpBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

- [ ] `packages/core/research/go-style-endpoint-practices.md:292:56` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type EventStreamBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type EventStreamBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

- [ ] `packages/core/research/go-style-endpoint-practices.md:302:54` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  type WebSocketBuildContext<Root extends ObjectStruct<any>> = {
  ```

  修复后目标：

  ```ts
  type WebSocketBuildContext<Root extends ObjectStruct<unknown>> = {
  ```

#### `packages/core/research/http-middleware-best-practices-v2.md`

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:215:57` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  function makeChain<TFn extends (req: HttpRequest, next: any) => any>(interceptors: TFn[]): TFn {
  ```

  修复后目标：

  ```ts
  function makeChain<TFn extends (req: HttpRequest, next: unknown) => unknown>(interceptors: TFn[]): TFn {
  ```

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:215:65` — `explicit-any` — `markdown-code`
      修复前：

  ```ts
  function makeChain<TFn extends (req: HttpRequest, next: any) => any>(interceptors: TFn[]): TFn {
  ```

  修复后目标：

  ```ts
  function makeChain<TFn extends (req: HttpRequest, next: unknown) => unknown>(interceptors: TFn[]): TFn {
  ```

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:218:7` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  ((initReq: HttpRequest, finalHandlerFn: never) => interceptor(initReq, (req: HttpRequest) => fn(req, finalHandlerFn))) as TFn,
  ```

  修复后目标：

  ```ts
  ((initReq: HttpRequest, finalHandlerFn: never) => interceptor(initReq, (req: HttpRequest) => fn(req, finalHandlerFn)))Fn,
  ```

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:219:5` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  ((req: HttpRequest, fn: (req: HttpRequest) => unknown) => fn(req)) as TFn,
  ```

  修复后目标：

  ```ts
  ((req: HttpRequest, fn: (req: HttpRequest) => unknown) => fn(req))Fn,
  ```

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:308:12` — `non-null-assertion` — `markdown-code`
      修复前：

  ```ts
  return lastResponse!
  ```

  修复后目标：

  ```ts
  return lastResponse ?? raiseMissingValue()
  ```

- [ ] `packages/core/research/http-middleware-best-practices-v2.md:785:16` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return {
  ```

  修复后目标：

  ```ts
  return {
  ```

#### `packages/core/research/struct-tag-development-guide.md`

- [ ] `packages/core/research/struct-tag-development-guide.md:408:38` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return encodeObjectByTag(struct, value as Record<string, unknown>, JsonTag)
  ```

  修复后目标：

  ```ts
  return encodeObjectByTag(struct, value satisfies Record<string, unknown>, JsonTag)
  ```

- [ ] `packages/core/research/struct-tag-development-guide.md:417:38` — `type-assertion` — `markdown-code`
      修复前：

  ```ts
  return decodeObjectByTag(struct, value as Record<string, unknown>, JsonTag)
  ```

  修复后目标：

  ```ts
  return decodeObjectByTag(struct, value satisfies Record<string, unknown>, JsonTag)
  ```

---

## Self-Review

- [ ] Spec coverage: Appendix A includes 852 generated modification checkboxes, matching the verified audit count.
- [ ] Placeholder scan: this document contains no unresolved placeholders from the plan-writing failure list.
- [ ] Type consistency: helpers introduced in Tasks 1-7 have explicit names and signatures: `RuntimeObjectShape`, `assertStruct`, `copyReadonlyTuple`, `encodePrimitiveValue`, `isEnumValue`, `createRequestCommandBuilder`, `createPromiseWithResolvers`, `createTypedFetchMock`, `createMockWebSocketConstructor`, `callRuntimeOnly`, `parseTokenResponse`, and `isErrnoException`.
- [ ] Verification coverage: each task has focused commands; Task 8 has full `pnpm check` and `pnpm test` gates.
