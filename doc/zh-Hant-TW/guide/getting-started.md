---
title: 開始使用
description: 安裝 Defjs、定義型別化 HTTP 端點、建立用戶端，並從自己的應用程式呼叫。
---

# 開始使用

Defjs 讓應用程式只需要定義一次 API 契約，之後就能重用同一套型別化輸入、執行階段解碼與明確的傳輸結果。

## 安裝

在應用程式加入 core 套件：

```sh
pnpm add @defjs/core
```

如果專案使用其他套件管理工具，請改用對應的 npm、Yarn 或 Bun 指令。`@defjs/core` 採用 ESM。在 Node.js 執行時，目前套件 metadata 要求 Node 26 以上。

只在應用程式確實需要時安裝轉接器：

| 應用情境               | 套件                                                                                      |
| ---------------------- | ----------------------------------------------------------------------------------------- |
| React 18+              | `@defjs/core`、`@defjs/react`、`react`                                                    |
| Vue 3+                 | `@defjs/core`、`@defjs/vue`、`vue`                                                        |
| 伺服器端 OpenTelemetry | `@defjs/core`、`@defjs/opentelemetry-server`、`@opentelemetry/api`、`@opentelemetry/core` |

::: tip 文件要和安裝版本一致
這些頁面描述目前文件版本對應的 API。請先確認應用程式實際安裝的版本。如果 export 或 option 不同，請查看該版本的文件與 release notes，不要混用不同版本的範例。
:::

## 定義第一個請求

假設你的 API 提供 `GET /users/:id`。請把 base URL 與 response Struct 換成自己服務的實際契約。

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` 會回傳**指令建構器**。呼叫 `getUser(...)` 後會建立一個**指令**，其中保存端點定義與本次呼叫的輸入。接著，`client.execute(...)` 會回傳 HTTP 三元素 tuple：

```typescript
;[error, result, response]
```

成功時，`error` 是 `null`、`result` 是解碼後的輸出資料，而 `response` 是 Defjs 的 `SettledResponse` wrapper。失敗時，`result` 是 `undefined`；若完全沒收到回應，response wrapper 也會是 `undefined`。

### 為什麼需要 `as const`

陣列形式的 `output` 會用 status literal 區分 2xx 成功 body 與非 2xx 錯誤 body。`as const` 會保留這些 status，以及群組 status 陣列的 readonly literal 型別。少了它，TypeScript 可能把型別拓寬成 `number` 或 `number[]`，導致推導出的成功與錯誤分支變得不精確。

也可以使用物件形式的 output：

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## 接到你的應用程式

把端點定義放在描述服務 API 的 module，再從 component、route handler、job 或 store 重用指令建構器。請在真正擁有 endpoint、credential、攔截器與生命週期的邊界建立用戶端：

- 瀏覽器應用程式通常可以共用一個用戶端；
- 伺服器端渲染中，如果 header、cookie、使用者或 tenant 會隨請求改變，應為每個請求建立用戶端；
- 開啟 SSE 或 WebSocket 資源的程式碼，也必須負責消費並關閉它。

## 下一步

- [指令](/zh-Hant-TW/core/commands)說明自動請求對應與自訂的結構描述綁定投影。
- [錯誤](/zh-Hant-TW/core/errors)說明三種傳輸 tuple 與 `RequestError` union。
- [HTTP](/zh-Hant-TW/core/http)涵蓋 URL 解析、request body、輸出解碼、取消與 XSRF 行為。
- [範例](/zh-Hant-TW/guide/examples)把這些契約組合成由應用程式管理資源的實作方式。
