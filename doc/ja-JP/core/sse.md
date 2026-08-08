---
title: SSE
description: Server-Sent Events の定義とデコード、起動、共有ワークキュー、再接続、所有するストリームのクローズを説明します。
---

# SSE

`defineEventStream(...)` は SSE コマンドビルダーを作ります。エンドポイントには、パスとイベント名ごとに使う Struct を宣言します。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  path: '/notifications',
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

メソッドのデフォルトは `GET` です。別のメソッドも指定できますが、高レベルの SSE build コンテキストはリクエストボディに対応しません。

## イベントのデコード

SSE パーサーはまず `events[eventName]`、次に存在すれば `events.default` を選びます。どちらにも一致しないイベントは破棄し、任意の無効イベントオブザーバーへ `missing-struct` を通知します。

SSE の `data:` はテキストとして届きます。

- `struct.string()`、`struct.text()`、`struct.any()`、`struct.unknown()` はテキストを受け取ります。
- `struct.number()` はテキスト前後の空白を取り除き、有限数を受け付けます。
- `struct.boolean()` はテキスト前後の空白を取り除き、`true` または `false` だけを受け付けます。
- `struct.json(inner)` は JSON テキストをパースしてから、`inner` で構造デコードします。

単独の `struct.object(...)` は、JSON に見えるイベントテキストをパースしません。`struct.json(...)` で包んでください。

`default` Struct は、宣言されていないイベント名を処理します。

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

`default` Struct がない場合、`EventStreamData<TEvents>` は宣言されたイベント名からなる判別可能なユニオンです。`event.event` で分岐すると、`event.data` は対応する Struct の出力型に絞り込まれます。`default` がある場合、その分岐では通信上の実際のイベント名が `event: string` として保持されます。そのため、既知イベントと `default` を組み合わせたストリームには、この広いフォールバック分岐が残ります。

## 入力とリクエストのマッピング

パス、クエリ、ヘッダーセクションには `struct.request(...)` を使います。

```typescript
const roomEvents = defineEventStream({
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

カスタム SSE `build` はパスパラメーター、クエリパラメーター、ヘッダーを設定できます。受け取るのはスキーマに束縛されたプロジェクションです。ボディと認証情報は設定できません。認証情報はクライアント側の `withCredentials(...)` で設定します。

## 起動時のタプル

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE は次の形を返します。

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

成功時の 3 番目の要素は、検証済みの起動時オープンスナップショットです。そのレスポンスは HTTP ステータスと `text/event-stream` Content-Type の検証を通過しています。

`stream.open` はライブ getter です。後続の再接続レスポンスがステータスまたは Content-Type の検証に失敗した場合も、その最新レスポンスを保持します。最初のスナップショットが必要なら、`startupOpen` を別に保存してください。

`startupOpen.url`、`stream.open.url`、レスポンス URL はデフォルトでログへ出さないでください。機密性のあるパスやクエリデータを含む可能性があります。

## イベントを消費する

所有者は同じライフサイクル内で反復処理を開始し、クローズも手配します。

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

`execute` の成功は、起動が完了したことを意味します。起動後のエラーは元のタプルの `error` を変更せず、イテレーターの reject と `stream.closed` に現れます。

## 無効なイベント

`onInvalidEvent` は `withSSEOnInvalidEvent(...)` または `withSSEOptions(...)` で設定します。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

オブザーバーは次を受け取ります。

- `reason: 'missing-struct' | 'validation-failed'`
- 生のイベントの `id`、イベント名、データテキスト、任意の再試行値
- 検証失敗の `cause`

イベントは破棄されます。後続の有効なイベントは引き続き配信できます。オブザーバーが送出した例外や reject された Promise は捕捉されますが、非同期オブザーバーは後続メッセージの処理前に完了を待たれます。短時間で終わるようにしてください。生の `id`、`data`、`cause` は、記録前に内容を確認してマスキングします。

## 再接続

SSE はネットワーク障害とストリーム読み取り失敗を組み込みで再試行します。通常の EOF では `code: 'eof'` でストリームを閉じ、再接続しません。

デフォルトでは 1 秒後から再試行し、回数に上限はありません。`attempts` で上限を設定します。

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` は最初の試行後に行う再試行回数です。`attempts: 0` なら再試行しません。`shouldReconnect` に渡る `attempt` は最初の再試行が 1 で、論理ストリーム全体を通して累積します。物理接続に成功してもリセットされません。

