---
title: Client
description: 明確建立用戶端、組合選項、執行各傳輸專屬的指令，並檢查即時設定。
---

# Client

明確建立 `Client`，再把它交給實際執行指令的程式碼。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Client 會保存設定，並分派 HTTP、SSE 與 WebSocket 指令。它不管理全域 registry，也不是背景生命週期管理器。

## 選項組合

選項由左到右執行。

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

最後的 endpoint 是 `https://api.example.com`。攔截器順序則是 `operationLogger`、`authInterceptor`、`retryInterceptor`。

組合時遵循三項規則：

1. Setter helper 會取代原本的值，包括 `withEndpoint`、各 transport handle、query serializer、credentials、XSRF 設定，以及個別 SSE 或 WebSocket 設定。
2. `withInterceptors(...items)` 會附加項目。多次呼叫時，會保留攔截器加入的先後順序。
3. `withSSEOptions(...)` 與 `withWebSocketOptions(...)` 會淺層取代每個有定義的頂層欄位，不會 deep merge 巢狀的 reconnect、heartbeat 或 queue 物件。

例如，下方第二個 reconnect 物件會完整取代第一個，不會保留 `attempts: 5`。

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

群組選項 helper 會忽略值為 `undefined` 的 property。其餘有提供的頂層 property，都會完整取代目前值。

### Core 選項

| 選項                             | 效果                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `withEndpoint(url)`              | 設定所有傳輸共用的 absolute base endpoint。                     |
| `withHTTPHandle(fetch)`          | 取代 HTTP 使用的 Fetch 實作。                                   |
| `withSSEHandle(fetch)`           | 取代 SSE 使用的 Fetch 實作。                                    |
| `withWebSocketHandle(WebSocket)` | 取代 WebSocket constructor。                                    |
| `withInterceptors(...items)`     | 附加混合各傳輸的攔截器。                                        |
| `withQueryParamsSerializer(fn)`  | 取代 HTTP、SSE 與 WebSocket 的 query 序列化方式。               |
| `withCredentials(boolean)`       | 設為 true 時，HTTP 與 SSE 使用 Fetch `credentials: 'include'`。 |
| `withXSRF(options?)`             | 設定 HTTP XSRF token 注入。                                     |
| `withSSEOptions(options)`        | 淺層取代有定義的 SSE 欄位。                                     |
| `withWebSocketOptions(options)`  | 淺層取代有定義的 WebSocket 欄位。                               |

個別 SSE 與 WebSocket helper 只會設定對應的單一頂層欄位。各傳輸頁面會列出預設值與生命週期影響。

## 執行指令

`Client.execute` 有三種 overload，每一種都回傳 error-first 三元素 tuple。

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

有收到回應時，第三個元素是 Defjs `SettledResponse` wrapper。HTTP 選項包含 `abort` 或 `timeout`、額外的 `signal` alias、`context`，以及上傳／下載進度觀察器。

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

第三個元素是驗證過的啟動開啟快照。`stream.open` 是另一個即時 getter，可能在重連嘗試後改變。SSE 執行接受取消與 `HttpContext`；重連與事件 queue 則在 client options 設定。

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

第三個元素是啟動連線快照。`session.connection` 是即時 getter，可能描述後續的實體連線嘗試。WebSocket 執行接受取消，也能為每次執行設定 `beforeConnect`、`heartbeat`、`protocols`、`queue` 與 `reconnect`。它不接受 `HttpContext`。

完整失敗分支請見[錯誤](/zh-Hant-TW/core/errors)；傳輸生命週期則分別見 [HTTP](/zh-Hant-TW/core/http)、[SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)。

## Client 範圍

瀏覽器應用程式可以保留 module-level client，前提是 endpoint 與閉包只包含瀏覽器可安全使用、而且不依賴個別請求的狀態。

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

在伺服器端，如果選項或攔截器捕捉了 authorization、cookie、tenant、使用者資料或 request context，就不要跨請求重用同一個 client。請在伺服器的 request boundary 內建立它。

`Client` 沒有 `dispose()` 方法，也不追蹤進行中的 request、stream 或 session。啟動工作的程式碼，必須在對應的生命週期邊界取消 HTTP 請求、關閉 SSE handle，或關閉 WebSocket session。

## 進階檢查

用 `isClient(value)` 檢查執行階段 client marker。

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` 回傳 client 內部持有的即時可變設定物件。它不是快照，也不是 readonly view。

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

修改這個物件會影響後續執行，並繞過正常的選項組合。建議只用於診斷或經過仔細審查的整合程式碼。若引數不是有效 client，`getClientConfig` 會拋出 `TypeError`。

## 下一步

- [指令](/zh-Hant-TW/core/commands)定義傳給 `execute` 的值。
- [攔截器](/zh-Hant-TW/core/interceptors)說明篩選與洋蔥順序。
- [Context](/zh-Hant-TW/core/context)說明 HTTP 與 SSE 的請求範圍中繼資料。
