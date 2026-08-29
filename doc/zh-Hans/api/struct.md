---
title: Struct
description: struct 门面、Infer，以及 StructError。
---

# Struct {#page}

建线上边界的形状，parse 值，推断 TypeScript 类型。

## struct {#struct}

门面。用这个，别直接碰内部构造函数。

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### 原语和容器

| Helper                                                                      | 作用                                                                    |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | 标量                                                                    |
| `struct.literal(value)`                                                     | 精确字面量                                                              |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                    |
| `struct.date()`                                                             | `Date`                                                                  |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | 集合                                                                    |
| `struct.object(shape)`                                                      | 对象；字段可以 `.optional()`、`.null()` / `.nullable()`、`.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | 联合                                                                    |
| `struct.enum(values)`                                                       | 字符串列表或 `{ Name: value }` map                                      |

### 请求 / body helpers

| Helper                                                                         | 作用                      |
| ------------------------------------------------------------------------------ | ------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP/SSE/WS 的 input 分段 |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | 编码过的 body             |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | 二进制                    |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **返回** `[null, value]` 或 `[StructError, undefined]`。

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## 类型

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

见 [Struct 指南](../core/struct.md)。

## Struct {#Struct}

能 parse 的形状：input/output 类型，加上 `.optional()`、`.null()`、`.nullish()`、`.alias()`。

## StructLike {#StructLike}

带 `_struct` 类型载荷的东西。

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

`struct.object` 造出来的对象形状。

## RequestStruct {#RequestStruct}

`struct.request` 分段的 HTTP/SSE/WS input。

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

`StructError.format()` 吐的嵌套 `{ _errors, [key]: … }`。

## FlattenedStructError {#FlattenedStructError}

`StructError.flatten()` 吐的 `formErrors` 加 `fieldErrors`。
