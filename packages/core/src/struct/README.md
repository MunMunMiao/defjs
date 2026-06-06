# struct

`struct` 是 TypeScript 里的 Go struct 心智：声明字段、描述外部协议里的字段名，并让 endpoint 在边界完成解析和编码。它不是 validation DSL，也不提供一整套字符串、数字、数组的快捷约束。

## 基本使用

```ts
import { defineRequest, struct, tag, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.string(),
  name: struct.string().tag(tag.json('user_name')),
  age: struct.number(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  output: {
    200: User,
  },
})
```

HTTP、SSE、WebSocket endpoint 会在运行时用同一份 struct metadata 解析 input、output 和 message payload。struct 实例本身不开放 `parse` / `parseAsync` / `encode`。

## 类型

只导出一个类型推断工具：

```ts
type User = Infer<typeof User>
```

`Infer<T>` 表示边界解析后的输出类型。`tag.*(...)` 只影响对应外部协议里的字段名，不改变输出类型。

## 字段

常用字段构造器：

```ts
struct.string()
struct.number()
struct.boolean()
struct.date()
struct.bigint()
struct.array(struct.string())
struct.record(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.string() })
struct.or(struct.string(), struct.number())
struct.discriminatedUnion('type', [
  struct.object({ type: struct.literal('message'), body: struct.string() }),
  struct.object({ type: struct.literal('count'), count: struct.number() }),
])
```

缺失字段会走对应类型的零值。可选字段使用 `optional()`，空值字段使用 `null()` 或 `nullish()`。

## 自定义规则

没有内建的 `email()`、`min()`、`int()` 这类快捷方法，也不把业务校验塞进 struct 链式 API。struct 只负责边界结构；业务约束放在应用层、路由层或单独的 validator 里：

```ts
const UserId = struct.string()

function assertUserId(id: string) {
  if (!id.startsWith('u_')) {
    throw new Error('invalid user id')
  }
}

const id: Infer<typeof UserId> = 'u_1'
assertUserId(id)
```

## Tag

`tag` 对齐 Go struct tag 的心智模型：它是字段上的外部表示声明，类似 Go 的 ``json:"user_name"``、``query:"include_profile"`` 或 ``header:"x-trace-id"``。它只改名，不改变 TypeScript 字段名，也不决定字段属于哪个 request section。

```ts
const Query = struct.object({
  pageSize: struct.number().tag(tag.json('page_size')),
})
```

JSON response 中的 `{ "page_size": 50 }` 会在 endpoint runtime 中解析成 `{ pageSize: 50 }`；JSON request body 也会在 build/runtime 边界按 `tag.json(...)` 输出 wire key。query、headers、path、urlencoded 和 FormData 分别由 `tag.query(...)`、`tag.header(...)`、`tag.uri(...)`、`tag.urlencoded(...)`、`tag.multipart(...)` 表达。

## Request Shape

endpoint 默认请求构建使用 `struct.request(...)` 表达 request sections。字段属于哪里，由 section 决定：

```ts
const Input = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().optional().tag(tag.query('include_profile')),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.json(struct.object({
    name: struct.string().tag(tag.json('display_name')),
  })),
})
```

`path`、`query`、`headers` 只接受 flat object；body codec 由 `struct.json(...)`、`struct.urlencoded(...)`、`struct.formData(...)`、`struct.text()`、`struct.blob()` 或 `struct.arrayBuffer()` 决定。

`defineRequest` 不再提供 endpoint 级 body selector。body 怎么编码，必须写在 `struct.request({ body: ... })` 里。

`Content-Type` 由单一路径合成：先写 `headers`，再由最终 body 阶段决定是否覆盖、删除或保留。JSON、text、HTML、XML、urlencoded body 会设置各自默认类型；`contentType` 可显式覆盖，`contentType: null` 表示删除并抑制推断。`FormData` 不限制用户设置 header，但最终会删除 `Content-Type`，交给运行时补 multipart boundary。`Blob` / `File` 优先使用自身 `type`，没有 `type` 时使用 `application/octet-stream`；`ArrayBuffer`、`ReadableStream` 和其它无类型二进制 body 也使用 `application/octet-stream`。没有 body 时不会新增或覆盖 `Content-Type`。

