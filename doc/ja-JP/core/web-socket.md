---
title: WebSocket
description: 型付き JSON セッションを開始し、エンベロープを送受信し、close して closed を await します。
---

# WebSocket

開始 → 受信 → 送信 → close + `await session.closed`。購読解除と破棄は呼び出し側の所有です。クライアント、プロバイダ、インターセプターはセッションを自動 close しません。

## Basic Setup

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, openedSession, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using session = openedSession
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## JSON エンベロープ

`defineWebSocket(...)` は JSON メッセージのエンドポイントを記述します。必須の `incoming` マップがメッセージ型で Struct を選び、任意の `outgoing` が `session.send(...)` に対して同じことをします。ワイヤ上のメッセージはすべて、空でない文字列 `type` を持つオブジェクトです。

オブジェクトペイロードのフィールドは `type` の隣に置きます。スカラーと配列のペイロードはエンベロープの `data` フィールドを使います。

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

メッセージマップが制御するのはペイロードであり、エンベロープのディスクリミネータではありません。`incoming.default` はそれ以外の未宣言型名を受理します。なければ未知型は落とされます。受信のテキスト、`ArrayBuffer`、typed-array、`Blob` フレームは UTF-8 JSON としてデコードされます。壊れた JSON と Struct 失敗はランタイムエラーオブザーバーへ行き、`receive` には行きません。

オブジェクトペイロードに `data` というフィールドがある場合、エンコード後も `type` の隣に残ります（入れ子エンベロープにはなりません）。例: `{ data: string, source: string }` の `write` はワイヤでは `{ type: 'write', data: string, source: string }` になります。呼び出し側の値は、シリアライズ前に `data` がオブジェクトペイロードを運ぶため、まだ `{ type: 'write', data: { data, source } }` です。エイリアスはペイロードフィールドに効きます。`type` ディスクリミネータはエンベロープに属し、Struct には属しません。

`session.send(...)` は同期で検証とシリアライズをします。open ならすぐ送り、outgoing キューが有効なら `reconnecting` 中はキューし、書き込み不可なら `InvalidStateError` を投げます。outgoing マップなし、未宣言型、ペイロード検証失敗、無効/満杯の outgoing キュー、ネイティブ送信失敗でも投げます。

`receive` は単一消費者です。2 つ目のイテレータは拒否されます。

## 状態スナップショット

| メンバー                   | 意味                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------- |
| `state`                    | `idle`、`connecting`、`open`、`reconnecting`、`closing`、`closed`、`aborted`、または `error` |
| `connection`               | 最新の物理接続: `generation`、URL、交渉プロトコル、利用可能なら拡張                          |
| `bufferedAmount`           | ネイティブの未送信バイト数。物理ソケットがなければ `0`                                       |
| `receive`                  | 検証済み受信メッセージの単一消費者非同期イテラブル                                           |
| `onStateChange(listener)`  | 論理状態遷移を購読。購読解除を返す                                                           |
| `onRuntimeError(listener)` | 起動以外のランタイムエラーを購読。購読解除を返す                                             |
| `closed`                   | 論理終端の close 結果の promise                                                              |

`open` = 物理ソケットが open。`reconnecting` は置換前の準備 + 遅延を含みます。`connection.generation` は `open` に達した物理ソケットごとに増えます。タプルの `startupConnection` は最初の成功スナップショットのまま。`session.connection` は先へ進みます。

起動失敗 → `[error, undefined, connection?]`。オープン前のコンストラクタ失敗では接続がないことがあります。起動中のタイムアウト/close ではスナップショットがまだ付くことがあります。セッションが返ったあとのランタイムエラーは、オブザーバー、`receive`、`closed` を通り — 2 つ目の execute タプルではありません。

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## 再接続

