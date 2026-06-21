---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` は `defineWebSocket` を介して型付き WebSocket エンドポイントを提供します。各エンドポイントは以下を宣言します：

- `incoming` スキーマ — サーバーがクライアントに送信するメッセージ。
- `outgoing` スキーマ — クライアントがサーバーに送信するメッセージ。
- `input` スキーマ + `build` ハンドラー — リクエストパラメーターとクエリ／パス構築（オプション）。

メッセージは JSON エンコードされ、宣言されたスキーマに対して実行時に検証されます。

## WebSocket エンドポイントの定義

`defineWebSocket` を使って型付きコマンドビルダーを作成します。ビルダーは `client.execute()` で実行されます。

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // オプション: 入力から接続 URL を構築
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // サーバー → クライアントのメッセージ
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // クライアント → サーバーのメッセージ
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### スキーマ形状

**Incoming メッセージ**は `type` でキー付けされます。メッセージが到着すると、その JSON の `type` フィールドがスキーマキーと一致します。ペイロードがプレーンオブジェクトの場合、そのフィールドは `type` とマージされます：

```typescript
// サーバー送信: { "type": "message", "text": "hi", "userId": 1 }
// クライアント受信: { type: 'message', text: 'hi', userId: 1 }
```

ペイロードがスカラーまたは配列の場合、`data` の下にラップされます：

```typescript
// サーバー送信: { "type": "notification", "data": [1, 2, 3] }
// クライアント受信: { type: 'notification', data: [1, 2, 3] }
```

**Outgoing メッセージ**も同じ規約に従います。`send()` メソッドは `outgoing` キーのいずれかに一致する `type` を持つメッセージを受け付けます：

```typescript
socket.send({ type: 'message', text: 'hello' })
```

`incoming` で `default` キーを使うと、宣言されていないメッセージタイプを共有スキーマでキャッチできます。

## 実行とメッセージの消費

`client.execute()` はタプル `[error, socket, connection]` を返します：

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // 起動失敗を処理（検証、トランスポート、中断など）
  return
}

// 受信メッセージを反復
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// または非同期イテレーターを直接使用
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## `WebSocketSession` API

| メンバー                   | 型                                         | 説明                                                                    |
| -------------------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | 基盤ソケットからの `{ url?, protocol?, extensions? }`。                 |
| `state`                    | `WebSocketState`                           | 現在のライフサイクル状態（下記参照）。                                  |
| `receive`                  | `AsyncIterable<TIncoming>`                 | 検証済み受信メッセージの非同期イテレーター。                            |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | ソケットが `{ code?, reason?, wasClean?, cause? }` で閉じたときに解決。 |
| `send(message)`            | `(message: TOutgoing) => void`             | 送信メッセージを送信。未オープン時はキューに入る。                      |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | グレースフルに接続を閉じる。                                            |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | 購読解除関数を返す。                                                    |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | 購読解除関数を返す。                                                    |

```typescript
// 状態監視
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// 実行時エラー（スキーマ失敗、ハートビートタイムアウトなど）
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// グレースフルクローズ
socket.close(1000, 'done')
await socket.closed
```

## 接続ライフサイクル状態マシン

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| 状態           | 意味                                                                   |
| -------------- | ---------------------------------------------------------------------- |
| `idle`         | `execute()` 呼び出し前。                                               |
| `connecting`   | 最初の接続試行を開始中。                                               |
| `open`         | 接続確立。メッセージの送受信が可能。                                   |
| `closing`      | `close()` または `abort` がトリガーされ、クローズイベントを待機中。    |
| `closed`       | クリーンクローズ（エラーなし、または手動クローズ）。                   |
| `reconnecting` | 接続が切断され、リトライ前に待機中。                                   |
| `error`        | 終了失敗（検証エラー、トランスポートエラー、原因付き非中断クローズ）。 |
| `aborted`      | `AbortSignal` または `close()` による明示的な中断。                    |

状態遷移は `onStateChange` を介して発行されます。`receive` 非同期イテレーターは、ソケットが終了状態（`closed`、`error`、`aborted`）に達すると終了します。

## ハートビート

定期的な ping/ack を設定して、接続を維持したり、無効なピアを検出したりします。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // 30 秒ごとに送信
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // 10 秒以内に ack を期待
    isAck: (message) => message.type === 'pong',
  },
})
```

