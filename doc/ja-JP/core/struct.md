---
title: Struct
description: リクエストとレスポンスの形をモデルし、未知値をパースし、ワイヤボディをエンコードします。
---

# Struct

リクエスト（とそのレスポンス）を Struct としてモデルします。`Infer` で TypeScript 型が、`struct.parse(...)` で実行時チェックが得られます — throw なし、エラーファーストのタプルです。

## Basic Setup

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

パース済み出力は宣言フィールドだけを保ちます。必須欠落、間違ったプリミティブ、悪い入れ子、タプル長不一致、許可されない `null` → `StructError`。部分値なし。Struct は不変です。`.optional()` などは新しい Struct を返します。

## 必須、任意、null

存在と null 許容は別です。

| 宣言                         | Missing / `undefined`                  | `null` | 有効な値     |
| ---------------------------- | -------------------------------------- | ------ | ------------ |
| `struct.string()`            | 拒否                                   | 拒否   | 文字列を受理 |
| `struct.string().optional()` | 受理。欠落オブジェクトフィールドは省略 | 拒否   | 文字列を受理 |
| `struct.string().null()`     | 拒否                                   | 受理   | 文字列を受理 |
| `struct.string().nullish()`  | 受理。欠落オブジェクトフィールドは省略 | 受理   | 文字列を受理 |
| `struct.null()`              | 拒否                                   | 受理   | 他の値は拒否 |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

ルートでは optional は `undefined` になれます。オブジェクト内では、省略された optional/nullish フィールドは欠落のままです。`struct.request(...)` では、全部 optional のセクションは省略できます（`{}` に正規化）。必須フィールドを持つセクションは必須のままです。ボディラッパーがある → 内側が optional でもボディは必須。

## リクエストボディラッパー

`struct.request(...)` は `path`、`query`、`headers`、`body` を分けます。ボディには明示コーデックが要ります。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| ラッパー                   | パース済み値         | ワイヤ境界                                                           |
| -------------------------- | -------------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | `inner` からの値     | JSON テキスト、`application/json`                                    |
| `struct.text()`            | `string`             | テキスト、`text/plain;charset=UTF-8`                                 |
| `struct.urlencoded(shape)` | shape のオブジェクト | `URLSearchParams`、`application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | shape のオブジェクト | `FormData`。プラットフォームが multipart boundary を設定             |
| `struct.blob()`            | `Blob`               | Blob の type、または `application/octet-stream`                      |
| `struct.file()`            | `File`               | ネイティブ `File`（name + type）                                     |
| `struct.arrayBuffer()`     | `ArrayBuffer`        | バッファ、`application/octet-stream`                                 |

`struct.file()` はフォームフィールド用の値 Struct であり、単独の `request.body` ではありません。バイナリボディは `struct.blob()` と `struct.arrayBuffer()` です。むき出しのオブジェクト/配列/プリミティブ Struct は `request.body` として無効です。SSE は `body` を拒否します。WebSocket のリクエスト入力は `body` と `headers` を拒否します。

## エイリアス

`.alias(...)` は論理名とワイヤ名を分けます。`struct.parse(...)` は論理キーを使います。JSON とフラットなリクエストコーデックはエイリアスをエンコードし、JSON レスポンスデコードはワイヤキーを論理フィールドに戻します。

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| 境界                                             | フィールド                  |
| ------------------------------------------------ | --------------------------- |
| `struct.parse(User, ...)`                        | 論理 `displayName`          |
| JSON リクエストエンコード                        | ワイヤ `display_name`       |
| JSON レスポンスデコード                          | ワイヤ → 論理 `displayName` |
| query、header、URL-encoded、multipart エンコード | キーとしてワイヤエイリアス  |

エイリアスは入れ子フィールド、配列、オブジェクト、ユニオン、ディスクリミネータで動きます。アプリコードでは論理名を保ち、外部命名は Struct に載せてください。

## パース失敗

`struct.parse(...)` は `[null, value]` または `[StructError, undefined]` を返します。`StructError` は `Error` を拡張し、`issues` に加え `format()`、`flatten()`、`prettify()` を公開します。

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

`StructIssue` は `code`、`expected`、`message`、`path`、`received` を持ちます。issue は信頼できない入力を持ち得ます — ログや返却の前に redact してください。`struct.parse(..., { errorMap })` rewrites issue messages for that call only.決定的にし、リクエスト固有状態を入れないでください。

Struct の検証は構造だけです。公開の range、format、refinement、認可、状態遷移ルールはありません。そうした検査はコマンドを組み立てる前に行ってください。

## Reference

`@defjs/core` 上の公開コンストラクタです（内部は facade API ではありません）。

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| コンストラクタ                   | 入力                                            | 推論される出力           |
| -------------------------------- | ----------------------------------------------- | ------------------------ |
| `struct.number()`                | `NaN` 以外の数値                                | ±Infinity`を含む`number` |
| `struct.date()`                  | `Date`、数値、または日付文字列                  | 有効な `Date`            |
| `struct.bigint()`                | `bigint`、または `BigInt(...)` が受理する文字列 | `bigint`                 |
| `struct.enum(...)`               | 宣言された文字列または数値メンバー              | そのリテラルユニオン     |
| `struct.discriminatedUnion(...)` | 必須リテラルディスクリミネータ付きオブジェクト  | 選ばれたオブジェクト分岐 |
| `struct.or(...)`                 | 最初に一致する分岐。エンコードは曖昧さを検査    | 分岐出力のユニオン       |
| `struct.intersection(...)`       | 全メンバーが受理する値                          | 出力の交差               |
| `struct.record(value)`           | 値が `value` に一致するプレーンオブジェクト     | パース済み値の Record    |
| `struct.tuple(items)`            | 宣言長ちょうどである配列                        | 固定長タプル             |

すべての Struct は `.alias(name)`、`.optional()`、`.null()`、`.nullish()` をサポートします。`struct.discriminatedUnion` は必須リテラルディスクリミネータ付きオブジェクトオプションが要り、重複を拒否します。

`struct`、`Infer`、`Struct`、`StructError`、関連する公開型は `@defjs/core` から import してください。パーサは `struct.parse(...)` を使います。`createObjectStruct`、定義 symbol、コーデック内部、`packages/core/src` は import しないでください。

facade の非約束事項:

- オブジェクト/record 出力は null プロトタイプを使います — `Object.prototype` メソッドを前提にしないでください。
- 未知のオブジェクトキーは落とされます。
- `struct.number()` は `NaN` を拒否し、無限大は受理します。
- `struct.or(...)` は分岐を順に試し、分岐が食い違う曖昧なエンコードは拒否します。
- `struct.intersection(...)` はメンバーを宣言順にパースします。
- Struct は境界を検証します。キャッシュも認可も、トランスポートリソースの所有もしません。

## 関連レシピ

- [POST JSON](../recipes/post-json.md)
- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
