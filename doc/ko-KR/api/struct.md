---
title: Struct
description: struct 파사드, Infer, StructError예요.
---

# Struct {#page}

와이어 경계 형태를 만들고, 값을 파싱하고, TypeScript 타입을 추론해요.

## struct {#struct}

파사드예요. 내부 생성자보다 이걸 쓰세요.

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### 원시값과 컨테이너

| Helper                                                                      | 역할                                                                           |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | 스칼라                                                                         |
| `struct.literal(value)`                                                     | 정확한 literal                                                                 |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                           |
| `struct.date()`                                                             | `Date`                                                                         |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | 컬렉션                                                                         |
| `struct.object(shape)`                                                      | 객체. 필드는 `.optional()`, `.null()` / `.nullable()`, `.alias(name)`을 받아요 |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | 유니온                                                                         |
| `struct.enum(values)`                                                       | 문자열 목록 또는 `{ Name: value }` 맵                                          |

### 요청 / body 헬퍼

| Helper                                                                         | 역할                  |
| ------------------------------------------------------------------------------ | --------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP/SSE/WS 입력 섹션 |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | 인코딩된 body         |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | 바이너리              |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **Returns** `[null, value]` 또는 `[StructError, undefined]`예요.

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## 타입

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

자세한 내용은 [Struct 가이드](../core/struct.md)를 보세요.

## Struct {#Struct}

parse할 수 있는 모양이에요. input/output 타입에 `.optional()`, `.null()`, `.nullish()`, `.alias()`가 붙어요.

## StructLike {#StructLike}

`_struct` 타입 payload가 있는 거예요.

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

`struct.object`가 만드는 객체 모양이에요.

## RequestStruct {#RequestStruct}

`struct.request`가 나눈 HTTP/SSE/WS input이에요.

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

`StructError.format()`가 내놓는 중첩 `{ _errors, [key]: … }`예요.

## FlattenedStructError {#FlattenedStructError}

`StructError.flatten()`가 내놓는 `formErrors`와 `fieldErrors`예요.
