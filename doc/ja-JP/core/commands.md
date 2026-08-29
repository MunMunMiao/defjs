---
title: Commands
description: エンドポイントを定義し、不透明なコマンドを組み立て、入力を写像し、トランスポート結果を推論します。
---

# Commands

1 つの定義 → ビルダー → 不透明なコマンド → `client.execute`。HTTP、SSE、WebSocket で同じパイプラインです。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## 定義を選ぶ

| 定義                     | 契約                                                      | 成功時の値                                       |
| ------------------------ | --------------------------------------------------------- | ------------------------------------------------ |
| `defineRequest(...)`     | method、相対 path、任意の入力、任意の status 出力         | デコード済みデータ + `HttpResponse`              |
| `defineEventStream(...)` | path、バッファ/キュー上限、イベント名 → Struct マップ     | `EventStreamHandle` + open スナップショット      |
| `defineWebSocket(...)`   | path、incoming マップ、任意の outgoing マップ、キュー上限 | `WebSocketSession` + connection スナップショット |

`input` なし → ビルダーは引数なし。`input` あり → 入れ子が全部 optional でも Struct 値を渡します。任意の `path` / `query` / `headers` セクションは省略できます。必須フィールドを持つセクションは省略できません。ボディラッパーがあるならボディは必須です。

コマンドは不透明のままにしてください。タグや symbol を掘らないでください。

## 自動リクエストマッピング

論理入力がすでに path / query / headers / body を持つときは `struct.request(...)` を使います。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: { 201: struct.object({ id: struct.number(), name: struct.string() }) },
})
void createUser
```

エイリアスは送信ワイヤのキーだけ書き換えます。パース済みの値とコマンド入力は論理名のままです。

## カスタム `build`

呼び出し側の形とワイヤの形が違うときは `build(request, input)` に手を伸ばします。制約付きプロジェクションです — 認証方針で分岐したり、副作用を発明したりする場所ではありません。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.withQuery({ q: input.q, page: input.page ?? 1 })
  },
  output: { 200: struct.object({ items: struct.array(struct.string()) }) },
})
void search
```

## status 出力の形

`output` は status → Struct のマップ、または `{ status, body }[]` です。厳密な status が勝ちます。配列エントリでは、後の一致が先のグループ一致を上書きします。一致する宣言がなければ、ボディデコードの前に `UNDECLARED_STATUS` です。

## 関連レシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