遅延は現在の再試行間隔から始まります。サーバーは SSE の `retry:` フィールドで間隔を更新できます。`factor` は指数的な増加に使われ、`maxDelayMs` がその基準値を制限します。その後、`jitter` が 0 以上、設定値未満のランダムなミリ秒を加えます。jitter は上限適用後に加算されるため、最終遅延は `maxDelayMs` を `jitter` 未満だけ超えることがあります。

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

トランスポートは後続試行で最新イベント ID を `Last-Event-ID` として送ります。`shouldReconnect` は例外を送出しないようにしてください。述語が例外を送出したり reject されたりした場合、現在は待機中のイテレーターと `stream.closed` のすべてが確実に確定するとは限りません。

HTTP またはオープン時の検証失敗、メッセージ処理の致命的エラー、通常の EOF は、再試行可能なネットワーク・読み取り失敗とは異なります。すべての終端経路が再接続するとは考えないでください。

## 共有ワークキュー

非同期イテラブルは、論理ストリームに 1 つだけある共有ワークキューです。購読、ブロードキャスト、バックプレッシャーの仕組みではありません。

デフォルトではキューに上限がありません。`withSSEQueue(...)` または `withSSEOptions({ queue })` で上限を設定します。

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | 上限到達時の動作                                                     |
| ------------- | -------------------------------------------------------------------- |
| `drop-newest` | 到着したイベントを破棄します。                                       |
| `drop-oldest` | バッファ内の最古イベントを削除してから、新しいイベントを追加します。 |
| `error`       | キューオーバーフローエラーを送出して処理を終了します。               |

複数のイテレーターは値を奪い合い、それぞれにコピーは届きません。イテレーターにはライフサイクルに対応した `return()` 実装がないため、1 つの `for await` ループを `break` してもトランスポートは閉じません。`stream.close(...)` を明示的に呼んでください。

クローズするとキューへ新しい値を追加できなくなりますが、バッファ済みの値は破棄されません。コンシューマーは残りの値を取り出した後、次の反復で `done: true` を受け取ります。

### パーサーバッファの上限

イベントキューとパーサーバッファは別です。不完全な SSE 行を保持するバイト数には、`withSSEOptions(...)` で正の `maxBufferSize` を指定します。

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

起動後に上限を超えるとイテレーターが reject され、ストリームは `code: 'error'` で閉じます。省略した場合、このパーサーバッファに上限はありません。

## 終端クローズ

`stream.closed` は次の値で解決されます。

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` はレスポンスボディが正常に終了したことを表します。
- `aborted` には明示的な `stream.close(...)` とキャンセルパスが含まれます。
- `error` は再試行の停止または終端ストリームエラーを表します。

`stream.close(reason)` は冪等です。実行中のトランスポート処理を中断し、キューへの新規追加を閉じ、`stream.closed` を確定します。`break` はこれらを行いません。

ストリームを開いたアプリケーション境界がクローズを所有します。クライアントやフレームワークのプロバイダーが自動でクローズすることはありません。

## 次に読む

- [WebSocket](/ja-JP/core/web-socket) — 双方向セッションと明示設定の再接続
- [Interceptors](/ja-JP/core/interceptors) — SSE ヘッダーの変更とライフサイクルの観測
- [Errors](/ja-JP/core/errors) — 起動時レスポンスの有無
