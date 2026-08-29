---
title: Struct
description: Fachada struct, Infer y StructError.
---

# Struct {#page}

Construye formas del límite de cable, parsea valores, infiere tipos TypeScript.

## struct {#struct}

Fachada. Prefiere esto frente a los constructores internos.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### Primitivos y contenedores

| Helper                                                                      | Rol                                                                                 |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Escalares                                                                           |
| `struct.literal(value)`                                                     | Literal exacto                                                                      |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                                |
| `struct.date()`                                                             | `Date`                                                                              |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Colecciones                                                                         |
| `struct.object(shape)`                                                      | Objeto; los campos aceptan `.optional()`, `.null()` / `.nullable()`, `.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Uniones                                                                             |
| `struct.enum(values)`                                                       | Lista de strings o mapa `{ Name: value }`                                           |

### Helpers de request / body

| Helper                                                                         | Rol                            |
| ------------------------------------------------------------------------------ | ------------------------------ |
| `struct.request({ path?, query?, headers?, body? })`                           | Secciones de input HTTP/SSE/WS |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | Cuerpos codificados            |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | Binario                        |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Devuelve** `[null, value]` o `[StructError, undefined]`.

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## Tipos

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

Ver [guía de Struct](../core/struct.md).

## Struct {#Struct}

Forma parseable: tipos input/output más `.optional()`, `.null()`, `.nullish()`, `.alias()`.

## StructLike {#StructLike}

Cualquier cosa con un payload de tipo `_struct`.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

Struct con forma de objeto, de `struct.object`.

## RequestStruct {#RequestStruct}

Input HTTP/SSE/WS seccionado de `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

Árbol anidado `{ _errors, [key]: … }` de `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` más `fieldErrors` de `StructError.flatten()`.
