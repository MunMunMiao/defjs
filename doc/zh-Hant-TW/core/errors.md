---
title: 錯誤
description: 處理各傳輸專屬的結果 tuple，並對一般判別聯集物件 RequestError 進行分支。
---

# 錯誤

每一種受支援的傳輸都回傳 error-first 三元素 tuple，但第三個元素依傳輸而異。

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP 回傳解碼後資料與 Defjs `HttpResponse` wrapper。
- SSE 回傳邏輯 stream handle 與啟動開啟快照。
- WebSocket 回傳邏輯 session 與啟動連線快照。

失敗時第二個元素是 `undefined`。若啟動在傳輸產生對應快照前就失敗，第三個元素也可能是 `undefined`。

## `RequestError`

`RequestError` 是 tuple 裡回傳的一般判別聯集物件，不繼承原生 `Error` class。

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

實際匯出的 union 名稱是 `RequestError<TErrorData>`。

先對 `kind` 分支，需要時再檢查 `code`。

### HTTP Status Error

已宣告的非 2xx HTTP 回應會產生：

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

兩個 generic 的順序是 data 在前、status 在後。較寬泛的 `RequestError<TErrorData>` export 仍適合應用程式邊界，而端點 execute 會回傳依 status 區分的 `HttpStatusError<Data, Status>` union。因此，檢查 `error.status` 會將 `error.data` narrow 到該 status 宣告的 body：

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // 對此端點，其餘 409 | 422 status 共用相同的 conflict body。
    console.error(error.data.conflict)
  }
}
```

只有 `HttpStatusError` 具有 `data`。請在端點邊界保留這個與 status 關聯的 union，不要將它拓寬成互不相關的 data union。

### Transport Error

網路操作失敗、取消或 timeout 會產生：

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

輸入解碼、請求建構、回應解碼或未宣告的 HTTP status 可能產生：

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Code                         | 目前的觸發條件                                                    |
| ---------------------------- | ----------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 輸入結構解碼失敗、請求建構失敗，或 `build` 產生無效綁定。         |
| `RESPONSE_VALIDATION_FAILED` | 已宣告的回應或 SSE 啟動回應未通過結構／內容驗證。                 |
| `UNDECLARED_STATUS`          | 已宣告 `output` 時，HTTP 回傳了沒有對應 output Struct 的 status。 |

`UNDECLARED_STATUS` 同時適用於未對應的 2xx 與非 2xx status。

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

除非有明確的遮罩與保存政策，否則不要記錄 `cause`、`data`、response headers、body 或 URL。

### 原生 `Error` Bridge

部分 integration 要求 throw 原生 `Error`。請在這個邊界建立新的 diagnostic error，預設只公開穩定的 `kind`、`code` 與可用的 HTTP `status` 分類：

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

新建 error 會保留它在邊界產生的自身 stack。這個 bridge 絕不會附加或複製原始 `cause`、cause message、cause stack frame、`data`、response header/body 或 request/response URL。stack frame 文字本身也可能包含 URL 與 secret，因此選取並複製部分 cause frame 並不是安全的預設行為。可執行的 `examples/observability-redacted-logging` 專案會斷言保留的 404 status，同時檢查 response data 與刻意帶有 secret 的 cause stack 沒有洩漏。

## 回應是否可用

`HttpResponse` 是 Defjs wrapper，不是原生 `Response` 物件。它會公開 status、status text、headers、URL、body、`error` 與 `ok`。`ok` 只代表 status 落在 2xx。`error` 只用於 transport 或 body representation failure；一般非 2xx 回應會留空。

合法且已宣告的非 2xx body 會經 Struct 解碼，並以 typed `HttpStatusError.data` 保留。Malformed representation 則產生 `RESPONSE_VALIDATION_FAILED`，原始 codec 例外保存在 `cause`，已收到的 response 仍保留，但沒有 `data`。

HTTP 的情況如下：

- 已宣告的 HTTP status error 一定有 `error.response`；
- response output 驗證錯誤與 undeclared status 可能有 `error.response`；
- request validation、收到回應前取消、攔截器 throw，以及 status 0 transport failure 可能沒有 tuple response。

SSE 啟動失敗時，如果已先收到回應，之後才在 content 或 status 驗證失敗，第三個元素仍可能有 open snapshot。WebSocket 啟動失敗則只有確實捕捉到連線快照時，才可能回傳第三個元素。

## Error Factory 與常數

Root entry 有匯出供整合程式碼使用的 factory helper：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` 會正規化 abort、timeout 與其他 cause。
- `createDefinitionError(code, cause, response?)` 建立 definition error。
- `createHttpStatusError(status, message, response, data?)` 建立 HTTP status error。
- `ERR_ABORTED` 與 `ERR_TIMEOUT` 是 normalizer 能識別的共用 `Error` 值。

這些 helper 只會建立一般 `RequestError` 物件，不會 throw。

內建指令路徑會把預期內的啟動失敗轉成 tuple，但 tuple handling 不涵蓋任意 extension code。自訂攔截器與應用程式 callback 仍可能 throw，把不支援的指令傳給寬鬆的執行階段實作也會造成 rejection。

## 下一步

- [HTTP](/zh-Hant-TW/core/http)說明 status 分派與回應解碼。
- [SSE](/zh-Hant-TW/core/sse)區分啟動失敗與開啟後的錯誤。
- [WebSocket](/zh-Hant-TW/core/web-socket)說明 runtime error 與終止關閉。
