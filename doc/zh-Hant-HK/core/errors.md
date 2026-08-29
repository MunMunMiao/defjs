---
title: Errors
description: 按 kind 同 code 分支處理 404s、timeouts、undeclared statuses 同 transport failures。
---

# Errors

處理 declared 404、timeout 或者 undeclared status，靠讀 error-first tuple — 唔係 catch throws。`RequestError` 仍然係按 `kind` / `code` 區分嘅 union，同時亦係 native `Error`（`instanceof Error` 係 true）。先睇 `kind`，再睇 `code`。

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

## Stable codes

| `kind`       | Codes                                                                                                | Meaning                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Non-2xx 到達 HTTP boundary。保留 `status`、`response`，同任何 decoded status-specific `data`。                                  |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Cancel、timeout，或者 Fetch/transport failure 擋住咗正常 result。                                                               |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Input、request construction、response representation、Struct decode、status-contract failure，或者 interceptor 入面嘅 `throw`。 |

`cause` 喺 transport 同 definition errors 上面係 optional。`response` 永遠喺 HTTP status errors 上面；當已經有 response 時，definition errors 都可能出現。

## 按 transport 嘅 tuple 形狀

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

Startup failure → 第二項 `undefined`。第三項只會喺嗰個 transport 已經產出 response/snapshot 時出現。SSE handle 或者 WebSocket session return 之後，之後嘅 failures 住喺嗰個 handle 嘅 lifecycle — 唔會改寫已經 settle 嘅 startup tuple。

## HTTP status 同 data

Exact-status 優先。有 `output` 時，Defjs 會喺 decode body 之前揀 matching Struct，等 `error.status` 同 `error.data` 保持 correlated。

| Situation                                 | Tuple outcome                         | Body behavior                                                |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------ |
| 2xx 配 matching declared status           | Success                               | Selected Struct → `data`                                     |
| Non-2xx 配 matching declared status       | `HTTP_STATUS`                         | Selected Struct → typed `error.data`                         |
| 任何 status 冇 matching declaration       | `UNDECLARED_STATUS`                   | Status 喺 body decode **之前**贏                             |
| Matching status，body representation fail | `RESPONSE_VALIDATION_FAILED`          | 冇 partial typed value                                       |
| 省略 `output`                             | 2xx succeeds；non-2xx → `HTTP_STATUS` | Body 唔 decode；`data` 係 `undefined`                        |
| Response status `0`                       | Transport error                       | `response.error` → `NETWORK_ERROR`、`ABORTED` 或者 `TIMEOUT` |

`HttpResponse.ok` 淨係指 `200 <= status < 300`。正常 non-2xx 唔會 set `HttpResponse.error` — 嗰個 property 用嚟表示 Fetch-boundary transport 或者 body-representation failure。

## Startup vs post-open

SSE 會喺 resolve handle 之前 validate status、`text/event-stream` 同 body。Failed status → `HTTP_STATUS`。Bad content type 或者 missing body → `RESPONSE_VALIDATION_FAILED`。Opening snapshot 仍然可以落喺 tuple 第三格。

WebSocket startup 覆蓋 handshake + 第一次 physical open。Constructor failure、pre-open close、timeout 或者 cancel → startup tuple。即使 socket 從未到 `open`，connection snapshot 都可能存在。

| Transport | After startup                                                                                                                                                |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE       | Fatal error 時 iterator reject；`stream.closed` resolve 時帶 `code: 'error'` 同 `EventStreamErrorCode`                                                       |
| WebSocket | Message/queue/heartbeat/runtime failures 用 `onRuntimeError`；terminal errors 令 `receive` fail；`session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | Execute promise settle 一次。Interceptor/callback code 仍然可以喺 tuple normalization 之外 throw                                                             |

`ABORTED` / `TIMEOUT` 描述嘅係 caller-facing startup result。你仍然要 close return 出嚟嘅 stream/session，再 await 佢嘅 terminal promise。

## Native Error logging 同 cause

所有 `RequestError` variants 都係 native `Error` instances，所以唔再需要 diagnostic adapter。`String(error)` 會用穩定嘅 native form `<name>: <message>`。`kind`、`code`，以及 `status`、`response`、`data` 呢類 variant fields 會保持 enumerable，方便 structured logging；`name` 同 native `cause` chain 就係 non-enumerable。

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.prettify())
  }
}
```

Call `format()`、`flatten()` 或 `prettify()` 之前，要先用 `error.cause instanceof StructError` 收窄 type。呢啲 helpers 留喺 Struct cause，唔會 copy 去外層 `DefinitionError`。唔好叫 control flow parse `message` 或 `String(error)` — `kind`、`code` 同 reviewed status 仍然係 contract。

## Reference

| Branch                 | Control-flow check                           | Useful stable fields                        | Usually absent / sensitive        |
| ---------------------- | -------------------------------------------- | ------------------------------------------- | --------------------------------- |
| HTTP status policy     | `error.kind === 'http'`                      | `error.status`、reviewed `error.data`       | Body、headers、URL、`cause`       |
| Caller cancellation    | `kind === 'transport' && code === 'ABORTED'` | `kind`、`code`                              | Abort reason 同 stack             |
| Timeout                | `kind === 'transport' && code === 'TIMEOUT'` | `kind`、`code`                              | Request URL 同 underlying cause   |
| Contract failure       | `error.kind === 'definition'`                | `kind`、`code`、reviewed `response?.status` | Struct issues、body、input values |
| Stream/session runtime | `stream.closed` / `session.closed`           | Terminal code/kind、reviewed close status   | Event payloads、frames、causes    |

唔好由 status `0` 推 CORS — 用 `kind` 同 `code` 分支。

將 `cause`、`data`、response headers/bodies、URLs、Struct issues、input values 同 stacks 當 sensitive。一個保守 summary：

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

`createTransportError`、`createDefinitionError` 同 `createHttpStatusError` 會 build 呢啲 native Error values。普通 request failures 仍然由 tuple return；inherit native Error 唔代表會自動 throw。`ERR_ABORTED` 同 `ERR_TIMEOUT` 係 transport normalizer 認得嘅 shared causes。

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
