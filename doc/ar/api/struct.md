---
title: Struct
description: واجهة struct، Infer، وStructError.
---

# Struct {#page}

ابنِ أشكال حدود السلك، حلّل القيم، واستنتج أنواع TypeScript.

## struct {#struct}

واجهة. فضّل هذه على المنشئات الداخلية.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### البدائيات والحاويات

| المساعد                                                                     | الدور                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | بدائيات                                                                    |
| `struct.literal(value)`                                                     | حرفي مطابق                                                                 |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                       |
| `struct.date()`                                                             | `Date`                                                                     |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | مجموعات                                                                    |
| `struct.object(shape)`                                                      | كائن؛ الحقول تقبل `.optional()` و`.null()` / `.nullable()` و`.alias(name)` |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | اتحادات                                                                    |
| `struct.enum(values)`                                                       | قائمة سلاسل أو خريطة `{ Name: value }`                                     |

### مساعدات الطلب / الجسم

| المساعد                                                                        | الدور                  |
| ------------------------------------------------------------------------------ | ---------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | أقسام مدخل HTTP/SSE/WS |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | أجسام مرمّزة           |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | ثنائي                  |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **يُرجع** `[null, value]` أو `[StructError, undefined]`.

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## الأنواع

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

`StructIssue`: `path`، `code`، `expected`، `received`، `message`.

انظر [دليل Struct](../core/struct.md).

## Struct {#Struct}

شكل قابل للتحليل: أنواع الإدخال/الإخراج مع `.optional()` و`.null()` و`.nullish()` و`.alias()`.

## StructLike {#StructLike}

أي شيء يحمل حمولة نوع `_struct`.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

شكل كائن من `struct.object`.

## RequestStruct {#RequestStruct}

إدخال HTTP/SSE/WS مقسّم من `struct.request`.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

شجرة متداخلة `{ _errors, [key]: … }` من `StructError.format()`.

## FlattenedStructError {#FlattenedStructError}

`formErrors` مع `fieldErrors` من `StructError.flatten()`.
