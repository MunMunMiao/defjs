# `@defjs/core` 使用手册

> 当前状态：当前结构解析合同以 `src/struct/README.md` 和 `src/struct/public_api.ts` 为准。`struct` 只暴露结构声明和 `.alias(name)` 字段 wire-name 机制；解析与序列化由 codec、endpoint runtime 和 request build 内部使用 struct 元数据完成。

这份文档只保留当前最常用的 API 和使用方式。

## 快速开始

### 创建 client

```ts
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
```

`endpoint` 是基础地址。内部会先用 `new URL(endpoint)` 解析，然后再拼接 endpoint 定义里的 `path`。

例如：

```ts
endpoint = 'https://api.example.com/v1'
path = '/user/info'
```

最终请求地址是：

```ts
https://api.example.com/v1/user/info
```

## Client 规则

`client` 是显式创建和传递的执行器：

```ts
const [error, result] = await client.execute(command)
```

`createGlobalClient` / `getGlobalClient` / `setGlobalClient` / `resetGlobalClient` 已在 0.4 移除。需要多个外部 API 时，分别创建多个 `Client` 实例。

## Struct

endpoint 定义层只接受 `@defjs/core` 自带 `struct` struct，不接收第三方 struct adapter。

有两条硬规则：

1. 请求侧不再提供 `struct.json / struct.formData / struct.urlSearchParams`
2. `input` 或 `output` 省略时，表示这一层完全忽略解析

这意味着：

1. `input` 省略时，传入值原样交给 `build(ctx, input)`
2. `output` 省略时，即使服务端 body 有值，也不会解析，HTTP 的 `result` 会是 `undefined`

### 设计哲学：对齐 Go `encoding/json`

`@defjs/core/struct` 模仿 Go struct ↔ JSON 语义，让 TS 开发者获得 Go 后端开发者熟悉的 DX。struct 是结构合同：用户声明字段；endpoint runtime 和 codec 会在内部读取同一份字段元数据完成边界解析、wire key 映射与序列化。

#### 类型对偶：值类型 vs 指针

Go 区分**值类型**和**指针类型** —— 前者缺字段或收到显式 `null` 时填零值，后者缺字段为 `nil`、可接受显式 `null`。struct 通过 **`.nullish()`**（同时开 `optional + nullable`）精确对偶 Go 指针；`.optional()` 表示字段可省略，缺失或显式 `null` 在 object 字段位置都会省略输出。

| Go 字段                      | struct 写法                      | 合法输入                                                       | 非法输入               | 缺失输入              | `null` 输入    | wire 序列化                |
| ---------------------------- | -------------------------------- | -------------------------------------------------------------- | ---------------------- | --------------------- | -------------- | -------------------------- |
| `string`                     | `struct.string()`                | `"x"` → `"x"`                                                  | `123` → throw          | `""`                  | `""`           | `"x"` → `"x"`              |
| `*string`                    | `struct.string().nullish()`      | `"x"` → `"x"`                                                  | `123` → throw          | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `int`                        | `struct.number()`                | `42` → `42`                                                    | `"x"` → throw          | `0`                   | `0`            | `42` → `42`                |
| `*int`                       | `struct.number().nullish()`      | `42` → `42`                                                    | `"x"` → throw          | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `int64`（`json:",string"`）  | `struct.bigint()`                | `42n` / `"42"` → `42n`                                         | `42`(number) → throw § | `0n`                  | `0n`           | `42n` → `"42"` §           |
| `*int64`（`json:",string"`） | `struct.bigint().nullish()`      | `42n` / `"42"` → `42n`                                         | `42`(number) → throw § | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `bool`                       | `struct.boolean()`               | `true` → `true`                                                | `1` → throw            | `false`               | `false`        | `true` → `true`            |
| `*bool`                      | `struct.boolean().nullish()`     | `true` → `true`                                                | `1` → throw            | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `time.Time`                  | `struct.date()`                  | `Date` / `"2026-05-12T10:00:00Z"` / `1747036800000` → `Date` † | `"not-a-date"` → throw | `new Date(0)` (epoch) | `new Date(0)`  | `Date` → ISO 字符串 †      |
| `*time.Time`                 | `struct.date().nullish()`        | `Date` / ISO 字符串 / 数字 → `Date` †                          | `"not-a-date"` → throw | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `struct{...}`                | `struct.object({...})`           | `{...}` → 解析后值                                             | `"x"` → throw          | 全字段递归零值        | 全字段递归零值 | `{...}` → 按 wire key 输出 |
| `*struct{...}`               | `struct.object({...}).nullish()` | `{...}` → 解析后值                                             | `"x"` → throw          | `undefined`           | `null`         | `undefined` → ⌀ ‡          |
| `[]T` slice                  | `struct.array(T)`                | `[a, b]` → 递归解析                                            | `"x"` → throw          | `[]`                  | `[]`           | `[...]` → 递归序列化       |
| `map[K]V`                    | `struct.record(V)`               | `{k: v}` → 递归解析                                            | `"x"` → throw          | `{}`                  | `{}`           | `{...}` → 递归序列化       |

