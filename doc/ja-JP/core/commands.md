---
title: Commands
description: エンドポイントを定義し、コマンドビルダーとコマンドを作成し、Struct 入力を通信形式へ割り当て、HTTP 出力型を推論します。
---

# Commands

Defjs では、関連する 3 つの段階を区別します。

1. **エンドポイント定義**は、安定した HTTP、SSE、WebSocket 契約を記述します。
2. **コマンドビルダー**は、`defineRequest`、`defineEventStream`、`defineWebSocket` が返す関数です。
3. **コマンド**は、そのビルダーを入力付きで呼び出した結果です。`client.execute(...)` へ渡します。

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

この例では、`defineRequest` に渡したオブジェクトがエンドポイント定義、`getUser` がコマンドビルダー、`command` がコマンドです。

## HTTP エンドポイント定義

`defineRequest(...)` は次のフィールドを受け取ります。

| フィールド     | 意味                                                                                             |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `method`       | HTTP メソッド文字列。                                                                            |
| `path`         | 任意の `:name` プレースホルダーを含む相対エンドポイントパス。                                    |
| `input`        | コマンド入力の構造デコードに使う Struct。                                                        |
| `build`        | 入力フィールドからリクエスト各部への、スキーマに束縛されたプロジェクション。`input` が必要です。 |
| `output`       | レスポンスデコードと結果の型推論に使う、ステータスから Struct へのマッピング。                   |
| `responseType` | 任意のレスポンス形式。`json`、`text`、`blob`、`arraybuffer`。                                    |

コマンドフィールドを通信上のセクションへ直接割り当てる場合は、`struct.request(...)` を使います。

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

呼び出し側は論理フィールド名を使います。エイリアスが通信上のキーを決めます。

## コマンドビルダーの引数省略

`input` のないビルダーは、引数なしで呼び出します。

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

オブジェクト Struct の入力は型レベルで部分指定を許し、呼び出し側から見ると各プロパティはすべて任意です。リクエストセクションも任意です。構造デコードは optional でない出力フィールドをゼロ値で埋めるため、どちらの形でもビルダーの引数は必須になりません。

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search() // Accepted. The decoded q value is ''.
search({ query: { q: 'docs' } })
```

ビルダーに必ず引数を渡させたい場合は、プリミティブまたは配列の入力を使います。次の例はプリミティブ入力をパスパラメーターへプロジェクションします。

```typescript
const getUserById = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.number(),
  build(request, input) {
    request.setPathParams({ id: input })
  },
})

// getUserById() // TypeScript error: an argument is required.
getUserById(42)
```

これは引数を省略できるかどうかの規則であり、ビジネスルールの検証ではありません。呼び出し側は Struct の入力タイプが受け付ける値を渡せます。オブジェクトフィールドが欠けていればゼロ値になります。

## リクエストの自動構築

`input` が `struct.request(...)` で `build` を省略した場合、Defjs は宣言済みセクションを自動的に割り当てます。

- `path` はパスプレースホルダーを置き換えます。
- `query` はクエリパラメーターになります。
- `headers` はリクエストヘッダーになります。
- `body` は指定されたボディラッパーを使います。

リクエストボディでは、対応する境界を明示する必要があります。

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

`request.body` にラッパーなしの `struct.object(...)` を置かないでください。`struct.request(...)` が拒否します。HTTP はすべてのボディ形式に対応します。SSE はボディセクションを拒否し、WebSocket はヘッダーとボディセクションの両方を拒否します。

## カスタム `build`

論理フィールドを別の通信位置やキーへ割り当てる場合は、`build(request, input)` を使います。`input` パラメーターは**スキーマに束縛されたプロジェクション**であり、呼び出し元が渡した実値ではありません。

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

プロジェクションでできることは次のとおりです。

- 宣言済みフィールドを選ぶ
- 出力先の通信上のキーを指定する
- `.map(...)` で配列を 1 要素ずつ 1 対 1 にプロジェクションする
- JSON に束縛したオブジェクトを、そのフィールドエイリアスでエンコードする

呼び出し値の参照、値に応じた分岐、任意の変換、配列要素数の変更、リテラル値の注入はできません。たとえば `request.setJson({ version: 'v1' })` は無効です。`'v1'` が入力のバインディングビューに由来しないためです。

アプリケーションデータの正規化と検証は、コマンド作成前に行ってください。`build` は宣言的な通信マッピングに限定します。

### `build` で使える操作

| 出力先                                                             | HTTP | SSE  | WebSocket |
| ------------------------------------------------------------------ | ---- | ---- | --------- |
| `setPathParams`, `setQueryParams`                                  | 可   | 可   | 可        |
| `setHeaders`, `addHeaders`                                         | 可   | 可   | 不可      |
| JSON、テキスト、HTML、フォーム、Blob、ArrayBuffer のボディメソッド | 可   | 不可 | 不可      |

TypeScript の build コンテキストはトランスポート別です。型チェックを迂回した場合も、ランタイムチェックが未対応の出力を拒否します。

## HTTP 出力の型推論

`output` にはオブジェクトマップ、またはステータスとボディのペアを並べた配列を使えます。

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

HTTP の成功型は、宣言済み 2xx ボディのユニオンです。`error.data` は宣言済みの 2xx 以外のボディをまとめたユニオンです。配列形式では、ステータスリテラルとグループ化した `readonly` 配列を保持するために `as const` が必要です。

`output` を宣言した場合、返されるすべてのステータスに対応する Struct が必要です。未対応の 2xx または 2xx 以外のステータスは `UNDECLARED_STATUS` になります。`output` を省略するとレスポンスボディは無視され、結果は `undefined` です。

## SSE と WebSocket の定義

`defineEventStream(...)` では、HTTP の `output` の代わりに `events` マップを使います。イベント名が Struct を選び、任意の `default` エントリーがランタイムの未宣言名を処理します。

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` は、`incoming` と任意の `outgoing` メッセージマップを宣言します。メッセージエンベロープは `type` を判別フィールドとして使います。

```typescript
const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

デコード、キュー、再接続、クローズの所有権は [SSE](/ja-JP/core/sse) と [WebSocket](/ja-JP/core/web-socket) を参照してください。

## コマンドは不透明な値として扱う

アプリケーションコードではコマンドを作り、`Client.execute(...)` へ渡してください。トランスポートタグや構造のリフレクションに依存しないでください。

現在のルートエントリーは、トランスポートコマンドのインターフェースと低レベルの executor 関数をエクスポートしています。推奨するワークフローでは不要であり、長期的な安定性の方針はこのドキュメントで確定していません。ランタイムディスパッチが使うコマンドタグのシンボルとガード関数は、ルートからエクスポートされません。

## 次に読む

- [Client](/ja-JP/core/client) — `execute` のオーバーロードとオプション合成
- [HTTP](/ja-JP/core/http) — URL、エンコーディング、レスポンス、キャンセル
- [Struct](/ja-JP/core/struct) — 構造デコードとゼロ値
