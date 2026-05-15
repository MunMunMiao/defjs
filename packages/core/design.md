# `@defjs/core` 使用手册

> 当前状态：历史草案。当前结构解析合同以 `src/struct/README.md` 和 `src/struct/public_api.ts` 为准。本文中仍出现的 `schema`、`.refine()`、`.transform()`、`.pipe()`、`.default()`、`.catch()`、`.strict()`、`.passthrough()`、`.strip()` 等旧 DSL 叙述，不再代表当前 public API。

这份文档只保留当前最常用的 API 和使用方式。

## 快速开始

### 创建 client

```ts
import { createClient, createGlobalClient } from '@defjs/core'

const client = createClient({
  endpoint: 'https://api.example.com/v1',
})

createGlobalClient({
  endpoint: 'https://api.example.com/v1',
})
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

`client` 分两种：

1. 全局 client
2. 独立 client

推荐方式：

1. 前端大多数场景直接创建一个全局 client
2. 如果要请求多个外部 API，再在实际调用时传独立 client

请求时查找 client 的顺序固定为：

1. 第二段配置里的 `client`
2. 全局 client
3. 两者都没有时直接报错

也就是说，当前不会在定义 endpoint 时绑定 client。

## Schema

endpoint 定义层当前接受两类 schema：

1. `@defjs/core` 自带 `schema`
2. Standard Schema 兼容对象（任何带 `~standard` 属性的库，如 zod / valibot / arktype）

有两条硬规则：

1. 请求侧不再提供 `schema.json / schema.formData / schema.urlSearchParams`
2. `input` 或 `output` 省略时，表示这一层完全忽略解析

这意味着：

1. `input` 省略时，传入值原样交给 `build(request, input)`
2. `output` 省略时，即使服务端 body 有值，也不会解析，HTTP 的 `result` 会是 `undefined`

### 设计哲学：对齐 Go `encoding/json`

`@defjs/core/schema` 模仿 Go struct ↔ JSON 语义，让 TS 开发者获得 Go 后端开发者熟悉的 DX。**schema 是双向 codec** —— 任何 `.transform()` 必须显式声明 `decode + encode`，保证 round-trip 完整性。与 io-ts / Effect Schema 一致，与 zod 4.1 `z.codec()` 同构。

#### 类型对偶：值类型 vs 指针

Go 区分**值类型**和**指针类型** —— 前者缺字段填零值，后者缺字段为 `nil`、可接受显式 `null`。schema 通过 **`.nullish()`**（同时开 `optional + nullable`）精确对偶 Go 指针；`.optional()` 是更严的子集（只允许缺字段，拒绝显式 `null`）。

| Go 字段 | schema 写法 | `parse(合法值)` | `parse(非法值)` | `parse(undefined)` | `parse(null)` | `encode` |
|---|---|---|---|---|---|---|
| `string` | `schema.string()` | `"x"` → `"x"` | `123` → throw | `""` | throw | `"x"` → `"x"` |
| `*string` | `schema.string().nullish()` | `"x"` → `"x"` | `123` → throw | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `int` | `schema.number()` | `42` → `42` | `"x"` → throw | `0` | throw | `42` → `42` |
| `*int` | `schema.number().nullish()` | `42` → `42` | `"x"` → throw | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `int64`（`json:",string"`）| `schema.bigint()` | `42n` / `"42"` → `42n` | `42`(number) → throw § | `0n` | throw | `42n` → `"42"` § |
| `*int64`（`json:",string"`）| `schema.bigint().nullish()` | `42n` / `"42"` → `42n` | `42`(number) → throw § | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `bool` | `schema.boolean()` | `true` → `true` | `1` → throw | `false` | throw | `true` → `true` |
| `*bool` | `schema.boolean().nullish()` | `true` → `true` | `1` → throw | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `time.Time` | `schema.date()` | `Date` / `"2026-05-12T10:00:00Z"` / `1747036800000` → `Date` † | `"not-a-date"` → throw | `new Date(0)` (epoch) | throw | `Date` → ISO 字符串 † |
| `*time.Time` | `schema.date().nullish()` | `Date` / ISO 字符串 / 数字 → `Date` † | `"not-a-date"` → throw | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `struct{...}` | `schema.object({...})` | `{...}` → 解析后值 | `"x"` → throw | 全字段递归零值 | throw | `{...}` → alias 重命名 |
| `*struct{...}` | `schema.object({...}).nullish()` | `{...}` → 解析后值 | `"x"` → throw | `undefined` | `null` | `undefined` → ⌀ ‡ |
| `[]T` slice | `schema.array(T)` | `[a, b]` → 递归 parse | `"x"` → throw | `[]` | throw ※ | `[...]` → 递归 encode |
| `map[K]V` | `schema.record(V)` | `{k: v}` → 递归 parse | `"x"` → throw | `{}` | throw ※ | `{...}` → 递归 encode |

- `†` `schema.date()` 内置双向 wire 桥接：parse 接受任何 `new Date()` 可解析的输入（`Date` 实例 / ISO 字符串 / epoch 数字 / 任意），Invalid Date 抛 `invalid_type`；encode 输出 ISO 字符串。等价于 Go `time.Time` 的 `MarshalJSON` / `UnmarshalJSON`。**注意 footgun**：`boolean` 输入也会被 `new Date()` 接受 —— `new Date(true)` = `1970-01-01T00:00:00.001Z`（epoch + 1ms，Valid Date），**不抛错**。这是"直接交给 `new Date`"取舍的代价。
- `‡` `⌀` 表示在 object 字段位置 encode 时：value 中不含该 key → **整字段跳过**；显式带 `key: undefined` → 保留 `undefined`，后续 `JSON.stringify` 才丢字段 —— 整体效果与 Go `omitempty` 等价。
- `※` Go slice/map 底层 pointer-like，JSON `null` → nil。schema 中 `array(T)` / `record(V)` 默认拒绝 `null`，要表达此语义请显式 `.nullish()` 或 `.null()` —— 与 Go 的细微偏差。
- `§` `schema.bigint()` 接受 `bigint` 与字符串（对齐 Go `json:",string"` tag 用法），**拒绝 `number`**（避免 IEEE 754 精度丢失，超过 `Number.MAX_SAFE_INTEGER` 直接 throw）；encode 输出字符串。

**关键**：用值类型还是指针，**是用户的语义决策** —— 通过 `schema.x()` 与 `schema.x().nullish()` / `.optional()` 表达。schema 不替用户决定。

#### 修饰行为对偶

| Go 行为 | `@defjs/core/schema` |
|---|---|
| `json:"field_name"` tag 重命名 | `.alias('field_name')` |
| `omitempty` Output 字段可省 | `.optional()` |
| `json.Marshal` 反向序列化 | `schema.encode(value)` |
| `Decoder.DisallowUnknownFields()` | `.strict()` 拒绝未知字段 |
| 必填字段校验（显式严格） | `.strict({ missingKeys: true })` 拒绝缺失 |

零值兜底是**设计意图**而非 bug：缺字段时拿到 Go 风格零值；要严格就显式 `.strict({ missingKeys: true })`。

#### 字符串域：query / header / form

URL query、HTTP headers、multipart form 是字符串域，缺字段行为**完全由 schema 决定** —— 不引入额外规则：

- `schema.string()` —— 缺字段 `""`（等价 Go `string`）
- `schema.number()` —— 缺字段 `0`（等价 Go `int`）
- `schema.string().optional()` —— 缺字段 `undefined`（等价 Go `*string`）
- `schema.string().nullish()` —— 缺字段或显式 `null` → `undefined`

要表达"可能没传"用 `.optional()` / `.nullish()`；要表达"必填，缺就是零值"用值类型 schema。**这不是新规则，是 Go 指针语义的自然外延** —— 同一套心智模型贯穿 JSON body 与字符串域。

### Schema API 表

**基础工厂**

```ts
schema.string()         // Schema<string|undefined, string>
schema.number()         // Schema<number|undefined, number>
schema.boolean()        // Schema<boolean|undefined, boolean>
schema.null()           // Schema<null, null>
schema.any()            // Schema<unknown, any>
schema.unknown()        // Schema<unknown, unknown>
schema.bigint()         // Schema<bigint|undefined, bigint>
schema.date()           // Schema<Date|undefined, Date>
schema.blob()           // Schema<Blob|undefined, Blob>
schema.file()           // Schema<File|undefined, File>
schema.arrayBuffer()    // Schema<ArrayBuffer|undefined, ArrayBuffer>
schema.literal('x')     // Schema<'x'|undefined, 'x'>
schema.enum(['a','b'])  // Schema<'a'|'b'|undefined, 'a'|'b'>
schema.enum({A:'a'})    // 同上，从 const obj 推断
```

**复合工厂**

```ts
schema.array(item)
schema.object({...})
schema.record(valueSchema)
schema.tuple([a, b, c])
schema.or(a, b, ...)
schema.intersection(a, b)
schema.discriminatedUnion('type', [optionA, optionB, ...])
```

**递归 schema(getter 模式)**

直接在 `schema.object` 入参用 getter 字段,TS 完全自动推断:

```ts
const tree = schema.object({
  id: schema.string(),
  get children() { return schema.array(tree) },
})

