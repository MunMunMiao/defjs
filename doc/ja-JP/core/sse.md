---
title: SSE
description: 上限付き Server-Sent Events の定義とデコード、再接続、所有するストリームのクローズを説明します。
---

# SSE

`defineEventStream(...)` は SSE コマンドビルダーを作ります。エンドポイントには、パスとイベント名ごとに使う Struct を宣言します。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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

HTTP、SSE、WebSocket 実行の `timeout` は `1..2_147_483_647` の範囲にある正の安全な整数でなければならず、`0`、負数、小数、`NaN`、`Infinity`、上限を超える値を指定すると、request、stream、socket のリソースを作成する前に `REQUEST_VALIDATION_FAILED` になります。

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
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

オブザーバーは次を受け取ります。

- `reason: 'missing-struct' | 'validation-failed'`
- 生のイベントの `id`、イベント名、データテキスト
- 検証失敗の `cause`
- 現在の試行の `signal`

イベントは破棄されますが、後続の有効なイベントは配信できます。オブザーバーの例外は隔離され、abort は `signal` を通じて待機中のオブザーバーを中断します。短時間で終わるようにし、生の `id`、`data`、`cause` は記録前にマスキングしてください。

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

トランスポートは後続試行で最新イベント ID を `Last-Event-ID` として送ります。`shouldReconnect` が例外を送出または reject すると再試行は止まり、待機中の起動またはストリームはそのポリシーエラーで確定します。Abort は現在の試行の signal を通じて待機中の述語を中断します。

HTTP またはオープン時の検証失敗、メッセージ処理の致命的エラー、通常の EOF は、再試行可能なネットワーク・読み取り失敗とは異なります。すべての終端経路が再接続するとは考えないでください。

## エンドポイント所有の上限

ストリームの非同期イテレーターを消費できるのは 1 つだけです。2 つ目のイテレーター作成は例外になり、ループを抜ける場合も `stream.close(...)` を明示的に呼ぶ必要があります。

各定義には正の安全な整数 `maxBufferSize` と `maxQueueSize` が必要です。前者は SSE の各行と現在のイベントデータを、後者は消費待ちの解析済みイベントを制限します。キューの上限超過は致命的で、イベントを黙って破棄しません。

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

通常の EOF では残りのイベントを取り出せます。致命的な parser、transform、overflow エラーではバッファを消去し、active body をキャンセルし、iteration を reject して `stream.closed` を `code: 'error'` で確定します。

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
