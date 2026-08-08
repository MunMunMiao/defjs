---
title: Client
description: 明確建立 client、組合 option、執行不同 transport 的 command，並檢視 live configuration。
---

# Client

明確建立 `Client`，再把它傳給需要執行 command 的程式碼。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Client 保存設定，並分派 HTTP、SSE 與 WebSocket command。它不管理 global registry，也不是背景 lifecycle manager。

## Option 組合

Option 會由左至右執行。

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

最後的 endpoint 是 `https://api.example.com`。Interceptor 順序為 `operationLogger`、`authInterceptor`、`retryInterceptor`。

組合規則只有三項：

1. Setter helper 會取代原值，包括 `withEndpoint`、transport handle、query serializer、credentials、XSRF 設定，以及個別 SSE 或 WebSocket 設定。
2. `withInterceptors(...items)` 會追加。多次呼叫仍會保留 interceptor 的加入次序。
3. `withSSEOptions(...)` 與 `withWebSocketOptions(...)` 會淺層取代每個有定義的 top-level 欄位，不會 deep merge 內層 reconnect、heartbeat 或 queue object。

例如，以下第二個 reconnect object 會整個取代第一個，不會保留 `attempts: 5`：

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

分組 option helper 會忽略值為 `undefined` 的 property；其餘有提供的 top-level property 都會整個取代現值。

### Core Option

| Option                           | 效果                                                            |
| -------------------------------- | --------------------------------------------------------------- |
| `withEndpoint(url)`              | 設定所有 transport 使用的 absolute base endpoint。              |
| `withHTTPHandle(fetch)`          | 取代 HTTP 的 Fetch 實作。                                       |
| `withSSEHandle(fetch)`           | 取代 SSE 的 Fetch 實作。                                        |
| `withWebSocketHandle(WebSocket)` | 取代 WebSocket constructor。                                    |
| `withInterceptors(...items)`     | 追加混合 transport interceptor。                                |
| `withQueryParamsSerializer(fn)`  | 取代 HTTP、SSE 與 WebSocket 的 query serializer。               |
| `withCredentials(boolean)`       | 值為 true 時，HTTP 與 SSE 使用 Fetch `credentials: 'include'`。 |
| `withXSRF(options?)`             | 設定 HTTP XSRF token 注入。                                     |
| `withSSEOptions(options)`        | 淺層取代有定義的 SSE 欄位。                                     |
| `withWebSocketOptions(options)`  | 淺層取代有定義的 WebSocket 欄位。                               |

個別 SSE 與 WebSocket helper 只會設定對應的 top-level 欄位。各 transport 頁列出其預設值及 lifecycle 影響。

## 執行 Command

`Client.execute` 有三個 overload，每個都回傳 error-first 三項 tuple。

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

有 response 時，第三項是 Defjs `SettledResponse` wrapper。HTTP option 包括 `abort` 或 `timeout`、額外的 `signal` alias、`context`，以及 upload/download progress observer。

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

第三項是已驗證的 startup-open snapshot。`stream.open` 是另一個 live getter，可能在 reconnect 後改變。SSE execution 接受 cancellation 與 `HttpContext`；reconnect 和 event queue 則在 client option 設定。

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

第三項是 startup-connection snapshot。`session.connection` 是 live getter，可能描述之後的實體連線嘗試。WebSocket execution 接受 cancellation，以及單次 execution 的 `beforeConnect`、`heartbeat`、`protocols`、`queue` 與 `reconnect`，但不接受 `HttpContext`。

準確的 failure branch 見 [Errors](/zh-Hant-HK/core/errors)；transport lifecycle 見 [HTTP](/zh-Hant-HK/core/http)、[SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)。

## Client Scope

如果 endpoint 與 closure 只包含可安全留在瀏覽器、並且與 request 無關的 state，瀏覽器應用程式可以保留 module-level client。

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

伺服器端 client 的 option 或 interceptor 一旦捕捉 authorization、cookie、tenant 資料、user 資料或 request context，就不要跨 request 重用。請在 server request boundary 內建立 client。

`Client` 沒有 `dispose()` method，亦不追蹤 active request、stream 或 session。開始工作的程式碼必須在相應 lifecycle boundary 取消 HTTP request、關閉 SSE handle 或關閉 WebSocket session。

## 進階檢視

用 `isClient(value)` 檢查 runtime client marker。

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` 回傳 client 實際持有的 live mutable configuration object，不是 snapshot，亦不是 readonly view。

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

修改這個 object 會影響之後的 execution，並繞過正常 option composition。只應用於診斷或經仔細審查的 integration code。參數不是有效 client 時，`getClientConfig` 會拋出 `TypeError`。

## 下一步

- [Commands](/zh-Hant-HK/core/commands)：定義傳給 `execute` 的值。
- [Interceptors](/zh-Hant-HK/core/interceptors)：transport filtering 與洋蔥順序。
- [Context](/zh-Hant-HK/core/context)：HTTP 與 SSE 的 request-scoped metadata。
