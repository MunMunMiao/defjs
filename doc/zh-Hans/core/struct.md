---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# 结构

`@defjs/core` 提供一个轻量的 struct 外观，用于声明结构、验证输入和推断类型。设计意图参考 Go 的 `encoding/json`：零值默认值、接受部分输入、稳定可预测的运行时行为。

## 基础类型

所有结构都通过 `struct` 命名空间创建，支持链式调用 `.optional()`、`.null()`、`.nullish()` 和 `.alias(name)`。

### 标量

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

可用标量：

| 构造器                 | 输入类型                                | 输出类型      | 零值                 |
| ---------------------- | --------------------------------------- | ------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`      | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`      | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`     | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`      | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`        | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`        | `null`               |
| `struct.any()`         | `unknown`                               | `any`         | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`     | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`        | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`        | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer` | `new ArrayBuffer(0)` |

### 可选和可空

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // 输出类型：string | undefined
  age: struct.number().null(), // 输出类型：number | null
  nick: struct.string().nullish(), // 输出类型：string | null | undefined
})
```

### 枚举和字面量

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.enum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### 数组、元组、记录

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### 联合和交集

```typescript
const Id = struct.or(struct.string(), struct.number())
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### 可区分联合

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## 请求结构

`struct.request(...)` 将 `path`、`query`、`headers` 和 `body` 组织成单个输入结构，供端点自动构建 HTTP 请求。

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

Body 包装器决定传输编码：

| 包装器                     | 编码               |
| -------------------------- | ------------------ |
| `struct.json(struct)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | 纯文本             |
| `struct.blob()`            | 二进制 Blob        |
| `struct.arrayBuffer()`     | 二进制 ArrayBuffer |

## `Infer<T>` 类型推断

`Infer<T>` 提取结构的输出类型。它是你唯一需要掌握的类型级辅助工具。

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` 也适用于 `struct.array(...)`、`struct.or(...)`、`struct.request(...)`：

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser>
// { path: { orgId: number }; query: { dryRun?: boolean }; headers: { 'X-Api-Key': string }; body: { name: string } }
```

## StructError 和错误映射

`StructError` 是承载 `StructIssue[]` 的运行时错误容器。Defjs 在请求/响应验证失败时可能把它作为底层 `cause` 使用；你在需要格式化或传递已收集问题时，也可以直接构造它。对象缺失字段会被零值补齐，因此常见失败更接近“类型不对”“枚举/字面量不匹配”或“联合不匹配”，而不是 `missing_key`。公开包也不会导出 `struct.parseTuple(...)`、`struct.parseValue(...)` 这类通用解析辅助；解析发生在 Defjs 消费命令输入或传输数据时。

```typescript
import { StructError } from '@defjs/core'

const error = new StructError([
  {
    code: 'invalid_type',
    path: ['name'],
    expected: 'string',
    received: 42,
    message: 'Expected string at [name], received 42',
  },
])

console.log(error.issues)
```

### 错误格式化

```typescript
error.format() // 树对象 { _errors: [], name: { _errors: ['...'] } }
error.flatten() // 扁平对象 { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // 字符串："× name: Expected string at [name], received 42"
```

### 全局错误映射

通过 `setErrorMap` 替换默认消息：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Field ${issue.path.join('.')} has the wrong type`
  }
  return undefined // 未覆盖的问题使用默认消息
})
```

## 字段别名

`.alias(name)` 是唯一内建字段 wire-name 机制。它只改变 JSON、query、headers、path、urlencoded 和 FormData 编解码使用的外部 key；不改变 TypeScript 属性名、输出类型、request section、body codec，也不会改写 `build(ctx, input)` 中手写的对象 key。未设置 alias 的字段使用对象字段名作为 wire key。

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

同一个 alias 会同时用于 JSON、query、path params、headers、urlencoded body 和 multipart body。如果同一个逻辑字段在不同目标中需要不同名字，就拆分 struct，或在 `build(ctx, input)` 中显式写出目标 key。

## 字段内省

`getStructFields(...)`、`isObjectStruct(...)` 这类字段内省辅助确实存在于内部模块和核心测试中，但它们不属于公开的 `@defjs/core` 导出面。公开文档应把 alias 视为编码/解码时生效的字段映射能力，而不是承诺运行时反射 API。

## 零值默认值和部分输入

结构解析器遵循 Go `encoding/json` 语义：

1. **缺失字段** → 用该类型的零值填充，不抛出 `missing_key`。
2. **部分输入** → 允许只传入部分字段；未设置字段自动用零值填充。
3. **`undefined` 和 `null`** → `optional` 字段返回 `undefined`；`nullable` 字段返回 `null`；其余返回零值。

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

// 命令输入或响应数据在解析后遵循同样的零值行为：
// {} -> { x: 0, y: 0 }
// { x: 1 } -> { x: 1, y: 0 }
```

这是设计意图，不是 bug。优点：

- 前端表单可以只发送修改过的字段；后端仍然收到完整结构。
- 避免 `undefined` 在对象中传播；输出总是可安全遍历。
- 与 Go 的 json 反序列化保持一致的思维模型，统一跨语言协作。

如果你需要严格验证（缺失字段应报错），请在端点的 `build` 函数里或创建命令输入之前，显式检查业务上必须存在的字段。

## 下一步

- [命令 →](/core/commands) — 在 `defineRequest`、`defineEventStream` 和 `defineWebSocket` 中使用 struct
- [HTTP →](/core/http) — 请求体编码和响应验证
- [上下文 →](/core/context) — 自动构建和请求构建器能力