| オプション   | 説明                                                                             |
| ------------ | -------------------------------------------------------------------------------- |
| `intervalMs` | ハートビート送信間隔（必須）。                                                   |
| `message`    | ハートビートメッセージを返すファクトリー。`TOutgoing` に対して型付けされる。     |
| `timeoutMs`  | 設定された場合、ack が時間内に到着しないとコード `4000` でソケットが閉じられる。 |
| `isAck`      | 受信メッセージをハートビート ack として認識する述語。                            |

ハートビートはクライアントレベル（`createClient({ webSocket: { heartbeat: ... } })`）またはリクエストレベル（`execute()` オプション）で設定できます。リクエストレベルの設定が優先されます。

## 再接続

予期しない接続切断時に自動再接続がトリガーされます。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| オプション        | デフォルト   | 説明                                                       |
| ----------------- | ------------ | ---------------------------------------------------------- |
| `attempts`        | `3`          | 最大リトライ回数。`<= 0` で再接続を無効化。                |
| `delayMs`         | `1000`       | 初回リトライ前のベース遅延。                               |
| `factor`          | `2`          | 指数バックオフ乗数。                                       |
| `maxDelayMs`      | `30000`      | 計算された遅延の上限。                                     |
| `jitter`          | `0`          | ランダム化係数（`0`〜`1`）。                               |
| `shouldReconnect` | `() => true` | 特定のクローズがリトライをトリガーすべきかを判定する述語。 |

遅延計算式: `min(delayMs * factor^(attempt - 1), maxDelayMs)`、その後ジッターが適用されます。

再接続はクライアントレベルでも `createClient({ webSocket: { reconnect: ... } })` で設定できます。

## 送信キュー

ソケットが `open` になる前（または一時的な切断中）に送信されたメッセージはキューに入り、接続準備が整うとフラッシュされます。

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| オプション | 説明                                             |
| ---------- | ------------------------------------------------ |
| `maxSize`  | 最大キュー済みメッセージ数。デフォルトは無制限。 |
| `overflow` | `maxSize` を超過した場合の動作。                 |

キューは終了クローズ（`error`、`aborted`、`closed`）時にクリアされます。

## 手動クローズと中断動作

### `socket.close(code?, reason?)`

グレースフルクローズを実行します：

1. ネイティブ `WebSocket.close(code, reason)` を呼び出します。
2. 内部 `AbortController` を `manual-web-socket-close` 理由で中断します。
3. ソケットは `closing` → `closed` に遷移します。
4. `socket.closed` は指定された `code` と `reason` で解決します。

### `AbortSignal`（外部）

`execute()` オプションで外部 `AbortSignal` を渡します：

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// 後から:
controller.abort() // 即座にソケットを閉じ、'aborted' に遷移
```

ソケットがオープンする**前**に中断された場合、`execute()` はトランスポートエラーで解決し、`socket` は `undefined` です。オープン**後**に中断された場合、ソケットは `aborted` に遷移し、`receive` は終了します。

### `timeout`

リクエストレベルのタイムアウトはサポートされていますが、同じリクエストで `abort` と組み合わせることはできません（定義エラーが返されます）：

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// エラー — abort と timeout を混在させることはできない
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## 完全な例

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## 次に読む

- [SSE →](/core/sse) — 型付きスキーマと再接続を備えた Server-Sent Events。
- [Client →](/core/client) — クライアントの作成と WebSocket 設定。
- [Commands →](/core/commands) — `defineWebSocket` の入力と build ルール。
