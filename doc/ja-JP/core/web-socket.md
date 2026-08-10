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
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
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
  maxIncomingQueueSize: 100,
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

HTTP、SSE、WebSocket 実行の `timeout` は `1..2_147_483_647` の範囲にある正の安全な整数でなければならず、`0`、負数、小数、`NaN`、`Infinity`、上限を超える値を指定すると、request、stream、socket のリソースを作成する前に `REQUEST_VALIDATION_FAILED` になります。

WebSocket は次の形を返します。

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

成功時の 3 番目の要素は `generation: 1` の起動時接続スナップショットです。最初の物理ソケットの `url`、`protocol`、`extensions` を含むことがあります。

`session.connection` はライブ getter です。物理ソケットが正常に開くたびに `generation` が増えます。起動時スナップショットが必要なら、タプルの 3 番目の要素を保持してください。

接続 URL はログへ出さないでください。パス識別子、アプリケーションのクエリデータ、テレメトリー伝播フィールドを含む可能性があります。

## ライブセッション

`WebSocketSession` は、複数の物理接続試行にまたがる 1 つの論理セッションです。

| メンバー                   | 動作                                                                 |
| -------------------------- | -------------------------------------------------------------------- |
| `connection`               | 最新の接続情報を返すライブ getter。                                  |
| `bufferedAmount`           | ネイティブソケットの未送信バイト数。ソケットがなければ `0`。         |
| `state`                    | 論理セッションの現在状態を返すライブ getter。                        |
| `receive`                  | 検証済み受信メッセージの共有非同期ワークキュー。                     |
| `send(message)`            | 書き込み可否を確認後、検証・シリアライズし、送信またはキューへ追加。 |
| `close(code?, reason?)`    | 終端クローズを要求します。                                           |
| `closed`                   | 観測された終端クローズ情報を返す Promise。                           |
| `onStateChange(listener)`  | 状態オブザーバーを追加し、購読解除関数を返します。                   |
| `onRuntimeError(listener)` | ランタイムエラーオブザーバーを追加し、購読解除関数を返します。       |

クライアントは返却後のセッションを追跡しません。呼び出し側がメッセージの消費、オブザーバー、キャンセル、クローズを所有します。

## メッセージを受信する

テキスト、ArrayBuffer、型付き配列、Blob は到着順に UTF-8 JSON としてデコードされます。次の入力は通知なしで破棄されます。

- オブジェクトでないエンベロープ
- `type` がない、または空文字列
- `incoming.default` Struct のない未知のタイプ

不正な JSON と選択済み Struct の検証失敗は `onRuntimeError` へ通知されます。フレームは破棄され、セッションは継続します。

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

`receive` が許可するイテレーターは 1 つだけです。`maxIncomingQueueSize` は必須の正の要素上限です。オーバーフローはバッファを破棄し、イテレーターを失敗させ、セッションを `error` で終了します。

## メッセージを送信する

`send(...)` は同期メソッドです。次の場合は同期的に例外を送出することがあります。

- エンドポイントに `outgoing` マップがない
- メッセージに有効な `type` がない
- タイプが未宣言
- ペイロードの構造デコードまたはエンコーディングに失敗した
- 再接続中にエンドポイント所有の送信キューが無効または満杯である
- 即時送信中にネイティブソケットが例外を送出した

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

ペイロードの検証・シリアライズより先に、論理的に送信可能かを確認します。論理状態と現在の物理ソケットがともに `open` の場合だけ直接送信します。`reconnecting` かつエンドポイントの `maxOutgoingQueueSize` が正の場合だけキューへ入れます。保持した FIFO は、置換ソケットが `open` を通知する前にフラッシュします。

手動クローズ中、終端状態、リモートクローズ後に再接続述語の結果が未確定な間は、`send` が `InvalidStateError` を送出します。トランスポートは、以前の物理ソケットへ送信済みのフレームを再送しません。

## 状態

`session.state` は次のいずれかです。

| State          | 意味                                                |
| -------------- | --------------------------------------------------- |
| `idle`         | 実行開始前の初期内部状態。                          |
| `connecting`   | 最初の物理接続試行を開始中。                        |
| `open`         | 現在の物理ソケットが開いている。                    |
| `reconnecting` | 次の物理接続試行を準備中または遅延中。              |
| `closing`      | 所有者が手動クローズを要求した。                    |
| `closed`       | 正規化されたエラーのない終端クローズ。              |
| `aborted`      | 外部キャンセルが `ABORTED` に正規化された終端状態。 |
| `error`        | その他の終端失敗。                                  |

