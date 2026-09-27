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
  output: struct.object({ id: struct.number(), name: struct.string() }),
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
    request.setQueryParams({ q: input.q, page: input.page })
  },
  output: struct.object({ items: struct.array(struct.string()) }),
})
void search
```

## `output` と `error` の形

`output` は 2xx ボディ用の単一の Struct、`error` はそれ以外すべて用の単一の Struct です。`ok` だけが分岐点で、デコードするのは常に片側だけです。片側を省くと、そのボディは読まれません。fault が status を運び、`data` は `undefined` のままです。

## 関連レシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
