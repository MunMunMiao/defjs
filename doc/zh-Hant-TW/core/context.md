---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# 脈絡

Defjs 執行流程：用戶端設定提供全域預設值；指令定義描述端點結構；`build` 將解析後的輸入對應到 HTTP 請求各部分；`HttpContext` 則作為單次執行生命週期中攔截器之間傳遞的隱形行李。

## HttpContext 傳遞

`HttpContext` 是單次請求／連線生命週期內的 Token 式鍵值容器，用於存放後設資料。它不參與 URL、標頭或主體的序列化。由攔截器讀取與寫入。

### 建立與使用

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. 定義 Token（附預設值）
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. 建立脈絡並設定值
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. 執行時傳入
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### 在攔截器中讀取

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### 合併脈絡

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged 同時包含 requestId 與 auth
```

### 核心 API

| 匯出                                             | 說明                                              |
| ------------------------------------------------ | ------------------------------------------------- |
| `makeHttpContextToken<T>(defaultValue: () => T)` | 建立附預設值的 Token                              |
| `makeHttpContext()`                              | 建立空白脈絡                                      |
| `makeHttpContext(entries)`                       | 從 `[token, value]` 陣列建立                      |
| `makeHttpContext(otherContext)`                  | 複製另一個脈絡                                    |
| `mergeHttpContexts(primary, secondary)`          | 合併兩個脈絡；secondary 對同一 Token 覆寫 primary |
| `ctx.set(token, value)`                          | 寫入值；回傳自身（可鏈式呼叫）                    |
| `ctx.get(token)`                                 | 讀取值；若未設定則回傳 Token 預設值               |
| `ctx.has(token) / ctx.del(token)`                | 檢查／刪除                                        |
| `ctx.keys() / ctx.length`                        | 疊代／計數                                        |

---

## 請求建構器與輸入解析

### 輸入解析流程

執行指令時，用戶端依以下順序處理輸入：

1. **驗證**：使用 `input` Struct 驗證並解析原始呼叫者資料。
2. **建構**：呼叫 `build(request, parsedInput)` 將解析後的資料對應到請求各部分。
3. **傳輸**：依 `kind` 分派至 HTTP fetch、SSE 串流或 WebSocket 連線。

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### 建構處理能力矩陣

不同傳輸協定支援不同的 `build` 操作：

| 建構方法                                  | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

在 `build` 中使用不支援的傳輸方法會在執行時拋出 `REQUEST_VALIDATION_FAILED`。

### 自動建構

若省略 `build`，則 `input` 也必須省略。然而，你可以使用 Struct 的 `request` 形狀讓框架自動推導建構邏輯：

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // 無需 build；框架自動對應 path/query
})
```

若提供 `build`，則必須同時提供 `input`。這是嚴密的設計規則。

---

## 用戶端設定

使用 `createClient` 搭配一或多個設定函式建立用戶端。對同一個鍵，後面的函式會覆寫前面的函式。

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### 核心選項

#### `withEndpoint(url)`

設定基礎 API 位址。所有請求的 `path` 會附加在此 URL 之後。

```typescript
withEndpoint('https://api.example.com/v1')
// 請求 /users 會產生 https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

是否套件含跨域憑證（cookie、HTTP 驗證標頭、TLS 用戶端憑證）。對應 `fetch` 的 `credentials` 選項。

```typescript
withCredentials(true) // 在跨域請求中包含 cookie
withCredentials(false) // 預設值
```

#### `withXSRF(options)`

設定 XSRF 權杖讀取與注入行為。預設從 `document.cookie` 讀取 `XSRF-TOKEN`，並注入至 `X-XSRF-TOKEN` 標頭。

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // 自訂讀取邏輯，例如從 localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| 欄位            | 型別                                   | 預設值                    |
| --------------- | -------------------------------------- | ------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`            |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`          |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | 從 `document.cookie` 讀取 |

#### `withQueryParamsSerializer(fn)`

自訂查詢參數序列化。預設為 `URLSearchParams.toString()`。

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

提供自訂序列化器後，HTTP 與 SSE 請求可支援複雜查詢參數。

---

## 傳輸協定專屬設定

### SSE 選項

透過 `withSSEOptions` 或個別設定函式進行設定。

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| 選項                 | 說明                                                             |
| -------------------- | ---------------------------------------------------------------- |
| `sse.fetch`          | SSE 專用的 `fetch` 實作                                          |
| `sse.reconnect`      | 重連策略：嘗試次數、延遲、退避倍數、抖動、最大延遲、自訂決策函式 |
| `sse.queue`          | 事件佇列：最大容量、溢位策略                                     |
| `sse.onInvalidEvent` | 無效事件觀察者（缺少結構描述或驗證失敗）                         |
| `sse.maxBufferSize`  | 底層緩衝區大小限制（位元組）                                     |

### WebSocket 選項

透過 `withWebSocketOptions` 或個別設定函式進行設定。

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| 選項                      | 說明                                                             |
| ------------------------- | ---------------------------------------------------------------- |
| `webSocket.WebSocket`     | 自訂 `WebSocket` 建構函式                                        |
| `webSocket.protocols`     | RFC 6455 子協定陣列                                              |
| `webSocket.beforeConnect` | 連線前鉤子（例如取得動態權杖）                                   |
| `webSocket.heartbeat`     | 心跳：間隔、逾時、訊息工廠、ACK 斷言                             |
| `webSocket.reconnect`     | 重連策略：嘗試次數、延遲、退避倍數、抖動、最大延遲、自訂決策函式 |
| `webSocket.queue`         | 發送佇列：最大容量、溢位策略                                     |

### 心跳細節

WebSocket 心跳用於偵測連線活性。若設定，框架會每隔 `intervalMs` 發送心跳訊息，並在 `timeoutMs` 內等待 ACK。若 ACK 逾時，則觸發重連。

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // 每 30 秒發送一次
  timeoutMs: 10000, // 必須在 10 秒內收到 ACK
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- 心跳訊息型別必須與 `outgoing` 定義相容。
- `isAck` 決定是否將傳入訊息視為心跳回應。回傳 `true` 時，該訊息不會進入 `receive` 疊代器。

---

## 設定組合與優先順序

設定函式依序套用；後面的覆寫前面的。執行階段選項（`client.execute(cmd, { timeout: 5000 })`）具有最高優先權，其次為用戶端層級設定。

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// 在執行時覆寫 SSE 重連
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## 接下來

- [用戶端 →](/core/client) — 用戶端建立與 `execute` 用法
- [指令 →](/core/commands) — 指令定義與輸入選擇性規則
- [SSE →](/core/sse) — SSE 執行、重連與事件處理
- [WebSocket →](/core/web-socket) — WebSocket 連線、心跳與狀態管理
- [攔截器 →](/core/interceptors) — 攔截器型別與洋蔥鏈機制