再接続はオプトインです。`reconnect` オブジェクトなし → 物理 close で論理セッションが終わります。設定時のデフォルトは `attempts: 3`、`delayMs: 1000`、`factor: 2`、`maxDelayMs: 30000`、`jitter: 0`。`attempts` は初回試行のあとのリトライ回数。`attempts: 0` は無効。デフォルト述語はあらゆる close 結果を受理します。

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` は次のリトライ試行、close の cause、code、reason、`wasClean` を受け取ります。手動の `session.close(...)` は述語に入りません。準備/方針の throw は、エラーで論理セッションを終えます。

WebSocket のバックオフ jitter は**乗法**です（`jitter: 0.2` → 遅延は `0.8x` から `1.2x`）。SSE の jitter は WebSocket と同じ 0–1 の乗法因子です。delay/factor/jitter/attempt の値はコンストラクタ前に検証され、タイマー遅延は `2_147_483_647` ms を超えられません。

`beforeConnect({ attempt, signal })` は最初のコンストラクタと毎回の再接続の前に走ります。キャンセルが準備と接続の両方を止めるよう、その signal をトークン更新に渡してください。

## ハートビート

execute またはクライアントスコープでオプトインします。間隔ごとに `message()` を outgoing Struct マップ経由で送ります。任意の `isAck(message)` が ack を認識すると、そのメッセージはタイムアウトを消し、`receive` には**届けられません**。

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` と `timeoutMs` は正の有限タイマーで、`≤ 2_147_483_647` である必要があります。ハートビートメッセージは outgoing マップに対して有効である必要があります。シリアライズ、ネイティブ送信、ack 分類、タイムアウト失敗は論理セッションにとって致命的で — 通常の再接続にはなりません。

## キュー

| 設定                   | 必須の値                               | 振る舞い                                                                                              |
| ---------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | 正の安全な整数                         | `receive` 待ちのパース済みメッセージと、変換待ちの生フレームを上限。オーバーフロー → `state: 'error'` |
| `maxOutgoingQueueSize` | 任意の非負の安全な整数。デフォルト `0` | `state === 'reconnecting'` のあいだだけ FIFO。満杯/無効 → `send(...)` が throw                        |

キュー済みの outgoing フレームは、置換ソケットが `open` を公開する前に flush されます。以前のソケットで送信済みのフレームは自動再生されません。再接続キューは、再接続中に送るメッセージ向けであり — アプリ状態の再構築向けではありません。

受信オーバーフローは保留シーケンスを消し、`receive` を失敗させ、セッションを止め、`kind: 'error'` で `session.closed` を解決します。消費者を十分速くするか、測ったサイズ/メモリから上限を上げてください。

## プロトコルと認証

定義の `protocols`、クライアントの `withWebSocketProtocols(...)`、execute の `protocols` がコンストラクタのサブプロトコル一覧を設定します。優先順位: 実行 → クライアント → 定義。最初に定義された一覧が論理セッション用にコピーされ、再接続でも再利用されます。

ブラウザーの WebSocket コンストラクタは任意のハンドシェイクヘッダーを受け付けません。Defjs は `http:` → `ws:`、`https:` → `wss:` に変換し、path プレースホルダを一度エンコードし、設定された query シリアライザを使います。WebSocket の query 組み立ては、複雑な query 値も JSON としてシリアライズします（デフォルト HTTP のスカラー専用 query とは違います）。

`withCredentials(true)` は HTTP/SSE の Fetch 資格情報であり — WebSocket 認証ではありません。レビュー済みの cookie/セッション方針、サブプロトコル、短命の接続チケットを使ってください。一般的な資格情報や長寿命シークレットを query 文字列に載せないでください。

## 閉鎖と所有権

`session.close(code?, reason?)` は終端閉鎖を要求し、ハートビートを止めます。code は `1000` または `3000..4999`。reason は UTF-8 で ≤ 123 バイト。無効な close 引数は状態を変える前に throw します。

`await using` は close を要求し、Defjs が所有する teardown を待ちます。手動 reason や論理終端結果が必要なら、`close()` と `closed` も引き続き使えます。

終端の `kind`: `'closed'`、`'aborted'`、または `'error'`。任意のネイティブ `code` / `reason` / `wasClean` と、aborted/error 用の `cause`。`closed` は論理終端であり、物理 TCP close を証明しません。disposer は teardown を 1 秒に制限します。close event がなければ Defjs cleanup を完了し、`TimeoutError` という名前の `DOMException` を reject できますが、`closed` は論理的な manual close 結果のままです。観測済みのネイティブ close フィールドが owner fallback より優先されます。

## GraphQL 境界

Defjs は型付き JSON エンベロープと論理セッションのライフサイクルを提供します。WebSocket アプリケーションプロトコルは**実装しません**。GraphQL-over-WebSocket の機能 — connection init、operation ID、`next`/`error`/`complete`、破棄、サブスクリプション再生 — はコア契約の外です。

サーバーがそのプロトコルを要するときは `graphql-ws` のようなプロトコルクライアントを使うか、`defineWebSocket(...)` で自分のエンベロープをモデルしてください。メッセージマップだけでは GraphQL 意味論は交渉されません。

## 関連レシピ

- [WebSocket セッションを開く](../recipes/websocket-session.md)
- [SSE ストリームを消費する](../recipes/consume-sse.md)
