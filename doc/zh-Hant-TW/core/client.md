---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# 用戶端

`@defjs/core` 採用**顯式用戶端**設計。每個請求都透過你顯式建立的 `Client` 實例執行。這讓測試、多環境設定與相依追蹤變得簡單明瞭。

## 建立用戶端

使用 `createClient` 搭配一或多個設定函式。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

設定函式可組合。對同一個鍵，後面的函式會覆寫前面的函式。

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### 設定選項

| 函式                                | 說明                                         |
| ----------------------------------- | -------------------------------------------- |
| `withEndpoint(url)`                 | 基礎 API 位址。                              |
| `withHTTPHandle(fetch)`             | HTTP 的自訂 `fetch` 實作。                   |
| `withSSEHandle(fetch)`              | SSE 的自訂 `fetch` 實作。                    |
| `withWebSocketHandle(WebSocket)`    | 自訂 `WebSocket` 建構函式（例如用於 Node）。 |
| `withInterceptors(...interceptors)` | 註冊傳輸層攔截器。依 `kind` 自動分派。       |
| `withQueryParamsSerializer(fn)`     | 自訂查詢參數序列化。                         |
| `withCredentials(boolean)`          | 是否套件含跨域憑證。                         |
| `withXSRF(options)`                 | XSRF 權杖讀取與注入行為。                    |
| `withSSEOptions(options)`           | SSE 重連、佇列、無效事件處理等。             |
| `withWebSocketOptions(options)`     | WebSocket 心跳、重連、佇列、子協定等。       |

SSE 與 WebSocket 專屬設定請見 [SSE](/core/sse) 與 [WebSocket](/core/web-socket)。

## 執行指令

`Client.execute` 是多載方法，會依 `Command` 型別分派至正確的傳輸層。

### HTTP 請求

傳入以 `defineRequest` 建立的指令。回傳三元組：

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

回傳型別：

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### SSE 事件串流

傳入以 `defineEventStream` 建立的指令。回傳串流控制代碼與開啟資訊。

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

回傳型別：

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### WebSocket 連線

傳入以 `defineWebSocket` 建立的指令。回傳工作階段物件。

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

回傳型別：

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## 輔助函式

### `isClient`

檢查一個值是否為有效的 `Client` 實例。

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

提取內部設定物件以供除錯，或建構更高層級的抽象。

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

若傳入的值不是 `Client` 實例，`getClientConfig` 會拋出 `TypeError`。

## 顯式用戶端設計

Defjs 的每個用戶端都是顯式建立的。你可以使用 `createClient` 建立 `Client`，並將它傳遞到需要的地方。

顯式建立的優點：

- **測試友好**：直接將不同的 `Client` 實例傳入測試，無需重置或模擬任何狀態。
- **多環境並存**：多個用戶端可以在同一行程中並行執行（例如內部 API + 公開 API）。
- **相依透明**：呼叫方必須顯式持有 `Client`，讓相依關係在靜態分析與程式碼審查中一目了然。

若你在應用中需要共享用戶端，請從模組匯出：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

然後在業務程式碼中匯入使用：

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## 接下來

- [HTTP 請求 →](/core/http) — `defineRequest` 與輸出模式
- [SSE →](/core/sse) — SSE 定義、重連與事件佇列
- [WebSocket →](/core/web-socket) — WebSocket 定義、心跳與重連策略
- [攔截器 →](/core/interceptors) — 攔截器型別與洋蔥鏈機制
