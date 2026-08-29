---
title: Struct
description: Façade struct, Infer, et StructError.
---

# Struct {#page}

Construis des formes de frontière wire, parse des valeurs, infère des types TypeScript.

## struct {#struct}

Façade. Préfère-la aux constructeurs internes.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### Primitives et conteneurs

| Helper                                                                      | Rôle                                                                                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Scalaires                                                                             |
| `struct.literal(value)`                                                     | Littéral exact                                                                        |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                                  |
| `struct.date()`                                                             | `Date`                                                                                |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Collections                                                                           |
| `struct.object(shape)`                                                      | Objet ; les champs acceptent `.optional()`, `.null()` / `.nullable()`, `.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Unions                                                                                |
| `struct.enum(values)`                                                       | Liste de strings ou map `{ Name: value }`                                             |

### Helpers requête / body

| Helper                                                                         | Rôle                          |
| ------------------------------------------------------------------------------ | ----------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | Sections d’entrée HTTP/SSE/WS |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | Bodies encodés                |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | Binaire                       |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Renvoie** `[null, value]` ou `[StructError, undefined]`.

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

`StructIssue` : `path`, `code`, `expected`, `received`, `message`.

Voir [le guide Struct](../core/struct.md).

## Struct {#Struct}

Forme parseable : types input/output plus `.optional()`, `.null()`, `.nullish()`, `.alias()`.

## StructLike {#StructLike}

Tout ce qui a un payload de type `_struct`.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

Struct en forme d’objet, de `struct.object`.

## RequestStruct {#RequestStruct}

Input HTTP / SSE / WS découpé par `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

Arbre imbriqué `{ _errors, [key]: … }` de `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` plus `fieldErrors` de `StructError.flatten()`.