## Build Plan

`build(ctx, input)` 不是序列化阶段，而是编排阶段。带 `input` schema 的 endpoint 中，`input` 不是实际业务值，而是由 `struct.request(...)` 生成的 bound view。这个 view 记录字段路径和字段 struct，运行时再用实际入参提取值并编码。

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.number().tag(tag.uri('id')),
  }),
  query: struct.object({
    includeProfile: struct.boolean().tag(tag.query('include_profile')),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.json(struct.object({
    profile: struct.object({
      displayName: struct.string().tag(tag.json('display_name')),
    }),
  })),
})

const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.setPathParams({
      id: input.path.userId,
    })

    ctx.setJson({
      name: input.body.profile.displayName,
      data: {
        userId: input.path.userId,
        traceId: input.headers.traceId,
        includeProfile: input.query.includeProfile,
      },
    })
  },
})
```

实际调用：

```ts
updateUser({
  path: { userId: 1 },
  query: { includeProfile: true },
  headers: { traceId: '123' },
  body: {
    profile: {
      displayName: 'John Doe',
    },
  },
})
```

`setJson` 实际发送：

```ts
{
  "name": "John Doe",
  "data": {
    "userId": 1,
    "traceId": "123",
    "includeProfile": true
  }
}
```

build plan 的规则：

1. projection 的 key 可以自由命名。
2. projection 的 value 必须来自 `build` 参数里的 `input` bound field；不能把独立声明的 field struct 拿到外面复用，也不能直接写 runtime literal。
3. `ctx.setPathParams(...)`、`ctx.setQueryParams(...)`、`ctx.setHeaders(...)`、`ctx.setFormUrlEncoded(...)`、`ctx.setFormData(...)` 只接受 flat projection。
4. `ctx.setJson(...)` 支持嵌套 object projection。
5. 同一个 request 区域可以调用多次；`path`、`query`、`headers`、`body` 都按最后一次写入为准，不做 merge。
6. array 只支持 `map(...)` 生成 `ArrayProjection`，不支持 `filter`、`reduce` 或其它数据运算。

```ts
const BulkInput = struct.request({
  body: struct.json(struct.object({
    users: struct.array(struct.object({
      id: struct.number(),
      name: struct.string(),
      password: struct.string(),
    })),
  })),
})

defineRequest({
  method: 'POST',
  path: '/users',
  input: BulkInput,
  build(ctx, input) {
    ctx.setJson({
      users: input.body.users.map(user => ({
        id: user.id,
        name: user.name,
      })),
    })
  },
})
```

如果不写 `build`，`struct.request(...)` 会按 section 默认构建请求：

1. `path` → path params。
2. `query` → query params。
3. `headers` → HTTP headers。
4. `body` → wrapper 指定的 body codec。

SSE request input 不支持 `body` section；WebSocket request input 只支持 `path` 和 `query` section。

## Decode Policy

Object 始终丢弃未知字段，接近 Go JSON 默认行为。这里不提供“拒绝未知字段”模式；struct 只负责边界解析，不负责把输入对象变成额外的校验 DSL。

```ts
const User = struct.object({ id: struct.string() })

endpoint runtime 收到 `{ "id": "u_1", "extra": "ignored" }` 时，输出值只包含 `{ id: 'u_1' }`。
```

## 递归结构

没有显式递归构造器。递归 object 使用 getter 表达字段懒读取：

```ts
type Category = {
  children: Category[]
  id: string
}

const Category = struct.object({
  id: struct.string(),
  get children() {
    return struct.array(Category)
  },
})

endpoint runtime 可以解析 `{ "id": "root", "children": [] }` 这样的递归 JSON payload。
```