- `†` `struct.date()` 内置 wire 桥接：边界解析接受任何 `new Date()` 可解析的输入（`Date` 实例 / ISO 字符串 / epoch 数字 / 任意），Invalid Date 抛 `invalid_type`；wire 序列化输出 ISO 字符串。等价于 Go `time.Time` 的 `MarshalJSON` / `UnmarshalJSON`。**注意 footgun**：`boolean` 输入也会被 `new Date()` 接受 —— `new Date(true)` = `1970-01-01T00:00:00.001Z`（epoch + 1ms，Valid Date），**不抛错**。这是"直接交给 `new Date`"的语义边界。
- `‡` `⌀` 表示在 object 字段位置序列化时：value 中不含该 key → **整字段跳过**；显式带 `key: undefined` → 保留 `undefined`，后续 `JSON.stringify` 才丢字段 —— 整体效果与 Go `omitempty` 等价。
- `※` `array(T)` / `record(V)` 是值类型 struct，缺失或显式 `null` 都走零值；要保留 `null` 本身请显式 `.nullish()` 或 `.null()`。
- `§` `struct.bigint()` 的 runtime 输入是 `bigint`，wire 输入是字符串（对齐 Go `json:",string"` tag 用法），wire 输出也始终是字符串。它**拒绝 `number`**，避免 IEEE 754 精度丢失；空字符串或空白字符串沿用 JavaScript `BigInt()` 行为得到 `0n`。

**关键**：用值类型还是指针，**是用户的语义决策** —— 通过 `struct.x()` 与 `struct.x().nullish()` / `.optional()` 表达。struct 不替用户决定。

#### 修饰行为对偶

| Go 行为                            | `@defjs/core/struct`                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------- |
| `json:"field_name"` 风格字段重命名 | `.alias('field_name')`                                                        |
| `omitempty` Output 字段可省        | `.optional()`                                                                 |
| `json.Marshal` 反向序列化          | 由 endpoint runtime / request build 内部执行，struct 实例不暴露反向序列化方法 |
| 未知字段                           | 始终忽略，不提供额外严格模式                                                  |

零值默认值是**设计意图**而非 bug：缺字段时拿到 Go 风格零值；struct 不提供额外严格校验入口。

#### 字符串域：query / header / form

URL query、HTTP headers、multipart form 是字符串域，缺字段行为**完全由 struct 决定** —— 不引入额外规则：

- `struct.string()` —— 缺字段 `""`（等价 Go `string`）
- `struct.number()` —— 缺字段 `0`（等价 Go `int`）
- `struct.string().optional()` —— 缺字段 `undefined`（等价 Go `*string`）
- `struct.string().nullish()` —— 缺字段或显式 `null` → `undefined`

要表达"可能没传"用 `.optional()` / `.nullish()`；要表达"必填，缺就是零值"用值类型 struct。**这不是新规则，是 Go 指针语义的自然外延** —— 同一套心智模型贯穿 JSON body 与字符串域。

### Struct API 表

**基础工厂**

```ts
struct.string()
struct.number()
struct.boolean()
struct.null()
struct.any()
struct.unknown()
struct.bigint()
struct.date()
struct.blob()
struct.file()
struct.arrayBuffer()
struct.literal('x')
struct.enum(['a', 'b'])
```

**复合工厂**

```ts
struct.array(item)
struct.object({...})
struct.record(valueStruct)
struct.tuple([a, b, c])
struct.or(a, b, ...)
struct.intersection(a, b)
struct.discriminatedUnion('type', [optionA, optionB, ...])
```

