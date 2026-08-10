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

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

實際匯出的 union 名稱是 `RequestError<TErrorData>`。

先對 `kind` 分支，需要時再檢查 `code`。

### HTTP Status Error

已宣告的非 2xx HTTP 回應會產生：

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

只有 `HttpStatusError` 具有 `data`。其型別是該端點所有已宣告非 2xx output body 的 union。目前檢查 `error.status` 不會進一步 narrow 這個 union。不同 status body 若有不同形狀，請用應用程式自有的結構或 discriminator 檢查。

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
