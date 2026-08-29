---
title: Errors
description: kind と code で、404・タイムアウト・未宣言 status・トランスポート失敗を分岐します。
---

# Errors

宣言済み 404、タイムアウト、未宣言 status は、throw を catch するのではなく、エラーファーストのタプルを読んで扱います。`RequestError` は引き続き `kind` / `code` のユニオンで、各値はネイティブ `Error` です（`instanceof Error` は true）。まず `kind`、次に `code` です。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## 安定したコード

| `kind`       | Codes                                                                                                | 意味                                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | non-2xx が HTTP 境界に到達。`status`、`response`、デコード済みの status 固有 `data` があれば保持。                     |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | キャンセル、タイムアウト、または Fetch/トランスポート失敗が通常結果を妨げた。                                          |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | 入力、リクエスト組み立て、レスポンス表現、Struct デコード、status 契約、またはインターセプターの throw/reject の失敗。 |

`cause` は transport と definition エラーで任意です。`response` は HTTP status エラーには常にあり、定義エラーではレスポンスがすでにあったときに付くことがあります。

## トランスポート別のタプル形

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

起動失敗 → 2 番目は `undefined`。3 番目はそのトランスポートが先にレスポンス/スナップショットを出したときだけ。SSE ハンドルや WebSocket セッションが返ったあとの失敗は、そのハンドルのライフサイクル上にあり、確定した起動タプルは書き換えません。

## HTTP status と data

厳密 status が先です。`output` があると、Defjs はボディをデコードする前に一致する Struct を選ぶので、`error.status` と `error.data` の対応が保たれます。

| 状況                               | タプルの結果                        | ボディの振る舞い                                                |
| ---------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| 一致する宣言済み status の 2xx     | 成功                                | 選ばれた Struct → `data`                                        |
| 一致する宣言済み status の non-2xx | `HTTP_STATUS`                       | 選ばれた Struct → 型付き `error.data`                           |
| 一致する宣言のない任意の status    | `UNDECLARED_STATUS`                 | status がボディデコードの**前**に勝つ                           |
| 一致する status でボディ表現が失敗 | `RESPONSE_VALIDATION_FAILED`        | 部分的な型付き値なし                                            |
| `output` 省略                      | 2xx は成功、non-2xx → `HTTP_STATUS` | ボディはデコードされない。`data` は `undefined`                 |
| レスポンス status `0`              | トランスポートエラー                | `response.error` → `NETWORK_ERROR`、`ABORTED`、または `TIMEOUT` |

`HttpResponse.ok` は `200 <= status < 300` だけを意味します。通常の non-2xx は `HttpResponse.error` を立てません — そのプロパティは Fetch 境界のトランスポート失敗またはボディ表現失敗向けです。

## 起動 vs オープン後

SSE はハンドルを解決する前に status、`text/event-stream`、ボディを検証します。失敗した status → `HTTP_STATUS`。悪い content type や欠落ボディ → `RESPONSE_VALIDATION_FAILED`。オープニングスナップショットは、タプルの 3 番目に載ることがあります。

WebSocket の起動はハンドシェイク + 最初の物理 open をカバーします。コンストラクタ失敗、オープン前 close、タイムアウト、キャンセル → 起動タプル。ソケットが `open` に達しなくても、接続スナップショットがあることがあります。

| トランスポート | 起動後                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE            | 致命エラーでイテレータが reject。`stream.closed` は `code: 'error'` と `EventStreamErrorCode` で解決                                                         |
| WebSocket      | メッセージ/キュー/ハートビート/ランタイム失敗は `onRuntimeError`。終端エラーで `receive` が失敗。`session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP           | execute の promise は一度だけ確定。インターセプター/コールバックのコードは、タプル正規化の外でまだ throw し得る                                              |

`ABORTED` / `TIMEOUT` は呼び出し側から見た起動結果を表します。返されたストリーム/セッションは、それでも close して終端 promise を await してください。

## ログと Struct cause

各 `RequestError` はネイティブ `Error` です。`String(error)` は安定した `<name>: <message>` を返し、構造化ログ向けの `kind`、`code`、`status`、`response`、`data` は enumerable のままです。`cause` は cause chain のネイティブで non-enumerable なリンクです。helper を外側のエラーへコピーしないでください。

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.format(), error.cause.flatten(), error.cause.prettify())
  }
}
```

`format()`、`flatten()`、`prettify()` は、必ず `error.cause instanceof StructError` の後で呼びます。統一 tuple は変わりません。ログ改善によって宣言済み failure が throw に変わることもありません。

## Reference

| 分岐                            | 制御フローの検査                             | 使える安定フィールド                            | 通常は欠ける / 機微                 |
| ------------------------------- | -------------------------------------------- | ----------------------------------------------- | ----------------------------------- |
| HTTP status 方針                | `error.kind === 'http'`                      | `error.status`、レビュー済み `error.data`       | ボディ、ヘッダー、URL、`cause`      |
| 呼び出し側キャンセル            | `kind === 'transport' && code === 'ABORTED'` | `kind`、`code`                                  | abort 理由とスタック                |
| タイムアウト                    | `kind === 'transport' && code === 'TIMEOUT'` | `kind`、`code`                                  | リクエスト URL と背後の cause       |
| 契約失敗                        | `error.kind === 'definition'`                | `kind`、`code`、レビュー済み `response?.status` | Struct の問題、ボディ、入力値       |
| ストリーム/セッションランタイム | `stream.closed` / `session.closed`           | 終端 code/kind、レビュー済み close status       | イベントペイロード、フレーム、cause |

status `0` から CORS を推論しないでください — `kind` と `code` で分岐します。

`cause`、`data`、レスポンスヘッダー/ボディ、URL、Struct の問題、入力値、スタックは機微として扱ってください。控えめな要約の例です。

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`、`createDefinitionError`、`createHttpStatusError` はネイティブ `Error` インスタンスを構築して返します。通常の request failure は統一 tuple に残り、ネイティブ `Error` であること自体が throw に変えるわけではありません。`ERR_ABORTED` と `ERR_TIMEOUT` は、トランスポート正規化が認識する共有の cause です。

## 関連レシピ

- [宣言済み 404 付きの GET](../recipes/get-declared-404.md)
- [HTTP 呼び出しをキャンセルする](../recipes/cancel-http.md)
