---
title: 錯誤
description: 用 kind 與 code 處理 404、逾時、未宣告狀態碼與傳輸失敗。
---

# 錯誤

處理已宣告 404、逾時或未宣告狀態碼時，讀 error-first tuple — 不是去 catch throws。`RequestError` 仍是按 `kind` / `code` 區分的 union，同時也是原生 `Error`（`instanceof Error` 為 true）。先看 `kind`，再看 `code`。

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

const example: RequestError = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## 穩定的 codes

| `kind`       | Codes                                                                                                | 意義                                                                                       |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `http`       | `HTTP_STATUS`                                                                                        | 非 2xx 到了 HTTP 邊界。保留 `status`、`response`，以及任何解碼後的狀態碼專屬 `data`。      |
| `transport`  | `ABORTED`、`TIMEOUT`、`NETWORK_ERROR`                                                                | 取消、逾時，或 Fetch／傳輸失敗擋住了正常結果。                                             |
| `definition` | `REQUEST_VALIDATION_FAILED`、`RESPONSE_VALIDATION_FAILED`、`UNDECLARED_STATUS`、`INTERCEPTOR_FAILED` | Input、請求建構、回應 representation、Struct 解碼、狀態契約失敗，或 interceptor 內部丟錯。 |

`cause` 在 transport 與 definition errors 上是選填。`response` 在 HTTP status errors 上一定有；當回應已存在時，也可能出現在 definition errors。

## 各傳輸的 tuple 形狀

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

啟動失敗 → 第二項 `undefined`。第三項只有在該傳輸先產出回應／快照時才有。SSE handle 或 WebSocket session 回傳後，之後的失敗走該 handle 的生命週期 — 不會改寫已 settled 的啟動 tuple。

## HTTP status 與 data

精確 status 優先。有 `output` 時，Defjs 在解碼 body 前就選好對應 Struct，因此 `error.status` 與 `error.data` 會對得上。

| 情況                                     | Tuple 結果                       | Body 行為                                                  |
| ---------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| 2xx 且有相符的已宣告 status              | 成功                             | 選定的 Struct → `data`                                     |
| 非 2xx 且有相符的已宣告 status           | `HTTP_STATUS`                    | 選定的 Struct → 型別化的 `error.data`                      |
| 任何狀態碼都沒有相符宣告                 | `UNDECLARED_STATUS`              | Status 在 body 解碼**之前**勝出                            |
| Status 相符，但 body representation 失敗 | `RESPONSE_VALIDATION_FAILED`     | 沒有部分型別化值                                           |
| 省略 `output`                            | 2xx 成功；非 2xx → `HTTP_STATUS` | Body 不解碼；`data` 是 `undefined`                         |
| 回應 status `0`                          | 傳輸錯誤                         | `response.error` → `NETWORK_ERROR`、`ABORTED` 或 `TIMEOUT` |

`HttpResponse.ok` 只代表 `200 <= status < 300`。正常的非 2xx 不會設 `HttpResponse.error` — 那個屬性是給 Fetch 邊界傳輸或 body representation 失敗用的。

## 啟動 vs 開啟後

SSE 在 resolve handle 前會驗證 status、`text/event-stream`、body。失敗的 status → `HTTP_STATUS`。壞 content type 或缺少 body → `RESPONSE_VALIDATION_FAILED`。開啟快照仍可能落在 tuple 第三格。

WebSocket 啟動涵蓋 handshake + 第一次實體 open。Constructor 失敗、開之前 close、逾時或取消 → 啟動 tuple。即使 socket 從沒進到 `open`，也可能有 connection 快照。

| 傳輸      | 啟動之後                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | Iterator 在致命錯誤時 reject；`stream.closed` 以 `code: 'error'` 與 `EventStreamErrorCode` resolve                                                 |
| WebSocket | Message／queue／heartbeat／runtime 失敗走 `onRuntimeError`；終端錯誤時 `receive` 失敗；`session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute promise 只 settle 一次。Interceptor／callback 程式碼仍可能在 tuple 正規化之外丟錯                                                          |

`ABORTED`／`TIMEOUT` 描述的是呼叫端看到的啟動結果。若回傳了 stream／session，你仍要關閉它並 await 終端 promise。

## Native Error logging 與 cause

所有 `RequestError` variants 都是原生 `Error` instances，因此不再需要 diagnostic adapter。`String(error)` 使用穩定的原生形式 `<name>: <message>`。`kind`、`code`，以及 `status`、`response`、`data` 等 variant 欄位保持 enumerable，方便 structured logging；`name` 與原生 `cause` chain 則是 non-enumerable。

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

呼叫 `format()`、`flatten()` 或 `prettify()` 前，先用 `error.cause instanceof StructError` 縮窄型別。這些 helpers 留在 Struct cause，不會複製到外層 `DefinitionError`。別讓控制流程 parse `message` 或 `String(error)` — `kind`、`code` 與審過的 status 仍是契約。

## Reference

| 分支                    | 控制流程檢查                                 | 有用的穩定欄位                            | 通常沒有／敏感                 |
| ----------------------- | -------------------------------------------- | ----------------------------------------- | ------------------------------ |
| HTTP status 政策        | `error.kind === 'http'`                      | `error.status`、審過的 `error.data`       | Body、headers、URL、`cause`    |
| 呼叫端取消              | `kind === 'transport' && code === 'ABORTED'` | `kind`、`code`                            | Abort reason 與 stack          |
| 逾時                    | `kind === 'transport' && code === 'TIMEOUT'` | `kind`、`code`                            | Request URL 與底層 cause       |
| 契約失敗                | `error.kind === 'definition'`                | `kind`、`code`、審過的 `response?.status` | Struct issues、body、input 值  |
| Stream／session runtime | `stream.closed`／`session.closed`            | 終端 code／kind、審過的 close status      | Event payloads、frames、causes |

別從 status `0` 推 CORS — 用 `kind` 與 `code` 分支。

把 `cause`、`data`、回應 headers／bodies、URLs、Struct issues、input 值、stacks 都當敏感。保守摘要：

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

`createTransportError`、`createDefinitionError`、`createHttpStatusError` 建立的是這些原生 Error values。一般請求失敗仍會從 tuple 回傳；繼承原生 Error 不會讓它們自動 throw。`ERR_ABORTED` 與 `ERR_TIMEOUT` 是傳輸正規化器認得的共用 causes。

## 相關 recipes

- [已宣告 404 的 GET](../recipes/get-declared-404.md)
- [取消 HTTP 呼叫](../recipes/cancel-http.md)