**request body wrapper**

```ts
struct.json(struct.object({...}))
struct.urlencoded(struct.object({...}))
struct.formData({ file: struct.file() })
struct.text()
struct.blob()
struct.arrayBuffer()
```

**递归 struct（getter 模式）**

直接在 `struct.object` 入参用 getter 字段，运行时边界解析时才读取 getter：

```ts
type Tree = {
  children: Tree[]
  id: string
}

const Tree = struct.object({
  id: struct.string(),
  get children() {
    return struct.array(Tree)
  },
})

// endpoint runtime 可以解析 { id: 'root', children: [{ id: 'a', children: [] }] }
```

**共用 method-chain（所有 struct）**

```ts
.optional()            // pointer-like，Output 可省
.null()                // 接受 null
.nullish()             // optional + nullable
.alias('name') // 字段 wire key alias；core request placement 使用 struct.request sections
```

**边界解析**

struct 实例不暴露解析方法。HTTP、SSE、WebSocket endpoint runtime 使用内部同步解析 helper，并把失败转换为现有 error tuple。

struct 不提供验证 DSL 或 object utility DSL；字符串长度、数字范围、业务规则、对象裁剪等应放在应用层、路由层或单独 validator 中。

**StructError 与全局错误**

```ts
error.format() // { _errors: [], [key]: subtree }
error.flatten() // { formErrors: [], fieldErrors: {} }
error.prettify() // 多行可读字符串
setErrorMap(map) // 全局拦截 issue.message，i18n 友好
```

## Build 设计方案

这部分定义 endpoint request build 的设计边界。下面的 `defineXXX.build` 使用合同必须服从这里的设计决策；当前实现锚点是 `src/internal/request_builder.ts`、`src/http/request.ts`、`src/sse/request.ts` 和 `src/web_socket/build.ts`。

### 设计目标

1. `input` 同时作为调用方输入解析合同和 request build 元数据源，避免 struct、tag、build 三套规则漂移。
2. 简单 endpoint 不需要写 `build`：`struct.request(...)` 直接描述 `path/query/headers/body`，runtime 自动 materialize request。
3. 复杂 endpoint 必须显式写 `build(ctx, input)`：只编排当前 endpoint input tree 的字段引用，不接收 raw runtime value。
4. `build` 只负责 request shape 编排；鉴权、trace、事务、request-scoped metadata 通过 `context` 和 interceptor 处理。
5. HTTP、SSE、WebSocket 共用同一套 request plan 心智，但按 transport 能力裁剪可用 section 和 ctx 方法。

### 非目标

1. 不做 field-level placement：字段属于 `path/query/headers/body` 由 `struct.request(...)` section 决定，`.alias(name)` 只决定 wire key。
2. 不做 `endpoint.build ?? autoBuild` 的隐式混合；写了 `build` 就完整接管 request plan。
3. 不暴露泛 `setBody`、raw `BodyInit`、actual input resolver、`setXXX` 或 context 读写入口。
4. 不把 WebSocket 握手 headers、自定义 transport factory、OpenAPI 导出纳入 build v1。
5. 不让闭包里的字段 struct 直接参与 binding；binding source 只能来自 `build(ctx, input)` 的第二参。

### 当前代码事实

1. HTTP、SSE、WebSocket 都通过 `buildRequest(input, build, { input, transport })` 进入统一 request assembly。
2. 没有 `build` 时，只有 `struct.request(...)` 会执行默认构建；普通 `struct.object(...)` 等非 request struct 不自动生成 request。
3. 有 `build` 且有 `input` struct 时，当前实现创建 endpoint-local bound view，记录 `BuildPlanStep[]`，再用 parsed input materialize 成 path/query/header/body。
4. 有 `build` 但没有 `input` 时，仍走 immediate builder 路径；这不是 struct-aware build 的设计中心。
5. transport gate 在 request build 之后执行：SSE 禁止 body / withCredentials，WebSocket 只允许 path params 和 query params。
6. HTTP 的最终 `Content-Type` 在 request headers 写入后由 body 阶段统一裁决，`FormData` 会删除手写 `Content-Type` 以保留 runtime boundary。

### 目标流程

