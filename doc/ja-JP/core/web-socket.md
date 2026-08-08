---
title: WebSocket
description: メッセージエンベロープ、起動とライブセッション、受信ワークキュー、明示設定の再接続、ハートビート、リソースのクローズを説明します。
---

# WebSocket

`defineWebSocket(...)` は、JSON メッセージを使う WebSocket エンドポイントのコマンドビルダーを作ります。

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## メッセージエンベロープ

すべてのメッセージは、空でない文字列の `type` を持つ JSON オブジェクトです。タイプによって `incoming` または `outgoing` の Struct が選ばれます。

オブジェクトペイロードのフィールドは `type` と同じ階層に置けます。

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

スカラーまたは配列のペイロードは `data` に入れます。

```json
{ "type": "count", "data": 3 }
```

`type` と `data` はエンベロープの予約キーです。オブジェクトペイロード自体が `data` フィールドを持つ場合、ランタイムがそのフィールドをエンベロープペイロードと誤認しないよう、ペイロード全体を包んでください。

```typescript
const audit = defineWebSocket({
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

対応する通信形式は `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }` です。

`type` を通常のペイロードフィールドとして宣言しないでください。エンベロープの正規化処理が管理します。

任意の `incoming.default` Struct は、未宣言のメッセージタイプを処理します。指定がなければ未知のタイプは破棄されます。

## 起動時のタプル

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

WebSocket は次の形を返します。

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時の 3 番目の要素は、起動時接続スナップショットです。最初の物理ソケットがオープンした時点で取得した `url`、`protocol`、`extensions` を含むことがあります。

`session.connection` はライブ getter です。再接続では内部の物理ソケットが置き換わり、この値も更新されることがあります。起動時スナップショットが必要なら、タプルの 3 番目の要素を保持してください。

接続 URL はログへ出さないでください。パス識別子、アプリケーションのクエリデータ、テレメトリー伝播フィールドを含む可能性があります。

## ライブセッション

`WebSocketSession` は、複数の物理接続試行にまたがる 1 つの論理セッションです。

| メンバー                   | 動作                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `connection`               | 最新の接続情報を返すライブ getter。                                  |
| `state`                    | 論理セッションの現在状態を返すライブ getter。                        |
| `receive`                  | 検証済み受信メッセージの共有非同期ワークキュー。                     |
| `send(message)`            | 送信メッセージを検証・シリアライズし、送信またはキューへ追加します。 |
| `close(code?, reason?)`    | 終端クローズを要求します。                                           |
| `closed`                   | 観測された終端クローズ情報を返す Promise。                           |
| `onStateChange(listener)`  | 状態オブザーバーを追加し、購読解除関数を返します。                   |
| `onRuntimeError(listener)` | ランタイムエラーオブザーバーを追加し、購読解除関数を返します。       |

クライアントは返却後のセッションを追跡しません。呼び出し側がメッセージの消費、オブザーバー、キャンセル、クローズを所有します。

## メッセージを受信する

テキスト、ArrayBuffer、型付き配列、Blob のメッセージは UTF-8 JSON としてデコードされます。次の入力は通知なしで破棄されます。

- 不正な JSON
- オブジェクトでないエンベロープ
- `type` がない、または空文字列
- `incoming.default` Struct のない未知のタイプ

Struct が選ばれた後のデコード失敗は `onRuntimeError` へ通知され、そのメッセージは破棄されます。

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

受信イテラブルは、上限のない共有ワークキューです。複数のイテレーターはメッセージを奪い合い、独立した購読にはなりません。キューが増えてもトランスポートはサーバーの送信を遅くしません。受信メッセージを必ず継続して消費するか、セッションを速やかにクローズしてください。

## メッセージを送信する

`send(...)` は同期メソッドです。次の場合は同期的に例外を送出することがあります。

- エンドポイントに `outgoing` マップがない
- メッセージに有効な `type` がない
- タイプが未宣言
- ペイロードの構造デコードまたはエンコーディングに失敗した
- 上限付き送信キューが `overflow: 'error'` を使っている
- 即時送信中にネイティブソケットが例外を送出した

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

オープン前または再接続試行の間に送ったメッセージは送信キューに入ります。物理ソケットがオープンするとキューの内容が送信されます。

終端状態の後に `send` を呼ばないでください。現在の実装にはクローズ後の安定した拒否契約がなく、終端クローズ後にキューへ入ったデータは送信されない可能性があります。

## 状態

`session.state` は次のいずれかです。

| State          | 意味                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `idle`         | 実行開始前の初期内部状態。                                                                                                           |
| `connecting`   | 最初の物理接続試行を開始中。                                                                                                         |
| `open`         | 物理ソケットが開いた後、最後に通知された論理状態。再接続の待機中は、物理ソケットが存在しなくても `open` のままになることがあります。 |
| `reconnecting` | 遅延後に次の物理接続試行を開始中。                                                                                                   |
| `closing`      | キャンセルにより、接続中またはオープン中のソケットをクローズ中。                                                                     |
| `closed`       | 正規化されたエラーのない終端クローズ。                                                                                               |
| `aborted`      | 外部キャンセルが `ABORTED` に正規化された終端状態。                                                                                  |
| `error`        | その他の終端失敗。                                                                                                                   |

`reconnecting` は遅延中には通知されません。遅延後、次の試行を開始するときに通知されます。`session.state` は最後に通知されたライフサイクル状態であり、現在ネイティブソケットが存在する証明ではありません。この間に送ったメッセージは送信キューへ入ります。

状態リスナーは直接実行されます。例外を送出しないようにし、所有者の終了時に購読を解除してください。

### 各試行の前処理

`beforeConnect` はクライアントまたは 1 回の実行に設定できます。最初の試行と各再接続試行で、ネイティブコンストラクターより前に実行されます。

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

コマンド入力とリクエストプロジェクションは、すでに構築済みです。このフックは `build` を再実行せず、束縛済みクエリ値も変更しません。実行環境のハンドシェイク処理が使う状態の更新など、アプリケーションが所有する準備処理に使います。例外の送出または Promise の reject は終端トランスポート失敗になり、クローズ結果の再接続述語には渡りません。

## 再接続は明示設定

再接続オブジェクトを指定しなければ再接続しません。クライアントごと、または実行ごとに設定します。

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts` は最初の試行後に行う再試行回数です。空オブジェクトを渡すと、次のデフォルトで 3 回再試行します。

