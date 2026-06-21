---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# 指令

Defjs 圍繞「指令」建構：由 `defineRequest`、`defineEventStream` 與 `defineWebSocket` 建立的型別安全可執行物件。每個指令攜帶 `kind`（傳輸型別）、`definition`（端點結構描述）與 `input`（呼叫資料）。用戶端依 `kind` 分派至正確的傳輸邏輯。

## defineRequest：HTTP 端點定義

`defineRequest` 定義 RESTful HTTP 端點。接受定義物件並回傳指令建構器。

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### 定義物件欄位

| 欄位           | 型別                              | 說明                                             |
| -------------- | --------------------------------- | ------------------------------------------------ |
| `method`       | `string`                          | HTTP 方法，例如 `GET`、`POST`                    |
| `path`         | `string`                          | URL 路徑，支援 `:param` 佔位符                   |
| `input`        | `AnyStruct \| undefined`          | 輸入資料 Struct 驗證器                           |
| `build`        | `RequestBuildHandler`             | 將解析後的輸入對應到 HTTP 請求各部分             |
| `output`       | `RequestOutputShape \| undefined` | 將狀態碼對應到回應 Structs                       |
| `responseType` | `HttpResponseType`                | 選填，強制回應解析模式（`json`、`text`、`blob`） |

### input / output / build 關係

1. **input**：描述呼叫方必須提供的資料。執行時，用戶端使用 `input` Struct 驗證並解析原始輸入。
2. **build**：接收 `RequestBuilder` 與解析後的輸入（`RequestBuildInput`），將資料對應到路徑參數、查詢參數、標頭與主體。
3. **output**：描述可能的伺服器回應。用戶端依 HTTP 狀態碼選擇對應的 Struct，並推導成功（2xx）與錯誤（非 2xx）型別。

若省略 `build`，則 `input` 也必須省略。該指令不接受任何輸入，直接發送至 `path`。

若提供 `build`，則必須同時提供 `input`。這是嚴密的設計規則。

### 無輸入的捷徑

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // 無需引數
```

### 輸出型別推導

`output` 同時支援陣列與物件形式，行為等同：

```typescript
// 陣列形式（推薦）
output: [
  { status: 200, body: UserStruct },
  { status: [401, 403], body: AuthErrorStruct },
]

// 物件形式
output: {
  200: UserStruct,
  '401': AuthErrorStruct,
  '403': AuthErrorStruct,
}
```

執行結果會自動定型：2xx 資料進入成功分支，其餘進入錯誤分支。

---

## defineEventStream：SSE 串流定義

`defineEventStream` 定義 Server-Sent Events（SSE）端點。將事件名稱對應到 Struct，以達到事件層級的型別安全。

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### events 對應

`events` 的每個鍵對應 SSE 的 `event` 欄位。訊息抵達時，用戶端依 `event` 名稱查找對應的 Struct。

### default 兜底

若伺服器發送未宣告的事件名稱，可提供 `default` 結構描述作為兜底：

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // 未匹配事件解析為字串
  },
})
```

若無 `default`，未匹配事件會被捨棄。若設定了 `onInvalidEvent` 攔截器，則會收到通知。

### 帶輸入的 SSE

SSE 預設使用 `GET`。若需要查詢參數，請提供 `input` 與 `build`，與 `defineRequest` 相同：

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

SSE 的 `build` 不支援請求主體或 `withCredentials`。

---

## defineWebSocket：WebSocket 定義

`defineWebSocket` 定義 WebSocket 端點，區分 **incoming**（伺服器 → 用戶端）與 **outgoing**（用戶端 → 伺服器）訊息結構描述。

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### incoming 訊息結構描述

`incoming` 定義伺服器推送的訊息型別。每則訊息必須套件含 `type` 欄位，且與 `incoming` 的鍵匹配。若承載為物件，其欄位會與 `type` 合併：

```typescript
// 伺服器發送: { type: 'message', user: 'Alice', text: 'Hi' }
// 解析為:    { type: 'message', user: 'Alice', text: 'Hi' }
```

若承載為純量（字串、數字等），則套件裝為 `{ type: 'xxx', data: <value> }`。

### outgoing 訊息結構描述

`outgoing` 定義用戶端發送的訊息型別。`type` 會自動從鍵名填入。只需提供承載：

```typescript
// 發送: { type: 'sendMessage', text: 'Hello' }
// 或:   { type: 'sendMessage', data: { text: 'Hello' } }
```

若 outgoing 訊息承載為物件，兩種形式皆支援。若為純量，則必須使用 `{ type: 'xxx', data: <value> }`。

### 僅接收的 WebSocket

若無需向伺服器發送訊息，可省略 `outgoing`：

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### WebSocket build 限制

WebSocket 的 `build` 僅支援 `setPathParams` 與 `setQueryParams`。HTTP 專屬操作（標頭、主體）不支援。

---

## 指令物件結構

不論定義型別為何，建構後的指令遵循統一結構：

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP 指令
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE 指令
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket 指令
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` 是傳輸型別標籤。`Client.execute` 依此分派至適當的執行器（HTTP fetch、SSE 串流、WebSocket 連線）。

---

## 輸入選擇性規則（IsInputOptional）

指令建構器的引數是否可選，由 `IsInputOptional` 自動推導：

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

規則：

1. **未定義 `input`**：`TInput` 為 `undefined`，引數完全可選。
2. **有 `input` 但所有欄位可選**：`{} extends EndpointInput<...>` 為 true，引數仍可選。
3. **有 `input` 且含必填欄位**：引數為必填。

```typescript
// 無 input — 可選
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// input 全為可選欄位 — 可選
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// 必填欄位 — 必填
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript 錯誤：缺少引數
C({ body: { name: 'defjs' } }) // OK
```

## 接下來

- [SSE →](/core/sse) — SSE 執行、重連與事件處理
- [WebSocket →](/core/web-socket) — WebSocket 連線、心跳與狀態管理
- [用戶端 →](/core/client) — 用戶端建立與 `execute` 用法
