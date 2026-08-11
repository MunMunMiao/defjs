# Struct

`Struct` 是 Defjs 用来描述协议边界的结构合同：它声明字段、字段的外部 wire name，以及值在边界上的结构解析和基础类型转换。它采用严格的字段存在性规则；Go 中“先定义目标结构体再解码”的做法可以帮助理解类型合同，但 Struct 不会在解析失败时返回零值或部分结果，也不是通用的业务 validation DSL。

Struct 主要回答三个问题：

1. 输入或响应应当有哪些结构字段？
2. 外部字段名如何映射到 TypeScript 属性名？
3. 缺失值、`null`、基础类型转换和结构错误应当如何得到稳定、可中止的结果？

它不回答邮箱是否合法、金额是否为正、用户是否有权限、订单状态能否流转等应用问题。

## 快速开始

从根入口导入 `struct`、`Infer` 和 endpoint API：

```typescript
import { createClient, defineRequest, struct, type Infer, type StructInput, withEndpoint } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  displayName: struct.string().alias('display_name'),
})

type User = Infer<typeof User>

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [{ status: 200, body: User }] as const,
})

const client = createClient(withEndpoint('https://api.example.com'))
const [error, user] = await client.execute(getUser({ path: { id: 1 } }))
if (error) throw error

console.log(user.id, user.displayName)
```

`Infer<typeof User>` 是解析后的输出类型。`alias('display_name')` 只改变外部协议中的字段名，不把 TypeScript 属性 `displayName` 改成 `display_name`。

Struct 实例本身没有 `.parse()`、`validate`、`parseAsync` 或 `encode` 方法。需要独立解析时使用 facade 上的 `struct.parse(User, input)`；HTTP、SSE、WebSocket endpoint runtime 和 request builder 也会在各自边界使用同一份 Struct metadata。

## 公共构造器

`struct` facade 当前提供以下构造器。这里按用途分组，不对应内部实现的全部 definition kind。

| 用途                     | 构造器                                                          | 说明                                                                      |
| ------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 基础值                   | `string`、`number`、`boolean`、`null`                           | 字符串、数字、布尔值和显式 `null`                                         |
| 不透明值                 | `any`、`unknown`                                                | 接受不受 Struct 约束的值；`any` 的输出类型也不提供静态保证                |
| 固定值                   | `literal`、`enum`                                               | 单个字面量或非空枚举；枚举支持字符串数组和含字符串/数字值的对象           |
| 平台/转换值              | `date`、`bigint`                                                | 输入可来自 wire 表示，输出分别是 `Date` 和 `bigint`                       |
| 二进制值                 | `blob`、`file`、`arrayBuffer`                                   | 浏览器平台值                                                              |
| 复合值                   | `object`、`array`、`tuple`、`record`                            | 对象、列表、固定长度序列和任意 key 的记录                                 |
| 组合值                   | `or`、`intersection`、`discriminatedUnion`                      | 普通 union、交集和按 discriminator 路由的 union                           |
| 请求包装                 | `request`                                                       | 将 path、query、headers、body 组织成 request sections                     |
| body codec / binary body | `json`、`urlencoded`、`formData`、`text`、`blob`、`arrayBuffer` | 为 request body 选择 JSON、表单、文本或二进制编码；后两者是直接二进制路径 |

`struct.blob()` 和 `struct.arrayBuffer()` 既是值 Struct，也可以直接作为二进制 request body。普通 `struct.object(...)` 不能直接放入 `struct.request({ body: ... })`；JSON body 应使用 `struct.json(objectStruct)`，表单 body 使用 `struct.urlencoded(shape)` 或 `struct.formData(shape)`。

常见组合示例：

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

const UserId = struct.or(struct.string(), struct.number())
const Coordinates = struct.tuple([struct.number(), struct.number()])
const Headers = struct.record(struct.string())
const Combined = struct.intersection(struct.object({ id: struct.string() }), struct.object({ displayName: struct.string() }))
```

## 严格解析与显式零值

`struct.parse(schema, input)` 返回固定的 error-first 二元组：

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

解析失败时第二项固定为 `undefined`，不会构造整个 Struct 的零值，也不会暴露此前已成功解析的兄弟字段。

```typescript
const DailySummary = struct.object({
  orders: struct.number(),
  acceptingOrders: struct.boolean(),
  adjustmentIds: struct.array(struct.string()),
  operatorMessage: struct.string(),
})

const [missingError, missingSummary] = struct.parse(DailySummary, {})
// missingError.issues[0] 指向 orders；missingSummary 是 undefined。

