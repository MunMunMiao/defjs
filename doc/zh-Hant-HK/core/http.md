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

## 按 status dispatch

`output` 係 status → Struct map，或者 `{ status, body }[]`。有 `output` 又冇 `responseType` 時，representation 預設係 `json`。Explicit types：`json`、`text`、`blob`、`arraybuffer`。

操作次序：

1. Status `0` → transport error。
2. 冇 `output` → 2xx succeeds，`data === undefined`；non-2xx → `HTTP_STATUS`，`error.data === undefined`。Body 唔 decode。
3. 有 `output` 時，exact declared status 揀佢嘅 Struct。Array form：之後嘅 match override 之前嘅 grouped match。
4. Undeclared status → 喺 body decode **之前**就 `UNDECLARED_STATUS`。
5. Representation failure → `RESPONSE_VALIDATION_FAILED`，冇 partial data。
6. Decoded declared 2xx → result；decoded declared non-2xx → `HTTP_STATUS` 上嘅 typed `error.data`。

`HttpResponse` 有 `url`、`status`、`statusText`、`headers`、`body`、`error` 同 `ok`。`ok` 淨係指 `200 <= status < 300`。佢係 Defjs value，唔係 native `Response`。冇 `output` 時唔允許 `responseType`。

## Cancel the work

Execution options 收 `signal`，再加 `abort` 或者 `timeout`。**`abort` 同 `timeout` 互斥。** `signal` 可以同其中一個一齊用。

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

`timeout` 一定要係 `1..2_147_483_647` 入面嘅 positive safe integer。Recognized cancel → `ABORTED`；execution timeout → `TIMEOUT`；其他 Fetch/interceptor failures → `NETWORK_ERROR`。Server 接受咗 write 之後再 cancel，**唔**證明 write 已經 rollback。

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
