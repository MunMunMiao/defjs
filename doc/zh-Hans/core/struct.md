---
title: Struct
description: 建模请求和响应形状，解析 unknown，编码线上 body。
---

# Struct

把请求（以及响应）建成 Struct。TypeScript 类型靠 `Infer`，运行时检查靠 `struct.parse(...)`——不抛，错误优先 tuple。

## 基本用法

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

解析输出只保留已声明字段。缺必填、原始类型不对、嵌套坏了、tuple 长度不对、不允许的 `null` → `StructError`，没有半成品。Struct 不可变；`.optional()` 这类方法返回新 Struct。

## 必填、可选、null

「有没有」和「能不能 null」是两件事：

| 声明                         | 缺失 / `undefined`     | `null` | 合法值      |
| ---------------------------- | ---------------------- | ------ | ----------- |
| `struct.string()`            | 拒绝                   | 拒绝   | 接受 string |
| `struct.string().optional()` | 接受；对象缺字段则省略 | 拒绝   | 接受 string |
| `struct.string().null()`     | 拒绝                   | 接受   | 接受 string |
| `struct.string().nullish()`  | 接受；对象缺字段则省略 | 接受   | 接受 string |
| `struct.null()`              | 拒绝                   | 接受   | 拒绝其他值  |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

在根上，optional 可以是 `undefined`。在对象里，省略的 optional/nullish 字段保持缺席。`struct.request(...)` 里全可选的段可以省略（归一成 `{}`）；有必填字段的段仍必填。Body wrapper 一旦出现 → body 必填，哪怕内部字段都 optional。

## 请求 body wrapper

`struct.request(...)` 拆开 `path`、`query`、`headers`、`body`。Body 要显式 codec：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| Wrapper                    | 解析值            | 线上边界                                                             |
| -------------------------- | ----------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | 来自 `inner` 的值 | JSON 文本，`application/json`                                        |
| `struct.text()`            | `string`          | 文本，`text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | Shape 的对象      | `URLSearchParams`，`application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Shape 的对象      | `FormData`；平台设 multipart boundary                                |
| `struct.blob()`            | `Blob`            | Blob type 或 `application/octet-stream`                              |
| `struct.file()`            | `File`            | 原生 `File`（name + type）                                           |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | Buffer，`application/octet-stream`                                   |

`struct.file()` 是表单字段的值 Struct——不是独立的 `request.body`。二进制 body 用 `struct.blob()` 和 `struct.arrayBuffer()`。裸 object/array/primitive Struct 不能当 `request.body`。SSE 拒绝 `body`。WebSocket 请求输入拒绝 `body` 和 `headers`。

## Alias

`.alias(...)` 把逻辑名和线上名分开。`struct.parse(...)` 用逻辑 key。JSON 和平铺请求 codec 编码 alias；JSON 响应解码把线上 key 映回逻辑字段。

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| 边界                                       | 字段                      |
| ------------------------------------------ | ------------------------- |
| `struct.parse(User, ...)`                  | 逻辑 `displayName`        |
| JSON 请求编码                              | 线上 `display_name`       |
| JSON 响应解码                              | 线上 → 逻辑 `displayName` |
| Query、header、URL-encoded、multipart 编码 | 线上 alias 当 key         |

Alias 对嵌套字段、数组、对象、union、discriminator 都管用。业务代码用逻辑名；外部命名写在 Struct 里。

## 解析失败

`struct.parse(...)` 返回 `[null, value]` 或 `[StructError, undefined]`。`StructError` 继承 `Error`，暴露 `issues`，还有 `format()`、`flatten()`、`prettify()`。

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

`StructIssue` 有 `code`、`expected`、`message`、`path`、`received`。Issue 可能带着不可信输入——日志或回传前先脱敏。`struct.parse(..., { errorMap })` 只覆盖那一次 parse 的文案。

Struct 校验只做结构。没有公开的 range、format、refinement、鉴权或状态迁移规则。那些检查放在打 command 之前。

## 参考

`@defjs/core` 上的公开构造（内部不是 facade API）：

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| 构造                             | 输入                                      | 推断输出                 |
| -------------------------------- | ----------------------------------------- | ------------------------ |
| `struct.number()`                | 非 `NaN` 的 number                        | `number`，含 ±`Infinity` |
| `struct.date()`                  | `Date`、number 或日期字符串               | 合法 `Date`              |
| `struct.bigint()`                | `bigint` 或 `BigInt(...)` 能接受的 string | `bigint`                 |
| `struct.enum(...)`               | 声明过的 string 或 number 成员            | 该字面量 union           |
| `struct.discriminatedUnion(...)` | 带必填字面量 discriminator 的对象         | 选中的对象分支           |
| `struct.or(...)`                 | 第一个匹配的分支；编码会查歧义            | 分支输出的 union         |
| `struct.intersection(...)`       | 每个成员都接受的值                        | 输出的 intersection      |
| `struct.record(value)`           | 值匹配 `value` 的普通对象                 | 解析值的 Record          |
| `struct.tuple(items)`            | 长度恰好等于声明的数组                    | 定长 tuple               |

每个 Struct 都支持 `.alias(name)`、`.optional()`、`.null()`、`.nullish()`。`struct.discriminatedUnion` 需要带必填字面量 discriminator 的对象选项，并拒绝重复。

从 `@defjs/core` 导入 `struct`、`Infer`、`Struct`、`StructError` 及相关公开类型。解析用 `struct.parse(...)`。别导入 `createObjectStruct`、definition symbol、codec 内部，或 `packages/core/src`。

Facade 的非承诺：

- Object/record 输出用 null prototype——别假定有 `Object.prototype` 方法。
- 未知对象 key 会丢掉。
- `struct.number()` 拒绝 `NaN`，接受 infinity。
- `struct.or(...)` 按顺序试分支；分支编码冲突时拒绝歧义。
- `struct.intersection(...)` 按声明顺序解析成员。
- Struct 校验边界；它不缓存、不授权、不拥有传输资源。

## 相关配方

- [POST JSON](../recipes/post-json.md)
- [声明了 404 的 GET](../recipes/get-declared-404.md)