const [error, summary] = struct.parse(DailySummary, {
  orders: 0,
  acceptingOrders: false,
  adjustmentIds: [],
  operatorMessage: '',
})
// error 是 null；0、false、[]、'' 是调用方显式提供的合法值。
```

`date`、`bigint` 以及 JSON codec 仍会做边界转换：例如 `date` 接受 `Date`、字符串或数字并输出 `Date`，`bigint` 接受 `bigint` 或字符串并输出 `bigint`。无效日期或不符合 `bigint` 输入规则的值产生结构错误。

`struct.object(shape)` 只遍历声明的 shape，未知 key 会被丢弃。`array`、`record`、`tuple`、object 和 intersection 都在第一个确定错误处停止；tuple 输入长度必须与声明长度完全一致。解析后的 object 和 record 使用 null prototype；依赖 `Object.prototype` 方法时，应使用 `Object.keys`/`Object.entries`，或显式复制为普通对象。

Node 的 strict deep equality 会比较 prototype，因此 Struct 解析结果不会与字段相同的 object literal 深度相等。测试应显式断言这个边界，或只在断言处做 shallow copy：

```typescript
import assert from 'node:assert/strict'

const [profileError, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(profileError, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

Spread 只适用于这里的浅层断言；嵌套 Struct object 仍使用 null prototype。不要仅为迎合测试 matcher 而在生产路径增加全局 normalize 或 clone。

## 缺失、`null` 与修饰符

`optional()`、`null()` 和 `nullish()` 会返回带有新 flags 的 Struct，不会改变原 Struct。实际行为取决于 Struct 位于对象字段位置还是作为顶层 value：

| 输入情况                   | 普通 Struct   | 对象字段 `.optional()` | 对象字段 `.null()` | 对象字段 `.nullish()` |
| -------------------------- | ------------- | ---------------------- | ------------------ | --------------------- |
| 字段缺失或值为 `undefined` | `StructError` | 省略 key               | `StructError`      | 省略 key              |
| 显式 `null`                | `StructError` | `StructError`          | 保留 `null`        | 保留 `null`           |
| 存在且类型正确             | 解析后的值    | 解析后的值             | 解析后的值         | 解析后的值            |
| 存在但类型错误             | `StructError` | `StructError`          | `StructError`      | `StructError`         |

具体规则如下：

- `.optional()` 在对象字段位置对缺失或 `undefined` 省略字段；作为顶层 value 的缺失结果是 `undefined`。显式 `null` 仍失败。
- `.null()` 只接受显式 `null`，不会让字段变成 optional；缺失或 `undefined` 仍失败。
- `.nullish()` 同时设置 optional 和 nullable：缺失时省略对象字段，显式 `null` 时保留 `null`；作为顶层 value 时，缺失结果是 `undefined`。
- `.null()` 或 `.nullish()` 不会让任意非 null 值免于类型解析；错误类型仍然失败。

Object input 属性默认必填；只有 `.optional()` 或 `.nullish()` 字段可以省略。启用 `exactOptionalPropertyTypes` 时，推导出的 object input 使用 exact optional property：调用方应省略 optional 或 nullish key，而不是显式赋值 `undefined`。

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

运行时面对 unknown input 时仍会防御性地接受 optional/nullish 字段的显式 `undefined`，并从解析结果中省略该 key；这项 normalization 不会放宽静态调用方的 input 类型。

## 结构解析与应用校验

Struct 的“validation”语境指结构边界失败，不是返回布尔值的业务验证器。它会：

- 读取声明的字段并丢弃未知 object key；
- 要求普通字段存在，并按 optional、nullable、nullish 修饰符处理缺失或 `null`；
- 检查基础类型、literal、enum、数组、tuple、record 和对象结构；
- 对 `date`、`bigint` 等支持的 wire/runtime 类型做转换；
- 在第一个结构问题处停止并产生一个 `StructIssue`。

当前 Struct 没有 `.min()`、`.max()`、`.int()`、`.nonempty()`、`.refine()`、`.transform()`、`.default()`、`.strip()`、`.passthrough()`、`.pick()` 或自定义 predicate。以下规则应放在 service、router 或专用 validator 层：

- 字符串非空、邮箱/正则格式和标识符前缀；
- 数字必须为整数、有限值、正数、金额精度或处于某个范围；
- 权限、租户归属、库存上限和不可变字段；
- 跨字段约束，例如结束时间必须晚于开始时间；
- 订单状态流转和安全授权。

Struct 会区分“没有传字段”和“显式传入合法的 `0`、`false`、`''` 或 `[]`”：前者对必填字段失败，后者正常解析。它仍不判断这些显式值是否满足业务规则；业务约束应由 service、router 或专用 validator 负责。

## Alias 与 wire key

`.alias(name)` 只改变 wire key，不改变逻辑字段名、`Infer`、request section 或 body codec。JSON、query、path、headers、URL-encoded 和 FormData 的自动编解码都会读取同一 alias。

```typescript
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`logicalUser` 和 `responseUser` 使用 `{ id, displayName }`；`wireKeyError` 指向缺失的逻辑 `id`；`requestWireBody` 则是 `{ user_id, display_name }`。公开 `struct.parse` 读取逻辑值，transport JSON 编解码才会应用 wire alias。

| 概念              | 示例                      | 结果                                                |
| ----------------- | ------------------------- | --------------------------------------------------- |
| TypeScript 属性名 | `displayName`             | 调用方和解析后对象使用 `displayName`                |
| wire key          | `display_name`            | JSON/query/path/headers/表单编码使用 `display_name` |
| 解析后的值        | `{ displayName: 'Ada' }`  | 不会变成 `{ display_name: 'Ada' }`                  |
| 编码后的值        | `{ display_name: 'Ada' }` | 发到协议边界的 key                                  |

同一 object shape 内的 wire key 必须唯一；两个字段不能通过 alias 解析成同一个外部 key。不同 request section 可以各自使用同名 wire key，因为它们属于不同的协议位置。

显式 `build(ctx, input)` 时需要区分 bound view 和最终 wire key。`input` 是从 endpoint input Struct 生成的 schema-bound view，不是实际业务值，也不是可以拿去复用的 field Struct。例如：

```typescript
build(ctx, input) {
  ctx.setJson({
    name: input.body.displayName,
  })
}
```

这里对象字面量中的 `name` 已经是最终 wire key，不会再自动套用 `display_name`。如果把整个 keyed object 交给 JSON encoder，encoder 才会按对象 Struct metadata 递归应用 aliases。自动构建 `struct.request(...)` 时，runtime 会按 section 和 field metadata 使用 alias。

## Union 与 discriminated union

### 普通 union

`struct.or(a, b, ...)` 按声明顺序尝试 option，第一条成功的分支胜出：

```typescript
const Identifier = struct.or(struct.string(), struct.number())
type Identifier = Infer<typeof Identifier> // string | number
```

顺序是合同的一部分。重叠分支会让前面的分支吸收后面的分支；`struct.any()` 或 `struct.unknown()` 这类宽泛分支也可能让后续分支永远没有机会。每个 option 内部都 fail-fast；第一个成功 option 立即返回。所有 option 都失败时只产生一个外层 `invalid_union` issue，不聚合候选分支的错误。

### 判别联合

对象事件等需要稳定路由时，优先使用 `discriminatedUnion`：

```typescript
const Event = struct.discriminatedUnion('type', [
  struct.object({
    type: struct.literal('parcel_packed'),
    orderId: struct.string(),
    parcels: struct.number(),
  }),
  struct.object({
    type: struct.literal('delivery_delayed'),
    orderId: struct.string(),
    reason: struct.string(),
  }),
])

type Event = Infer<typeof Event>

function summarize(event: Event): string {
  if (event.type === 'parcel_packed') return `${event.parcels} parcels packed`
  return `${event.orderId} delayed: ${event.reason}`
}
```

每个 option 必须是 object Struct，必须含同名 discriminator 字段，且该字段必须是 required `struct.literal(...)`；除纯 `literal(null)` 外，不能用 modifier 扩大 discriminator 的取值。discriminator value 必须唯一。这些是定义时约束，违反时抛 `TypeError`。解析时：

- 已知 discriminator 只路由到对应 option，再解析该分支；不会在其他 option 之间回退。
- 缺失或未知 discriminator 无法路由，会产生 `StructError`，issue path 指向 discriminator。
- 已选分支的字段错误会保留该字段路径。
- JSON codec 支持 discriminator 字段的 alias；按 option 声明顺序读取第一个实际存在的 wire discriminator，选中分支后不再访问其他 option 的 alias。

## Request sections

`struct.request(...)` 表达直接映射到 request 的四个 section：`path`、`query`、`headers` 和 `body`。

只需声明实际使用的 section；一旦声明，该 section 本身就是必填的。section 内只有标记为 optional 或 nullish 的字段可以省略。例如声明 `query: struct.object({ page: struct.number().optional() })` 后，`query: {}` 合法，但完全省略 `query` 会失败。

```typescript
const UpdateInput = struct.request({
  path: struct.object({
    userId: struct.number().alias('id'),
  }),
  query: struct.object({
    includeProfile: struct.boolean().optional().alias('include_profile'),
  }),
  headers: struct.object({
    traceId: struct.string().alias('x-trace-id'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('display_name'),
    }),
  ),
})

const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: UpdateInput,
})