| フィールド        | デフォルト                             |
| ----------------- | -------------------------------------- |
| `attempts`        | `3`                                    |
| `delayMs`         | `1000`                                 |
| `factor`          | `2`                                    |
| `maxDelayMs`      | `30000`                                |
| `jitter`          | `0`                                    |
| `shouldReconnect` | すべてのクローズ結果で `true` を返す。 |

デフォルト述語は、正常・異常のどちらのリモートクローズも再試行します。正常なクローズを終端にする場合は述語を指定してください。`attempt` は最初の再試行が 1 です。

基準遅延は `min(delayMs * factor ** (attempt - 1), maxDelayMs)` です。WebSocket の jitter は乗算です。たとえば `0.2` なら `0.8` 以上 `1.2` 以下のランダムな係数を選びます。ミリ秒を加算する SSE の jitter とは異なります。

`shouldReconnect` は同期かつ例外を送出しない処理にしてください。再接続は、同じ論理セッション内で新しい物理ソケットを開きます。受信/送信キューもその論理セッションに属します。

## ハートビート

ハートビートも明示的な設定が必要です。

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message` はエンドポイントの送信マップに対して有効な値を返す必要があります。`isAck` が認識したメッセージはハートビートタイムアウトを解除し、`receive` には追加されません。

正の `timeoutMs` を超えると、ランタイムはランタイムエラーリスナーに `Error('WebSocket heartbeat timeout')` を通知し、ネイティブクローズコード `4000` と理由 `heartbeat timeout` でクローズを要求します。その後に再接続するには、クローズを許可する再接続ポリシーが別途必要です。

`timeoutMs < intervalMs` にしてください。現在の実装はこの関係を検証しません。タイムアウトが間隔以上だと、後続のハートビートタイマーと重なる可能性があります。

## キュー

`queue` オプションが設定するのは送信メッセージだけです。

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

送信キューはデフォルトで無制限です。上限を設定した場合、デフォルトのオーバーフロー方式は `drop-oldest` です。ほかに `drop-newest` と `error` があります。終端クローズ時には送信キューが空になります。

受信キューには公開された上限・オーバーフローオプションがありません。上限のない共有ワークキューで、バックプレッシャーも提供しません。リソース所有者は継続して消費するか、セッションをクローズする必要があります。

## クローズの所有権

`session.close(code, reason)` は現在のネイティブソケットの `close` メソッドを呼び、手動クローズのマーカーで論理セッションを中断します。クローズを要求するだけで、正常なハンドシェイク、目に見える `closing` 状態、最終的な `closed` 値が要求したコードや理由と完全一致することは保証しません。

`session.closed` はランタイムが観測したクローズ情報で解決されます。

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

ネイティブ実装がクローズイベントを通知しない場合、確定が遅れることがあります。外部キャンセルは、正規化された理由に応じて `aborted` または `error` で終了します。セッションが試行間にある場合は `closing` を経由しないこともあります。

セッションを開いたコンポーネント、ルート、ジョブ、サービスの境界でリスナーの購読を解除し、クローズしてください。プロバイダーのアンマウントだけでは実行されません。

## URL と認証の安全性

HTTP ベース URL は WebSocket スキームへ変換されます。`http:` は `ws:`、`https:` は `wss:` です。パスプレースホルダーはセグメントとしてエンコードされません。クエリ値は設定済みのシリアライザーを使います。

プロトコルの優先順位は、実行オプション、クライアントオプション、エンドポイント定義の順です。明示的な空のプロトコル配列は、優先順位の低い値を抑止します。

ブラウザー WebSocket API は任意のハンドシェイクヘッダーを設定できません。クエリパラメーターを汎用的な認証情報の経路として扱わないでください。URL はブラウザーの開発者ツール、プロキシ、アクセスログ、テレメトリーに記録されることがあります。TLS（`wss:`）と、デプロイ先に合わせてレビューした認証設計を使ってください。たとえば、適切な same-site Cookie フローや短命の接続チケットです。

## 次に読む

- [SSE](/ja-JP/core/sse) — ストリーム再試行とキュー動作の違い
- [Interceptors](/ja-JP/core/interceptors) — セッションのライブ getter を保つラッパー
- [Errors](/ja-JP/core/errors) — 起動時タプル失敗
