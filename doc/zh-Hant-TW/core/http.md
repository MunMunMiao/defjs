---
title: HTTP
description: 建構 HTTP URL 與 body、分派回應 Struct、取消工作、設定 credentials 與 XSRF，並了解 Fetch 邊界。
---

# HTTP

`defineRequest(...)` 會建立 HTTP 指令建構器。[指令](/zh-Hant-TW/core/commands)頁面說明端點定義與輸入投影；本頁集中處理 HTTP wire 與生命週期行為。

## URL 建構

`withEndpoint(...)` 必須提供 absolute base URL，其 path 會保留並當成目錄：

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Base path 若沒有結尾 slash，會自動補上。Base endpoint 上的 query 或 hash 則會被丟棄。

端點 `path` 是相對契約路徑。開頭 slash 可以接受，但解析前會先移除，因此不會取代 base directory。執行階段會拒絕：

- absolute URL 與 protocol-relative URL；
- 含有 `?` 的路徑；
- 含有 `#` 的路徑。

Path placeholder 使用 `:name`：

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Placeholder value 插入時不會做 path segment encoding。請限制 identifier 的格式，或在建立指令前，對單一不受信任的 segment 呼叫 `encodeURIComponent`。未編碼的 slash 或 dot segment 可能改變解析結果；插入 `?` 或 `#` 則會讓 endpoint path 驗證拒絕請求。

## 請求編碼

直接對應 wire 時使用 `struct.request(...)`：

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Body Struct 會決定編碼與預設 content type：

| Body Struct                | Wire body             | 預設 `Content-Type`                               |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | 由平台設定，包含 boundary                         |
| `struct.blob()`            | `Blob`                | Blob type 或 `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

自訂 `build` 可以使用對應的 HTTP builder method。Setter method 會取代該 request part；`addHeaders`、`addFormData` 與 `addFormUrlEncoded` 則會附加到目前內容。所有值都必須來自結構描述綁定投影。

### Query 值

預設 query encoder 接受扁平的 scalar value，以及 scalar value array。巢狀 object 會在建構請求時失敗。

`withQueryParamsSerializer((params, rawParams) => string)` 可以改變已經被接受的扁平值要如何輸出。它會收到 `URLSearchParams` view 與編碼後的 flat record，但不會讓巢狀 query object 變成合法；這類值在序列化前就會被拒絕。

Alias 會變成 outbound query、path 與 header key，呼叫端程式碼仍使用 Struct 的邏輯欄位名稱。

## Status 與輸出解碼

`output` 將 status code 對應到 response Struct：

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

執行階段依 exact status 選擇 Struct。宣告 `output` 時，任何未對應 status 都會產生 `UNDECLARED_STATUS`。已宣告的 2xx body 形成 success data union；已宣告的非 2xx body 則形成 `error.data`。

`response.ok` 只代表 `status >= 200 && status < 300`，不代表輸出解碼、應用程式驗證或授權成功。

已宣告 `output` 且省略 `responseType` 時，回應預設解析成 `json`。可明確指定的模式是 `json`、`text`、`blob` 與 `arraybuffer`，再由選中的 Struct 做結構解碼。省略 `output` 時，result data 是 `undefined`，回傳 response wrapper 的 `body` 則是 `null`。

### 目前的 Malformed JSON 缺陷

::: danger Malformed JSON 可能看起來成功
目前 Fetch 邊界會把 JSON parse failure 放進 `HttpResponse.error`，並讓 body 保持 `null`。HTTP 指令執行在套用 output Struct 前沒有檢查這個 parse error。不可為 null 的 `null` 又可能解碼成 Struct 零值，因此 malformed 2xx JSON body 目前可能產生 `[null, zeroValue, response]`。

不要把零值成功結果當成伺服器確實傳回有效 JSON 的證明。這需要修正實作並加入 regression test，文件只能先提出警告。
:::

## HTTP 結果

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

成功時，`response` 是 Defjs `SettledResponse` wrapper，body 與 `data` 相符。失敗時能否取得 response，取決於執行已走到哪個階段。完整分類請見[錯誤](/zh-Hant-TW/core/errors)。

## 取消與 Timeout

HTTP 執行接受 `abort`、`signal` 與 `timeout`：

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` 會與 client 內部 signal，以及正數 timeout 合併。獨立的 `abort` 欄位是目前 API 保留的另一個取消 signal。`abort` 與 `timeout` 不能同時提供，否則會回傳 `REQUEST_VALIDATION_FAILED`；`signal` 則可以和其中任一項一起使用。

可識別的取消會產生 `ABORTED`。`AbortSignal.timeout(...)` reason 或 execution timeout 會產生 `TIMEOUT`，其他 Fetch failure 則產生 `NETWORK_ERROR`。

## Credentials 與 XSRF

`withCredentials(true)` 會讓 HTTP 與 SSE 的 Fetch 使用 `credentials: 'include'`。`false` 代表不指定 Fetch option，並不會強制使用 `omit`。這項設定不會加入 `Authorization` header，也不會設定 WebSocket authentication。

`withXSRF(...)` 只套用於 HTTP request。預設值是：

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

只有 `POST`、`PUT`、`PATCH` 與 `DELETE` 會嘗試注入。已存在的設定 header 會保留。瀏覽器 cookie lookup 只限 same-origin request；瀏覽器以外的環境請提供同步 `tokenProvider`，而且它的優先權高於 cookie lookup。

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

伺服器端 token provider 必須維持 request-scoped。`withCredentials(true)` 不會讓 JavaScript 能讀取 cross-origin browser cookie，也不會造成 cross-origin XSRF header 注入。

## 進度觀察器

Fetch response body 被讀取時，`onDownloadProgress` 會回報 byte 數。只有取得正數 `Content-Length` 時，`lengthComputable` 才是 true。

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` 只觀察 `ReadableStream<Uint8Array>` request body。目前 high-level 指令建構器有 Blob 與 ArrayBuffer 投影 setter，卻沒有 raw stream setter。因此沒有標準 `defineRequest` 範例能提供這個選項所需的 stream。不要把自行建構的 stream 說成可用的 high-level command body。

Progress callback 直接在傳輸讀寫路徑執行。請確保它不會 throw，而且工作量低。

## Low-Level Fetch 邊界

`fetchHandler(httpRequest, fetchImpl?)` 有從套件匯出。它會把 Defjs `HttpRequest` 轉成原生 `Request`、呼叫 Fetch、解析選定的回應表示形式，最後回傳 Defjs `HttpResponse` wrapper。Fetch failure 會變成 status 0 wrapper。

直接呼叫 `fetchHandler` 會繞過：

- 指令輸入解碼與 request projection；
- HTTP output status dispatch 與 Struct decoding；
- client interceptor orchestration；
- 轉換成 high-level `RequestError` tuple。

它是已匯出的 low-level 邊界，不是建議使用的指令流程。本文件尚未建立它的長期穩定性承諾。

## 下一步

- [攔截器](/zh-Hant-TW/core/interceptors)說明 request cloning、short-circuit 與 retry。
- [錯誤](/zh-Hant-TW/core/errors)說明 HTTP status、transport 與 definition failure。
- [Struct](/zh-Hant-TW/core/struct)說明零值結構解碼。
