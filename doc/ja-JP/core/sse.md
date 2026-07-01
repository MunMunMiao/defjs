---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs は `defineEventStream` を使って型付き SSE（Server-Sent Events）エンドポイントを定義します。実行後、`[error, stream, openInfo]` のトリプレットが返され、`stream` はサーバーがプッシュしたイベントを 1 つずつ消費するための非同期イテラブルです。

## イベントストリームの定義

SSE エンドポイントを定義する際は、`events` フィールドでイベント名を struct にマッピングします。SSE トランスポートは各イベントの `data:` ペイロードを生テキストとして届け、Defjs は一致する struct を選び、その struct のコンテンツ種別に従ってテキストをデコードします。

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

### デフォルトイベント struct

サーバーが `events` に明示的に宣言されていないイベントタイプを送信する場合、`default` struct を提供します。`default` がない場合、未知のイベントは静かに破棄されます。

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### イベントデータのコンテンツデコード

SSE トランスポートは各 `data:` ペイロードをテキストとして届けます。Defjs はまず `events[eventName] ?? events.default` からイベント用 struct を選び、選ばれた struct に従ってテキストをデコードします。

サーバーがイベントに対して JSON テキストを送信する場合は `struct.json(inner)` を使います。`struct.json(inner)` は生の SSE テキストに対してまず `JSON.parse` を実行し、その結果の値を `inner` でパースします：

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

プリミティブなテキストペイロードの場合：

- `struct.string()` と `struct.text()` は生のイベントテキストを読み取ります。
- `struct.number()` はテキストをトリムし、有限の数値のみを受け入れます。
- `struct.boolean()` はテキストをトリムし、正確な `true` または `false` のみを受け入れます。

素の `struct.object(...)`、`struct.array(...)`、`struct.record(...)` は、JSON のように見えるテキストを自動的にパースしません。JSON イベントデータを扱うには `struct.json(...)` でラップしてください。

### 入力付きイベントストリーム

ストリームにクエリパラメーターやリクエストボディが必要な場合は、`input` struct と `build` 関数を提供します。`build` のシグネチャは `defineRequest` と同じで、params、query、headers をサポートします。

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## 実行結果

`client.execute()` は SSE コマンドに対してトリプレットを返します：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — 接続または検証失敗時に非 null；成功時は `null`。
- **`stream`** — 成功時は `for await...of` で消費できる `EventStreamHandle`；失敗時は `undefined`。
- **`open`** — 初回接続のレスポンス情報（`response` と `url`）を含みます。接続失敗時は `undefined` の可能性があります。

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle と stream.closed

`EventStreamHandle` は `AsyncIterable` を実装しているため、`for await...of` で直接使用できます。さらに以下のプロパティ／メソッドを提供します：

| プロパティ／メソッド       | 説明                                                                |
| -------------------------- | ------------------------------------------------------------------- |
| `open`                     | 初回接続の `EventStreamOpenInfo`（`response` と `url` を含む）      |
| `closed`                   | `Promise<EventStreamCloseInfo>`。ストリームが完全に閉じたときに解決 |
| `close(reason?)`           | 能動的にストリームを閉じる。オプションで理由を渡せる                |
| `[Symbol.asyncIterator]()` | イベントキューを消費する非同期イテレーターを返す                    |

`closed` は以下の場合に解決されます：

- サーバーの正常終了 (`code: 'eof'`)
- `stream.close()` による能動的クローズ (`code: 'aborted'`)
- 接続エラーまたは再接続枯渇 (`code: 'error'`)

```typescript
// 能動的クローズ
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## 無効イベント処理: onInvalidEvent

サーバーが `events`（または `default`）内の struct に一致できないイベントを送信した場合、または struct 検証に失敗した場合、`onInvalidEvent` オブザーバーがトリガーされます。これはクライアントレベルの設定で、`createClient` 時に `sse.onInvalidEvent` として渡されます。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: 検証失敗時の元のエラー
    },
  }),
)
```

`onInvalidEvent` は**オブザーバー**です：

よくある検証失敗は、イベントの `data:` フィールドが JSON テキストであるのに対して `struct.object(...)` を宣言してしまうことです。そのような場合は `struct.json(struct.object(...))` を宣言してください。`struct.json(...)` の下で無効な JSON が届いた場合、それは `validation-failed` として報告され、生テキストとして再試行されることはありません。

- 内部でスローしても、例外は静かに無視され、ストリームは継続します。
- 後続のイベントの消費をブロックしません。

## 再接続とキュー設定

SSE トランスポートはビルトインの自動再接続を持ち、クライアントレベルの `sse.reconnect` と `sse.queue` で設定できます。

### 再接続設定

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // 最大リトライ回数
      delayMs: 1000, // 初回リトライ間隔
      factor: 2, // 指数バックオフ乗数
      maxDelayMs: 30000, // 最大リトライ間隔
      jitter: 1000, // ランダムジッター範囲（ms）
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

再接続の優先順位：

1. `onerror` が `null` を返した場合、再接続を停止。
2. `shouldReconnect` が `false` を返した場合、再接続を停止。
3. `attempts` 制限を超えた場合、再接続を停止。
4. それ以外の場合、`delayMs` + `factor` 指数バックオフ + `jitter` を使って次のリトライ間隔を計算。

> 再接続は自動的に `Last-Event-ID` ヘッダーを引き継ぎ、サーバーがブレークポイントから再開できるようにします。

### キュー設定

イベントは到着後に内部非同期キューに入り、その後イテレーターによって消費されます。キューのサイズとオーバーフロー動作を制限できます：

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | 動作                                                         |
| ------------- | ------------------------------------------------------------ |
| `drop-newest` | 新しく到着したイベントを破棄。キュー内の古いイベントを保持   |
| `drop-oldest` | 最も古いイベントを破棄。新しいイベントのためのスペースを確保 |
| `error`       | キュー満杯でエラーをスローし、ストリームを閉じる             |

## 完全な例

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## 次に読む

- [Client →](/core/client) — `createClient` と `sse` オプション
- [Commands →](/core/commands) — コマンド定義と入力ルール
- [WebSocket →](/core/web-socket) — WebSocket 接続と状態管理
