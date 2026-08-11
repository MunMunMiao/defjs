---
title: Errors
description: 處理 transport-specific result tuple，並按 plain RequestError discriminated union 分支。
---

# Errors

每種受支援的 transport 都回傳 error-first 三項 tuple，但第三項保留該 transport 的特定意思。

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP 回傳解碼後的 data 與 Defjs `HttpResponse` wrapper。
- SSE 回傳 logical stream handle 與 startup-open snapshot。
- WebSocket 回傳 logical session 與 startup-connection snapshot。

失敗時，第二項是 `undefined`。如果 transport 在產生對應 snapshot 前已 startup failure，第三項亦可能是 `undefined`。

## `RequestError`

`RequestError` 是在 tuple 回傳的 plain discriminated object，並不繼承原生 `Error` class。

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

Root export 的 union 名稱是 `RequestError<TErrorData>`。

先按 `kind` 分支，有需要再按 `code` 分支。

### HTTP Status Error

已宣告的非 2xx HTTP response 會產生以下 error：

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

兩個 generic 的次序是 data 在前、status 在後。較廣的 `RequestError<TErrorData>` export 仍適合 application boundary，而 endpoint execute 會回傳按 status 區分的 `HttpStatusError<Data, Status>` union。因此，檢查 `error.status` 會把 `error.data` narrow 到該 status 宣告的 body：

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // 對此 endpoint，其餘 409 | 422 status 共用同一個 conflict body。
    console.error(error.data.conflict)
  }
}
```

只有 `HttpStatusError` 有 `data`。請在 endpoint boundary 保留這個與 status 關聯的 union，不要把它 widen 成互不關聯的 data union。

### Transport Error

網絡操作失敗、cancellation 或 timeout 會產生：

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Transport error 沒有 `data` 或 `response` 欄位。

### Definition Error

Input 解碼、request building、response decoding 或未宣告 HTTP status，可能產生：

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Code                         | 目前觸發條件                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------ |
| `REQUEST_VALIDATION_FAILED`  | Input 結構式解碼失敗、request construction 失敗，或 `build` 產生無效 binding。 |
| `RESPONSE_VALIDATION_FAILED` | 已宣告 response 或 SSE startup response 未通過 structural/content validation。 |
| `UNDECLARED_STATUS`          | 已宣告 `output`，但 HTTP 回傳的 status 沒有對應 Struct。                       |

`UNDECLARED_STATUS` 同時適用於未匹配的 2xx 與 non-2xx status。

## 分支處理

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

未有明確的敏感資料遮罩與 retention policy 時，不要記錄 `cause`、`data`、response headers、body 或 URL。

### 原生 `Error` Bridge

部分 integration 要求 throw 原生 `Error`。請在這個 boundary 建立新的 diagnostic error，預設只公開穩定的 `kind`、`code` 及可用的 HTTP `status` 分類：

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

新建 error 會保留它在 boundary 產生的自身 stack。這個 bridge 絕不會附加或複製原始 `cause`、cause message、cause stack frame、`data`、response header/body 或 request/response URL。stack frame text 本身亦可能包含 URL 及 secret，因此選取並複製部分 cause frame 並不是安全預設。可執行的 `examples/observability-redacted-logging` 專案會斷言保留的 404 status，同時檢查 response data 及刻意帶有 secret 的 cause stack 沒有洩漏。

## Response Availability

`HttpResponse` 是 Defjs wrapper，不是 native `Response`。它提供 status、status text、headers、URL、body、`error` 與 `ok`。`ok` 只代表 status 落在 2xx 範圍。`error` 只用於 transport 或 body representation failure；普通 non-2xx response 會留空。

有效而且已宣告的 non-2xx body 會經 Struct 解碼，並以 typed `HttpStatusError.data` 保留。Malformed representation 則產生 `RESPONSE_VALIDATION_FAILED`，原始 codec exception 保存在 `cause`，已收到的 response 仍保留，但沒有 `data`。

對 HTTP 而言：

- 已宣告 HTTP status error 有 `error.response`；
- response-output validation error 與 undeclared status 可能有 `error.response`；
- request validation、收到 response 前取消、interceptor throw，以及 status-0 transport failure，可能沒有 tuple response。

SSE startup failure 時，如果 response 已到達，之後才出現 content 或 status validation failure，第三項仍可能有 open snapshot。WebSocket startup failure 時，只有已擷取 connection snapshot 才可能回傳第三項。

## Error Factory 與 Constant

Root entry 為 integration code 匯出以下 factory helper：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)`：normalize abort、timeout 與其他 cause。
- `createDefinitionError(code, cause, response?)`：建立 definition error。
- `createHttpStatusError(status, message, response, data?)`：建立 HTTP status error。
- `ERR_ABORTED` 與 `ERR_TIMEOUT`：normalizer 可識別的共用 `Error` 值。

這些 helper 建立 plain `RequestError` object，不會 throw。

內置 command path 會把預期內的 startup failure 轉成 tuple。Tuple handling 不涵蓋任意 extension code：custom interceptor 與應用程式 callback 仍可能 throw；把不受支援的 command 傳給 broad runtime implementation 亦會 reject。

## 下一步

- [HTTP](/zh-Hant-HK/core/http)：status dispatch 與 response decoding。
- [SSE](/zh-Hant-HK/core/sse)：startup failure 與 open 後 error 的分別。
- [WebSocket](/zh-Hant-HK/core/web-socket)：runtime error 與 terminal close。