```text
definition-time:
  endpoint.input creates endpoint-local binding registry
  run build(ctx, boundInputView) to record BuildPlan
  store BuildPlan on endpoint definition

request-time:
  parse actual caller input with endpoint.input
  materialize BuildPlan against parsed input
  apply transport gate
  create concrete HTTP / SSE / WebSocket request
```

当前代码可以先在 `buildRequest(...)` 内完成 plan recording 和 materialize；目标设计允许后续把 plan recording 前移到 definition-time，而不改变 public API。

### 关键决策

1. `struct.request(...)` 是默认请求构建的唯一入口；request section 是结构层级，不是字段 tag。
2. `build(ctx, input)` 的 `input` 是 bound view，不是 actual parsed value；`ctx.bindXXX(...)` 只记录 source path / projection。
3. `BuildPlan` 只保存 binding 关系和目标 request 区域，不保存 actual caller value。
4. path/query/header/urlencoded/formData 输出是 flat record；JSON body 支持递归 object projection、whole-source binding 和 array `map(...)` projection。
5. 同一个 request 区域多次写入时，最终 materialize 结果按最后一次写入为准，不做隐式 merge。
6. array projection v1 只支持 JSON 内的 one-to-one `map`；不支持 `filter`、`reduce`、`flatMap`、index access 或 callback 外泄 source。
7. transport 能力是硬边界：WebSocket 不支持 headers/body，SSE 不支持 body，HTTP 支持完整 body helpers。

## `defineXXX.build` 与 `struct` 绑定

`defineRequest`、`defineEventStream`、`defineWebSocket` 的请求构建只有两条主线：

1. **request-shaped input**：`input` 使用 `struct.request(...)`，由 `path/query/headers/body` 分区直接描述 request shape。没有 `build` 时按这个 shape 构建 request。
2. **`ctx.bindXXX(...)` 编排路径**：复杂协议写 `build(ctx, input)`，只编排当前 endpoint input tree 中的 struct 字段，不接收 raw runtime value。

完整 build 合同和实践规则以本节描述、源码类型与测试为准。

### Request-shaped input

`struct.request(...)` 替代旧的字段 placement 心智。placement 不由字段 alias 决定，而由 request 分区决定：

```ts
const UploadInput = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  query: struct.object({
    includeProfile: struct.boolean().optional(),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.formData({
    uid: struct.number(),
    files: struct.array(struct.file()),
  }),
})
```

调用方传入的值保持 request shape：

```ts
{
  path: { id: 1 },
  query: { includeProfile: true },
  headers: { traceId: 'trace-1' },
  body: {
    uid: 7,
    files: [file],
  },
}
```

materialize 后：

```text
path: /users/1
query: ?includeProfile=true
headers: x-trace-id: trace-1
body: FormData(uid=7, files=file)
```

规则：

1. `path`、`query`、`headers` 必须是 flat object；`path` 字段必须可编码为 required scalar。
2. `body` struct 决定 body codec：`struct.json(...)`、`struct.urlencoded(...)`、`struct.formData(...)`、`struct.text()`、`struct.blob()`、`struct.arrayBuffer()`。
3. `struct.json(...)` 支持 deep object / array；`struct.urlencoded(...)` 和 `struct.formData(...)` 只支持 flat field object。
4. headers 先写入，body 阶段再裁决最终 `Content-Type`；如果 body 类型需要自己的 `Content-Type`，会覆盖用户已写入的 header。
5. 字段 wire key 使用 `.alias(name)`，例如 `.alias('x-trace-id')`；wire key 只改名，不决定字段属于哪个 request section。
6. 省略某个 section 表示该 section 不参与请求构建。
7. 写了 `build(ctx, input)` 后，request-shaped 默认构建不再参与，用户完整接管 request plan。

### Input bound view

字段 struct 只负责声明 struct，不能单独传给 `ctx.bindXXX(...)`。所有 binding source 必须从 `build(ctx, input)` 的第二参 `input` 取出：

```ts
const Input = struct.request({
  path: struct.object({
    id: struct.number(),
  }),
  headers: struct.object({
    token: struct.string().optional().alias('x-token'),
  }),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: Input,
  build(ctx, input) {
    ctx.setPathParams({ id: input.path.id })
    ctx.setHeaders({ 'x-token': input.headers.token })
  },
})
```

