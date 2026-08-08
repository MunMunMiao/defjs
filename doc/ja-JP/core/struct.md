---
title: Struct
description: 構造デコード、ゼロ値、部分指定できるオブジェクト入力、エイリアス、StructError の処理を説明します。
---

# Struct

Struct は構造デコードと通信時のエンコーディングを記述します。一部のゼロ値動作は Go に着想を得ていますが、Go の `encoding/json` の挙動を完全に実装したものではありません。

ルートエントリーの `struct` ファサードと `Infer<T>` を使います。

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## コンストラクター

主なコンストラクターは次のとおりです。

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` と `struct.unknown()` は値を制約せず受け取ります。バイナリ用のコンストラクターは `struct.blob()`、`struct.file()`、`struct.arrayBuffer()` です。

すべての Struct で次の修飾メソッドを使えます。

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## ゼロ値

Struct が optional でない場合、欠損値または `undefined` はゼロ値へデコードされます。nullable でない `null` も同じです。nullable な Struct では、欠損値、`undefined`、`null` が `null` になります。

主なゼロ値は次のとおりです。

| Struct                        | ゼロ値                                 |
| ----------------------------- | -------------------------------------- |
| `string`                      | `''`                                   |
| `number`                      | `0`                                    |
| `boolean`                     | `false`                                |
| `bigint`                      | `0n`                                   |
| `date`                        | `new Date(0)`                          |
| 配列                          | `[]`                                   |
| オブジェクト                  | 各フィールドにゼロ値を持つオブジェクト |
| タプル                        | 各要素にゼロ値を持つタプル             |
| enum                          | 最初に宣言した値                       |
| リテラル                      | 宣言したリテラル                       |
| `blob`, `file`, `arrayBuffer` | 対応する空の値                         |
| `any`, `unknown`              | `undefined`                            |

オブジェクト内で `.optional()` だけを付けたフィールドが欠けている場合、デコード結果にはそのフィールドが含まれません。`.nullish()` は optional かつ nullable です。欠損値には nullable の処理が優先されるため、現在は `null` へデコードされます。

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

未知のオブジェクトキーは破棄されます。パース後のオブジェクトと record の出力には null prototype が使われます。`Object.prototype` のメソッドに依存するコードでは、`Object.keys`、`Object.entries` を使うか、意図的に通常のオブジェクトへコピーしてください。

## 入力の部分指定は仕様

TypeScript の境界では、オブジェクト入力のプロパティはすべて任意です。デコード後の出力プロパティが存在する場合も同じです。`struct.request(...)` のリクエストセクションも任意です。

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

これらのフィールドを必須と説明しないでください。Struct は、アプリケーションレベルの必須項目、認可、範囲、金額、形式、状態遷移を検証しません。公開された refine/range/format DSL もありません。

`struct.number()` は正負の `Infinity` を受け付け、JavaScript の数値のうち除外するのは `NaN` だけです。有限性、範囲、ドメインのチェックは、コマンド作成前にアプリケーションコードで行ってください。`build` の中には置けません。`build` が受け取るのは呼び出し元の実値ではなく、スキーマに束縛されたプロジェクションだからです。

## リクエストボディ

`struct.request(...)` は、通信形式へ直接割り当てるセクションをまとめます。

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

ボディ境界は次のとおりです。

| Struct                     | エンコーディング  |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | プレーンテキスト  |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

リクエストの自動マッピングとトランスポートごとの制約は [Commands](/ja-JP/core/commands) を参照してください。

## エイリアス

`.alias(name)` は論理的な TypeScript キーを変えずに通信上のキーを変更します。

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

エイリアスは JSON キーのデコードとエンコードに使われます。リクエストの自動構築では、送信時のパス、クエリ、ヘッダー、URL エンコード、multipart のキーにも使います。呼び出し側は論理キーを使い続けます。カスタム `build` プロジェクションで明示した出力先キーは、その指定どおりです。

## `StructError`

構造デコードに失敗すると `StructError` になります。多くの場合は `RequestError.cause` から参照できます。

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

`StructError` は次を公開します。

- `issues`: 元の `StructIssue[]`
- `format()`: 入れ子になったメッセージツリー
- `flatten()`: 最上位のフォームメッセージとフィールドメッセージ
- `prettify()`: 人が読める複数行の文字列

`StructIssue.received` には入力データまたはレスポンスデータが入ることがあります。デフォルトメッセージにその値の表現が含まれる場合もあります。特に record では、パスと整形済みのキーも信頼できないデータに由来します。`issues`、メッセージ、`format()`、`flatten()`、`prettify()` をログ出力または返却する前に、内容を確認してマスキングしてください。

## グローバルなエラーメッセージ

`setErrorMap(...)` は、メッセージ生成処理をプロセス全体で置き換えます。

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

このマップはグローバルで、クライアントスコープではありません。変更すると、同じ JavaScript realm にある全クライアントの後続 Struct issue に影響します。コールバックにリクエスト固有の状態を持ち込まないでください。同一プロセスを共有するアプリケーションでは、設定箇所を調整してください。

## 次に読む

- [Commands](/ja-JP/core/commands) — Struct フィールドとリクエスト/メッセージのマッピング
- [Errors](/ja-JP/core/errors) — Struct 失敗が実行タプルに現れる形
- [HTTP](/ja-JP/core/http) — レスポンスデコードと現在の不正 JSON に関する制約
