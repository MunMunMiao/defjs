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

- HTTP 回傳解碼後的 data 與 Defjs `SettledResponse` wrapper。
- SSE 回傳 logical stream handle 與 startup-open snapshot。
- WebSocket 回傳 logical session 與 startup-connection snapshot。

失敗時，第二項是 `undefined`。如果 transport 在產生對應 snapshot 前已 startup failure，第三項亦可能是 `undefined`。

## `RequestError`

`RequestError` 是在 tuple 回傳的 plain discriminated object，並不繼承原生 `Error` class。

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Root export 的 union 名稱是 `RequestError<TErrorData>`。

先按 `kind` 分支，有需要再按 `code` 分支。

### HTTP Status Error

已宣告的非 2xx HTTP response 會產生以下 error：

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

只有 `HttpStatusError` 有 `data`。其 type 是該 endpoint 所有已宣告 non-2xx output body 的 union。檢查 `error.status` 目前不會 narrow 這個 union。不同 status 的 body shape 不同時，請使用應用程式自己的結構檢查或 discriminant。

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
  response?: SettledResponseLike<unknown>
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

## Response Availability

`SettledResponseLike` 與 `SettledResponse` 是 Defjs wrapper，不是 native `Response`。它們提供 status、status text、headers、URL、body 與 optional error information；settled wrapper 另有 `ok`。`ok` 只代表 status 落在 2xx 範圍。

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
