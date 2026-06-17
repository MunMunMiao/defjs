---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# 结构

`@defjs/core` 提供一个轻量的 struct 外观，用于声明结构、验证输入和推断类型。设计意图参考 Go 的 `encoding/json`：零值回退、接受部分输入、稳定可预测的运行时行为。

## 基础类型

所有结构都通过 `struct` 命名空间创建，支持链式调用 `.optional()`、`.null()`、`.nullish()` 和 `.tag(...)`。

### 标量

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
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
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

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
const Id = struct.union([struct.string(), struct.number()])
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
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

Body 包装器决定传输编码：

| 包装器                     | 编码               |
| -------------------------- | ------------------ |
| `struct.json(schema)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | 纯文本             |
| `struct.blob()`            | 二进制 Blob        |
| `struct.arrayBuffer()`     | 二进制 ArrayBuffer |

## `Infer<T>` 类型推断

`struct.Infer<T>` 提取结构的输出类型。它是你唯一需要掌握的类型级辅助工具。

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` 也适用于 `struct.array(...)`、`struct.union(...)`、`struct.request(...)`：

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError 和错误映射

验证失败时，运行时返回 `StructError`，包含完整的 `SchemaIssue[]`。

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### 错误格式化

```typescript
error.format() // 树对象 { _errors: [], name: { _errors: ['...'] } }
error.flatten() // 扁平对象 { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // 字符串："× name: Expected string, received undefined"
```

### 全局错误映射

通过 `setErrorMap` 替换默认消息：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // 未覆盖的问题使用默认消息
})
```

## 标签系统

标签是附加到字段的元数据，由编解码器、请求构建器或外部适配器读取。核心提供 6 个内置命名空间：

| 命名空间                | 用途               | 无参数行为           |
| ----------------------- | ------------------ | -------------------- |
| `tag.json()`            | JSON 字段线键      | 回退到字段名         |
| `tag.urlencoded()`      | URL 编码字段线键   | 回退到字段名         |
| `tag.multipart()`       | Multipart 字段线键 | 回退到字段名         |
| `tag.query(fieldName)`  | 查询参数线键       | **必须显式提供名称** |
| `tag.uri(fieldName)`    | URI 路径参数线键   | **必须显式提供名称** |
| `tag.header(fieldName)` | HTTP 请求头线键    | **必须显式提供名称** |

### 使用示例

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### 自定义配置标签

`tag.defineConfig` 允许第三方库定义自己的命名空间和配置键：

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

规则：

- 同一命名空间内，后设置的 `value` 覆盖前面的 `value`。
- 同一命名空间且同一 `config` 键下，后设置的值覆盖前面的值。
- 配置值只能是 `string | number | boolean`。

### 读取标签

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## 字段内省

`getStructFields` 将对象结构展开为可读的字段列表，包含字段键、子结构和物化的标签。

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

配合 `isObjectStruct` 在内省前进行安全类型检查：

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
  }
}
```

## 零值回退和部分输入

结构解析器遵循 Go `encoding/json` 语义：

1. **缺失字段** → 用该类型的零值填充，不抛出 `missing_key`。
2. **部分输入** → 允许只传入部分字段；未设置字段自动用零值填充。
3. **`undefined` 和 `null`** → `optional` 字段返回 `undefined`；`nullable` 字段返回 `null`；其余返回零值。

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

这是设计意图，不是 bug。优点：

- 前端表单可以只发送修改过的字段；后端仍然收到完整结构。
- 避免 `undefined` 在对象中传播；输出总是可安全遍历。
- 与 Go 的 json 反序列化保持一致的思维模型，统一跨语言协作。

如果你需要严格验证（缺失字段应报错），在端点的 `build` 函数中显式检查，或使用 `struct.parseTuple` 自行处理 `[error, value]` 结果。

## 下一步

- [命令 →](/core/commands) — 在 `defineRequest`、`defineEventStream` 和 `defineWebSocket` 中使用 struct
- [HTTP →](/core/http) — 请求体编码和响应验证
- [上下文 →](/core/context) — 自动构建和请求构建器能力
