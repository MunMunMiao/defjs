---
title: 設計上の判断
description: Defjs が契約・コマンド・トランスポート結果・デコード・所有権を明示的に保つ理由です。
---

# 設計上の判断

Defjs はいくつかの意図的なトレードオフを取っています。便利 API は、誰がリクエスト・ストリーム・セッションを所有しているかを隠しがちです。Defjs はその境界を見えるままにして、同じエンドポイント契約を再利用しても、キャッシュやリトライスケジューラやリソースマネージャを黙って抱え込まないようにしています。

## 明示的なクライアント

`createClient(...)` はエンドポイント設定を明示的な値にします。環境やリクエストスコープが違えば、エンドポイント・資格情報・インターセプター・シリアライザ・トランスポートハンドルも違います。`@defjs/core` の `createClient(...)` も、HTTP 専用の利用者向けに同じ考え方です。

代償は、プロセス全体のデフォルトがないことです。その代償はサーバーで効きます — options やクロージャが認証・cookie・ユーザー・テナント・リクエストメタデータを掴むなら、クライアントをリクエスト境界の中で作ります。明示的なクライアントでも、インターセプターが掴んだ状態は隔離されませんクライアントの同一性そのものがセキュリティ境界ではありません。

クライアントはコマンドをディスパッチします。進行中の作業は所有しません。HTTP リクエスト・SSE ストリーム・WebSocket セッションを始めた側が、キャンセルまたは close し、終端の promise を await する必要があります。

## 定義、ビルダー、コマンド

定義は安定した契約です。method、path、入力 Struct、出力マッピング、トランスポートの上限。ビルダーは呼び出し可能なビューです。呼ぶと、1 回の実行用の不透明なコマンドが 1 つできます。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

バックグラウンドジョブと UI の所有者は、同じ `getUser` の形を、違うキャンセル/リトライ方針で実行できます。コマンドを不透明にしておくと、アプリコードが内部のトランスポートタグや symbol に依存しにくくなります。

## トランスポート固有の結果

3 つのトランスポートともエラーファーストのタプルを使います。汎用の単一「レスポンス」だと、ライフサイクルの事実が消えてしまいます。

- HTTP → `[error, data, response]` — デコード済み出力 + `HttpResponse`
- SSE → `[error, stream, open]` — 1 つの論理ストリーム + 起動時のレスポンススナップショット
- WebSocket → `[error, session, connection]` — 論理セッション + 起動時の接続スナップショット

3 番目の値はスナップショットであり、将来の再接続が同じ物理接続を保つという promise ではありません。起動失敗でも、トランスポートが先にレスポンス/スナップショットを出していれば、それが含まれることがあります。起動後のライフサイクル制御は、返されたハンドルまたはセッションに属します。

## 実行時デコード

TypeScript の推論は「期待するもの」を記述しますが、サーバーレスポンスを実行時に検査はできません。Struct のパースが契約のもう半分です。Defjs はリクエスト組み立て前にコマンド入力を検証し、選ばれた表現をデコードし、対応する Struct をパースします。

この順序で、status と body を別の事実として保てます。宣言済み status の厳密な選択は、ボディデコードの**前**に行われます。宣言済み non-2xx → 型付き `error.data`。壊れた宣言済みボディ → `RESPONSE_VALIDATION_FAILED`。未宣言の status → `UNDECLARED_STATUS`（型なしの成功/失敗ではない）。「届いた JSON なんでも」より厳しいですが、安全な判断ができます。

## `build` の限界

入力がすでに path/query/headers/body を持つとき、自動の `struct.request(...)` マッピングがデフォルトです。カスタム `build(request, input)` は、呼び出し側の形とワイヤの形が違うときの、制約付きプロジェクションです。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` はスキーマに束縛されたビューであり、呼び出し側の実行時オブジェクトそのものではありません。プロジェクションは宣言フィールドの選択、リネーム、ソース配列 1 要素から出力 1 要素への写像はできます。値で分岐したり、リテラルを差し込んだり、濃度を変えたりはできません。ビジネスデータの正規化と値依存の検証は、コマンドを作る前に行ってください。

## オブザーバーと方針の置き場所

インターセプターはトランスポート全体の方針向けです。認証、トレーシング、ショートサーキット、レビュー済みリトライ。自分のトランスポートだけ動き、オニオン順で合成されます。実行 options は作業固有の寿命向けです。`signal`、`timeout`、WebSocket ハートビート、オプトイン再接続。

オブザーバーは、起きたことを報告するだけで、第二の所有者にはなりません。SSE の `onInvalidEvent`、WebSocket の状態リスナー、ランタイムエラーリスナーは、境界付きの診断とメトリクス向けです。返されたストリーム/セッションが、反復・close・購読解除・終端待ちを所有したままです。キャッシュ、古い結果の抑制、冪等性、ドメインエラーの写像は、`client.execute(...)` の周りに置き、アプリ自身の方針と状態が見える場所にしてください。

## OpenAPI、ソースマップ、テレメトリ

Defjs は第二の OpenAPI 契約を生成したり同期したりしません。OpenAPI がすでに権威なら、それを保ち、アプリ境界で実行時検証を足します。新しいサービスなら、エンドポイント定義と Struct を直接のワイヤ契約にしてよいです — 第二の単一情報源は不要です。

`withOpenTelemetryServer(...)` はクライアントに **アウトバウンド** の Defjs 計測を足します。OpenTelemetry SDK の初期化はしません。`tracer` は必須、`meter` は任意、3 トランスポートはデフォルト有効、WebSocket の query 伝播はデフォルト無効です。operation 名は静的で低カーディナリティに保ってください。伝播・フック・URL・ヘッダー・ペイロード・cause・保持期間は、機微になり得るものとして見直してください。

ソースマップはデプロイの判断であり、Defjs の振る舞いではありません。`sourcesContent` 付きの公開マップはソースを晒します。隠したマップでもソースとパスは入ります。マップを無効にするとソースレベルでのシンボル化は失われます。非公開マップは、明示的なアクセスと保持ルール付きの、デプロイ可能なデバッグ成果物として扱ってください。

## 関連レシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [ローカル Fetch ハンドルでテストする](../recipes/test-with-handle.md)
