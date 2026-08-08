---
title: Context
description: HttpContext を使い、HTTP と SSE のインターセプターチェーンにリクエストスコープのメタデータを渡します。
---

# Context

`HttpContext` は、トークンをキーにするメタデータコンテナーです。HTTP または SSE の実行に付随し、インターセプターが受け取る `HttpRequest` から参照できます。コンテキスト自体が URL、ヘッダー、ボディへシリアライズされることはありません。

## トークンとデフォルト値

デフォルト値を返すファクトリーを指定して、型付きトークンを作ります。

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

コンテキストに値が保存されていない場合、`context.get(token)` はトークンファクトリーを呼び出します。デフォルト値はコンテキストへ保存されません。そのため、状態を持つファクトリーは、未設定の値を読むたびに別の値を返す可能性があります。毎回同じ値を返すデフォルトを推奨します。

## Context を作成して渡す

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` はコンテキストを変更し、メソッドチェーン用に同じコンテキストを返します。`makeHttpContextToken(...)` 以外で作った値をトークンとして渡すと、`get(...)` と `set(...)` は `TypeError` を送出します。

インターセプターは同じオブジェクトを読み取ります。

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

固定した操作名と、レビュー済みのメタデータだけを使ってください。機密情報、未加工のヘッダー、ボディ、URL、クエリ文字列はデフォルトでログに含めないでください。

## 参照セマンティクス

実行時、`HttpContext` は参照のまま渡されます。インターセプターがコンテキストを変更すると、後続のインターセプターと、そのオブジェクトを保持している呼び出し元の両方から変更が見えます。

リクエスト、ユーザー、テナント、トレース、Cookie、認可情報を含む場合は、リクエストごとに新しいコンテキストを作ってください。1 つの可変コンテキストを並行処理で再利用すると、メタデータの漏えいや上書きにつながります。

現在、HTTP と SSE の実行オプションは `context` を受け取ります。WebSocket の実行オプションは受け取りません。SSE の論理ハンドルは、各接続試行でリクエストコンテキストを引き継ぎます。それでもアプリケーションは、そのコンテキストをストリームのリクエストスコープが所有するものとして扱ってください。

## コピーとマージ

`makeHttpContext(existing)` はトークンマップを浅くコピーします。

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

マップは別になりますが、保存されているオブジェクト値は再帰的に複製されません。

`makeHttpContext(entries)` にはトークンと値のペアを渡せます。

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` は新しいコンテキストを返します。同じトークンがある場合、`secondary` の値が `primary` の値を置き換えます。

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

コンテキストを 1 つだけ渡した場合もコピーを返します。どちらも渡さなければ空のコンテキストを返します。

## Context API

| Member              | 動作                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `set(token, value)` | 値を保存し、同じコンテキストを返します。                                       |
| `get(token)`        | 保存済みの値を返します。未設定ならトークンのデフォルトファクトリーを呼びます。 |
| `has(token)`        | 値が保存されているか確認します。                                               |
| `del(token)`        | 値を削除し、同じコンテキストを返します。                                       |
| `keys()`            | 保存済みトークンを反復処理します。                                             |
| `length`            | 保存済みトークンの数です。                                                     |

ランタイムで型を判定する場合は、`isHttpContext(...)` と `isHttpContextToken(...)` を使えます。

リクエストマッピングは別の責務です。リクエストセクションの自動マッピングとスキーマに束縛されたプロジェクションは [Commands](/ja-JP/core/commands)、チェーンの動作は [Interceptors](/ja-JP/core/interceptors) を参照してください。
