---
title: 指令
description: 定義端點、建立指令建構器與指令、將 Struct 輸入對應到 wire，並推導 HTTP 輸出型別。
---

# 指令

Defjs 有三個彼此相關的階段：

1. **端點定義**描述穩定的 HTTP、SSE 或 WebSocket 契約。
2. **指令建構器**是 `defineRequest`、`defineEventStream` 或 `defineWebSocket` 回傳的函式。
3. **指令**是呼叫建構器並傳入輸入後得到的值。把這個指令交給 `client.execute(...)`。

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

這裡傳給 `defineRequest` 的物件是端點定義，`getUser` 是指令建構器，`command` 則是指令。

## HTTP 端點定義

`defineRequest(...)` 接受下列欄位：

| 欄位           | 意義                                                                 |
| -------------- | -------------------------------------------------------------------- |
| `method`       | HTTP method 字串。                                                   |
| `path`         | 相對端點路徑，可包含 `:name` placeholder。                           |
| `input`        | 對指令輸入做結構解碼的 Struct。                                      |
| `build`        | 將輸入欄位對應到請求各部分的結構描述綁定投影。必須同時提供 `input`。 |
| `output`       | 用於回應解碼與結果推導的 status-to-Struct 對應。                     |
| `responseType` | 選用的 `json`、`text`、`blob` 或 `arraybuffer` 回應模式。            |

指令欄位會直接對應到 wire section 時，請使用 `struct.request(...)`：

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

呼叫端使用邏輯欄位名稱，alias 則決定 wire key。

## 指令建構器的引數可省略性

沒有 `input` 的建構器不接受引數：

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Object Struct 的輸入在型別層級是 partial，呼叫端可以省略每個 object property。Request section 也都可以省略。結構解碼會用零值補上非 optional 的輸出欄位，所以這兩種形狀都不會讓建構器引數成為必填。

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search() // Accepted. The decoded q value is ''.
search({ query: { q: 'docs' } })
```

若建構器一定要收到引數，請使用 primitive 或 array 輸入。以下範例使用 primitive，並投影到 path parameter：

```typescript
const getUserById = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.number(),
  build(request, input) {
    request.setPathParams({ id: input })
  },
})

// getUserById() // TypeScript error: an argument is required.
getUserById(42)
```

這說的是引數能不能省略，不是商務規則驗證。呼叫端仍可傳入 Struct input type 接受的值，遺漏的 object field 則會取得零值。

## 自動建構請求

`input` 是 `struct.request(...)` 且省略 `build` 時，Defjs 會自動對應已宣告的 section：

- `path` 取代 path placeholder。
- `query` 變成 query parameter。
- `headers` 變成 request header。
- `body` 使用它自己的 body wrapper。

Request body 必須宣告受支援的 boundary：

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

不要把裸的 `struct.object(...)` 放進 `request.body`；`struct.request(...)` 會拒絕它。HTTP 支援所有 body 形式，SSE 不接受 body section，WebSocket 則同時不接受 headers 與 body section。

## 自訂 `build`

邏輯欄位需要放到不同 wire 位置或使用不同 key 時，請用 `build(request, input)`。其中 `input` 是**結構描述綁定投影**，只表示欄位綁定，不提供呼叫端的執行階段值。

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

投影可以：

- 選取已宣告欄位；
- 指定目標 wire key；
- 用 `.map(...)` 對陣列做一個輸入項目對一個輸出項目的投影；
- 把選取的物件綁定到 JSON 時，使用該物件欄位的 alias 編碼。

投影不能檢查呼叫端值、依值分支、進行任意轉換、改變陣列項目數量，或注入 literal 值。例如，`request.setJson({ version: 'v1' })` 不是有效投影，因為 `'v1'` 並非來自輸入綁定檢視。

請在建立指令前正規化並驗證應用程式資料。`build` 只負責宣告式 wire mapping。

### Build 能力

| 目標                                                  | HTTP | SSE    | WebSocket |
| ----------------------------------------------------- | ---- | ------ | --------- |
| `setPathParams`, `setQueryParams`                     | 支援 | 支援   | 支援      |
| `setHeaders`, `addHeaders`                            | 支援 | 支援   | 不支援    |
| JSON、text、HTML、form、Blob、ArrayBuffer body method | 支援 | 不支援 | 不支援    |

TypeScript build context 會依 transport 提供不同型別。即使繞過型別檢查，執行階段也會拒絕不受支援的輸出。

## HTTP 輸出推導

`output` 支援物件 map，或 status/body pair 陣列：

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

HTTP 成功型別是所有已宣告 2xx body 的 union；`error.data` 是所有已宣告非 2xx body 的 union。陣列形式需要 `as const`，才能保留 status literal 與 grouped readonly array。

宣告 `output` 後，每個實際回傳的 status 都必須有對應 Struct。任何未對應的 2xx 或非 2xx status 都會產生 `UNDECLARED_STATUS`。省略 `output` 時，response body 會被忽略，結果則是 `undefined`。

## SSE 與 WebSocket 定義

`defineEventStream(...)` 用 `events` map 取代 HTTP `output`。Event name 會選擇 Struct，選用的 `default` 項目則在執行階段處理未宣告名稱。

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` 會宣告 `incoming` 與選用的 `outgoing` message map。Message envelope 使用 `type` discriminator。

```typescript
const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

解碼、queue、reconnect 與關閉責任請見 [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)。

## 把指令視為不透明值

應用程式程式碼應建立指令，再把它交給 `Client.execute(...)`。不要依賴 transport tag 或結構反射。

目前 root entry 有匯出 transport command interface 與 low-level executor function。建議流程不需要使用這些 export；本文件也尚未建立它們的長期穩定性承諾。執行階段分派所用的 command tag symbol 與 guard function 並未從 root 匯出。

## 下一步

- [Client](/zh-Hant-TW/core/client)說明 execute overload 與選項組合。
- [HTTP](/zh-Hant-TW/core/http)負責 URL、編碼、回應與取消行為。
- [Struct](/zh-Hant-TW/core/struct)說明結構解碼與零值。
