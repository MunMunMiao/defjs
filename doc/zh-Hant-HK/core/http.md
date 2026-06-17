---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-schema mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

使用 `defineRequest` 定義 HTTP 端點，再透過 `Client.execute()` 執行。核心套件會自動處理結構描述驗證、狀態碼分派、訊號合併與回應主體解析。

## 定義端點

`defineRequest` 接受含 `method`、`path`、`input`（選填）、`output`（選填）與 `build`（選填）的定義物件。

提供 `input` 時，必須同時提供 `build`，以說明輸入欄位如何對應到請求各部分（路徑參數、查詢參數、標頭、主體）。

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

若無需輸入，請同時省略 `input` 與 `build`：

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## 狀態碼對結構描述輸出對應

`output` 將 HTTP 狀態碼對應到結構描述。執行階段依回應狀態碼選擇對應的結構描述。

同時支援物件與陣列形式：

```typescript
import { defineRequest, object, string } from '@defjs/core'

// 物件形式：鍵為狀態碼，值為結構描述
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// 陣列形式：支援多個狀態碼對應到同一結構描述
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

若伺服器回傳的狀態碼未在 `output` 中宣告，請求會失敗，並回傳 `code` 為 `UNDECLARED_STATUS` 的 `DefinitionError`。

## 成功／錯誤資料類型推導

`output` 驅動 TypeScript 類型推導。`Client.execute()` 回傳的 `HttpAwaitResult` 會自動區分 2xx 成功資料與非 2xx 錯誤資料。

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result 的型別為 { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data 的型別為 { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### 類型輔助

- `RequestSuccessData<TOutput>`：從 `output` 提取所有 2xx 結構描述輸出類型。若無 2xx 對應，推導為 `unknown`。
- `RequestErrorData<TOutput>`：從 `output` 提取所有非 2xx 結構描述輸出類型。若無非 2xx 對應，推導為 `unknown`。

## 執行請求

呼叫 `Client.execute()` 並傳入指令。第二個引數為選填的 `HttpExecuteOptions`：

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* 攔截器可讀取的自訂上下文 */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // 別名，等同 abort
})
```

回傳的 `HttpAwaitResult` 為三元組：

| 位置 | 類型                                     | 含義                                              |
| ---- | ---------------------------------------- | ------------------------------------------------- |
| 0    | `RequestError<TErrorData> \| null`       | 錯誤物件；成功時為 `null`                         |
| 1    | `TSuccess \| undefined`                  | 成功資料；失敗時為 `undefined`                    |
| 2    | `SettledResponse<TSuccess> \| undefined` | 原始回應套件裝，含 `status`、`headers`、`body` 等 |

## 取消與逾時

`abort`、`timeout` 與 `signal` 控制請求生命週期。**`abort` 與 `timeout` 不可同時使用** — 同時使用會在請求發送前產生驗證錯誤。

### 使用 AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// 稍後取消
controller.abort()

// 取消後，error.kind 為 'transport'，code 為 'ABORTED'
```

### 使用逾時

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5 秒逾時
})

// 逾時後，error.kind 為 'transport'，code 為 'TIMEOUT'
```

### 合併外部訊號

若同時傳入 `abort` 與 `signal`，框架會將其合併為單一 `AbortSignal`。`timeout` 也會以 `AbortSignal.timeout()` 參與合併。任一訊號觸發皆會取消請求。

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // 與 abort 合併
})
```

### 錯誤區分

取消與逾時同屬 `TransportError`，可透過 `error.code` 區分：

| 情境     | `error.code`    | 說明                                            |
| -------- | --------------- | ----------------------------------------------- |
| 手動取消 | `ABORTED`       | `controller.abort()` 或外部訊號觸發             |
| 逾時     | `TIMEOUT`       | `timeout` 到期，或 `AbortSignal.timeout()` 觸發 |
| 網路失敗 | `NETWORK_ERROR` | fetch 的其他例外                                |

## 下載／上傳進度

透過 `onDownloadProgress` 與 `onUploadProgress` 追蹤進度。

### 下載進度

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` 套件含三個欄位：

- `lengthComputable`: 伺服器是否回傳 `Content-Length`
- `loaded`: 目前已接收位元組數
- `total`: 總位元組數（僅當 `lengthComputable` 為 `true` 時有效）

### 上傳進度

上傳進度僅在請求主體為 `ReadableStream<Uint8Array>` 時運作。框架會套件裝串流，並在每個 chunk 後回呼。

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## 回應類型

預設情況下，若宣告了 `output`，框架會自動將回應解析為 `json`。你可以透過 `responseType` 覆寫，或在 `output` 為 `undefined` 時指定。

```typescript
import { defineRequest } from '@defjs/core'

// 明確指定回應型別
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// 無 output，只關注原始回應
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

支援的 `responseType` 值：

| 值            | 說明                                         |
| ------------- | -------------------------------------------- |
| `json`        | 讀取文字後 `JSON.parse()`；空主體回傳 `null` |
| `text`        | 直接回傳文字字串                             |
| `blob`        | 回傳 `Blob`                                  |
| `arraybuffer` | 回傳 `ArrayBuffer`                           |

當 `responseType` 為 `json` 且 `output` 定義了該回傳狀態碼的結構描述時，框架會驗證解析後的 JSON。若驗證失敗，會回傳 `code: 'RESPONSE_VALIDATION_FAILED'` 的 `DefinitionError`。

## 接下來

- [用戶端 →](/core/client) — 建立 `Client`、攔截器、XSRF、全域選項
- [SSE →](/core/sse) — Server-Sent Events 與串流回應
- [WebSocket →](/core/web-socket) — 雙向即時通訊