同一个 struct 实例可以在 input tree 里复用；绑定时仍然通过 `input.*` 指明具体 path：

```ts
const id = struct.number()

const Input = struct.request({
  path: struct.object({
    org: struct.object({ id }),
    user: struct.object({ id }),
  }),
})

build(ctx, input) {
  ctx.setPathParams({
    orgId: input.path.org.id,
    userId: input.path.user.id,
  })
}
```

### `build(ctx, input)`

`build(ctx, input)` 不读取 actual parsed value。目标执行模型是：

```text
definition-time:
  struct creates endpoint-local binding registry from endpoint.input
  run build(ctx, boundInputView) once to produce BuildPlan

request-time:
  decode actual caller input
  materialize BuildPlan into path/query/header/body
```

`ctx.bindXXX(...)` 的 value 是当前 input tree 中的 bound source；key 是目标 request key。示例：

```ts
build(ctx, input) {
  ctx.setPathParams({ id: input.userId })
  ctx.setQueryParams({ include_profile: input.includeProfile })
  ctx.setHeaders({ 'x-trace-id': input.traceId })
  ctx.setJson({
    name: input.profile.displayName,
    data: {
      userId: input.userId,
      traceId: input.traceId,
      includeProfile: input.includeProfile,
    },
  })
}
```

调用方传入：

```ts
{
  userId: 1,
  traceId: '123',
  includeProfile: true,
  profile: {
    displayName: 'John Doe',
  },
}
```

materialize 后发送：

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

同一套 bound view 也支持 whole-source binding：

```ts
const Input = struct.object({
  id: struct.number(),
  name: struct.string(),
})

build(ctx, input) {
  ctx.setJson(input)
}
```

调用方传入 `{ id: 1, name: 'Ada' }` 时，实际 JSON body 是 `{ id: 1, name: 'Ada' }`。

array source 也可以在 JSON projection 内使用 `map(...)` 重组 item shape：

```ts
build(ctx, input) {
  ctx.setJson({
    users: input.users.map(user => ({
      id: user.id,
      name: user.name,
    })),
  })
}
```

这里的 `user` 是 array item bound source 模板，不是 actual item value。`input.users.map(...)` 生成 `ArrayProjection`，v1 只支持 `map`；materialize 时才会对真实 `users` 数组逐项套用 projection。

`ctx.setJson(input.profile)` 发送 nested object；`ctx.setQueryParams(input)`、`ctx.setHeaders(input)`、`ctx.setFormUrlEncoded(input)` 只在 `input` 是对应 struct codec 可编码的平铺 object 时合法；`ctx.setFormData(input)` 只在 struct multipart codec 可编码的平铺 object 上合法；single body helpers 例如 `ctx.setArrayBuffer(...)` 不接受 object source。

### Binding 边界

In `build(ctx, input)`, explicit object literal keys are the final wire keys and are never rewritten by source-field aliases. Whole-source bound values (e.g. `ctx.setJson(input.body)`) still recursively apply the source struct's aliases. 2. binding metadata 使用 endpoint-local registry / private symbol / WeakMap，不能占用用户字段名 `path`、`struct`、`fieldKey`。3. ctx 必须校验 bound source 属于当前 endpoint input owner，不能接受伪造对象、闭包里的字段 struct 或其他 endpoint 的 bound view。4. root input object / nested object bound view 可以作为 direct source，但必须按 helper 支持结构校验。5. path/query/header 是 flat output；source 可以来自 deep bound source，也可以来自平铺 object source。6. JSON 支持递归 object projection，也支持 whole-object / whole-array bound source，以及 `input.array.map(item => projection)` 生成的 one-to-one `ArrayProjection`。7. `ArrayProjection` v1 只支持 `map`；array item bound source 只能在所属 `map(...)` projection 内使用，不支持 `filter` / `reduce` / `flatMap` / index access。8. v1 不提供泛 `ctx.setBody(ref)`，避免 `BodyInit` 重新变成 raw body 入口。9. `ctx` 不暴露 `setXXX`、`context`、`withCredentials`、`setXml`。10. primitive / array / union input 在 v1 只做边界解析，不支持 struct-aware `build`；配置 `build` 应返回 definition error。

### Transport 差异

