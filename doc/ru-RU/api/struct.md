---
title: Struct
description: Фасад struct, Infer и StructError.
---

# Struct {#page}

Собери формы на границе wire, распарси значения, выведи TypeScript-типы.

## struct {#struct}

Фасад. Бери его, а не внутренние конструкторы.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### Примитивы и контейнеры

| Хелпер                                                                      | Роль                                                                            |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | Скаляры                                                                         |
| `struct.literal(value)`                                                     | Точный literal                                                                  |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                            |
| `struct.date()`                                                             | `Date`                                                                          |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | Коллекции                                                                       |
| `struct.object(shape)`                                                      | Объект; поля принимают `.optional()`, `.null()` / `.nullable()`, `.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | Unions                                                                          |
| `struct.enum(values)`                                                       | Список строк или карта `{ Name: value }`                                        |

### Хелперы request / body

| Хелпер                                                                         | Роль                     |
| ------------------------------------------------------------------------------ | ------------------------ |
| `struct.request({ path?, query?, headers?, body? })`                           | Секции input HTTP/SSE/WS |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | Закодированные bodies    |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | Binary                   |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Возвращает** `[null, value]` или `[StructError, undefined]`.

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## Типы

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

Подробности — в [гайде Struct](../core/struct.md).

## Struct {#Struct}

Разбираемая форма: типы input/output плюс `.optional()`, `.null()`, `.nullish()`, `.alias()`.

## StructLike {#StructLike}

Всё, у чего есть type payload `_struct`.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

Объектная форма от `struct.object`.

## RequestStruct {#RequestStruct}

Секционированный HTTP/SSE/WS input от `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

Вложенное дерево `{ _errors, [key]: … }` из `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` плюс `fieldErrors` из `StructError.flatten()`.
