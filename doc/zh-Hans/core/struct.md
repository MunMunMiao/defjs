---
title: Struct
description: 描述结构化解码、零值、object 的部分输入、alias 和 StructError 处理。
---

# Struct

Struct 描述结构化解码和 wire 编码。它选取的部分零值行为受 Go 启发，但并不是 Go `encoding/json` 语义的完整实现。

从 root entry 使用 `struct` facade 和 `Infer<T>`：

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Constructor

常用 constructor 包括：

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` 和 `struct.unknown()` 接受不受约束的值。Binary constructor 包括 `struct.blob()`、`struct.file()` 和 `struct.arrayBuffer()`。

每个 Struct 都支持以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 零值

缺失值或 `undefined` 会解码为零值，除非 Struct 标记了 optional。非 nullable 的 `null` 走同一条零值路径。Nullable Struct 会把缺失、`undefined` 或 `null` 解码为 `null`。

常见零值如下：

| Struct                        | 零值                         |
| ----------------------------- | ---------------------------- |
| `string`                      | `''`                         |
| `number`                      | `0`                          |
| `boolean`                     | `false`                      |
| `bigint`                      | `0n`                         |
| `date`                        | `new Date(0)`                |
| array                         | `[]`                         |
| object                        | 各字段都包含其零值的 object  |
| tuple                         | 各 item 都包含其零值的 tuple |
| enum                          | 第一个声明值                 |
| literal                       | 已声明的 literal             |
| `blob`, `file`, `arrayBuffer` | 对应类型的空值               |
| `any`, `unknown`              | `undefined`                  |

在 object 中，仅标记 `.optional()` 的缺失字段不会出现在解码结果中。`.nullish()` 同时是 optional 和 nullable；缺失时 nullable 处理优先，因此目前会解码为 `null`。

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

未知 object key 会被丢弃。解析后的 object 和 record 使用 null prototype。如果代码依赖 `Object.prototype` method，请使用 `Object.keys`、`Object.entries`，或明确复制到普通 object。

## Partial Input 是有意设计

Object input property 在 TypeScript 边界都是可选的，即使解码后的 output property 一定存在。`struct.request(...)` 中的 request section 也可选。

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

不要把这些字段描述为必填。Struct 不提供应用级必填字段、authorization、range、amount、format 或 state transition 校验，也没有公开的 refine/range/format DSL。

`struct.number()` 接受正负 `Infinity`；在 JavaScript number 中，它只排除 `NaN`。创建 command 前，请在应用代码中执行 finite、range 和 domain 检查。不要把这些检查放进 `build`，因为 `build` 接收 schema-bound projection，而不是调用方运行时值。

## Request Body

`struct.request(...)` 对直接 wire section 分组：

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Body boundary 包括：

| Struct                     | 编码              |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Plain text        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

自动请求映射和 transport 限制见 [Commands](/zh-Hans/core/commands)。

## Alias

`.alias(name)` 改变 wire key，但不改变逻辑 TypeScript key。

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Alias 会解码和编码 JSON key。自动请求构建也会把 alias 用作 outbound path、query、header、URL-encoded 和 multipart key。调用方始终使用逻辑 key。自定义 `build` projection 中显式指定的目标 key 仍按原样使用。

## `StructError`

结构化解码失败会产生 `StructError`，通常出现在 `RequestError.cause` 中。

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

`StructError` 暴露：

- `issues`：原始 `StructIssue[]`；
- `format()`：嵌套 message tree；
- `flatten()`：顶层 form 和 field message；
- `prettify()`：适合阅读的多行字符串。

`StructIssue.received` 可能包含 input 或 response 数据。默认 message 也可能包含该值的表示形式。Path 和格式化后的 key 还可能来自不可信数据，尤其是 record。记录日志或返回给调用方之前，请对 `issues`、message、`format()`、`flatten()` 和 `prettify()` 做审查或脱敏。

## 全局 Error Message

`setErrorMap(...)` 会替换整个进程的 message 生成逻辑：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

这个 map 是全局的，不属于某个 client。修改后，同一 JavaScript realm 内所有 client 后续产生的 Struct issue 都会受影响。不要在 callback 中捕获请求专属状态；同一进程内有多个应用时，要协调安装时机。

## 下一步

- [Commands](/zh-Hans/core/commands)：把 Struct 字段映射到 request 和 message。
- [Errors](/zh-Hans/core/errors)：Struct failure 如何出现在 execution tuple 中。
- [HTTP](/zh-Hans/core/http)：response 解码和当前 malformed JSON 限制。