| ctx 方法                                             | HTTP | SSE  | WebSocket |
| ---------------------------------------------------- | ---- | ---- | --------- |
| `setPathParams`                                      | 合法 | 合法 | 合法      |
| `setQueryParams`                                     | 合法 | 合法 | 合法      |
| `setHeaders`                                         | 合法 | 合法 | 非法      |
| `setJson` / `setFormUrlEncoded` / `setFormData`      | 合法 | 非法 | 非法      |
| `setArrayBuffer` / `setBlob` / `setText` / `setHtml` | 合法 | 非法 | 非法      |

## HTTP

### 定义 endpoint

```ts
import { defineRequest, struct } from '@defjs/core'

const getUserInfo = defineRequest({
  method: 'GET',
  path: '/user/:id',
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
    query: struct.object({
      withProfile: struct.boolean(),
    }),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      code: struct.string(),
      message: struct.string(),
    }),
  },
})
```

HTTP 请求构建有两条路径：

1. 不写 `build` 时，使用 `struct.request(...)` 的 request shape 构建。
2. 写 `build(ctx, input)` 时，用户完整接管构建。

HTTP 的 `ctx` 暴露：

1. `ctx.setPathParams(...)`
2. `ctx.setQueryParams(...)`
3. `ctx.setHeaders(...)`
4. `ctx.setJson(...)`
5. `ctx.setText(...)`
6. `ctx.setHtml(...)`
7. `ctx.setArrayBuffer(...)`
8. `ctx.setBlob(...)`
9. `ctx.setFormData(...)`
10. `ctx.setFormUrlEncoded(...)`

其中：

1. struct-aware `bindXXX(...)` 入参是当前 input tree 中的 bound source / projection
2. `ctx.setPathParams(...)` 只生成 flat path params，但 source 必须是 struct path codec 可编码的 required bound source
3. `ctx.setQueryParams(...)`、`ctx.setHeaders(...)`、`ctx.setFormUrlEncoded(...)` 只生成 flat record，但 source 可以来自对应 struct codec 可编码的 deep bound source
4. `ctx.setJson(...)` 接受递归 object projection，也接受 direct object / array source；array 支持 whole-array bound source，也支持 `input.items.map(item => projection)` 生成的仅支持 `map` 的 `ArrayProjection`
5. `ctx.setFormData(...)` 生成 flat multipart fields，source 可以来自 struct multipart codec 可编码的 deep bound source，也可以是平铺 form-data field object
6. `ctx.setArrayBuffer(...)`、`ctx.setBlob(...)`、`ctx.setText(...)`、`ctx.setHtml(...)` 接受 single bound source，不接受 object source
7. 同一个 request 区域可以调用多次；`path`、`query`、`headers`、`body` 都按最后一次写入为准，不做 merge，也不因多次调用报错
8. `ctx` 不暴露泛 `setBody`，不接收裸 `BodyInit` / `string` / actual input resolver
9. XML 暂不进入 struct-aware 目标合同
10. 没有 body 时不会设置 `Content-Type`

`Content-Type` 合成规则：

1. 先写入 `headers` section / `ctx.setHeaders(...)` 的结果。
2. 最后一次 body 写入决定 body 区域和最终 `Content-Type`。
3. `setJson(...)` 默认 `application/json`；`setText(...)` 默认 `text/plain;charset=UTF-8`；`setHtml(...)` 默认 `text/html;charset=UTF-8`；`setFormUrlEncoded(...)` 默认 `application/x-www-form-urlencoded;charset=UTF-8`；XML body 默认 `application/xml;charset=UTF-8`。
4. body helper 的 `contentType` 可以显式覆盖默认值；`contentType: null` 表示删除并抑制 `Content-Type` 推断。
5. `FormData` 不限制用户先写 `Content-Type`，但最终 body 阶段会删除它，让 Fetch/运行时生成带 boundary 的 multipart header。
6. `Blob` / `File` 优先使用自身 `type`；没有 `type` 时使用 `application/octet-stream`。
7. `ArrayBuffer`、`ReadableStream` 和其它无类型二进制 body 使用 `application/octet-stream`。
8. raw `URLSearchParams` 推断为 `application/x-www-form-urlencoded;charset=UTF-8`；raw `string` 推断为 `text/plain;charset=UTF-8`；raw object / array / number / boolean / `null` 推断为 `application/json`。
9. `undefined` 表示没有 body；没有 body 时不会新增或覆盖 `Content-Type`。