type Tree = TypeOf<typeof tree>   // { id: string; children: Tree[] }

const [err, val] = tree.parse({ id: 'root', children: [{ id: 'a', children: [] }] })
```

- **完全自动推断**:无类型注解、无 cast、无显式 lazy 工厂
- **运行时延迟**:`schema.object` 内部用 `Object.getOwnPropertyDescriptor` 检测 getter,parse 时才调用 getter 取值(避开 JS TDZ)
- **同 zod v4 对齐**:借助 phantom property 类型设计 + 宽 shape 约束
- **类型层局限**:**简单 1~2 层递归**(`tree.children`)自动推断 work;**多层嵌套 + 复杂 mapped type**(如 `tree.meta.nested.snapshots: T[][][]`)TS 会 bail out,需要 `as unknown as ...` cast。这是 TS 自身在 generic instantiation 深度上的硬限制,业界(zod v4 同款)。

**共用 method-chain（所有 schema）**

```ts
.alias('field_name')   // Go json:"" tag
.default(value)        // 缺省值
.optional()            // pointer-like，Output 可省
.null()                // 接受 null
.nullish()             // optional + nullable
.refine(check, msg?)   // 自定义验证（sync 或 async）
.transform(decode, encode)  // 双向变换，encode 必填，保证 round-trip
.pipe(target)          // 链接到下个 schema
.brand<B>()            // nominal type（纯类型层）
.catch(fallback)       // 失败降级
.encode(value)         // Go json.Marshal 对偶
['~standard']          // Standard Schema 双向兼容
```

**Parse 入口**

```ts
.parse(value)        // [error: SchemaError | null, value: O]
.parseAsync(value)   // Promise<[error, value]>，支持 async refine
```

Go 风元组,**永远不抛错**。`value` 永远是 `O` 类型 —— 成功时是解析后的值,失败时是 schema 零值(同 `parse(undefined)`)。用法:

```ts
const [err, user] = userSchema.parse(input)
if (err) {
  console.error(err.prettify())
  return
}
console.log(user.name)   // 成功路径,user 类型已 narrow
```

与 `http` / `sse` / `web_socket` 三个传输的 `[error, data, response]` 元组完全同构。这是包内唯一的解析入口 —— 没有 throws 版,没有 safeParse 版,**一种最佳实践**。

**String 内建约束**

```ts
.min(n) / .max(n) / .length(n)
.regex(/pattern/) / .email() / .url() / .uuid()
.startsWith(prefix) / .endsWith(suffix)
.datetime() / .ip() / .cuid() / .nanoid()
```

**Number 内建约束**

```ts
.min(n) / .max(n) / .gt(n) / .gte(n) / .lt(n) / .lte(n)
.int() / .positive() / .negative() / .nonnegative() / .nonpositive()
.finite() / .multipleOf(divisor)
```

**Array 内建约束**

```ts
.min(n) / .max(n) / .length(n) / .nonempty()
```

**Object utility**

```ts
.strict(options?)         // { unknownKeys?, missingKeys? }
.passthrough()            // 保留未知字段
.strip()                  // 丢弃未知字段（默认）
.pick({ a: true, b: true })
.omit({ a: true })
.partial()                // 所有字段变 optional
.required()               // 所有字段变 required
.extend({...})            // 追加/覆盖字段
.merge(otherObjectSchema)
.keyof()                  // 返回 enum schema with declared keys
```

**SchemaError 与全局错误**

```ts
error.format()      // { _errors: [], [key]: subtree }
error.flatten()     // { formErrors: [], fieldErrors: {} }
error.prettify()    // 多行可读字符串
setErrorMap(map)    // 全局拦截 issue.message，i18n 友好
```

### Standard Schema 互操作

任何 `@defjs/core` schema 都暴露 `~standard` 属性（`vendor: 'defjs', version: 1`），可直接传给 tRPC v11 / Hono / TanStack Form / Drizzle / RHF resolvers 等支持 Standard Schema 的库。

```ts
const userSchema = schema.object({...})
const standard = userSchema['~standard']
const result = await standard.validate({...})  // { value } | { issues }
```

## HTTP

### 定义 endpoint

```ts
import { defineRequest, schema } from '@defjs/core'

