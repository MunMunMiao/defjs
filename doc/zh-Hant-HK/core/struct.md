---
title: Struct
description: 說明結構式解碼、零值、partial object input、alias 與 StructError handling。
---

# Struct

Struct 描述結構式解碼與 wire encoding。當中選用的零值行為受 Go 啟發，但並非完整實作 Go `encoding/json` semantics。

從 root entry 使用 `struct` facade 與 `Infer<T>`：

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

常用 constructor 有：

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

`struct.any()` 與 `struct.unknown()` 接受不受限制的值。Binary constructor 包括 `struct.blob()`、`struct.file()` 及 `struct.arrayBuffer()`。

每個 Struct 都支援以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 零值

缺少值或 `undefined` 會解碼成零值，除非 Struct 標記為 optional。Non-nullable `null` 亦走同一條零值路徑。Nullable Struct 則把缺少值、`undefined` 或 `null` 解碼成 `null`。

常見零值如下：

| Struct                        | 零值                         |
| ----------------------------- | ---------------------------- |
| `string`                      | `''`                         |
| `number`                      | `0`                          |
| `boolean`                     | `false`                      |
| `bigint`                      | `0n`                         |
| `date`                        | `new Date(0)`                |
| array                         | `[]`                         |
| object                        | 各欄位都包含其零值的 object  |
| tuple                         | 各 item 都包含其零值的 tuple |
| enum                          | 第一個宣告值                 |
| literal                       | 已宣告的 literal             |
| `blob`, `file`, `arrayBuffer` | 對應類型的空值               |
| `any`, `unknown`              | `undefined`                  |

在 object 內，只標記 `.optional()` 的缺少欄位不會出現在 decoded output。`.nullish()` 同時是 optional 與 nullable；缺少值時 nullable handling 優先，所以目前會解碼成 `null`。

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

Unknown object key 會被丟棄。Parsed object 與 record 使用 null prototype。程式碼如依賴 `Object.prototype` method，請改用 `Object.keys`、`Object.entries`，或明確複製成普通 object。

## Partial Input 是刻意設計

Object input property 在 TypeScript boundary 全部 optional，即使 decoded output property 一定存在。`struct.request(...)` 的 request section 亦可省略。

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

不要把這些欄位描述成 required。Struct 不提供應用層 required-field、authorization、range、amount、format 或 state-transition validation，亦沒有 public refine/range/format DSL。

`struct.number()` 接受正負 `Infinity`；在 JavaScript number 之中只排除 `NaN`。建立 command 前，請在應用程式碼完成 finite、range 與 domain check。不要把這些檢查放入 `build`，因為 `build` 收到的是 schema-bound projection，不是呼叫方 runtime value。

## Request Body

`struct.request(...)` 把直接 wire section 分組：

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

Body boundary 有：

| Struct                     | 編碼              |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Plain text        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

Automatic request mapping 與 transport restriction 見 [Commands](/zh-Hant-HK/core/commands)。

## Alias

`.alias(name)` 會改變 wire key，但不會改動 logical TypeScript key。

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Alias 會 decode 與 encode JSON wire key。Automatic request building 亦把 alias 用作 outbound path、query、header、URL-encoded 及 multipart key。呼叫方仍然使用 logical key；custom `build` projection 明確指定的 target key 則維持原樣。

## `StructError`

結構式解碼失敗會產生 `StructError`，通常可在 `RequestError.cause` 找到。

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

`StructError` 提供：

- `issues`：原始 `StructIssue[]`；
- `format()`：nested message tree；
- `flatten()`：top-level form 與 field message；
- `prettify()`：便於閱讀的 multiline string。

`StructIssue.received` 可能包含 input 或 response data，預設 message 亦可能包含該值的 representation。Path 與 formatted key 也可能源自 untrusted data，record 尤其要小心。記錄或回傳前，必須審查並 redact `issues`、message、`format()`、`flatten()` 與 `prettify()`。

## 全域 Error Message

`setErrorMap(...)` 會取代整個 process 的 message generation：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

這個 map 是 global，不屬於個別 client。修改後，同一 JavaScript realm 內所有 client 之後產生的 Struct issue 都會受影響。不要在 callback 捕捉 request-specific state；同一 process 內有多個應用程式時，要協調 installation timing。

## 下一步

- [Commands](/zh-Hant-HK/core/commands)：把 Struct field 對應至 request 與 message。
- [Errors](/zh-Hant-HK/core/errors)：Struct failure 如何出現在 execution tuple。
- [HTTP](/zh-Hant-HK/core/http)：response decoding 與目前 malformed JSON limitation。
