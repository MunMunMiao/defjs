---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# 結構描述

`@defjs/core` 提供輕量級的 struct 外觀，用於宣告結構描述、驗證輸入與推導類型。設計意圖參考 Go 的 `encoding/json`：零值預設值、接受部分輸入、穩定且可預測的執行階段行為。

## 基本類型

所有結構描述都透過 `struct` 命名空間建立，支援鏈式呼叫 `.optional()`、`.null()`、`.nullish()` 與 `.alias(name)`。

### 純量

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

可用純量：

| 建構函式               | 輸入類型                                | 輸出類型      | 零值                 |
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

### 可選與可空

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // 輸出型別: string | undefined
  age: struct.number().null(), // 輸出型別: number | null
  nick: struct.string().nullish(), // 輸出型別: string | null | undefined
})
```

### 枚舉與字面量

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### 陣列、元組、記錄

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### 聯合與交叉

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### 可辨識聯合

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## 請求結構描述

`struct.request(...)` 將 `path`、`query`、`headers` 與 `body` 組織為單一輸入結構，供端點自動建構 HTTP 請求。

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

主體套件裝器決定傳輸編碼：

| 套件裝器                   | 編碼               |
| -------------------------- | ------------------ |
| `struct.json(struct)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | 純文字             |
| `struct.blob()`            | 二進位 Blob        |
| `struct.arrayBuffer()`     | 二進位 ArrayBuffer |

## `Infer<T>` 類型推導

`Infer<T>` 提取結構描述的輸出類型。這是你唯一需要掌握類型層級輔助函式。

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` 也適用於 `struct.array(...)`、`struct.union(...)`、`struct.request(...)`：

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError 與錯誤對應

驗證失敗時，執行階段回傳含完整 `StructIssue[]` 的 `StructError`。

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### 錯誤格式化

```typescript
error.format() // 樹狀物件 { _errors: [], name: { _errors: ['...'] } }
error.flatten() // 扁平物件 { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // 字串: "× name: Expected string, received undefined"
```

### 全域錯誤對應

透過 `setErrorMap` 替換預設訊息：

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // 未覆蓋的問題使用預設訊息
})
```

## Field Aliases

`.alias(name)` 是唯一內建欄位 wire-name 機制。它只改變 JSON、query、headers、path、urlencoded 和 FormData 編解碼使用的外部 key；不改變 TypeScript 屬性名、輸出類型、request section、body codec，也不會改寫 `build(ctx, input)` 中手寫的物件 key。未設定 alias 的欄位會使用物件欄位名作為 wire key。

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

The same alias is used by JSON, query, path params, headers, urlencoded bodies, and multipart bodies. If the same logical value needs different names in different targets, split the struct or write explicit keys in `build(ctx, input)`.

## Field Introspection

`getStructFields` expands an object struct into a readable field list containing field key, alias, and sub-struct.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
  }
}
```

## 零值預設值與部分輸入

struct 解析器遵循 Go `encoding/json` 語義：

1. **缺失欄位** → 以該類型的零值填入，不拋出 `missing_key`。
2. **部分輸入** → 允許只傳入部分欄位；未設定欄位自動以零值填入。
3. **`undefined` 與 `null`** → `optional` 欄位回傳 `undefined`；`nullable` 欄位回傳 `null`；其餘回傳零值。

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

這是設計意圖，不是缺陷。優點：

- 前端表單可只發送修改過的欄位；後端仍收到完整結構。
- 避免 `undefined` 在物件中擴散；輸出永遠可安全遍歷。
- 與 Go 的 json unmarshaling 心智模型一致，統一跨語言協作。

若需要嚴格驗證（缺失欄位應報錯），請在端點的 `build` 函式中明確檢查，或使用 `struct.parseTuple` 自行處理 `[error, value]` 結果。

## 接下來

- [指令 →](/core/commands) — 搭配 `defineRequest`、`defineEventStream` 與 `defineWebSocket` 使用 struct
- [HTTP →](/core/http) — 請求主體編碼與回應驗證
- [上下文 →](/core/context) — 自動建構與請求建構器功能
