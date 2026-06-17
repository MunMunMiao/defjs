---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# コマンド

Defjs は「コマンド」を中心に構築されています：コマンドとは、`defineRequest`、`defineEventStream`、`defineWebSocket` によって作成された型安全な実行可能オブジェクトです。各コマンドは `kind`（トランスポートタイプ）、`definition`（エンドポイントスキーマ）、`input`（呼び出しデータ）を持ちます。クライアントは `kind` に基づいて正しいトランスポートロジックにディスパッチします。

## defineRequest：HTTP エンドポイント定義

`defineRequest` は RESTful HTTP エンドポイントを定義します。定義オブジェクトを受け取り、コマンドビルダーを返します。

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### 定義オブジェクトのフィールド

| フィールド     | 型                                | 説明                                                                 |
| -------------- | --------------------------------- | -------------------------------------------------------------------- |
| `method`       | `string`                          | HTTP メソッド。例: `GET`、`POST`                                     |
| `path`         | `string`                          | URL パス。`:param` プレースホルダーをサポート                        |
| `input`        | `AnyStruct \| undefined`          | 入力データの Struct バリデーター                                     |
| `build`        | `RequestBuildHandler`             | パース済み入力を HTTP リクエストの各部分にマッピング                 |
| `output`       | `RequestOutputShape \| undefined` | ステータスコードからレスポンス Struct へのマッピング                 |
| `responseType` | `HttpResponseType`                | オプション。レスポンスのパースモードを強制（`json`、`text`、`blob`） |

### input / output / build の関係

1. **input**：呼び出し側が提供する必要があるデータを記述します。実行時に、クライアントは `input` Struct を使って生の入力を検証・パースします。
2. **build**：`RequestBuilder` とパース済み入力（`RequestBuildInput`）を受け取り、データをパスパラメーター、クエリパラメーター、ヘッダー、ボディにマッピングします。
3. **output**：サーバーの応答の可能性を記述します。クライアントは HTTP ステータスコードに一致する Struct を選択し、成功（2xx）とエラー（非 2xx）の型を導出します。

`build` を省略する場合、`input` も省略する必要があります。そのコマンドは入力を受け付けず、`path` に直接送信されます。

`build` を提供する場合、`input` も提供する必要があります。これは厳密な設計ルールです。

### 入力なしのショートカット

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // 引数は不要
```

### 出力型推論

`output` は配列形式とオブジェクト形式の両方をサポートし、等価な動作をします：

```typescript
// 配列形式（推奨）
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// オブジェクト形式
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

実行結果は自動的に型付けされます：2xx データは成功ブランチに入り、それ以外はエラーブランチに入ります。

---

## defineEventStream：SSE ストリーム定義

`defineEventStream` は Server-Sent Events（SSE）エンドポイントを定義します。イベント名を Struct にマッピングし、イベントレベルの型安全性を実現します。

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### events マッピング

`events` の各キーは SSE の `event` フィールドに対応します。メッセージが到着した際、クライアントは `event` 名に一致する Struct を検索します。

### default フォールバック

サーバーが宣言されていないイベント名を送信する場合、`default` スキーマをフォールバックとして提供できます：

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // 一致しないイベントを文字列としてパース
  },
})
```

`default` がない場合、一致しないイベントは静かに破棄されます。`onInvalidEvent` インターセプターが設定されている場合は、通知を受け取ります。

### 入力付き SSE

SSE はデフォルトで `GET` を使用します。クエリパラメーターが必要な場合は、`defineRequest` と同様に `input` と `build` を提供します：

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE の `build` はリクエストボディや `withCredentials` をサポートしません。

---

## defineWebSocket：WebSocket 定義

`defineWebSocket` は WebSocket エンドポイントを定義します。**incoming**（サーバー → クライアント）と **outgoing**（クライアント → サーバー）のメッセージスキーマを区別します。

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming メッセージスキーマ

`incoming` はサーバーからプッシュされるメッセージ型を定義します。各メッセージは `incoming` キーに一致する `type` フィールドを含む必要があります。ペイロードがオブジェクトの場合、そのフィールドは `type` とマージされます：

```typescript
// サーバー送信: { type: 'message', user: 'Alice', text: 'Hi' }
// クライアント受信: { type: 'message', user: 'Alice', text: 'Hi' }
```

ペイロードがスカラー（文字列、数値など）の場合、`{ type: 'xxx', data: <value> }` としてラップされます。

### outgoing メッセージスキーマ

`outgoing` はクライアントが送信するメッセージ型を定義します。`type` はキー名から自動的に補完されます。ペイロードのみを提供します：

```typescript
// 送信: { type: 'sendMessage', text: 'Hello' }
// または: { type: 'sendMessage', data: { text: 'Hello' } }
```

outgoing メッセージのペイロードがオブジェクトの場合、両方の形式がサポートされます。スカラーの場合は `{ type: 'xxx', data: <value> }` を使用する必要があります。

### incoming のみの WebSocket

サーバーへのメッセージ送信が不要な場合は、`outgoing` を省略します：

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket build の制限

WebSocket の `build` は `setPathParams` と `setQueryParams` のみをサポートします。HTTP 固有の操作（ヘッダー、ボディ）はサポートされません。

---

## コマンドオブジェクトの構造

定義タイプに関わらず、構築されたコマンドは統一された構造に従います：

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP コマンド
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE コマンド
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket コマンド
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` はトランスポートタイプのタグです。`Client.execute` はこれに基づいて適切な実行装置（HTTP fetch、SSE ストリーム、WebSocket 接続）にディスパッチします。

---

## 入力のオプショナルルール（IsInputOptional）

コマンドビルダーの引数がオプショナルかどうかは、`IsInputOptional` によって自動的に推論されます：

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

ルール：

1. **`input` が定義されていない**：`TInput` は `undefined` で、パラメーターは完全にオプショナルです。
2. **`input` はあるがすべてのフィールドがオプショナル**：`{} extends EndpointInput<...>` が true で、パラメーターは依然としてオプショナルです。
3. **`input` に必須フィールドがある**：パラメーターは必須です。

```typescript
// 入力なし — オプショナル
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// すべてオプショナルフィールドの入力 — オプショナル
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// 必須フィールドあり — 必須
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript エラー: 引数が不足
C({ body: { name: 'defjs' } }) // OK
```

## 次に読む

- [SSE →](/core/sse) — SSE の実行、再接続、イベント処理
- [WebSocket →](/core/web-socket) — WebSocket 接続、ハートビート、状態管理
- [Client →](/core/client) — クライアントの作成と `execute` の使い方
