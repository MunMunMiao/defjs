---
title: Context
description: 透過 HttpContext 把請求範圍的中繼資料傳進 HTTP 與 SSE 攔截器鏈。
---

# Context

`HttpContext` 是以 token 為 key 的中繼資料容器。它會跟著 HTTP 或 SSE 執行，並出現在攔截器看到的 `HttpRequest` 上；它本身不會序列化進 URL、headers 或 body。

## Token 與預設值

用預設值 factory 建立有型別的 token：

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

Context 裡沒有已儲存的值時，`context.get(token)` 會呼叫 token factory。預設值不會寫回 context，因此有狀態的 factory 可能在每次讀取缺少的值時產生不同結果。建議使用結果固定的預設值。

## 建立並傳入 Context

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` 會修改 context，並回傳同一個 context 以便 chain。若值不是由 `makeHttpContextToken(...)` 建立的 token，`get(...)` 與 `set(...)` 都會拋出 `TypeError`。

攔截器讀到的是同一個物件：

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

使用固定的 operation name 與審查過的中繼資料。預設不要把密鑰、原始 headers、body、URL 或 query string 寫進 log。

## 參照語意

執行時會以參照傳遞 `HttpContext`。攔截器若修改它，後續攔截器與持有同一物件的呼叫端都看得到變更。

Context 只要含有 request、使用者、tenant、trace、cookie 或 authorization 資料，就要為每個請求建立新的實例。跨並行工作重用同一個可變 context，可能洩漏或覆寫中繼資料。

目前 HTTP 與 SSE 的 execute options 接受 `context`，WebSocket 則不接受。SSE 邏輯 handle 會保留與各次連線嘗試關聯的 request context；應用程式仍應把它視為該 stream request scope 所擁有。

## 複製與合併

`makeHttpContext(existing)` 會 shallow copy token map：

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

兩個 map 彼此分開，但儲存的物件值不會 deep clone。

`makeHttpContext(entries)` 接受 token/value pair：

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` 會回傳新的 context。同一個 token 若兩邊都有值，`secondary` 會取代 `primary`。

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

只傳一個 context 時仍會回傳副本；兩個都不傳則回傳空 context。

## Context API

| Member              | 行為                                              |
| ------------------- | ------------------------------------------------- |
| `set(token, value)` | 儲存值並回傳同一個 context。                      |
| `get(token)`        | 回傳已儲存的值，否則呼叫 token 的預設值 factory。 |
| `has(token)`        | 檢查是否已儲存值。                                |
| `del(token)`        | 刪除值並回傳同一個 context。                      |
| `keys()`            | 迭代已儲存的 token。                              |
| `length`            | 已儲存的 token 數量。                             |

需要執行階段 guard 時，可以使用 `isHttpContext(...)` 與 `isHttpContextToken(...)`。

請求對應是另一件事。[指令](/zh-Hant-TW/core/commands)說明自動 request section 與結構描述綁定投影，[攔截器](/zh-Hant-TW/core/interceptors)則說明 chain 行為。
