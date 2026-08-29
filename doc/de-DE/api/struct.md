---
title: Struct
description: struct-Facade, Infer und StructError.
---

# Struct {#page}

Baue Wire-Boundary-Shapes, parse Values, inferiere TypeScript-Types.

## struct {#struct}

Facade. Lieber das als interne Constructors.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### Primitive und Container

| Helfer                                                                      | Rolle                                                                               |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Scalars                                                                             |
| `struct.literal(value)`                                                     | Exaktes Literal                                                                     |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                                |
| `struct.date()`                                                             | `Date`                                                                              |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Collections                                                                         |
| `struct.object(shape)`                                                      | Object; Fields akzeptieren `.optional()`, `.null()` / `.nullable()`, `.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Unions                                                                              |
| `struct.enum(values)`                                                       | String-Liste oder `{ Name: value }`-Map                                             |

### Request-/Body-Helfer

| Helfer                                                                         | Rolle                      |
| ------------------------------------------------------------------------------ | -------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP/SSE/WS Input-Sections |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | Encoded Bodies             |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | Binary                     |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Returns** `[null, value]` oder `[StructError, undefined]`.

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## Typen

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

Siehe [Struct-Guide](../core/struct.md).

## Struct {#Struct}

Parsebare Form: Input/Output-Typen plus `.optional()`, `.null()`, `.nullish()`, `.alias()`.

## StructLike {#StructLike}

Alles mit einem `_struct`-Typ-Payload.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

Objektförmiges Struct von `struct.object`.

## RequestStruct {#RequestStruct}

Abschnittiges HTTP/SSE/WS-Input von `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

Verschachtelter `{ _errors, [key]: … }`-Baum von `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` plus `fieldErrors` von `StructError.flatten()`.
