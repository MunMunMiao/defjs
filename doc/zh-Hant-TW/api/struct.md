---
title: Struct
description: struct facade、Infer，以及 StructError。
---

# Struct {#page}

組 wire 邊界的形狀、剖析值、推導 TypeScript 型別。

## struct {#struct}

Facade。請走這個，別用內部 constructors。

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### 純量與容器

| Helper                                                                      | 用途                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | 純量                                                                    |
| `struct.literal(value)`                                                     | 精確字面值                                                              |
| `struct.null()` / `any()` / `unknown()`                                     | Null／any／unknown                                                      |
| `struct.date()`                                                             | `Date`                                                                  |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | 集合                                                                    |
| `struct.object(shape)`                                                      | 物件；欄位可接 `.optional()`、`.null()` / `.nullable()`、`.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | 聯集                                                                    |
| `struct.enum(values)`                                                       | 字串清單或 `{ Name: value }` map                                        |

### Request／body helpers

| Helper                                                                         | 用途                        |
| ------------------------------------------------------------------------------ | --------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP／SSE／WS 的 input 區段 |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | 編碼後的 bodies             |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | 二進位                      |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **回傳** `[null, value]` 或 `[StructError, undefined]`。

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## 型別

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

見 [Struct 指南](../core/struct.md)。

## Struct {#Struct}

能 parse 的形狀：input/output 型別，加上 `.optional()`、`.null()`、`.nullish()`、`.alias()`。

## StructLike {#StructLike}

帶 `_struct` 型別載荷的東西。

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

`struct.object` 做出來的物件形狀。

## RequestStruct {#RequestStruct}

`struct.request` 分段的 HTTP／SSE／WS input。

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

`StructError.format()` 吐出的巢狀 `{ _errors, [key]: … }`。

## FlattenedStructError {#FlattenedStructError}

`StructError.flatten()` 吐出的 `formErrors` 加 `fieldErrors`。
