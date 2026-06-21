---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` は、スキーマの宣言、入力の検証、型の推論のための軽量な struct ファサードを提供します。設計意図は Go の `encoding/json` をモデルにしています：ゼロ値フォールバック、部分入力の受け入れ、安定した予測可能な実行時動作です。

## プリミティブ型

すべてのスキーマは `struct` 名前空間を通じて作成され、`.optional()`、`.null()`、`.nullish()`、`.alias(name)` などのチェーン呼び出しをサポートします。

### スカラー

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

利用可能なスカラー：

| コンストラクター       | 入力型                                  | 出力型        | ゼロ値               |
| ---------------------- | --------------------------------------- | ------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`      | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`      | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`     | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`      | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`        | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`        | `null`               |
| `struct.any()`         | `unknown`                               | `any`         | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`     | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`        | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`        | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer` | `new ArrayBuffer(0)` |

### オプショナルと Nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // 出力型: string | undefined
  age: struct.number().null(), // 出力型: number | null
  nick: struct.string().nullish(), // 出力型: string | null | undefined
})
```

### 列挙型とリテラル

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### 配列、タプル、レコード

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### 共用体と交差型

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### 判別共用体

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## リクエストスキーマ

`struct.request(...)` は `path`、`query`、`headers`、`body` を単一の入力構造に整理し、エンドポイントによる自動 HTTP リクエストビルドを実現します。

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

ボディラッパーはトランスポートエンコーディングを決定します：

| ラッパー                   | エンコーディング     |
| -------------------------- | -------------------- |
| `struct.json(struct)`      | `JSON.stringify`     |
| `struct.urlencoded(shape)` | `URLSearchParams`    |
| `struct.formData(shape)`   | `FormData`           |
| `struct.text()`            | プレーンテキスト     |
| `struct.blob()`            | バイナリ Blob        |
| `struct.arrayBuffer()`     | バイナリ ArrayBuffer |

## `Infer<T>` 型推論

`Infer<T>` はスキーマの出力型を抽出します。これは覚えておくべき唯一の型レベルヘルパーです。

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` は `struct.array(...)`、`struct.union(...)`、`struct.request(...)` でも機能します：

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError とエラーマッピング

検証に失敗すると、実行時は完全な `StructIssue[]` を含む `StructError` を返します。

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### エラーのフォーマット

```typescript
error.format() // ツリーオブジェクト { _errors: [], name: { _errors: ['...'] } }
error.flatten() // フラットオブジェクト { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // 文字列: "× name: Expected string, received undefined"
```

### グローバルエラーマッピング

`setErrorMap` でデフォルトメッセージを置き換えます：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // カバーされていない問題はデフォルトメッセージを使用
})
```

## Field Aliases

`.alias(name)` は唯一の組み込みフィールド wire-name メカニズムです。JSON、query、headers、path、urlencoded、FormData のエンコード/デコードで使う外部 key だけを変更します。TypeScript のプロパティ名、出力型、request section、body codec、または `build(ctx, input)` 内で明示的に書いた object key は変更しません。alias がないフィールドは object field key を wire key として使います。

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

The same alias is used by JSON, query, path params, headers, urlencoded bodies, and multipart bodies. If the same logical value needs different names in different targets, split the struct or write explicit keys in `build(ctx, input)`.

## Field Introspection

`getStructFields` expands an object struct into a readable field list containing field key, alias, and sub-struct.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
  }
}
```

## ゼロ値フォールバックと部分入力

struct パーサーは Go の `encoding/json` セマンティクスに従います：

1. **欠落フィールド** → タイプのゼロ値で埋められ、`missing_key` はスローされません。
2. **部分入力** → 一部のフィールドのみを渡せます。未設定フィールドはゼロ値で自動補完されます。
3. **`undefined` と `null`** → `optional` フィールドは `undefined` を返します；`nullable` フィールドは `null` を返します；その他はゼロ値を返します。

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

これは意図的な設計であり、バグではありません。メリット：

- フロントエンドフォームは変更されたフィールドのみを送信できます；バックエンドは完全な構造を受け取ります。
- オブジェクト内への `undefined` の蔓延を回避します；出力は常に安全にトラバース可能です。
- Go の json アンマーシャリングと一貫したメンタルモデルを提供し、異言語間のコラボレーションを統一します。

厳密な検証が必要な場合（欠落フィールドをエラーにする）は、エンドポイントの `build` 関数で明示的にチェックするか、`[error, value]` 結果を自分で処理するために `struct.parseTuple` を使用してください。

## 次に読む

- [Commands →](/core/commands) — `defineRequest`、`defineEventStream`、`defineWebSocket` で struct を使用する
- [HTTP →](/core/http) — リクエストボディエンコーディングとレスポンス検証
- [Context →](/core/context) — 自動ビルドとリクエストビルダー機能
