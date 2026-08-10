---
title: Struct
description: 說明嚴格結構解碼、必填與可選輸入、alias 與 StructError 處理。
---

# Struct

Struct 用來描述嚴格結構解碼與 wire encoding。必填值遺漏或值無效時會失敗，不會產生預設值。

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

`struct.any()` 與 `struct.unknown()` 接受 `null`、`undefined` 以外的任何值；需要接受兩者時仍使用相同的 modifier。Binary constructor 包括 `struct.blob()`、`struct.file()` 與 `struct.arrayBuffer()`。

每個 Struct 都支援以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 嚴格解析

在指令以外解碼時使用 `struct.parse(schema, input)`。它回傳固定的 error-first 二元組：

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

所有 modifier 使用同一套規則：遺漏值與 `undefined` 只有在 `.optional()` 或 `.nullish()` 下才接受；明確 `null` 只有在 `.null()` 或 `.nullish()` 下才接受。`.null()` 不會讓值變成 optional。

遺漏的 optional 與 nullish object field 會從輸出省略；在頂層則解碼為 `undefined`。未知 key 會被丟棄，解碼後的 object 與 record 使用 null prototype。

## 必填 Object 與 Request 輸入

除非欄位 Struct 是 optional 或 nullish，否則 object property 在 TypeScript 與執行階段都必填。`struct.request(...)` 中每個已宣告 section 也必填；未宣告的 section 不會出現在輸入型別中。

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

省略 `query` 會報錯，`query: {}` 合法。遺漏必填欄位、明確 `undefined`、禁止的 `null` 或錯誤執行階段型別都會讓整次解析失敗，而且不回傳部分值。

複合 Struct 在第一個確定的 issue 停止。Tuple 輸入長度必須與宣告完全一致。`struct.or(...)` 仍按順序嘗試 alternative，`struct.discriminatedUnion(...)` 仍選擇已宣告分支。

Discriminator 欄位使用 alias 時，`struct.discriminatedUnion(...)` 會依 option 宣告順序讀取第一個實際存在的 wire discriminator。選中分支後，不再讀取後續 option 的 alias。

Struct 強制執行已宣告結構，不負責應用程式層級 authorization、range、amount、format 或 state transition 規則，也沒有公開 refine/range/format DSL。

`struct.number()` 接受正負 `Infinity`；在 JavaScript number 中只排除 `NaN`。請在建立指令前，於應用程式程式碼中完成 finite、範圍與 domain 檢查。不要把這些檢查放進 `build`，因為 `build` 收到的是結構描述綁定投影，不是呼叫端執行階段值。

## Request Body

`struct.request(...)` 會將可直接對應 wire 的 section 分組：

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

Body boundary 如下：

| Struct                     | 編碼              |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | 純文字            |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

自動 request mapping 與各傳輸限制請見[指令](/zh-Hant-TW/core/commands)。

## Alias

`.alias(name)` 會變更 wire key，但不會改變 TypeScript 的邏輯 key。

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Alias 會解碼與編碼 JSON key。自動建構請求時，也會套用到 outbound path、query、header、URL-encoded 與 multipart key。呼叫端仍使用邏輯 key；自訂 `build` 投影明確指定的目標 key 則維持原樣。

## `StructError`

結構解碼失敗會產生 `StructError`，通常出現在 `RequestError.cause`。

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
- `format()`：巢狀訊息樹；
- `flatten()`：頂層 form 與 field message；
- `prettify()`：方便閱讀的多行字串。

`StructIssue.received` 可能包含輸入或回應資料，預設訊息也可能包含該值的表示形式。Path 與格式化後的 key 也可能來自不受信任的資料，record 尤其如此。記錄或回傳 `issues`、訊息、`format()`、`flatten()` 與 `prettify()` 前，必須先遮罩或審查。

## 全域錯誤訊息

`setErrorMap(...)` 會替換整個 process 的訊息產生方式：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

這個 map 是全域的，不屬於個別 client。變更後，同一個 JavaScript realm 裡每個 client 之後產生的 Struct issue 都會受影響。不要在 callback 裡放 request-specific state；共用 process 的應用程式也要協調安裝時機。

## 下一步

- [指令](/zh-Hant-TW/core/commands)把 Struct 欄位對應到 request 與 message。
- [錯誤](/zh-Hant-TW/core/errors)說明 Struct failure 如何出現在執行 tuple。
- [HTTP](/zh-Hant-TW/core/http)涵蓋回應解碼與 representation error。