updateUser({
  path: { userId: 1 },
  query: { includeProfile: true },
  headers: { traceId: 'trace-1' },
  body: { name: 'Miao' },
})
```

当 HTTP、SSE 或 WebSocket endpoint runtime 未提供显式 `build` 时，内部 request builder 才会读取 `struct.request` metadata 并默认 materialize：

1. `path` -> path params；
2. `query` -> query params；
3. `headers` -> HTTP headers；
4. `body` -> body wrapper 指定的 codec。

`struct.request` 只声明 sections 和 body codec；它本身不执行 materialize，也不能独立构建请求。`path`、`query` 和 `headers` 必须是 flat object Struct。`urlencoded` 和 `formData` 的便捷构造器也接收 flat shape；JSON body 可以嵌套对象。SSE request input 不支持 body；WebSocket request input 只支持 path 和 query，不支持 headers 和 body，这些是 transport runtime 的限制。

Path placeholder 应传入原始 scalar 值；Core 在替换时会对每个值恰好执行一次 `encodeURIComponent`。调用方不要预编码，否则 `%` 会再次编码为 `%25`。

如果写了显式 `build`，默认 materialize 不再替你完成 request plan；`build` 必须明确写出需要的 section 和 body 编码。`struct.request` 负责表达结构和 codec，不负责决定应用层业务校验，也不改变 transport 的生命周期合同。

## StructError 与解析失败

定义时传入错误的构造参数，例如非法的 discriminated union option，会抛 `TypeError`。对一个已经定义的 Struct 解析错误类型值，则产生 `StructError`，其中每个 `StructIssue` 包含 `code`、`expected`、`message`、`path` 和 `received`。

公共 `struct.parse` 使用以下结果形状：

```text
成功: [null, parsedValue]
失败: [StructError, undefined]
```

对象、数组、record、request、tuple 等在第一个错误处停止；不会把部分成功 output 暴露给调用方。为了兼容错误展示 API，`StructError.issues` 仍是数组，但正常解析失败只包含当前第一个 issue。内部 `parseStructValue` 是 throwing adapter；应用应使用根入口的 `struct.parse`，不要依赖 `./introspection` 等内部路径。

在 endpoint runtime 中，Struct 错误会由对应 transport 再包装。例如 HTTP 输入结构失败通常成为 `definition/REQUEST_VALIDATION_FAILED`。响应错误的 status dispatch 条件见下面的 HTTP 矩阵；这一步属于 endpoint 层，不属于 Struct 本身。

```typescript
import { StructError } from '@defjs/core'

