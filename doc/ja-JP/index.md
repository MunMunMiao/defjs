---
layout: home

hero:
  name: Defjs
  text: HTTP、SSE、WebSocket を型付きコマンドで扱う
  tagline: Struct で通信形式を定義し、クライアントを明示的に作成します。トランスポートごとの戻り値とライフサイクルの違いもそのまま扱えます。
  actions:
    - theme: brand
      text: はじめる
      link: /ja-JP/guide/getting-started
    - theme: alt
      text: GitHub で見る
      link: https://github.com/defjs/defjs

features:
  - title: エンドポイント契約
    details: エンドポイント定義、コマンドビルダー、コマンドを区別します。Struct は呼び出し入力とトランスポートデータを実行時にデコードします。
  - title: トランスポート別の結果
    details: HTTP、SSE、WebSocket はいずれもエラーを先頭に置く 3 要素タプルを返します。3 番目の要素は、それぞれレスポンスラッパー、起動時オープンスナップショット、起動時接続スナップショットです。
  - title: インターセプターチェーン
    details: HTTP、SSE、WebSocket のインターセプターをクライアントへ登録できます。各トランスポートが該当するインターセプターを選び、オニオン順で実行します。
  - title: 明示的なライフサイクル
    details: SSE はネットワーク障害と読み取り失敗を再試行できます。WebSocket の再接続は明示的な設定が必要です。反復処理、キャンセル、終端クローズはアプリケーションが管理します。
  - title: 実行時デコード
    details: TypeScript の推論に使うものと同じ Struct 契約で、入力、レスポンス、ストリームイベント、WebSocket メッセージをデコードします。
  - title: アプリケーション統合
    details: Vue や React でクライアントを共有し、サーバーサービスの送信処理に OpenTelemetry 計装を追加できます。
---

## 型付き API クライアントを作る

アプリケーションが呼び出す HTTP、SSE、WebSocket の契約を定義するところから始めます。Defjs はその定義をコマンドビルダーに変換し、実行時にデータを検証し、トランスポート結果を明示します。

HTTP の基本フローは短くまとまります。API 用のクライアントを作成し、エンドポイントを定義し、コマンドビルダーを呼び出して、そのコマンドを実行します。

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

クライアントをアプリケーションが使うサービスへ向け、Struct を実際のレスポンス契約に合わせてください。認証情報、UI 状態、再試行、キャンセル、リソースのクリーンアップはアプリケーション側で管理します。

## 次に読む

- [はじめに](/ja-JP/guide/getting-started) — パッケージのインストールから最初の型付きリクエストまで
- [Client](/ja-JP/core/client) — オプションの合成と 3 種類の `execute` オーバーロード
- [Commands](/ja-JP/core/commands) — エンドポイント定義、コマンドビルダー、コマンド、スキーマに束縛されたプロジェクション
- [HTTP](/ja-JP/core/http)、[SSE](/ja-JP/core/sse)、[WebSocket](/ja-JP/core/web-socket) — 各トランスポートの動作とライフサイクル管理
- [Vue](/ja-JP/plugins/vue)、[React](/ja-JP/plugins/react)、[OpenTelemetry Server](/ja-JP/plugins/opentelemetry-server) — アプリケーションのフレームワークとテレメトリーへの接続方法
