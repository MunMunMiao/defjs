# Request-shaped Struct 与 Go 生态对比

> 文件名保留历史路径。本文是当前 endpoint 默认请求构建合同；当前 public API 心智模型是 `struct.request(...)`。

## 核心结论

endpoint request build 只有两条路径：

1. **request-shaped default build**：不写 `build` 时，`input` 必须是 `struct.request(...)`，由 `path/query/headers/body` request sections 构造请求。
2. **explicit build**：写了 `build(ctx, input)` 后，用户完整接管 request plan；request-shaped default build 不参与，也不做隐式 merge。

`struct.request(...)` 的关键边界：

1. 字段属于 `path`、`query`、`headers` 还是 `body`，由 request section 决定，不由字段上的 `tag.*` 决定。
2. `body` codec 由 body wrapper 决定，例如 `struct.json(...)`、`struct.formData(...)`，不设计 endpoint-level body selector。
3. `path`、`query`、`headers` 只接受 flat object；`struct.json(...)` body 支持 deep object / array。
4. `struct.formData(...)`、`struct.urlencoded(...)` 只接受 flat field object。
5. `tag.*('wire-name')` 是 Go-style field tag，只改 wire key，不决定字段属于哪个 request section。
6. `FormData` 的 `Content-Type` 由运行时设置 boundary，用户 headers 不能覆盖。

## Request-shaped Struct

默认请求构建的输入必须直接描述 request shape：

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.number().tag(tag.uri('id')),
  }),
  query: struct.object({
    includeProfile: struct.boolean().optional().tag(tag.query('include_profile')),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.json(
    struct.object({
      profile: struct.object({
        displayName: struct.string().tag(tag.json('display_name')),
      }),
    }),
  ),
})

const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: Input,
})
```

调用方传入的值保持 request shape：

```ts
{
  path: { userId: 1 },
  query: { includeProfile: true },
  headers: { traceId: '123' },
  body: {
    profile: {
      displayName: 'John Doe',
    },
  },
}
```

materialize 结果：

```text
path    <- { id: 1 }
query   <- { include_profile: true }
headers <- { x-trace-id: '123' }
body    <- JSON.stringify({ profile: { display_name: 'John Doe' } })
```

## Body Wrapper

request shape 只有一个 `body` slot，body wrapper 决定编码方式：

```ts
type RequestBodyStruct =
  | ReturnType<typeof struct.json>
  | ReturnType<typeof struct.urlencoded>
  | ReturnType<typeof struct.formData>
  | ReturnType<typeof struct.text>
  | ReturnType<typeof struct.blob>
  | ReturnType<typeof struct.arrayBuffer>
```

示例：

```ts
const UploadInput = struct.request({
  query: struct.object({
    id: struct.number(),
  }),
  headers: struct.object({
    contentType: struct.string().tag(tag.header('x-content-type')),
  }),
  body: struct.formData({
    uid: struct.number(),
    files: struct.array(struct.file()),
  }),
})
```

规则：

1. `struct.json(...)` 可以包 `struct.object(...)`、`struct.array(...)` 或其他 JSON codec 支持的 struct。
2. `struct.urlencoded(...)` 和 `struct.formData(...)` 只能包 flat object。
3. `struct.text()`、`struct.blob()`、`struct.arrayBuffer()` 绑定单一 body source。
4. 不允许同时声明多个 body wrapper。
5. 不允许 endpoint-level body selector。

## Transport Matrix

request-shaped default build 必须按 transport 裁剪能力：

| request section | HTTP | SSE  | WebSocket |
| --------------- | ---- | ---- | --------- |
| `path`          | 使用 | 使用 | 使用      |
| `query`         | 使用 | 使用 | 使用      |
| `headers`       | 使用 | 使用 | 禁止      |
| `body`          | 使用 | 禁止 | 禁止      |

对应的 explicit build ctx 也必须遵守同一能力矩阵：

| ctx 方法                                                   | HTTP | SSE  | WebSocket |
| ---------------------------------------------------------- | ---- | ---- | --------- |
| `bindPathParams(...)`                                      | 合法 | 合法 | 合法      |
| `bindQueryParams(...)`                                     | 合法 | 合法 | 合法      |
| `bindHeaders(...)`                                         | 合法 | 合法 | 非法      |
| `bindJson(...)`                                            | 合法 | 非法 | 非法      |
| `bindFormUrlEncoded(...)`                                  | 合法 | 非法 | 非法      |
| `bindFormData(...)`                                        | 合法 | 非法 | 非法      |
| `bindText(...)` / `bindBlob(...)` / `bindArrayBuffer(...)` | 合法 | 非法 | 非法      |

## Explicit Build

`build(ctx, input)` 只做编排。`input` 不是 actual runtime value，而是当前 endpoint input tree 的 bound view。

```text
definition-time:
  endpoint.input creates endpoint-local binding registry
  run build(ctx, boundInputView) once
  store BuildPlan

request-time:
  parse actual caller input
  materialize BuildPlan from parsed value
  create concrete request
```

字段 struct 不能单独绑定：

```ts
const id = struct.number()

const Input = struct.request({
  path: struct.object({ id }),
})

defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({ id: input.path.id }) // correct
    // ctx.bindPathParams({ id })             // definition error
  },
})
```

explicit build 可以重组 JSON body：

```ts
const Input = struct.request({
  path: struct.object({
    userId: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().tag(tag.query('include_profile')),
  }),
  headers: struct.object({
    traceId: struct.string().tag(tag.header('x-trace-id')),
  }),
  body: struct.json(
    struct.object({
      profile: struct.object({
        displayName: struct.string().tag(tag.json('display_name')),
      }),
    }),
  ),
})

defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({ id: input.path.userId })
    ctx.bindJson({
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

如果实际传入：

```ts
{
  path: { userId: 1 },
  query: { includeProfile: true },
  headers: { traceId: '123' },
  body: {
    profile: {
      displayName: 'John Doe',
    },
  },
}
```

实际发送的 JSON body 是：

```ts
{
  name: 'John Doe',
  data: {
    userId: 1,
    traceId: '123',
    includeProfile: true,
  },
}
```

## Array Projection

array source 只能在 JSON projection 中通过 `map(...)` 重组：

```ts
const Input = struct.request({
  body: struct.json(
    struct.object({
      users: struct.array(
        struct.object({
          id: struct.number(),
          name: struct.string(),
          password: struct.string(),
        }),
      ),
    }),
  ),
})

defineRequest({
  method: 'POST',
  path: '/users/bulk',
  input: Input,
  build(ctx, input) {
    ctx.bindJson({
      users: input.body.users.map((user) => ({
        id: user.id,
        name: user.name,
      })),
    })
  },
})
```

不支持 `filter`、`reduce`、`flatMap` 或任意回调执行。`map(...)` 是 definition-time projection DSL，不是 runtime array method。

## Go 生态校准

Go server binding 的方向是：

```text
HTTP request -> input struct
```

`zen-kit` client request build 的方向是：

```text
typed input value -> HTTP request
```

二者是对偶启发，不是行为照搬。

| 框架/库                    | Go 生态事实                                                                  | 对 `zen-kit` 的结论                                                               |
| -------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Gin / Echo / Fiber / Hertz | 支持 JSON/form/query/path/header 等来源绑定，也支持 source-specific binder。 | 保留 request sections 和 explicit build，不默认 all-source merge。                |
| Echo / Fiber / Hertz       | 多来源聚合必须定义覆盖顺序。                                                 | `struct.request(...)` 不做隐式 merge；一个字段只能属于一个 request section path。 |
| Huma                       | 一个 input struct 表示整份 request，body 是特殊位置。                        | `struct.request({ path, query, headers, body })` 是合理方向。                     |
| Beego / Buffalo            | body codec 由 Content-Type 或显式方法决定。                                  | client 侧用 body wrapper 静态决定 codec，不用 endpoint-level selector。           |
| `net/http` / Chi           | 手写解析是一等路径。                                                         | `build(ctx, input)` 必须是完整逃生舱。                                            |
| GoFrame                    | fuzzy matching 对 server app 友好。                                          | client SDK 不采用 fuzzy field matching，避免 wire contract 隐式化。               |

## 旧设计迁移

将旧的 field-tag placement 改写为 request-shaped API：

```ts
const Input = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().tag(tag.query('include_profile')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string(),
    }),
  ),
})

defineRequest({
  method: 'POST',
  path: '/users/:id',
  input: Input,
})
```

迁移规则：

1. `tag.uri(...)` -> `struct.request({ path: struct.object(...) })`
2. `tag.query(...)` -> `struct.request({ query: struct.object(...) })`
3. `tag.header(...)` -> `struct.request({ headers: struct.object(...) })`
4. `tag.json(...)` / `tag.urlencoded(...)` / `tag.multipart(...)` -> 对应 body wrapper 内的 wire key
5. endpoint-level body selector -> `body: struct.json(...) | struct.urlencoded(...) | struct.formData(...)`

## 当前实现迁移提醒

当前 checkout 中仍存在旧 tag-based request builder 和测试用例。实现迁移时必须以本文、`defjs-build-options.md` 和 `go-style-endpoint-practices.md` 为目标合同：

1. 默认请求构建只接受 `struct.request(...)` root。
2. primitive / array / union root input 只负责 parse，不做默认 request materialize。
3. HTTP 默认 request materialization 从 request sections 构建 path/query/headers/body。
4. SSE 默认 request materialization 只接受 path/query/headers。
5. WebSocket 默认 request materialization 只接受 path/query。
6. explicit build 存在时，不读取 request-shaped default build。
7. 旧 `tag.*` 不能驱动默认 request placement。

## 完成标准

1. 文档只把 `struct.request(...)` 作为当前默认请求构建概念。
2. 文档不再推荐 endpoint-level body selector。
3. 默认 request materialization 示例全部使用 `struct.request(...)`。
4. explicit build 示例全部从 `build(ctx, input)` 的 `input` bound view 取字段。
5. array projection 只支持 JSON projection 内的 `map(...)`。
6. transport matrix 覆盖 HTTP / SSE / WebSocket。
7. tests 覆盖 request-shaped default build、explicit build takeover、transport-specific guards 和 body wrapper codec。
