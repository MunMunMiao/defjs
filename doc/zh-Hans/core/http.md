---
title: HTTP
description: 定义请求，execute，按状态分支，用 signal 或 timeout 取消。
---

# HTTP

定义 → execute → 看 tuple 分支 → 页面走了就取消。HTTP 环就这些。

## 基本用法

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

`withEndpoint(...)` 要合法绝对 URL。Endpoint pathname 当目录留下；query 和 hash 在 command 解析前丢掉。

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

Path 占位符是原始标量，恰好编码一次。空值以及 `.` / `..` 会拒绝。一个占位符里的斜杠、`?`、`#`、`%`、空格、Unicode 仍是一个编码段——别预先编码。

Definition path 不能含 `?` 或 `#`，也不能是绝对或协议相对。默认 query 编码器接受标量和标量数组。嵌套/复杂 query 值需要 `withQueryParamsSerializer(...)`，否则构造失败。

## 编码输入

`struct.request(...)` 把 path、query、headers、body 分开。Body wrapper 决定 codec 和 content type：

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

Alias 只改写出线上的 key。解析值和 command 输入仍用逻辑名。

| Wrapper                    | 运行时 body       | 默认 content type                                        |
| -------------------------- | ----------------- | -------------------------------------------------------- |
| `struct.json(inner)`       | JSON 字符串       | `application/json`                                       |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                               |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`        |
| `struct.formData(shape)`   | `FormData`        | 平台 multipart boundary；Defjs 清掉过期的 `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type 或 `application/octet-stream`                  |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                               |

自定义 `build` 暴露同样的 location/codec setter。最后一次 body 写入胜出（值 + content-type 元数据）。高层 command 不会把任意对象变成 body——声明 wrapper，或用匹配的 setter。

## 按状态分派

`output` 是 status → Struct 映射或 `{ status, body }[]`。有 `output` 且没写 `responseType` 时，表示默认是 `json`。显式类型：`json`、`text`、`blob`、`arraybuffer`。

顺序：

1. 状态 `0` → 传输错误。
2. 无 `output` → 2xx 成功且 `data === undefined`；非 2xx → `HTTP_STATUS` 且 `error.data === undefined`。Body 不解码。
3. 有 `output` 时，精确声明状态选中其 Struct。数组形式：后面的匹配覆盖前面的分组匹配。
4. 未声明状态 → body 解码**之前**就是 `UNDECLARED_STATUS`。
5. 表示失败 → `RESPONSE_VALIDATION_FAILED`，没有半成品 data。
6. 解码后的声明 2xx → 结果；解码后的声明非 2xx → `HTTP_STATUS` 上的类型化 `error.data`。

`HttpResponse` 有 `url`、`status`、`statusText`、`headers`、`body`、`error`、`ok`。`ok` 只表示 `200 <= status < 300`。这是 Defjs 值，不是原生 `Response`。没有 `output` 时不允许 `responseType`。

## 取消工作

执行 options 收 `signal`，再配 `abort` 或 `timeout` 其一。**`abort` 和 `timeout` 互斥。** `signal` 可以跟其中任一个搭配。

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

`timeout` 必须是 `1..2_147_483_647` 的正 safe integer。识别出的取消 → `ABORTED`；执行超时 → `TIMEOUT`；其他 Fetch/interceptor 失败 → `NETWORK_ERROR`。服务端已接受写入后的取消，**不能**证明写入回滚了。

## Credentials 与 XSRF

`withCredentials(true)` 给 HTTP 和 SSE 设 Fetch `credentials: 'include'`。它不创建 `Authorization`，也不配置 WebSocket 鉴权。`false` 则不指定 credentials。

`withXSRF(...)` 只作用于 HTTP。默认：`cookieName: 'XSRF-TOKEN'`，`headerName: 'X-XSRF-TOKEN'`。Header 只在非安全方法、调用方还没设、且是同源浏览器请求时注入。跳过 `GET`、`HEAD`、`OPTIONS`、`TRACE`。浏览器外若要注入，传同步的请求作用域 `tokenProvider`。

日常日志里别带 credentials、XSRF token、query 字符串。别把 query 当通用凭证通道。

## Progress 与 Fetch 边界

`onDownloadProgress` 在显式响应表示被读取时跑。只有正的 `Content-Length` 时 `lengthComputable` 才为 true。没有 `responseType` → 不解码 body → 也没有 body 读取进度。

`onUploadProgress` 盯着 Fetch 读取的 `ReadableStream<Uint8Array>` 请求 body。普通 body wrapper 不暴露原始 stream setter——上传进度主要给底层构造用。

`fetchHandler(httpRequest, fetchImpl?)` 是更底层的 Fetch 边界：拼原生 `Request`、调 Fetch、读表示、返回 `HttpResponse`。它**不**校验 command 输入、不按 `output` 分派、不跑 interceptor。适合注入传输测试——不能替代 `client.execute`。

## 重放限制

Defjs **不会**自动重试 HTTP。重试读仍要有审过的超时/网络/重复政策。重试 mutation 需要可重放字节、服务端支持、绑定鉴权作用域 + 请求字节的幂等 key，以及接收方去重政策。

Client/command/Fetch 边界没法知道失败写入是否已提交。重放决策放在应用或审过的 interceptor。Interceptor 可以短路或替换底层请求；最终状态和 body 仍须满足 command 契约。

## 相关配方

- [声明了 404 的 GET](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [取消一次 HTTP](../recipes/cancel-http.md)
- [用本地 Fetch handle 做测试](../recipes/test-with-handle.md)
