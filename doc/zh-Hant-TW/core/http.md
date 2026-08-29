---
title: HTTP
description: 定義請求、執行、依 status 分支，並用 signal 或 timeout 取消。
---

# HTTP

定義 → 執行 → 依 tuple 分支 → 畫面離開就取消。HTTP 迴圈就這樣。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## 解析 URL

`withEndpoint(...)` 需要有效的絕對 URL。Endpoint pathname 當目錄保留；query 與 hash 在 command 解析前會丟掉。

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Path placeholders 是原始 scalars，只 encode 一次。空值與 `.`／`..` 會被拒絕。單一 placeholder 裡的斜線、`?`、`#`、`%`、空白、Unicode 會留在同一個 encoded segment — 別先 encode。

Definition path 不能含 `?` 或 `#`，也不能是絕對或 protocol-relative。預設 query encoder 接受 scalars 與 scalars 陣列。巢狀／複雜 query 值需要 `withQueryParamsSerializer(...)`，否則建構會失敗。

## 編碼 input

`struct.request(...)` 把 path、query、headers、body 分開。Body wrapper 決定 codec 與 content type：

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Aliases 只改 outbound wire keys。剖析後的值與 command inputs 仍用邏輯名稱。

| Wrapper                    | 執行階段 body     | 預設 content type                                          |
| -------------------------- | ----------------- | ---------------------------------------------------------- |
| `struct.json(inner)`       | JSON 字串         | `application/json`                                         |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                 |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`          |
| `struct.formData(shape)`   | `FormData`        | 平台 multipart boundary；Defjs 會清掉過期的 `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type 或 `application/octet-stream`                    |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                 |

自訂 `build` 暴露同樣的 location／codec setters。最後一次 body write 勝出（value + content-type metadata）。高階 commands 不會把任意物件變成 body — 宣告 wrapper，或用對應的 setter。

## 依 status 分派

`output` 是 status → Struct map 或 `{ status, body }[]`。有 `output` 且沒有 `responseType` 時，representation 預設是 `json`。明確型別：`json`、`text`、`blob`、`arraybuffer`。

作業順序：

1. Status `0` → 傳輸錯誤。
2. 沒有 `output` → 2xx 成功且 `data === undefined`；非 2xx → `HTTP_STATUS` 且 `error.data === undefined`。Body 不解碼。
3. 有 `output` 時，精確的已宣告 status 選出其 Struct。陣列形式：較晚的 match 覆寫較早的 grouped match。
4. 未宣告 status → 在 body 解碼**之前**得到 `UNDECLARED_STATUS`。
5. Representation 失敗 → `RESPONSE_VALIDATION_FAILED`，沒有部分資料。
6. 解碼後的已宣告 2xx → 結果；解碼後的已宣告非 2xx → `HTTP_STATUS` 上的型別化 `error.data`。

`HttpResponse` 有 `url`、`status`、`statusText`、`headers`、`body`、`error`、`ok`。`ok` 只代表 `200 <= status < 300`。它是 Defjs 值，不是原生 `Response`。沒有 `output` 時，不允許 `responseType`。

## 取消工作

執行 options 接受 `signal`，再加上 `abort` 或 `timeout`。**`abort` 與 `timeout` 互斥。** `signal` 可以跟其中一個搭配。

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` 必須是 `1..2_147_483_647` 的正 safe integer。認得的取消 → `ABORTED`；執行逾時 → `TIMEOUT`；其他 Fetch／interceptor 失敗 → `NETWORK_ERROR`。伺服器已接受寫入後再取消，**不能**證明寫入已回滾。

## Credentials 與 XSRF

`withCredentials(true)` 為 HTTP 與 SSE 設 Fetch `credentials: 'include'`。它不會建立 `Authorization`，也不會設定 WebSocket auth。`false` 則不指定 credentials。

`withXSRF(...)` 只給 HTTP。預設：`cookieName: 'XSRF-TOKEN'`、`headerName: 'X-XSRF-TOKEN'`。Header 只在非安全方法、呼叫端尚未設定、且是同源瀏覽器請求時注入。會跳過 `GET`、`HEAD`、`OPTIONS`、`TRACE`。非瀏覽器環境若要注入，請傳同步、請求範圍的 `tokenProvider`。

Credentials、XSRF tokens、query strings 別進日常 logs。別把 query params 當一般憑證通道。

## Progress 與 Fetch 邊界

`onDownloadProgress` 在讀明確的回應 representation 時跑。只有正的 `Content-Length` 時 `lengthComputable` 才是 true。沒有 `responseType` → 不解碼 body → 沒有 body-read progress。

`onUploadProgress` 在 Fetch 讀 `ReadableStream<Uint8Array>` 請求 body 時觀察。一般 body wrappers 不暴露 raw stream setter — upload progress 主要給低階建構用。

`fetchHandler(httpRequest, fetchImpl?)` 是較低階的 Fetch 邊界：建立原生 `Request`、呼叫 Fetch、讀 representation、回傳 `HttpResponse`。它**不會**驗證 command input、分派 `output`，或跑 interceptors。適合注入傳輸測試 — 不能取代 `client.execute`。

## 重放限制

Defjs **不會**自動重試 HTTP。重試讀取仍需要審過的逾時／網路／重複政策。重試 mutation 需要可重放的 bytes、伺服器支援、綁定 auth 範圍 + request bytes 的 idempotency key，以及接收端的重複政策。

Client／command／Fetch 邊界無法知道失敗的寫入有沒有提交。把重放決策放在應用程式或審過的 interceptor。Interceptors 可以 short-circuit 或替換低階 request；最終 status 與 body 仍須滿足 command 契約。

## 相關 recipes

- [已宣告 404 的 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [取消 HTTP 呼叫](../recipes/cancel-http.md)
- [用本機 Fetch handle 測試](../recipes/test-with-handle.md)
