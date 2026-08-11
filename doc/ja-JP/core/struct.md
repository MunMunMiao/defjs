---
title: Struct
description: 厳密な構造デコード、必須・任意入力、エイリアス、StructError の処理を説明します。
---

# Struct

Struct は厳密な構造デコードと通信時のエンコーディングを記述します。必須値の欠損や不正値は、既定値を生成せず失敗します。

ルートエントリーの `struct` ファサードと `Infer<T>` を使います。

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

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

`struct.any()` と `struct.unknown()` は `null` と `undefined` 以外の任意の値を受け取ります。これらを許可する場合も同じ修飾メソッドを使います。バイナリ用のコンストラクターは `struct.blob()`、`struct.file()`、`struct.arrayBuffer()` です。

すべての Struct で次の修飾メソッドを使えます。

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 厳密なパース

コマンド外でデコードするには `struct.parse(schema, input)` を使います。固定の error-first タプルを返します。

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

修飾子の規則は共通です。欠損値と `undefined` は `.optional()` または `.nullish()` の場合だけ、明示的な `null` は `.null()` または `.nullish()` の場合だけ受理されます。`.null()` は値を optional にはしません。

欠損した optional と nullish のオブジェクトフィールドは出力から省かれ、トップレベルでは `undefined` になります。未知のキーは破棄され、デコード後のオブジェクトと record は null prototype を使います。

Node の strict deep equality は prototype も比較するため、Struct で解析したオブジェクトは同じフィールドを持つオブジェクトリテラルと深く等価にはなりません。この境界を明示的に検証するか、アサーション内だけで shallow copy を作成してください。

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

この spread はアサーション専用の浅いコピーです。ネストした Struct オブジェクトも null prototype のままです。テスト matcher に合わせるためだけに、本番経路へ全体的な normalize や clone を追加しないでください。

`exactOptionalPropertyTypes` を有効にすると、推論されたオブジェクト入力は正確な optional property を使います。optional または nullish のキーに `undefined` を代入せず、そのキー自体を省略してください。

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

実行時の `struct.parse` は unknown 入力に含まれる明示的な `undefined` を防御的に受け入れ、そのキーを省略します。この正規化によって、静的に推論された呼び出し側の入力型が広がることはありません。

## 必須のオブジェクト・リクエスト入力

Struct が optional または nullish でない限り、オブジェクトプロパティは TypeScript と実行時の両方で必須です。`struct.request(...)` で宣言した各セクションも必須です。宣言しないセクションは入力型に現れません。

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

`query` の省略はエラーですが、`query: {}` は有効です。必須フィールドの欠損、明示的な `undefined`、禁止された `null`、不正な実行時型のどれでも、部分値を返さずパース全体が失敗します。

複合 Struct は最初に確定した issue で停止します。タプル入力の長さは宣言と完全に一致する必要があります。`struct.or(...)` は順番に代替候補を試し、`struct.discriminatedUnion(...)` は宣言済みの分岐を選びます。

discriminator フィールドに alias がある場合、`struct.discriminatedUnion(...)` は option の宣言順に、実際に存在する最初の wire discriminator を読み取ります。分岐を選択した後は、後続 option の alias を読み取りません。

Struct が保証するのは宣言した構造であり、アプリケーションの認可、範囲、金額、形式、状態遷移ではありません。公開 refine/range/format DSL はありません。

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

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

`logicalUser` は `{ id, displayName }` を使い、`wireKeyError` は論理キー `id` の欠落を示します。公開 `struct.parse` は論理値だけを読み、wire key を単独 parse の入力として扱いません。

transport の JSON エンコードとデコードでのみ wire alias が適用されます。

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`requestWireBody` は `{ user_id, display_name }`、`responseUser` は再び `{ id, displayName }` になります。リクエストの自動構築でも送信時の path、query、header、URL-encoded、multipart のキーに alias を使います。カスタム `build` プロジェクションで明示した出力先キーは変わりません。

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
- [HTTP](/ja-JP/core/http) — レスポンスデコードと表現エラー