`session.state` は論理ライフサイクルであり、現在ネイティブソケットが存在する証明ではありません。`reconnecting` 中の `send` は、エンドポイント所有の送信容量を使います。

オブザーバーの失敗は分離されます。状態リスナーの失敗はランタイムエラーリスナーへ通知され、そのリスナーの失敗は利用可能な `globalThis.reportError` へ転送されます。終端時にオブザーバーは解放されますが、所有者が先に終了する場合は購読を解除してください。

### 各試行の前処理

`beforeConnect` はクライアントまたは 1 回の実行に設定できます。最初の試行と各再接続試行で、ネイティブコンストラクターより前に実行されます。

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

フックは `{ attempt, signal }` を受け取ります。最初の `attempt` は `0` で、再接続ごとに増えます。所有する非同期処理へ `signal` を渡してください。中断とタイムアウトはフックと競合し、遅い reject を消費して、遅い結果からのソケット生成を防ぎます。例外または reject は終端トランスポート失敗です。

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

`shouldReconnect` は同期処理です。例外はセッションを `error` で終了し、明示的な `false` は `closed` で終了します。再接続は同じ論理セッション内に新しい物理ソケットを作るだけで、以前の送信を再生しません。`session.connection.generation` が増えたとき、まだ有効で安全に再生できるサブスクリプションだけを復元し、mutation は再生しないでください。

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

ハートビートのシリアライズ、送信、ack 述語、タイムアウトの失敗はすべて致命的です。ランタイムエラーリスナーへ通知し、`receive` を失敗させ、再接続ポリシーを参照せずセッションを `error` で終了します。

`intervalMs` と、指定する `timeoutMs` は、それぞれ正の有限値で `2_147_483_647` 以下でなければなりません。ack の期限が有効な間、後続の interval は別の ping を送らず期限もリセットしません。ack またはセッション停止で期限を解除します。

## キュー

キュー上限はエンドポイント定義に属します。`maxIncomingQueueSize` は必須の正の安全な整数で、オーバーフローは致命的エラーとなり、バッファ済みの値を破棄します。`maxOutgoingQueueSize` は省略可能な非負の安全な整数で、デフォルトは `0` です。正の値では試行間のフレームを FIFO で保持し、古いフレームを削除せずにオーバーフローを拒否します。

どちらもバイト数ではなく要素数を数えます。`session.bufferedAmount` はネイティブソケットの未送信バイト数を別に公開します。`receive` が許可するイテレーターは 1 つだけです。

## クローズの所有権

`session.close(code, reason)` は、コードが `1000` または `3000..4999`、理由が UTF-8 で最大 123 バイトであることを先に検証します。有効な入力は `closing` へ移り、ネイティブクローズを要求して実際の `CloseEvent` を待ちます。観測したコードと理由が要求値より優先されます。

`session.closed` はランタイムが観測したクローズ情報で解決されます。

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

手動クローズ、原因のないリモートクローズ、明示的に拒否した再接続は `closed` になります。外部中断は `aborted`、タイムアウトとランタイム失敗は `error` です。ネイティブクローズが例外を送出した場合は引数なしで 1 回だけ再試行し、両方失敗すれば 3 回目を呼ばず `error` で確定します。

セッションを開いたコンポーネント、ルート、ジョブ、サービスの境界でリスナーの購読を解除し、クローズしてください。プロバイダーのアンマウントだけでは実行されません。

## URL と認証の安全性

HTTP ベース URL は WebSocket スキームへ変換されます。`http:` は `ws:`、`https:` は `wss:` です。パスプレースホルダーには生の値を渡してください。Core は各セグメントを正確に 1 回エンコードし、`%` を `%25` にし、空文字、`.`、`..` を拒否します。クエリ値は設定済みのシリアライザーを使います。

プロトコルの優先順位は、実行オプション、クライアントオプション、エンドポイント定義の順です。明示的な空のプロトコル配列は、優先順位の低い値を抑止します。

ブラウザー WebSocket API は任意のハンドシェイクヘッダーを設定できません。クエリパラメーターを汎用的な認証情報の経路として扱わないでください。URL はブラウザーの開発者ツール、プロキシ、アクセスログ、テレメトリーに記録されることがあります。TLS（`wss:`）と、デプロイ先に合わせてレビューした認証設計を使ってください。たとえば、適切な same-site Cookie フローや短命の接続チケットです。

## 次に読む

- [SSE](/ja-JP/core/sse) — ストリーム再試行とキュー動作の違い
- [Interceptors](/ja-JP/core/interceptors) — セッションのライブ getter を保つラッパー
- [Errors](/ja-JP/core/errors) — 起動時タプル失敗
