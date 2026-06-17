---
title: 設計決策
description: 與其他 HTTP 函式庫常見模式不同的 API 設計決策。
---

# 設計決策

Defjs 在某些設計決策上故意與其他 HTTP 函式庫的常見模式不同。本檔案解釋每個決策背後的設計原理。

## 顯式用戶端設計

Defjs 要求所有用戶端顯式建立。你使用 `createClient` 建立 `Client`，並在需要的地方傳遞它。

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

為何這樣設計：

- **測試友好**：測試之間無需重置或模擬任何狀態。直接傳入不同的 `Client` 執行個體。
- **多環境共存**：多個用戶端可以在同一程序中並行執行（例如內部 API + 公開 API），互不干擾。
- **相依透明**：呼叫方必須顯式持有 `Client`，使相依關係對靜態分析和程式碼審查可見。

如果你在應用中需要共享用戶端，請從模組匯出：

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## 框架整合

`@defjs/angular`、`@defjs/vue` 和 `@defjs/react` 將顯式用戶端接入各框架的相依模型。Angular 和 Vue 使用 `provideClient` / `injectClient`；React 使用 `ClientProvider` / `useClient`。這允許用戶端在元件或服務樹中註冊和擷取。

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // 在元件邏輯中使用 client.execute(...)
}
```

## 請求級選項傳給 `execute`，而非 Builder

請求級選項（`abort`、`timeout`、`heartbeat`、`reconnect` 等）透過 `client.execute` 的第二個引數傳入，而非指令建構器。

```typescript
// 正確：請求級選項傳給 execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` 按指令類型多載

`client.execute` 會根據 `Command` 類型自動回傳正確的結果類型。

```typescript
// HTTP 請求 — 回傳 HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE 串流 — 回傳 StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — 回傳 SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` 是觀察者

SSE 的 `onInvalidEvent` 是觀察者。其內部拋出的例外會被靜默忽略，不會中斷串流。

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // 即使這裡拋出例外，串流仍會繼續
    },
  },
})
```

## 錯誤子模組合併

所有錯誤符號都從 `@defjs/core` 主入口匯出。

| 匯出                    | 說明               | 典型用法                                                    |
| ----------------------- | ------------------ | ----------------------------------------------------------- |
| `RequestError`          | 錯誤聯合類型       | `switch (error.kind)` 分支                                  |
| `ERR_ABORTED`           | 取消識別符         | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | 逾時識別符         | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | 建立傳輸錯誤       | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | 建立定義錯誤       | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | 建立 HTTP 狀態錯誤 | `createHttpStatusError(404, 'Not Found', response, data)`   |

從主入口匯入：

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## 按 `kind` 和 `code` 進行錯誤分支

Defjs 建議透過 `kind` 和 `code` 進行分支，而非字串比對。

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## 更嚴格的端點定義規則

Defjs 強制執行一條嚴格規則：**當提供 `build` 時，必須同時提供 `input`。**

```typescript
// 正確：同時提供 input 與 build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// 正確：不提供 input 也不提供 build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// 錯誤：提供 build 但缺少 input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript 錯誤：缺少 input 結構描述
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

此規則同樣適用於 `defineEventStream` 與 `defineWebSocket`。

## 相依要求

| 套件             | 所需版本 |
| ---------------- | -------- |
| `@defjs/core`    | `^0.4.0` |
| `@defjs/angular` | `19.x`   |
| `@defjs/vue`     | `^0.4.0` |
| `@defjs/react`   | `^0.4.0` |

Angular peer dependency 範圍：`>=18.0.0 <=22.0.0`。React peer dependency 範圍：`>=18.0.0`。Node 執行環境：`>=26`。

## 接下來

- [用戶端 →](/core/client) — 顯式用戶端設計與設定
- [指令 →](/core/commands) — 指令定義與輸入規則
- [錯誤 →](/core/errors) — `RequestError` 結構與分支