const getUserInfo = defineRequest({
  method: 'GET',
  path: '/user/:id',
  input: schema.object({
    userId: schema.number(),
  }),
  build: (request, input) => {
    request.pathParams({
      id: input.userId,
    })
  },
  output: {
    200: schema.object({
      id: schema.number(),
      name: schema.string(),
    }),
    404: schema.object({
      code: schema.string(),
      message: schema.string(),
    }),
  },
})
```

请求侧只有 `build(request, input)` 这一条主路径。HTTP 的 `request` builder（HTTP / SSE / WebSocket 各有**独立的 interface**，不共用、不互为子集）暴露：

1. `request.pathParams(...)`
2. `request.queryParams(...)`
3. `request.headers(...)`
4. `request.body(...)`
5. `request.json(...)`
6. `request.text(...)`
7. `request.html(...)`
8. `request.xml(...)`
9. `request.formData(...)`
10. `request.formUrlEncoded(...)`

其中：

1. `request.body(...)` 是通用入口
2. `request.formData(...)` 只接受可安全编码为 multipart 的标量、`Blob` / `File` 及其数组
3. 没有 body 时不会设置 `Content-Type`
4. 只有自动检测不到 body 类型时，才兜底成 `application/octet-stream`

### 调用

无配置：

```ts
const [error, data, response] = await getUserInfo.use({
  userId: 1,
})
```

有配置：

```ts
const [error, data, response] = await getUserInfo.use({
  userId: 1,
})({
  client,
  handler,
  timeout: 10_000,
  abort: ac.signal,
  onUploadProgress(event) {},
  onDownloadProgress(event) {},
  context,
})
```

第二段 HTTP 配置：

1. `client?: Client`
2. `handler?: HttpHandler`
3. `timeout?: number`
4. `abort?: AbortSignal`
5. `onUploadProgress?: HttpProgressFn`
6. `onDownloadProgress?: HttpProgressFn`
7. `context?: HttpContext`

### 返回值

HTTP 固定返回：

```ts
[error, result, response]
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
    200: schema.blob(),
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
  200: userSchema,
  201: userSchema,
  404: errorSchema,
}
```

```ts
output: [
  {
    status: [200, 201],
    body: userSchema,
  },
  {
    status: 404,
    body: errorSchema,
  },
]
```

## SSE

### 定义 endpoint

```ts
import { defineEventStream, schema } from '@defjs/core'

