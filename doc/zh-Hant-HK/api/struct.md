---
title: Struct
description: struct facade、Infer，同 StructError。
---

# Struct {#page}

Build wire-boundary shapes，parse values，再 infer TypeScript types。

## struct {#struct}

Facade。Prefer 用呢個，唔好用 internal constructors。

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### Primitives 同 containers

| Helper                                                                      | 做咩                                                                         |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Scalars                                                                      |
| `struct.literal(value)`                                                     | Exact literal                                                                |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                         |
| `struct.date()`                                                             | `Date`                                                                       |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Collections                                                                  |
| `struct.object(shape)`                                                      | Object；fields 接受 `.optional()`、`.null()` / `.nullable()`、`.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Unions                                                                       |
| `struct.enum(values)`                                                       | String list 或者 `{ Name: value }` map                                       |

### Request / body helpers

| Helper                                                                         | 做咩                       |
| ------------------------------------------------------------------------------ | -------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP/SSE/WS input sections |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | Encoded bodies             |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | Binary                     |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Returns** `[null, value]` 或者 `[StructError, undefined]`。

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## Types

### Infer {#Infer}

### StructInput {#StructInput}

### AnyStruct {#AnyStruct}

### ParseResult {#ParseResult}

```ts
type Infer<T> = /* output type of T */
type StructInput<T> = /* input type of T */
type AnyStruct = Struct<any, any, boolean>
type ParseResult<O> = [error: null, value: O] | [error: StructError, value: undefined]
```

### StructError {#StructError}

```ts
class StructError extends Error {
  readonly issues: StructIssue[]
  format(): FormattedStructError
  flatten(): FlattenedStructError
  prettify(): string
}
```

`StructIssue`：`path`、`code`、`expected`、`received`、`message`。

睇 [Struct guide](../core/struct.md)。

## Struct {#Struct}

可以 parse 嘅 shape：input/output types，再加 `.optional()`、`.null()`、`.nullish()`、`.alias()`。

## StructLike {#StructLike}

帶住 `_struct` type payload 嘅嘢。

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

`struct.object` 整出嚟嘅 object shape。

## RequestStruct {#RequestStruct}

`struct.request` 分段嘅 HTTP/SSE/WS input。

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

`StructError.format()` 吐出嚟嘅 nested `{ _errors, [key]: … }`。

## FlattenedStructError {#FlattenedStructError}

`StructError.flatten()` 吐出嚟嘅 `formErrors` 加 `fieldErrors`。
