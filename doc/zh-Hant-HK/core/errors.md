---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# 錯誤

`@defjs/core` 的所有執行結果都以 `[error, result, response]` 三元組回傳。`error` 是 `RequestError`：一個以 `kind` 與 `code` 區分的可辨識聯合類型。建議以 `kind` 與 `code` 進行分支，而非字串比對。

## RequestError 結構

`RequestError` 是三種錯誤類型的聯合：

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

所有錯誤共享以下共同欄位：

| 欄位       | 類型                                    | 說明                                               |
| ---------- | --------------------------------------- | -------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | 頂層分支的錯誤分類                                 |
| `code`     | `string`                                | 第二層分支的精確錯誤碼                             |
| `message`  | `string`                                | 人類可讀的錯誤描述                                 |
| `data`     | `unknown`                               | 附加資料（僅 `http` 與 `definition` 錯誤具備）     |
| `response` | `SettledResponseLike`                   | 原始回應物件（僅 `http` 與 `definition` 錯誤具備） |

### HttpStatusError

當伺服器回傳非 2xx 狀態碼，且該狀態碼已在 `output` 中定義時產生。

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

`data` 類型由該狀態碼對應的 `output` 結構描述推導。例如 `output: { 404: notFoundStruct }` 會將 `error.data` 窄化為 `notFoundStruct` 的推導類型。

### TransportError

網路或傳輸層失敗時產生，套件括取消、逾時與一般網路錯誤。

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

請求定義或驗證失敗時產生。

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| 錯誤碼                       | 觸發情境                                                |
| ---------------------------- | ------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | 輸入參數未通過 `input` struct 驗證，或 `build` 拋出例外 |
| `RESPONSE_VALIDATION_FAILED` | 回應主體未通過該狀態碼對應的 `output` struct 驗證       |
| `UNDECLARED_STATUS`          | 伺服器回傳了未在 `output` 中宣告的 2xx 狀態碼           |

## 錯誤分類與分支

**請勿**使用字串比對來判斷錯誤類型：

```typescript
// 不推薦：脆弱且無型別窄化
if (error.message.includes('timeout')) { ... }
```

**推薦**：以 `kind` 與 `code` 分支，取得精確的類型窄化：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error 被窄化為 HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data 被窄化為 { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error 被窄化為 TransportError
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      // error 被窄化為 DefinitionError
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## 內建常數

`@defjs/core` 匯出兩個常數，用於識別特定傳輸錯誤：

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: 請求被主動取消
// ERR_TIMEOUT: 請求逾時
```

### 在攔截器中觸發取消

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### 與 AbortController 搭配使用

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### 手動建立傳輸錯誤

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## 輔助函式

### `createTransportError`

將原始例外正規化為 `TransportError`。

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

將原始例外正規化為 `DefinitionError`。

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

將非 2xx 回應正規化為 `HttpStatusError`。

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## 接下來

- [用戶端 →](/core/client) — 建立用戶端與執行指令
- [HTTP 請求 →](/core/http) — `defineRequest` 與輸出模式
- [SSE →](/core/sse) — SSE 錯誤與重連策略
- [WebSocket →](/core/web-socket) — WebSocket 連線錯誤處理