### 调用

无配置：

```ts
const [error, data, response] = await getUserInfo({
  path: { id: 1 },
  query: { withProfile: true },
})
```

有配置：

```ts
const [error, data, response] = await getUserInfo({
  path: { id: 1 },
  query: { withProfile: true },
}).with({
  client,
  timeout: 10_000,
  onUploadProgress(event) {},
  onDownloadProgress(event) {},
  context,
})
```

第二段 HTTP 配置：

1. `client?: Client`
2. `timeout?: number`
3. `abort?: AbortSignal`
4. `onUploadProgress?: HttpProgressFn`
5. `onDownloadProgress?: HttpProgressFn`
6. `context?: HttpContext`

`timeout` 与 `abort` 互斥。`timeout` 是便捷超时入口；`abort` 接收外部 `AbortSignal`。如果需要组合外部取消和超时，请自行构造组合后的 `AbortSignal` 并只传 `abort`。

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

### 返回值

HTTP 固定返回：

```ts
;[error, result, response]
```

语义：

1. `2xx`：`[null, result, response]`
2. 非 `2xx`：`[error, undefined, response]`

补充说明：

1. `output` 省略时，`result` 固定是 `undefined`
2. `response` 始终保留 `status / headers / url / ok`
3. 已声明的非 `2xx` 响应体会保留在 `error.data`

### 非 JSON 响应

如果接口返回的不是 JSON，需要在 definition 顶层显式声明：

```ts
const downloadAvatar = defineRequest({
  method: 'GET',
  path: '/avatar',
  responseType: 'blob',
  output: {
    200: struct.blob(),
  },
})
```

支持的值：

1. `json`
2. `text`
3. `blob`
4. `arraybuffer`

### `output` 的两种写法

```ts
output: {
  200: userStruct,
  201: userStruct,
  404: errorStruct,
}
```

```ts
output: [
  {
    status: [200, 201],
    body: userStruct,
  },
  {
    status: 404,
    body: errorStruct,
  },
]
```

## SSE

### 定义 endpoint

```ts
import { defineEventStream, struct } from '@defjs/core'

const watchUserInfo = defineEventStream({
  path: '/user/:id/events',
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  input: struct.request({
    path: struct.object({
      id: struct.number(),
    }),
    headers: struct.object({
      token: struct.string().alias('x-token'),
    }),
  }),
  events: {
    message: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    default: struct.unknown(),
  },
})
```

SSE 的目标 `ctx` 只暴露：

1. `ctx.setPathParams(...)`
2. `ctx.setQueryParams(...)`
3. `ctx.setHeaders(...)`

SSE 走 GET，没有请求体，所以 build ctx 不存在 `setBody / setJson / setText / setHtml / setXml / setFormData / setFormUrlEncoded`。

### 调用

无配置：

```ts
const [error, stream, open] = await watchUserInfo({
  path: { id: 1 },
  headers: { token: 'secret' },
})
```

有配置：

```ts
const [error, stream, open] = await watchUserInfo({
  path: { id: 1 },
  headers: { token: 'secret' },
}).with({
  client,
  timeout: 10_000,
  context,
})
```

第二段 SSE 配置：

1. `client?: Client`
2. `timeout?: number`
3. `abort?: AbortSignal`
4. `context?: HttpContext`

`timeout` 与 `abort` 互斥。SSE 的 `fetch` 只在 client 的 `sse` 配置中设置；需要动态切换 fetch 时，创建或 clone 对应 client，然后通过 `.with({ client })` 切换。

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

### 返回值

SSE 固定返回：

```ts
;[error, stream, open]
```

其中：

1. `error` 只表示启动阶段错误
2. `open` 是启动元信息，包含 `response` 和 `url`
3. `stream.closed` 表示流结束信息

### 事件处理规则

当前是宽松语义：

1. 未声明事件直接跳过
2. 已声明但 payload 校验失败的事件也直接跳过
3. 不提供事件失败上抛模式

## WebSocket

### 定义 endpoint

