---
title: Struct
description: 描述严格结构化解码、必填与可选输入、alias 和 StructError 处理。
---

# Struct

Struct 描述严格结构化解码和 wire 编码。必填值缺失或值无效时会失败，不会生成默认值。

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

`struct.any()` 和 `struct.unknown()` 接受除 `null`、`undefined` 外的任意值；需要接受这两者时仍使用相同的 modifier。Binary constructor 包括 `struct.blob()`、`struct.file()` 和 `struct.arrayBuffer()`。

每个 Struct 都支持以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 严格解析

在 command 之外解码时使用 `struct.parse(schema, input)`。它返回固定的 error-first 二元组：

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

所有 modifier 使用同一合同：缺失值和 `undefined` 只有在 `.optional()` 或 `.nullish()` 下才接受；显式 `null` 只有在 `.null()` 或 `.nullish()` 下才接受。`.null()` 不会让值变成 optional。

缺失的 optional 和 nullish object field 会从输出中省略；在顶层则解码为 `undefined`。未知 key 会被丢弃，解码后的 object 和 record 使用 null prototype。

## 必填 Object 与 Request 输入

除非字段的 Struct 是 optional 或 nullish，否则 object property 在 TypeScript 和运行时都必填。`struct.request(...)` 中每个已声明 section 也都必填；未声明的 section 不会出现在 input type 中。

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

省略 `query` 会报错，`query: {}` 合法。缺失必填字段、显式 `undefined`、禁止的 `null` 或错误运行时类型都会让整次解析失败，且不会返回部分值。

复合 Struct 在第一个确定的 issue 处停止。Tuple 输入长度必须与声明完全一致。`struct.or(...)` 仍按顺序尝试 alternative，`struct.discriminatedUnion(...)` 仍选择已声明分支。

Discriminator 字段使用 alias 时，`struct.discriminatedUnion(...)` 按 option 声明顺序读取第一个实际存在的 wire discriminator。选中分支后，不再读取后续 option 的 alias。

Struct 强制执行声明的结构，不负责应用级 authorization、range、amount、format 或 state transition 规则，也没有公开的 refine/range/format DSL。

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
- [HTTP](/zh-Hans/core/http)：response 解码和 representation error。