const watchUserInfo = defineEventStream({
  path: '/user/:id/events',
  input: schema.object({
    userId: schema.number(),
  }),
  build: (request, input) => {
    request.pathParams({
      id: input.userId,
    })
  },
  events: {
    message: schema.object({
      id: schema.number(),
      name: schema.string(),
    }),
    default: schema.unknown(),
  },
})
```

SSE 的 `request` builder（与 HTTP / WebSocket **各自独立**的 interface）只暴露：

1. `request.pathParams(...)`
2. `request.queryParams(...)`
3. `request.headers(...)`

SSE 走 GET，没有请求体，所以不存在 `body / json / text / html / xml / formData / formUrlEncoded`。这不是从 HTTP builder Pick 出来的子集 —— 是从零定义的独立 interface，IDE 自动补全就是这三个。

### 调用

无配置：

```ts
const [error, stream, open] = await watchUserInfo.use({
  userId: 1,
})
```

有配置：

```ts
const [error, stream, open] = await watchUserInfo.use({
  userId: 1,
})({
  client,
  fetch,
  timeout: 10_000,
  abort: ac.signal,
  context,
})
```

第二段 SSE 配置：

1. `client?: Client`
2. `fetch?: typeof fetch`
3. `timeout?: number`
4. `abort?: AbortSignal`
5. `context?: HttpContext`

### 返回值

SSE 固定返回：

```ts
[error, stream, open]
```

其中：

1. `error` 只表示启动阶段错误
2. `open` 是启动元信息，包含 `response` 和 `url`
3. `stream.closed` 表示流结束信息

### 事件处理规则

当前是宽松语义：

1. 未声明事件直接跳过
2. 已声明但 payload 校验失败的事件也直接跳过
3. 不提供 strict 模式

## WebSocket

### 定义 endpoint

```ts
import { defineWebSocket, schema } from '@defjs/core'

