---
title: HTTP
description: Define 一個 request，execute 佢，按 status 分支，再用 signal 或者 timeout cancel。
---

# HTTP

Define → execute → 按 tuple 分支 → screen 離開就 cancel。呢個就係成個 HTTP loop。

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## Resolve URL

`withEndpoint(...)` 要有效嘅 absolute URL。Endpoint pathname 當 directory 留住；query 同 hash 會喺 command resolution 之前丟棄。

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

Path placeholders 係 raw scalars，encode 剛好一次。Empty values 同 `.` / `..` 會被 reject。一個 placeholder 入面嘅 slashes、`?`、`#`、`%`、spaces 同 Unicode 仍然係一個 encoded segment — 唔好 pre-encode。

Definition path 唔可以有 `?` 或者 `#`，亦唔可以係 absolute 或者 protocol-relative。Default query encoder 接受 scalars 同 arrays of scalars。Nested/complex query values 要 `withQueryParamsSerializer(...)`，否則 construction 會 fail。

## Encode input

`struct.request(...)` 將 path、query、headers 同 body 分開。Body wrapper 揀 codec 同 content type：

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
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
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

Aliases 淨係 rewrite outbound wire keys。Parsed values 同 command inputs 保留 logical names。

| Wrapper                    | Runtime body      | Default content type                                         |
| -------------------------- | ----------------- | ------------------------------------------------------------ |
| `struct.json(inner)`       | JSON string       | `application/json`                                           |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                   |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`            |
| `struct.formData(shape)`   | `FormData`        | Platform multipart boundary；Defjs 會清 stale `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type 或者 `application/octet-stream`                    |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                   |

Custom `build` 暴露同一套 location/codec setters。最後一次 body write 贏（value + content-type metadata）。High-level commands 唔會將 arbitrary object 變做 body — 要 declare wrapper，或者用 matching setter。

## body 點讀

`output` 係 2xx body 嘅單一 Struct；`error` 係其餘一切嘅單一 Struct。任何一個聲明咗而又冇寫 `responseType`，representation 就預設係 `json`。明示類型：`json`、`text`、`blob`、`arraybuffer`。兩個都冇聲明就唔准用 `responseType`，body 亦根本唔會被讀。

次序：

1. `ok` 揀邊：2xx 走 `output`，其餘走 `error`。絕對唔會兩邊都走。
2. 嗰一邊冇聲明 → body 根本唔會被讀。2xx 成功而 `data === undefined`；非 2xx 係 `HTTP_STATUS` 而 `data === undefined`。你冇聲明嗰一邊嘅 body 解唔出會被完全忽略，連「佢解唔出」呢件事都忽略。
3. Media type 喺讀 body **之前**就查。唔對就係 `RES_MEDIA_TYPE_INVALID`，唔會 parse 亦唔會解碼。
4. 讀 representation。失敗係 `RES_DECODE_FAILED`。
5. Struct 解析個值。失敗係 `RES_STRUCT_MISMATCH`。
6. 2xx → 結果加一個有 type 嘅 `response.body`；非 2xx → `HTTP_STATUS` 上面有 type 嘅 `data`。

解碼只發生一次，而且喺 interceptor chain 之後，所以 interceptor 用 `makeResponse(...)` 造嘅 response，同線上嚟嘅讀法一模一樣。

成功嘅 response 係 `DecodedResponse<T>`：`url`、`status`、`statusText`、`headers`、`ok`，再加一個有 type 嘅 `body`。冇解碼到任何嘢嘅時候你拿到 `HttpMeta`——一樣嘅 fields，只係冇 `body`。`ok` 只表示 `200 <= status < 300`。兩者都唔係原生 `Response`。Transport failure 係 fault，所以唔存在代表佢嘅 status-0 response。

## Cancel the work {#cancel-the-work}

Execution options 收 `signal`，再加 `abort` 或者 `timeout`。**`abort` 同 `timeout` 互斥。** `signal` 可以同其中一個一齊用。

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` 一定要係 `1..2_147_483_647` 入面嘅 positive safe integer。Recognized cancel → `NET_ABORTED`；execution timeout → `NET_TIMEOUT`；其他 Fetch/interceptor failures → `NET_UNREACHABLE`。Server 接受咗 write 之後再 cancel，**唔**證明 write 已經 rollback。

## Credentials 同 XSRF

`withCredentials(true)` 為 HTTP 同 SSE set Fetch `credentials: 'include'`。佢唔會 create `Authorization`，亦唔會 configure WebSocket auth。`false` 會留 credentials unspecified。

`withXSRF(...)` 淨係 HTTP。Defaults：`cookieName: 'XSRF-TOKEN'`，`headerName: 'X-XSRF-TOKEN'`。Header 淨係為 non-safe methods inject，而且只喺 caller 未 set、同埋 same-origin browser requests 時。Skip `GET`、`HEAD`、`OPTIONS`、`TRACE`。喺 browser 之外，如果需要 injection，就傳 synchronous request-scoped `tokenProvider`。

Keep credentials、XSRF tokens 同 query strings 出日常 logs。唔好用 query params 當一般 credential channel。

## Progress 同 Fetch boundary

`onDownloadProgress` 會喺讀 explicit response representation 時 run。`lengthComputable` 淨係喺有 positive `Content-Length` 時先係 true。冇 `responseType` → 冇 body decode → 冇 body-read progress。

`onUploadProgress` 睇住 Fetch 讀 `ReadableStream<Uint8Array>` request body。Normal body wrappers 唔暴露 raw stream setter — upload progress 主要用喺 low-level construction。

`fetchHandler(httpRequest, fetchImpl?)` 係更低層嘅 Fetch boundary：build native `Request`，call Fetch，讀 representation，return `HttpResponse`。佢 **唔會** validate command input、dispatch `output`，或者 run interceptors。對 injected transport tests 有用 — 唔係 `client.execute` 嘅替代品。

## Replay limits

Defjs **唔會** auto-retry HTTP。Retry 一次 read 仍然要有 reviewed timeout/network/duplicate policy。Retry 一次 mutation 要 replayable bytes、server support、綁住 auth scope + request bytes 嘅 idempotency key，同 receiver duplicate policy。

Client/command/Fetch boundary 唔知 failed write 有冇 commit。將 replay decisions 留喺 app 或者 reviewed interceptor。Interceptors 可以 short-circuit 或者 replace low-level request；最終 status 同 body 仍然要滿足 command 嘅 contract。

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Cancel an HTTP call](../recipes/cancel-http.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)
