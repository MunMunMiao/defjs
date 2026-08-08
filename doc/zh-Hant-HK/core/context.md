---
title: Context
description: 透過 HttpContext，在 HTTP 與 SSE interceptor chain 傳遞 request-scoped metadata。
---

# Context

`HttpContext` 是以 token 為 key 的 metadata 容器。它會隨 HTTP 或 SSE execution 傳遞，並附在 interceptor 收到的 `HttpRequest` 上；本身不會 serialize 進 URL、headers 或 body。

## Token 與預設值

以 default-value factory 建立有類型的 token：

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

Context 未有儲存值時，`context.get(token)` 會呼叫 token factory。預設值不會寫入 context，因此 stateful factory 每次讀取缺少的值時都可能產生不同結果。建議使用 deterministic default。

## 建立並傳入 Context

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` 直接修改 context，並回傳同一個 object 以便 chaining。向 `get(...)` 或 `set(...)` 傳入並非由 `makeHttpContextToken(...)` 建立的值，會拋出 `TypeError`。

Interceptor 讀取的是同一個 object：

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

使用固定 operation name 與經 review 的 metadata。預設不要把 secret、raw headers、body、URL 或 query string 寫入 log。

## Reference Semantics

Execution 以 reference 傳遞 `HttpContext`。某個 interceptor 修改它後，之後的 interceptor 與仍持有該 object 的呼叫方都會看見變更。

Context 只要包含 request、user、tenant、trace、cookie 或 authorization 資料，就要為每個 request 建立新 instance。併發工作共用同一個 mutable context，可能洩漏或覆寫 metadata。

目前 HTTP 與 SSE execute option 接受 `context`；WebSocket execute option 不接受。SSE logical handle 會讓這個 request context 延續至後續 connection attempt，但應用程式仍要把它視為該 stream request scope 所擁有的 object。

## 複製與合併

`makeHttpContext(existing)` 會 shallow copy token map：

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

兩個 map 各自獨立，但內裏儲存的 object 值不會 deep clone。

`makeHttpContext(entries)` 亦接受 token/value pair：

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` 回傳新的 context。同一 token 同時存在時，`secondary` 會取代 `primary` 的值。

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

只傳入一個 context 仍會回傳副本；兩個都不傳則回傳空 context。

## Context API

| Member              | 行為                                               |
| ------------------- | -------------------------------------------------- |
| `set(token, value)` | 儲存值，並回傳同一 context。                       |
| `get(token)`        | 回傳已儲存的值；沒有時呼叫 token default factory。 |
| `has(token)`        | 檢查有否儲存值。                                   |
| `del(token)`        | 刪除值，並回傳同一 context。                       |
| `keys()`            | 逐一讀取已儲存的 token。                           |
| `length`            | 已儲存 token 的數量。                              |

需要 runtime guard 時，可使用 `isHttpContext(...)` 與 `isHttpContextToken(...)`。

Request mapping 是另一項責任。自動 request section 與 schema-bound projection 見 [Commands](/zh-Hant-HK/core/commands)；chain 行為見 [Interceptors](/zh-Hant-HK/core/interceptors)。