const chatSocket = defineWebSocket({
  path: '/ws/chat',
  input: schema.object({
    roomId: schema.string(),
  }),
  build: (request, input) => {
    request.queryParams({
      roomId: input.roomId,
    })
  },
  incoming: {
    message: schema.object({
      text: schema.string(),
    }),
  },
  outgoing: {
    message: schema.object({
      text: schema.string(),
    }),
  },
  protocols: ['json'],
})
```

WebSocket 的 `request` builder（与 HTTP / SSE **各自独立**的 interface）只暴露：

1. `request.pathParams(...)`
2. `request.queryParams(...)`

WebSocket Web API 不支持自定义握手 headers（见下文"WebSocket 规则"），也没有请求体。这同样不是从其它 builder Pick 出来的子集 —— 是从零定义的独立 interface，IDE 自动补全就是这两个。

### 调用

无配置：

```ts
const [error, socket, connection] = await chatSocket.use({
  roomId: 'room-1',
```

有配置：

```ts
const [error, socket, connection] = await chatSocket.use({
  roomId: 'room-1',
})({
  client,
  protocols: ['json'],
  beforeConnect: async () => {},
  reconnect: {
    attempts: 1,
  },
  heartbeat: {
    intervalMs: 30_000,
    message: () => ({
      type: 'ping',
    }),
  },
  queue: {
    maxSize: 100,
  },
  timeout: 10_000,
  abort: ac.signal,
})
```

第二段 WebSocket 配置：

1. `client?: Client`
2. `protocols?: readonly string[]`
3. `beforeConnect?: () => void | Promise<void>`
4. `reconnect?: WebSocketReconnectOptions`
5. `heartbeat?: WebSocketHeartbeatOptions`
6. `queue?: WebSocketQueueOptions`
7. `timeout?: number`
8. `abort?: AbortSignal`

### 返回值

WebSocket 固定返回：

```ts
[error, socket, connection]
```

其中：

1. `connection` 包含 `url / protocol / extensions`
2. `socket.receive` 是 `AsyncIterable`
3. `socket.send(...)` 会按 outgoing schema 校验
4. `socket.closed` 提供关闭信息

### WebSocket 规则

1. 当前只对齐标准 WebSocket Web API
2. 不支持自定义握手 headers
3. `protocols` 是覆盖型字段
4. `beforeConnect` 是无参通知 hook，不消费返回值
5. `heartbeat.message` 是可选函数；不提供时不会主动发 heartbeat 消息
6. 未声明消息直接跳过
7. 已声明但 payload 校验失败的消息也直接跳过

## `context + interceptor`

事务、trace、request-scoped metadata 当前统一走：

1. `context`
2. `interceptor`

建议边界：

1. 事务状态、trace、request-scoped metadata 放进 `context`
2. 需要基于这些上下文改写 headers/query/body 的逻辑放进 interceptor
3. 不在 `client` 或 endpoint 定义层新增事务字段

## 当前不提供

当前明确不纳入主设计的能力：

1. `schema.empty()`
2. `executeRaw(...)`
3. SSE / WebSocket strict 模式
4. WebSocket 自定义握手 headers
5. WebSocket 自定义 transport / factory
6. OpenAPI 生成与 schema 导出
