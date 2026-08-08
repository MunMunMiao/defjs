---
title: Commands
description: 定义 endpoint，创建 command builder 和 command，把 Struct 输入映射到 wire，并推断 HTTP output 类型。
---

# Commands

Defjs 分为三个相关阶段：

1. **端点定义（endpoint definition）**描述稳定的 HTTP、SSE 或 WebSocket 契约。
2. **Command builder** 是 `defineRequest`、`defineEventStream` 或 `defineWebSocket` 返回的函数。
3. **Command** 是调用 builder 并传入 input 后得到的值。把它传给 `client.execute(...)`。

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

这里，传给 `defineRequest` 的对象是端点定义，`getUser` 是 command builder，`command` 是 command。

## HTTP 端点定义

`defineRequest(...)` 接受以下字段：

| 字段           | 含义                                                                                |
| -------------- | ----------------------------------------------------------------------------------- |
| `method`       | HTTP method 字符串。                                                                |
| `path`         | 相对 endpoint path，可以包含 `:name` placeholder。                                  |
| `input`        | 对 command input 做结构化解码的 Struct。                                            |
| `build`        | 把 input 字段投影到 request part 的 schema-bound projection。必须同时提供 `input`。 |
| `output`       | 用于 response 解码和结果推断的 status-to-Struct 映射。                              |
| `responseType` | 可选的 `json`、`text`、`blob` 或 `arraybuffer` response mode。                      |

Command 字段直接对应 wire section 时，使用 `struct.request(...)`：

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

调用方使用逻辑字段名，alias 决定 wire key。

## Command Builder 参数可选性

没有 `input` 的 builder 不接收参数：

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Object Struct 的输入属性在类型层面都是可选的，request section 也可选。结构化解码会用零值填充非 optional output 字段，因此这两种 shape 都不会让 builder 参数变成必填。

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

如果 builder 必须接收参数，请使用 primitive 或 array input。下面用 primitive，并把它投影到 path parameter：

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

这只是参数可选性，不是业务校验。调用方仍可传入 Struct input type 接受的值；缺失的 object field 会得到零值。

## 自动构建请求

当 `input` 是 `struct.request(...)` 且没有提供 `build` 时，Defjs 会自动映射已声明的 section：

- `path` 替换 path placeholder；
- `query` 变成 query parameter；
- `headers` 变成 request header；
- `body` 使用对应的 body wrapper。

Request body 必须声明受支持的 boundary：

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

不要在 `request.body` 中直接放裸 `struct.object(...)`；`struct.request(...)` 会拒绝它。HTTP 支持所有 body 形式。SSE 不接受 body section，WebSocket 不接受 headers 和 body section。

## 自定义 `build`

逻辑字段需要映射到不同 wire 位置或 key 时，使用 `build(request, input)`。`input` 参数是 **schema-bound projection（受 schema 约束的投影）**，不是已解析的调用方运行时值。

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

- 选择已声明字段；
- 指定目标 wire key；
- 用 `.map(...)` 对数组做 item-to-item 投影；
- 把选中的对象绑定到 JSON 时，按字段 alias 编码。

投影不能检查调用方的值、按值分支、执行任意 transform、改变数组基数或注入字面量。例如，`request.setJson({ version: 'v1' })` 不是有效投影，因为 `'v1'` 不来自 input binding view。

创建 command 之前，在应用层完成数据标准化和校验。`build` 只负责声明式 wire mapping。

### Build 能力

| Target                                                | HTTP | SSE    | WebSocket |
| ----------------------------------------------------- | ---- | ------ | --------- |
| `setPathParams`, `setQueryParams`                     | 支持 | 支持   | 支持      |
| `setHeaders`, `addHeaders`                            | 支持 | 支持   | 不支持    |
| JSON、text、HTML、form、Blob、ArrayBuffer body method | 支持 | 不支持 | 不支持    |

TypeScript build context 会按 transport 收窄。即使绕过类型检查，runtime 也会拒绝不支持的输出。

## HTTP Output 推断

`output` 支持 object map 或 status/body pair 数组：

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

HTTP 成功类型是所有已声明 2xx body 的 union。`error.data` 是所有已声明非 2xx body 的 union。数组形式需要 `as const`，才能保留 status 字面量和分组 readonly 数组。

声明 `output` 后，每个返回的 status 都必须有匹配的 Struct。无论 2xx 还是非 2xx，未匹配都会产生 `UNDECLARED_STATUS`。省略 `output` 时，response body 会被忽略，结果是 `undefined`。

## SSE 与 WebSocket 定义

`defineEventStream(...)` 用 `events` map 取代 HTTP `output`。Event name 选择 Struct；可选的 `default` entry 在 runtime 处理未声明名称。

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` 声明 `incoming` 和可选的 `outgoing` message map。Message envelope 使用 `type` discriminator。

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

解码、queue、reconnect 和关闭所有权见 [SSE](/zh-Hans/core/sse) 与 [WebSocket](/zh-Hans/core/web-socket)。

## 把 Command 当作不透明值

应用代码应创建 command，并直接传给 `Client.execute(...)`。不要依赖 transport tag 或结构反射。

Root entry 目前会导出 transport command interface 和低层 executor function。推荐流程不需要这些导出，它们的长期稳定性承诺也尚未在本文档中确定。Runtime dispatch 使用的 command tag symbol 和 guard function 并未从 root 导出。

## 下一步

- [Client](/zh-Hans/core/client)：execution overload 和 option 组合。
- [HTTP](/zh-Hans/core/http)：URL、编码、response 和取消行为。
- [Struct](/zh-Hans/core/struct)：结构化解码和零值。
