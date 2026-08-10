---
title: Struct
description: 說明嚴格結構式解碼、必填與可選 input、alias 與 StructError handling。
---

# Struct

Struct 描述嚴格結構式解碼與 wire encoding。必填值缺少或值無效時會失敗，不會產生預設值。

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

`struct.any()` 與 `struct.unknown()` 接受 `null`、`undefined` 以外的任何值；需要接受兩者時仍使用相同的 modifier。Binary constructor 包括 `struct.blob()`、`struct.file()` 及 `struct.arrayBuffer()`。

每個 Struct 都支援以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 嚴格 Parse

在 command 以外解碼時使用 `struct.parse(schema, input)`。它回傳固定的 error-first tuple：

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

所有 modifier 使用同一 contract：缺少值與 `undefined` 只會在 `.optional()` 或 `.nullish()` 下接受；明確 `null` 只會在 `.null()` 或 `.nullish()` 下接受。`.null()` 不會令值變成 optional。

缺少的 optional 與 nullish object field 會從 output 省略；在頂層則解碼成 `undefined`。Unknown key 會被丟棄，decoded object 與 record 使用 null prototype。

## 必填 Object 與 Request Input

除非欄位 Struct 是 optional 或 nullish，否則 object property 在 TypeScript 與 runtime 都必填。`struct.request(...)` 中每個已宣告 section 亦必填；未宣告 section 不會出現在 input type。

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

省略 `query` 會報錯，`query: {}` 合法。缺少必填欄位、明確 `undefined`、禁止的 `null` 或錯誤 runtime type 都會令整次 parse 失敗，而且不回傳 partial value。

複合 Struct 在第一個確定的 issue 停止。Tuple input 長度必須與宣告完全一致。`struct.or(...)` 仍按次序嘗試 alternative，`struct.discriminatedUnion(...)` 仍選擇已宣告 branch。

Discriminator field 使用 alias 時，`struct.discriminatedUnion(...)` 會按 option 宣告次序讀取第一個實際存在的 wire discriminator。選中 branch 後，不再讀取後續 option 的 alias。

Struct 強制執行已宣告結構，不負責應用層 authorization、range、amount、format 或 state-transition rules，亦沒有 public refine/range/format DSL。

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
- [HTTP](/zh-Hant-HK/core/http)：response decoding 與 representation error。
