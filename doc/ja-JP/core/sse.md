---
title: Server-Sent Events
description: 型付き SSE ストリームを消費し、閉じ、終端の closed promise を await します。
---

# Server-Sent Events

ストリームを開き、一度だけ反復し、`close` して `await stream.closed`。そのライフサイクルは呼び出し側の所有です — クライアントやプラグインは代わりに dispose しません。

## Basic Setup

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, openedStream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using stream = openedStream
  for await (const event of stream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## ストリームを定義する

`defineEventStream(...)` には `events`、正の安全な整数の `maxBufferSize`、正の安全な整数の `maxQueueSize`、相対 `path` が要ります。method のデフォルトは `GET` です。

リクエスト入力には `path`、`query`、`headers` を持てます — `body` は不可。カスタム `build` は path/query/header の setter だけを受け取ります。`Accept` をすでに立てていなければ、Defjs は `Accept: text/event-stream` を送ります。

1 つの論理ストリームは、複数の物理 Fetch 試行にまたがれます。SSE は再接続 options がなくても、一時的なネットワークとストリーム読み取り失敗をデフォルトでリトライします。`attempts` 上限がなければ、そのリトライは無制限です。ハンドルと非同期イテレータはそれでも 1 つです。

## 開いて調べる

`client.execute(...)` は、status、content-type、ボディの検査が通ったあとでのみ解決します。

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

レスポンスは成功で、メディアタイプの essence が `text/event-stream` で、ボディがある必要があります。起動時の non-2xx → `HTTP_STATUS`。悪い content type や欠落ボディ → `RESPONSE_VALIDATION_FAILED`。レスポンス到着後に検証が失敗しても、レスポンススナップショットがタプルの 3 番目に残ることがあります。

`startupOpen` は初期スナップショットです。`stream.open` はライブで、後の物理 open で変わります。最初のレスポンスが重要なときはタプル側の値を残してください。

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## イベントをデコードする

ワイヤのイベント名 → `events[eventName]`。なければ `events.default`。一致する Struct がなければイベントは届けられません。SSE の `event` フィールド欠落 → 論理名 `message`。

SSE の `data` はまずテキストです。選ばれた Struct が変換を決めます。

| Struct                                                                 | 変換                                                              |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `struct.string()`、`struct.text()`、`struct.any()`、`struct.unknown()` | テキストのまま                                                    |
| `struct.number()`                                                      | trim したテキストが有限数であること。空は無効                     |
| `struct.boolean()`                                                     | trim したテキストがちょうど `true` または `false`                 |
| `struct.json(inner)`                                                   | JSON をパースしてから `inner` でデコード                          |
| オブジェクト、配列、ユニオン、その他の通常 Struct                      | テキストを直接デコード。JSON っぽいテキストは**自動パースしない** |

発行される値: `event`、デコード済み `data`、任意の空でない `id`。`default` があると、未知のイベント名は推論されたユニオンで `string` になります。

## 無効なイベントを観測する

無効/未宣言のイベントはキューに入らず落とされます。`withSSEOnInvalidEvent(...)` は生の ID、名前、テキストデータに加え、`missing-struct` または `validation-failed`、任意の cause を観測できます。

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

オブザーバーは変換境界で動きます。アクティブな試行の signal が abort されていない限り、その失敗は隔離されます。短く保ち、生のイベントデータを信頼しないでください。

## 再接続

再接続設定はデフォルトのリトライ経路をカスタムします — リトライを有効にするために必須ではありません。通常の EOF はリトライしません。ネットワークとストリーム読み取り失敗はリトライできます。status/content-type 検証、パーサ上限、メッセージ変換失敗、キューオーバーフロー、通常 EOF は論理ストリームにとって終端です。

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` は初回試行のあとのリトライ回数です。`attempts: 0` はリトライを無効にします。試行上限なし → 組み込みリトライは無制限。`delayMs` は初期間隔。`factor` で伸ばし、`maxDelayMs` がベースを上限します。SSE の `jitter` は WebSocket と同じ **0–1 の乗法因子**です。ストリームの `retry:` フィールドは現在の間隔を更新します。方針コールバックが false / throw / reject を返すと、論理ストリームは終わります。

最後にパースしたイベント ID は、後の試行で `Last-Event-ID` になります。無制限再接続の前に、サーバーの再生意味論を把握してください。

## バッファとキューの上限

どちらも正の安全な整数である必要があります。オーバーフローは致命的です — 古いイベントの黙った破棄はありません。

| 上限            | 守るもの                                         | 終端コード              |
| --------------- | ------------------------------------------------ | ----------------------- |
| `maxBufferSize` | パース中の未完了/過大な SSE 行/イベント          | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | 1 人の消費者の読み取りより速く生産されるイベント | `QUEUE_OVERFLOW`        |

致命的なストリームはバッファ済みイベントも消し、アクティブなボディをキャンセルし、イテレータを reject し、`code: 'error'` で `stream.closed` を解決します。

## 閉じて await する

`EventStreamHandle`: ライブなオープニングスナップショット 1 つ、終端 promise 1 つ、`close` 1 つ、非同期イテレータ 1 つ。

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

type StreamApi<T> = {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
  [Symbol.asyncIterator](): AsyncIterator<T>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

終端コード: `eof`、`aborted`、または `error`。`error` 結果は `EventStreamErrorCode` も持ちます。`INVALID_RESPONSE`、`MESSAGE_PROCESSING_FAILED`、`PARSER_LIMIT_EXCEEDED`、`QUEUE_OVERFLOW`、`TIMEOUT`、または `TRANSPORT_ERROR`。

`close(reason)` はアクティブな試行を abort し、キューを閉じ、`aborted` として確定します。ループの `break` / `return` / throw はイテレータ return を呼び、`iterator-return` で閉じます。コマンドを実行したコードが閉鎖を所有します。

`await using` は同じ所有ライフサイクルを呼びます。Defjs の読み取り/再接続処理の終了と reader lock の解放は保証しますが、provider 側で止まった `ReadableStream.cancel()` Promise の完了は保証しません。`close()` と `closed` も残っています。構造的な独自 `EventStreamHandle` 実装には同じ disposer が必要です。Defjs の handle を受け取るだけのコードには追加 runtime 呼び出しはありません。

リポジトリで検証済みかつサポートされる最低 lib 契約は、固定 TypeScript 7 と `ES2022`、`ESNext.Disposable`、`DOM`、`DOM.Iterable` です。この組み合わせが 1 つの baseline であり、各 declaration が 4 項目を個別にすべて強制するという意味ではありません。未検証の旧 compiler も保証しません。通常の HTTP Client は `AsyncDisposable` ではなく、timeout または `AbortSignal` で request を管理します。

資格情報、イベントデータ、イベント ID、cause、ストリーム URL は日常ログに出さないでください。`withCredentials(true)` は SSE の Fetch cookie に効きますが、WebSocket 認証は設定しません。

## 関連レシピ

- [SSE ストリームを消費する](../recipes/consume-sse.md)
- [HTTP 呼び出しをキャンセルする](../recipes/cancel-http.md)
