---
title: Struct
description: struct ファサード、Infer、StructError です。
---

# Struct {#page}

ワイヤ境界の形を作り、値をパースし、TypeScript 型を推論します。

## struct {#struct}

ファサードです。内部コンストラクタよりこちらを使ってください。

```ts
const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

const [error, user] = struct.parse(User, { id: 1, display_name: 'Ada' })
```

### プリミティブとコンテナ

| ヘルパー                                                                    | 役割                                                                                           |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `struct.string()` / `number()` / `boolean()` / `bigint()`                   | スカラー                                                                                       |
| `struct.literal(value)`                                                     | ちょうどそのリテラル                                                                           |
| `struct.null()` / `any()` / `unknown()`                                     | Null / any / unknown                                                                           |
| `struct.date()`                                                             | `Date`                                                                                         |
| `struct.array(item)` / `tuple(...)` / `record(value)`                       | コレクション                                                                                   |
| `struct.object(shape)`                                                      | オブジェクト。フィールドは `.optional()`、`.null()` / `.nullable()`、`.alias(name)` を取れます |
| `struct.or(...)` / `intersection(...)` / `discriminatedUnion(tag, options)` | ユニオン                                                                                       |
| `struct.enum(values)`                                                       | 文字列リスト、または `{ Name: value }` マップ                                                  |

### リクエスト / body ヘルパー

| ヘルパー                                                                       | 役割                         |
| ------------------------------------------------------------------------------ | ---------------------------- |
| `struct.request({ path?, query?, headers?, body? })`                           | HTTP/SSE/WS の入力セクション |
| `struct.json(inner)` / `text(inner)` / `formData(inner)` / `urlencoded(inner)` | エンコード済みボディ         |
| `struct.arrayBuffer()` / `blob()` / `file()`                                   | バイナリ                     |

### struct.parse() {#struct.parse}

```ts
function parse<S>(struct: S, value: unknown): ParseResult<Infer<S>>
```

- **戻り値** — `[null, value]`、または `[StructError, undefined]` です。

## ErrorMap {#ErrorMap}

```ts
type ErrorMap = (issue: StructIssue) => string | undefined
```

## 型

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

`StructIssue` は `path`、`code`、`expected`、`received`、`message` です。

[Struct ガイド](../core/struct.md) を見てください。

## Struct {#Struct}

parse できる形です。input/output の型に `.optional()`、`.null()`、`.nullish()`、`.alias()` が付きます。

## StructLike {#StructLike}

`_struct` の型ペイロードを持つものです。

## StructMethods {#StructMethods}

`.alias()`, `.null()`, `.nullish()`, `.optional()`.

## ObjectStruct {#ObjectStruct}

`struct.object` が作るオブジェクト形です。

## RequestStruct {#RequestStruct}

`struct.request` が切った HTTP / SSE / WS の input です。

## StructIssue {#StructIssue}

`path`, `code`, `expected`, `received`, `message`.

## FormattedStructError {#FormattedStructError}

`StructError.format()` が出す入れ子の `{ _errors, [key]: … }` です。

## FlattenedStructError {#FlattenedStructError}

`StructError.flatten()` が出す `formErrors` と `fieldErrors` です。
