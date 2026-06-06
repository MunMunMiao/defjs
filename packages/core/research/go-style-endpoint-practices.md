# Endpoint Build 实践合同

记录日期：2026-05-18

本文是 `defineRequest`、`defineEventStream`、`defineWebSocket` 的实践版合同。详细类型、registry 和 materialize 伪代码以 `packages/core/research/defjs-build-options.md` 为准。

## 核心合同

endpoint request build 只有两种模式：

1. 默认 request materialization：通过 `struct.request(...)` 的 request shape 生成 request。
2. explicit build：通过 `build(ctx, input)` 显式编排 request。

写了 `build` 后，request-shaped 默认构建不再参与。`build(ctx, input)` 不读取 actual parsed value，只记录当前 endpoint input struct 的绑定关系。

```text
definition-time:
  struct creates endpoint-local binding registry from endpoint.input
  run build(ctx, boundInputView)
  store BuildPlan

request-time:
  parse actual caller input
  materialize BuildPlan
  create concrete request
```

## Request-shaped 默认路径

默认 request materialization 消费 `struct.request(...)` 的 request sections。

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
    profile: struct.object({
      displayName: struct.string().tag(tag.json('display_name')),
    }),
  })),
})

defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: Input,
})
```

transport 使用规则：

| request section | HTTP | SSE | WebSocket |
|---|---|---|---|
| `path` | 使用 | 使用 | 使用 |
| `query` | 使用 | 使用 | 使用 |
| `headers` | 使用 | 使用 | 禁止 |
| `body` | 使用 | 禁止 | 禁止 |

HTTP body wrapper 规则：

```text
no body section -> no body
struct.json(...) -> JSON body
struct.urlencoded(...) -> URLSearchParams body
struct.formData(...) -> FormData body
struct.text() -> string body
struct.blob() -> Blob body
struct.arrayBuffer() -> ArrayBuffer body
```

同 section 重复 wire key 是 definition error。协议需要重复 query key 时，用 array 字段建模。

## Explicit Build

`build(ctx, input)` 的 `input` 是 bound view。所有 binding source 必须从 `input` 取出；闭包里的字段 struct 只负责声明 schema，不能直接传给 `ctx.bindXXX(...)`。

```ts
const id = struct.number()

const Input = struct.request({
  path: struct.object({
    org: struct.object({ id }),
    user: struct.object({ id }),
  }),
})

defineRequest({
  method: 'GET',
  path: '/orgs/:orgId/users/:userId',
  input: Input,
  build(ctx, input) {
    ctx.bindPathParams({
      orgId: input.path.org.id,
      userId: input.path.user.id,
    })
  },
})
```

普通字段也必须通过 `input.*` 绑定。

```ts
const page = struct.number().optional()

const Input = struct.request({
  query: struct.object({ page }),
})

defineRequest({
  method: 'GET',
  path: '/users',
  input: Input,
  build(ctx, input) {
    ctx.bindQueryParams({ page: input.query.page })
  },
})
```

`ctx.bindQueryParams({ page })` 必须拒绝，即使 `page` 在当前 input tree 中唯一。

## JSON Projection

JSON projection 支持重组 output shape。

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
  body: struct.json(struct.object({
    profile: struct.object({
      displayName: struct.string().tag(tag.json('display_name')),
    }),
  })),
})

defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
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

调用方传入：

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

实际 JSON body：

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

array source 可以在 JSON projection 内使用 `map(...)` 重组 item shape。

```ts
const Input = struct.request({
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
  path: '/users/bulk',
  input: Input,
  build(ctx, input) {
    ctx.bindJson({
      users: input.body.users.map(user => ({
        id: user.id,
        name: user.name,
      })),
    })
  },
})
```

`input.body.users.map(...)` 只生成 JSON `ArrayProjection`。callback 里的 `user` 不是 actual item value，而是 item bound source 模板；不能在 callback 外绑定，也不能用于 query/header/formData。`ArrayProjection` v1 只支持 `map`，不提供 `filter` / `reduce` / `flatMap`。

## Whole-source Binding

object bound view 可以作为 whole-source。

```ts
const Input = struct.request({
  body: struct.json(struct.object({
    id: struct.number(),
    name: struct.string(),
  })),
})

