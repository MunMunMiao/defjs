---
title: HTTP
description: 建立 HTTP URL 與 body、分派 response Struct、取消工作、設定 credentials 與 XSRF，並了解 Fetch boundary。
---

# HTTP

`defineRequest(...)` 會建立 HTTP command builder。[Commands](/zh-Hant-HK/core/commands) 負責 endpoint 定義與 input projection；本頁集中說明 HTTP wire 及 lifecycle 行為。

## URL 建構

`withEndpoint(...)` 必須提供 absolute base URL。當中的 path 會保留為 directory：

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Base path 沒有 trailing slash 時會自動補上。Base endpoint 上的 query 與 hash 都會被丟棄。

Endpoint `path` 是相對 contract path。可以保留開首 slash，runtime 會在 resolve 前移除，所以不會取代 base directory。Runtime 會拒絕：

- absolute URL 或 protocol-relative URL；
- 含有 `?` 的 path；
- 含有 `#` 的 path。

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

Placeholder 值插入時不會作 path-segment encoding。請限制 identifier format，或在建立 command 前，對單一不可信 segment 呼叫 `encodeURIComponent`。未編碼的 slash 或 dot segment 可能改變最終 path；插入 `?` 或 `#` 則會令 endpoint-path validation 拒絕該 request。

## Request Encoding

欄位直接對應 wire 時，使用 `struct.request(...)`：

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

Body Struct 決定 encoding 與 default content type：

| Body Struct                | Wire body             | 預設 `Content-Type`                               |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | string                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | 由平台設定，包括 boundary                         |
| `struct.blob()`            | `Blob`                | Blob type 或 `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

自訂 `build` 可呼叫對應 HTTP builder method。Setter method 取代該 request part；`addHeaders`、`addFormData` 與 `addFormUrlEncoded` 則追加至現有 part。所有值都必須來自 schema-bound projection。

### Query Value

預設 query encoder 接受扁平 scalar 與 scalar array。Nested object 會在 request building 階段失敗。

`withQueryParamsSerializer((params, rawParams) => string)` 可改變已接受 flat value 的輸出格式。它收到 `URLSearchParams` view 與 encoded flat record，但不能令 nested query object 變成有效 input，因為 object 會在 serializer 執行前被拒絕。

Alias 會成為 outbound query、path 與 header key；呼叫方仍使用 Struct 的 logical field name。

## Status 與 Output Decoding

`output` 把 status code 對應至 response Struct：

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

Runtime 會按精確 status 選擇 Struct。宣告 `output` 後，任何未匹配 status 都會產生 `UNDECLARED_STATUS`。已宣告 2xx body 組成 success-data union；已宣告 non-2xx body 則組成 `error.data`。

`response.ok` 只代表 `status >= 200 && status < 300`，不表示 output decoding、application validation 或 authorization 成功。

已宣告 `output` 而省略 `responseType` 時，response 預設以 `json` parse。Explicit mode 包括 `json`、`text`、`blob` 與 `arraybuffer`，再由選取的 Struct 作結構式解碼。省略 `output` 時，result data 是 `undefined`，回傳 response wrapper 的 `body` 是 `null`。

### 目前的 Malformed JSON 缺陷

::: danger Malformed JSON 可能看似成功
目前 Fetch boundary 會把 JSON parse failure 存入 `HttpResponse.error`，並讓 body 保持 `null`。HTTP command execution 在套用 output Struct 前沒有檢查這個 parse error。由於 non-nullable `null` 可能解碼成 Struct 零值，malformed 2xx JSON body 目前可以產生 `[null, zeroValue, response]`。

不要把全零值 success 視為 server 確實回傳合法 JSON 的證據。這個問題需要修正 source code 並加入 regression test；文件只能清楚警告現況。
:::

## HTTP 結果

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

成功時，`response` 是 Defjs `SettledResponse` wrapper，其 body 與 `data` 相同。失敗時有沒有 response，取決於 execution 已進行到哪一步。完整分類見 [Errors](/zh-Hant-HK/core/errors)。

## Cancellation 與 Timeout

HTTP execution 接受 `abort`、`signal` 與 `timeout`：

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` 會與 client internal signal 及正數 timeout 合併。獨立的 `abort` 欄位是目前 API 保留的另一個 cancellation signal。`abort` 與 `timeout` 不能同時提供，否則回傳 `REQUEST_VALIDATION_FAILED`；`signal` 則可配搭其中任何一項。

可識別的 cancellation 產生 `ABORTED`。`AbortSignal.timeout(...)` reason 或 execution timeout 產生 `TIMEOUT`；其他 Fetch failure 產生 `NETWORK_ERROR`。

## Credentials 與 XSRF

`withCredentials(true)` 令 HTTP 與 SSE 使用 Fetch `credentials: 'include'`。`false` 只會讓該 Fetch option 保持 unset，不會強制使用 `omit`。這個設定不會加入 `Authorization` header，亦不會設定 WebSocket authentication。

`withXSRF(...)` 只作用於 HTTP request。預設值是：

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

只有 `POST`、`PUT`、`PATCH` 與 `DELETE` 會嘗試注入。已設定的 header 會保留。瀏覽器 cookie lookup 只限 same-origin request；瀏覽器以外請提供同步 `tokenProvider`，其 precedence 高於 cookie lookup。

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

伺服器端 token provider 必須保持 request-scoped。`withCredentials(true)` 不會令 JavaScript 可以讀取 cross-origin browser cookie，亦不會觸發 cross-origin XSRF header injection。

## Progress Observer

`onDownloadProgress` 在讀取 Fetch response body 時回報 byte。只有正數 `Content-Length` 存在時，`lengthComputable` 才是 true。

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` 只觀察 `ReadableStream<Uint8Array>` request body。目前 high-level command builder 有 Blob 與 ArrayBuffer projection setter，卻沒有 raw stream setter。因此沒有標準 `defineRequest` 範例可以提供此 option 所需的 stream。不要把手動建立的 stream 寫成可用的 high-level command body。

Progress callback 會在 transport read/write path 執行。請確保 callback 不拋錯，而且開銷要小。

## Low-Level Fetch Boundary

`fetchHandler(httpRequest, fetchImpl?)` 已匯出。它把 Defjs `HttpRequest` 轉成 native `Request`、呼叫 Fetch、parse 選定的 response representation，再回傳 Defjs `HttpResponse` wrapper。Fetch failure 會成為 status-0 wrapper。

直接呼叫 `fetchHandler` 會繞過：

- command input decoding 與 request projection；
- HTTP output status dispatch 與 Struct decoding；
- client interceptor orchestration；
- 轉換成 high-level `RequestError` tuple 的流程。

它是已匯出的 low-level boundary，不是建議的 command workflow。這份文件未確立其長期 stability commitment。

## 下一步

- [Interceptors](/zh-Hant-HK/core/interceptors)：request cloning、short-circuit 與 retry。
- [Errors](/zh-Hant-HK/core/errors)：HTTP status、transport 與 definition failure。
- [Struct](/zh-Hant-HK/core/struct)：零值結構式解碼。
