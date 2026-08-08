---
title: Commands
description: 定義 endpoint、建立 command builder 與 command、把 Struct input 對應至 wire，並推斷 HTTP output type。
---

# Commands

Defjs 的流程分為三個不同階段：

1. **Endpoint 定義（endpoint definition）**描述穩定的 HTTP、SSE 或 WebSocket contract。
2. **Command builder** 是 `defineRequest`、`defineEventStream` 或 `defineWebSocket` 回傳的函式。
3. **Command** 是呼叫 builder 並傳入 input 後得到的值，再交給 `client.execute(...)`。

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

這裏傳給 `defineRequest` 的 object 是 endpoint 定義，`getUser` 是 command builder，`command` 則是 command。

## HTTP Endpoint 定義

`defineRequest(...)` 接受以下欄位：

| 欄位           | 意思                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `method`       | HTTP method string。                                                                |
| `path`         | 相對 endpoint path，可包含 `:name` placeholder。                                    |
| `input`        | 對 command input 作結構式解碼的 Struct。                                            |
| `build`        | 把 input 欄位投影至 request part 的 schema-bound projection；必須同時提供 `input`。 |
| `output`       | 用於 response decoding 與 result inference 的 status-to-Struct mapping。            |
| `responseType` | 可選的 `json`、`text`、`blob` 或 `arraybuffer` response mode。                      |

Command 欄位直接對應 wire section 時，使用 `struct.request(...)`：

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

呼叫方使用 logical field name；alias 決定 wire key。

## Command Builder 的 Argument 是否可省略

沒有 `input` 的 builder 不接收 argument：

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Object Struct 的 input property 在 type level 全部 optional，request section 亦可省略。結構式解碼會以零值填入 non-optional output 欄位，所以這兩種 shape 都不會令 builder argument 成為必填。

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

如果 builder 必須接收 argument，請使用 primitive 或 array input。以下用 primitive，並投影至 path parameter：

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

這只控制 argument optionality，不是 business validation。呼叫方仍可傳入 Struct input type 接受的值；缺少的 object 欄位會得到零值。

## 自動建立 Request

當 `input` 是 `struct.request(...)` 而且省略 `build`，Defjs 會自動對應已宣告的 section：

- `path` 取代 path placeholder；
- `query` 變成 query parameter；
- `headers` 變成 request header；
- `body` 使用對應的 body wrapper。

Request body 必須宣告受支援的 boundary：

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

不要把裸 `struct.object(...)` 直接放入 `request.body`；`struct.request(...)` 會拒絕。HTTP 支援所有 body form；SSE 不接受 body section；WebSocket 則不接受 headers 或 body section。

## 自訂 `build`

邏輯欄位要對應至不同 wire location 或 key 時，使用 `build(request, input)`。這裏的 `input` 是 **schema-bound projection**，不是已解析的呼叫方 runtime value。

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

Projection 可以：

- 選取已宣告欄位；
- 指定 target wire key；
- 用 `.map(...)` 作 array item-to-item projection；
- 把選取的 object 綁定至 JSON 時，按 field alias 編碼。

Projection 不能檢查呼叫方的值、按值分支、執行任意 transform、改變 array cardinality，或注入 literal value。例如，`request.setJson({ version: 'v1' })` 不是有效 projection，因為 `'v1'` 並非來自 input binding view。

建立 command 前，先在應用層完成資料 normalization 與 business validation。`build` 只負責 declarative wire mapping。

### Build 能力

| Target                                                | HTTP | SSE    | WebSocket |
| ----------------------------------------------------- | ---- | ------ | --------- |
| `setPathParams`, `setQueryParams`                     | 支援 | 支援   | 支援      |
| `setHeaders`, `addHeaders`                            | 支援 | 支援   | 不支援    |
| JSON、text、HTML、form、Blob、ArrayBuffer body method | 支援 | 不支援 | 不支援    |

TypeScript build context 會按 transport 收窄。即使繞過 type checking，runtime 仍會拒絕不受支援的 output。

## HTTP Output Inference

`output` 支援 object map 或 status/body pair array：

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

HTTP success type 是所有已宣告 2xx body 的 union。`error.data` 則是所有已宣告 non-2xx body 的 union。Array form 需要 `as const`，才可保留 status literal 與 grouped readonly array。

宣告 `output` 後，每個回傳 status 都要有 matching Struct。無論 2xx 或 non-2xx，未匹配都會產生 `UNDECLARED_STATUS`。省略 `output` 時，response body 會被忽略，result 是 `undefined`。

## SSE 與 WebSocket 定義

`defineEventStream(...)` 以 `events` map 取代 HTTP `output`。Event name 決定使用哪個 Struct；optional `default` entry 會在 runtime 處理未宣告名稱。

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` 宣告 `incoming` 與 optional `outgoing` message map。Message envelope 使用 `type` discriminator。

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

Decoding、queue、reconnect 與 close ownership 見 [SSE](/zh-Hant-HK/core/sse) 及 [WebSocket](/zh-Hant-HK/core/web-socket)。

## 把 Command 視為 Opaque Value

應用程式碼應建立 command，然後直接傳給 `Client.execute(...)`。不要依賴 transport tag 或 structural reflection。

Root entry 目前會匯出 transport command interface 與 low-level executor function。建議的 high-level workflow 不需要這些 export，而這份文件亦未確立其長期 stability commitment。Runtime dispatch 所用的 command tag symbol 與 guard function 並非 root export。

## 下一步

- [Client](/zh-Hant-HK/core/client)：execute overload 與 option composition。
- [HTTP](/zh-Hant-HK/core/http)：URL、encoding、response 與 cancellation 行為。
- [Struct](/zh-Hant-HK/core/struct)：結構式解碼與零值。