defineRequest({
  method: 'POST',
  path: '/users',
  input: Input,
  build(ctx, input) {
    ctx.bindJson(input.body)
  },
})
```

调用方传入 `{ id: 1, name: 'Ada' }` 时，实际 JSON body 是 `{ id: 1, name: 'Ada' }`。

direct object source 规则：

1. `ctx.bindJson(input)` / `ctx.bindJson(input.profile)`：被 struct JSON codec 接受的 object source 合法。
2. `ctx.bindQueryParams(input)` / `ctx.bindHeaders(input)` / `ctx.bindFormUrlEncoded(input)`：只接受对应 struct codec 可编码的 flat object source。
3. `ctx.bindFormData(input)`：只接受 struct multipart codec 可编码的 flat object source。
4. `ctx.bindArrayBuffer(input)`、`ctx.bindBlob(input)`、`ctx.bindText(input)`、`ctx.bindHtml(input)`：拒绝 object source，只接受 single matching bound source。

## Context Surface

HTTP ctx：

```ts
type HttpBuildContext<Root extends ObjectSchema<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
  bindHeaders(projection: KeyValueProjection<'header', Root>): void

  bindJson(projection: JsonProjection<Root>, options?: RequestBodyOptions): void
  bindFormUrlEncoded(projection: KeyValueProjection<'urlencoded', Root>, options?: RequestBodyOptions): void
  bindFormData(projection: FormDataProjection<Root>): void

  bindArrayBuffer(source: BoundFor<'arrayBufferBody', Root>, options?: RequestBodyOptions): void
  bindBlob(source: BoundFor<'blobBody', Root>, options?: RequestBodyOptions): void
  bindText(source: BoundFor<'textBody', Root>, options?: RequestBodyOptions): void
  bindHtml(source: BoundFor<'htmlBody', Root>, options?: RequestBodyOptions): void
}
```

SSE ctx：

```ts
type EventStreamBuildContext<Root extends ObjectSchema<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
  bindHeaders(projection: KeyValueProjection<'header', Root>): void
}
```

WebSocket ctx：

```ts
type WebSocketBuildContext<Root extends ObjectSchema<any>> = {
  bindPathParams(projection: PathParamsProjection<Root>): void
  bindQueryParams(projection: KeyValueProjection<'searchParam', Root>): void
}
```

`ctx` 不暴露 `setXXX`、`context`、`withCredentials`、`bindBody`、`bindXml`。签名、trace、nonce、auth token、request-scoped metadata 等运行时逻辑走 interceptor / adapter，不进入 `build(ctx, input)`。

## Struct Binding Capability

`BoundFor<TTarget, Root>` 不是新 schema，也不是 `S & marker`。它只表达当前 endpoint 的 bound source 可被目标 struct codec 接受。

字段 struct 不能单独作为 binding source；只有 `build(ctx, input)` 第二参 `input` 派生出的 `input.*` source 才能进入 `ctx.bindXXX(...)`。

能力判断必须复用 struct runtime definition 与现有 codec：

1. path/query/header/urlencoded：复用 `encodePathParams`、`encodeQueryParams`、`encodeHeaders`、`encodeUrlencoded` 的编码限制。
2. JSON：复用 `encodeObjectByTag` / struct JSON codec。
3. multipart：复用 `encodeMultipart`。
4. binary/blob/text/html single source：基于 struct runtime definition 判断 root source 类型。

## Materialize Rules

1. path/query/header/urlencoded/formData 的 output 是 flat record。
2. JSON projection 可以递归重组 object。
3. JSON projection 支持 array whole-source，也支持 `input.array.map(item => projection)` 生成的 one-to-one `ArrayProjection`。
4. `ArrayProjection` v1 只支持 `map`，不支持 `filter` / `reduce` / `flatMap` / index access。
5. optional `undefined` 在 query/header/urlencoded/formData/json object projection 中 skip。
6. path param 为 `undefined` 是 materialize error。
7. same-source duplicate wire key 是 definition error。
8. 多个 body helper 连续调用是 definition error。

## Test Requirements

runtime tests：

1. HTTP 默认 request materialization 使用 `struct.request({ path, query, headers, body })` 生成 request。
2. SSE 默认 request materialization 使用 `path/query/headers`，配置 body section 报错。
3. WebSocket 默认 request materialization 使用 `path/query`，配置 headers/body section 报错。
4. `build` 存在时 request-shaped 默认构建不参与。
5. 裸 struct 不能绑定；所有 binding source 必须来自 `build(ctx, input)` 的 `input`。
6. `input.*` bound view 能绑定 reused struct 的具体 path。
7. `ctx.bindJson(input)` 支持 root object whole-source。
8. `ctx.bindJson({ users: input.users.map(user => ({ id: user.id, name: user.name })) })` 支持 array item projection。
9. array item bound source 逃逸到 map 外或用于 query/header/formData 时是 definition error。
10. `ctx.bindQueryParams(input)` 只在 struct query codec 可编码的 flat object 上合法。
11. `ctx.bindArrayBuffer(input)` 拒绝 object source。
12. SSE 手写 body 报 definition error。
13. WebSocket 手写 headers/body/withCredentials 报 definition error。

type tests：

1. HTTP ctx 暴露所有 HTTP-legal `bindXXX`。
2. SSE ctx 不暴露 body helpers。
3. WebSocket ctx 不暴露 headers/body helpers。
4. HTTP ctx 不暴露 `setXXX`、`context`、`withCredentials`、`bindBody`、`bindXml`。
5. 伪造 `{ path, schema }` 结构不能通过 `ctx.bindXXX`。
6. 用户字段名为 `path`、`schema`、`fieldKey` 时不和 binding metadata 冲突。
