---
title: Struct
description: struct facade, Infer, and StructError.
---

# Struct {#page}

Build wire-boundary shapes, parse values, infer TypeScript types.

## struct {#struct}

Facade. Prefer this over internal constructors.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, displayName: 'Ada' })
```

### Primitives and containers

| Helper                                                                      | Role                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Scalars                                                                        |
| `struct.literal(value)`                                                     | Exact literal                                                                  |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                           |
| `struct.date()`                                                             | `Date`                                                                         |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Collections                                                                    |
| `struct.object(shape)`                                                      | Object; fields accept `.optional()`, `.null()` / `.nullable()`, `.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Unions                                                                         |
| `struct.enum(values)`                                                       | String list or `{ Name: value }` map                                           |

### Request / body helpers

| Helper                                                                                      | Role                       |
| ------------------------------------------------------------------------------------------- | -------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                                        | HTTP/SSE/WS input sections |
| `struct.json(inner, { contentType? })` / `text()` / `formData(shape)` / `urlencoded(shape)` | Encoded bodies             |
| `struct.arrayBuffer()` / `blob()` / `file()`                                                | Binary                     |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown, options?: { aliases?: boolean; errorMap?: ErrorMap }): ParseResult<Infer<S>>
```

- **Returns** `[null, value]` or `[StructError, undefined]`.
- Optional `errorMap` rewrites issue messages for this parse only.
- Default reads **logical** keys (`displayName`). Pass `{ aliases: true }` to read wire keys (`display_name`) the same way HTTP/JSON codecs do.

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

`StructIssue`: `path`, `code`, `expected`, `received`, `message`.

See [Struct guide](/core/struct).

## Struct {#Struct}

A parseable shape: input/output types plus `.optional()`, `.null()` / `.nullable()`, `.nullish()`, `.alias()`.

## StructLike {#StructLike}

Anything with a `_struct` type payload.

## StructMethods {#StructMethods}

`.alias()`, `.null()` / `.nullable()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

Object-shaped struct from `struct.object`.

## RequestStruct {#RequestStruct}

Sectioned HTTP/SSE/WS input from `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

Nested `{ _errors, [key]: … }` tree from `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` plus `fieldErrors` from `StructError.flatten()`.
