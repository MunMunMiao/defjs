---
title: Struct
description: 說明結構解碼、零值、partial object input、alias 與 StructError 處理。
---

# Struct

Struct 用來描述結構解碼與 wire encoding。部分零值行為受到 Go 啟發，但並不是 Go `encoding/json` 語意的完整實作。

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

`struct.any()` 與 `struct.unknown()` 接受不受限制的值。Binary constructor 包括 `struct.blob()`、`struct.file()` 與 `struct.arrayBuffer()`。

每個 Struct 都支援以下 modifier：

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## 零值

除非 Struct 是 optional，否則遺漏或 `undefined` 的值都會解碼成零值。不可為 null 的 Struct 收到 `null` 時，也會走相同的零值路徑。Nullable Struct 則會把遺漏、`undefined` 或 `null` 解碼成 `null`。

部分零值如下：

| Struct                        | 零值                       |
| ----------------------------- | -------------------------- |
| `string`                      | `''`                       |
| `number`                      | `0`                        |
| `boolean`                     | `false`                    |
| `bigint`                      | `0n`                       |
| `date`                        | `new Date(0)`              |
| array                         | `[]`                       |
| object                        | 各欄位都填入其零值的物件   |
| tuple                         | 各項目都填入其零值的 tuple |
| enum                          | 第一個宣告值               |
| literal                       | 宣告的 literal             |
| `blob`, `file`, `arrayBuffer` | 對應型別的空值             |
| `any`, `unknown`              | `undefined`                |

在 object 裡，只有加上 `.optional()` 的遺漏欄位不會出現在解碼後輸出。`.nullish()` 同時是 optional 與 nullable；對遺漏值而言 nullable 處理優先，所以目前會解碼成 `null`。

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

未知 object key 會被丟棄。解析後的 object 與 record 輸出使用 null prototype。依賴 `Object.prototype` method 的程式碼應改用 `Object.keys`、`Object.entries`，或明確複製成一般物件。

## Partial Input 是刻意設計

Object input property 在 TypeScript 邊界都可以省略，即使解碼後輸出一定會有該 property。`struct.request(...)` 裡的 request section 也可以省略。

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

不要把這些欄位描述成必填。Struct 不提供應用程式層級的必填欄位、authorization、range、amount、format 或 state transition 驗證，也沒有公開的 refine/range/format DSL。

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
- [HTTP](/zh-Hant-TW/core/http)涵蓋回應解碼與目前 malformed JSON 限制。