const [error, result] = await client.execute(command)

if (error?.kind === 'definition' && error.code === 'RESPONSE_VALIDATION_FAILED') {
  if (error.cause instanceof StructError) {
    console.error(error.cause.flatten())
    console.error(error.cause.prettify())
  }
}
```

`StructError` 还提供 `issues`、`format()`、`flatten()` 和 `prettify()`。`setErrorMap(map)` 可以全局替换后续 issue 的 message；清理时调用 `setErrorMap(undefined)`。`received`、message 和完整 cause 可能包含输入或响应 payload，不应在没有脱敏策略时写入日志。

### Struct 不提供 HTTP tuple

`[error, result, response]`、HTTP status、`HTTP_STATUS`、`UNDECLARED_STATUS`、`HttpResponse` 以及 HTTP error 的 `data` 都是 endpoint/transport 层的合同。Struct 本身没有 status、response 或 HTTP tuple。

有 `output` 时，底层 Fetch 会先按 effective `responseType` 读取 body representation，并可能把 codec 异常记录在 `HttpResponse.error`。Command 随后按固定优先级分类结果：status 0 transport failure → 无 `output` → 精确 status 匹配或 `UNDECLARED_STATUS` → `response.error` → Struct parse。这个顺序描述的是结果分类优先级，不是底层读取 body 的时机；只有精确匹配的已声明 output 才会消费 representation error 并进入 Struct。声明 `output` 但省略 `responseType` 时，effective mode 是 `json`；显式 `text`、`blob`、`arraybuffer` 则使用各自的 representation，不把 JSON-looking bytes 当作 JSON syntax。无 `output` 时也不能声明 `responseType`，底层会取消响应 body，不读取或解码 representation。当前条件矩阵如下：

| HTTP 分支                        | 条件                                                                                                                             | 当前包装                                                                                           |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| 无 `output`                      | 该分支优先于 `response.error` 和 Struct；`responseType` 不允许声明，底层取消 body 且不读取或解码 representation                  | 2xx 是 success，result 为 `undefined`；非 2xx 是 `HTTP_STATUS`，data 为 `undefined`；response 保留 |
| 有 `output` 但 status 未精确命中 | 底层 Fetch 可能已读取 representation 或记录 codec error，但 command 的 `UNDECLARED_STATUS` 分类优先；包括未声明的 2xx 和 non-2xx | `UNDECLARED_STATUS`；不执行 Struct decode                                                          |
| 精确命中、2xx                    | representation decode 和 Struct parse 都成功                                                                                     | success result 为 parsed value，success response.body 也是 parsed value                            |
| 精确命中、non-2xx                | representation decode 和 Struct parse 都成功                                                                                     | `HTTP_STATUS`；typed parsed value 在 `error.data`，`error.response.body` 保留原始 representation   |
| 精确命中但 decode/shape 失败     | runtime 判定 representation 或 Struct 不能接受                                                                                   | `RESPONSE_VALIDATION_FAILED`；result 和 `error.data` 不提供，`HttpResponse` 可保留                 |

`HTTP_STATUS + error.data` 只适用于精确命中的 non-2xx 且 representation、Struct 都成功的路径；它不是所有声明响应 Struct 出错时的 fallback。HTTP 的详细结果和 response 可用性请看 [HTTP 文档](../../../../doc/core/http.md) 与 [错误文档](../../../../doc/core/errors.md)，不要把 endpoint tuple 语义反推成 Struct API。

另一个需要区分的边界是 JSON representation error：底层 Fetch 在 effective mode 为 `json` 时会尝试解析非空 body；声明 `output` 且省略 `responseType` 会得到该默认 mode。Fetch 会把原始异常保存到 `HttpResponse.error`；只有精确匹配的已声明 output 才由 command 层在调用 Struct 前将其转换为 `RESPONSE_VALIDATION_FAILED`，返回 `[error, undefined, httpResponse]`，并把 codec 异常保留为 `cause`。无 output 不读取 body，未声明 status 则走更早的分类分支。因此 malformed body 不会成为 Struct value，也不会产生 typed `error.data`。

普通 non-2xx status 不会自动填充 `HttpResponse.error`；它由 `status` 与 `ok` 表达，并在 representation 和 Struct 都成功后成为带 typed `error.data` 的 `HTTP_STATUS`。未声明 status 与未声明 output 的 endpoint 仍遵循各自更早的分支，不被后续 representation error 覆盖。

## 现有实践与源码索引

以下示例与当前 public API 对齐，可作为实际用法参考：

- [`examples/struct-zero-values`](../../../../examples/struct-zero-values/src/index.ts)：显式 `0`、`false`、空集合/字符串，以及 optional、nullable 和 nullish。
- [`examples/struct-discriminated-union`](../../../../examples/struct-discriminated-union/src/index.ts)：按事件类型路由并获得 TypeScript 窄化。
- [`examples/struct-response-validation-error`](../../../../examples/struct-response-validation-error/src/index.ts)：响应 Struct 形状错误和 `StructError` 诊断。
- [`public_api.ts`](./public_api.ts) 与 [`facade.ts`](./facade.ts)：公共导出和 `struct` 构造器。
- [`parse.ts`](./parse.ts) 与 [`introspection.ts`](./introspection.ts)：严格 Struct 解析和内部 adapter 实现。
- [`errors.ts`](./errors.ts)：`StructError`、issue message 和错误视图。
- [`doc/core/struct.md`](../../../../doc/core/struct.md)：面向使用者的 Struct 文档。
- [`doc/core/commands.md`](../../../../doc/core/commands.md)：request input、默认构建和 transport 约束。

历史文档或研究材料中若出现 `tag.*`、`RuntimeStruct`、`TypeOf`、`InputOf` 或直接导入 `codec`/`introspection` 的示例，不代表当前 `@defjs/core` 公共 API；应以当前根入口导出、类型测试和上述源码为准。