```ts
import { defineWebSocket, struct } from '@defjs/core'

const chatSocket = defineWebSocket({
  path: '/ws/chat',
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
  input: struct.request({
    query: struct.object({
      roomId: struct.string(),
    }),
  }),
  incoming: {
    message: struct.object({
      text: struct.string(),
    }),
  },
  outgoing: {
    message: struct.object({
      text: struct.string(),
    }),
  },
  protocols: ['json'],
})
```

WebSocket 的目标 `ctx` 只暴露：

1. `ctx.setPathParams(...)`
2. `ctx.setQueryParams(...)`

WebSocket Web API 不支持自定义握手 headers（见下文"WebSocket 规则"），也没有请求体。

### 调用

无配置：

```ts
const [error, socket, connection] = await chatSocket({
  query: { roomId: 'room-1' },
})
```

有配置：

```ts
const [error, socket, connection] = await chatSocket({
  query: { roomId: 'room-1' },
}).with({
  client,
  protocols: ['json'],
  beforeConnect: async ({ attempt, signal }) => {
    await refreshConnectionState({ attempt, signal })
  },
  reconnect: {
    attempts: 1,
  },
  heartbeat: {
    intervalMs: 30_000,
    message: () => ({
      type: 'ping',
    }),
  },
  timeout: 10_000,
})
```

第二段 WebSocket 配置：

1. `client?: Client`
2. `protocols?: readonly string[]`
3. `beforeConnect?: (context: { attempt: number; signal: AbortSignal }) => void | Promise<void>`
4. `reconnect?: WebSocketReconnectOptions`
5. `heartbeat?: WebSocketHeartbeatOptions`
6. `timeout?: number`
7. `abort?: AbortSignal`

`timeout` 与 `abort` 互斥。需要组合多个取消来源时，请自行构造组合后的 `AbortSignal` 并只传 `abort`。

HTTP、SSE 和 WebSocket execution 的 `timeout` 必须是 `1..2_147_483_647` 范围内的正安全整数；`0`、负数、小数、`NaN`、`Infinity` 或超上限值会在创建 request、stream 或 socket 资源前返回 `REQUEST_VALIDATION_FAILED`。

### 返回值

WebSocket 固定返回：

```ts
;[error, socket, connection]
```

其中：

1. `connection` 是首次物理连接的快照，包含 `generation / url / protocol / extensions`
2. `socket.connection` 是最新物理连接的 live snapshot；`socket.bufferedAmount` 是当前 native backlog
3. `socket.receive` 是只能由一个 iterator 消费的有界 `AsyncIterable`
4. `socket.send(...)` 先检查逻辑可写性，再按 outgoing struct 校验；transport 不自动 replay 已发送 frame
5. `socket.closed` 提供 `closed / aborted / error` discriminated union

### WebSocket 规则

1. 当前只对齐标准 WebSocket Web API
2. 不支持自定义握手 headers
3. `protocols` 是覆盖型字段
4. `beforeConnect` 接收 `{ attempt, signal }`；取消和 timeout 会与 hook race，late result 不会再创建 socket
5. `heartbeat.message` 是可选函数；不提供时不会主动发 heartbeat 消息
6. 未声明消息直接跳过
7. 无效 JSON 与已声明但 payload 校验失败的消息会通知 runtime-error observer、丢弃该 frame，session 继续
8. queue limit 属于 endpoint：`maxIncomingQueueSize` 必填且 overflow fatal；`maxOutgoingQueueSize` 默认 `0`，只在 reconnecting 时保留 FIFO frame
9. state/runtime observer failure 被隔离；reconnect predicate throw 是 terminal `error`，明确返回 `false` 是 terminal `closed`

## `context + interceptor`

事务、trace、request-scoped metadata 当前统一走 build 之外的：

1. `context`
2. `interceptor`

建议边界：

1. 事务状态、trace、request-scoped metadata 放进 `context`
2. 需要基于这些上下文改写 headers/query/body 的逻辑放进 interceptor
3. `build(ctx, input)` 不读写 context，只编排 input struct field reference
4. 不在 `client` 或 endpoint 定义层新增事务字段

## 当前不提供

当前明确不纳入主设计的能力：

1. `struct.empty()`
2. `executeRaw(...)`
3. SSE / WebSocket 事件失败上抛模式
4. WebSocket 自定义握手 headers
5. WebSocket 自定义 transport / factory
6. OpenAPI 生成与 struct 导出
