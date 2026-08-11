---
title: 快速上手
description: 安裝 Defjs、定義 typed HTTP endpoint、建立 client，再由自己的應用程式呼叫。
---

# 快速上手

Defjs 讓應用程式只需定義一次 API contract，之後便可重用同一套 typed input、runtime decoding 同清楚的 transport result。

## 安裝

在應用程式加入 core package：

```sh
pnpm add @defjs/core
```

如果 project 使用其他 package manager，請改用相應的 npm、Yarn 或 Bun 指令。`@defjs/core` 是 ESM。在 Node.js 執行時，目前 package metadata 要求 Node 22 或以上。

打包後的 ESM HTTP consumer 已在 Node.js 22、24、26、Bun 1.3.14 及 Deno 2.9.5 完成實測。編譯應用程式後，相應指令形式如下：

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

Deno 指令使用 `node_modules` 中已安裝的 package；請把 network permission 換成應用程式實際需要的精確 API host。Bun 及 Deno 實測只涵蓋文件所述 HTTP 範圍，並不代表所有 platform API 或 transport。Browser build 使用一般 bundler，以及平台提供的必要 Fetch 與 WebSocket 能力。

跨 runtime 測試只應 assert `error.kind`、`error.code` 等穩定 Defjs field。不要依賴特定 engine 的 native `Error` message 或 JSON parse 文本；Node.js、Bun 及 Deno 可能採用不同格式。

只在應用程式真正需要時安裝 adapter：

| 應用場景                  | Packages                                                                                  |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                 | `@defjs/core`、`@defjs/react`、`react`                                                    |
| Vue 3+                    | `@defjs/core`、`@defjs/vue`、`vue`                                                        |
| Server-side OpenTelemetry | `@defjs/core`、`@defjs/opentelemetry-server`、`@opentelemetry/api`、`@opentelemetry/core` |

::: tip 文件要配合已安裝版本
這些頁面描述目前文件版本對應的 API。先確認應用程式實際安裝的版本。如果 export 或 option 不同，請查看該版本的文件及 release notes，不要混用不同版本的範例。
:::

## 定義第一個 Request

假設你的 API 提供 `GET /users/:id`。請把 base URL 同 response Struct 換成自己 service 的實際 contract。

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
  ],
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

`defineRequest(...)` 回傳一個 **command builder**。呼叫 `getUser(...)` 會建立一個 **command**，內含 endpoint 定義和這次呼叫的 input。之後，`client.execute(...)` 會回傳 HTTP 三項 tuple：

```typescript
;[error, result, response]
```

成功時，`error` 是 `null`，`result` 是解碼後的 output data，`response` 是 Defjs `HttpResponse` wrapper。失敗時，`result` 是 `undefined`；如果未收到 response，response wrapper 亦是 `undefined`。

### 自動保留 status literal

`defineRequest(...)` 對 `output` 使用 const generic，因此 inline array item 及分組 status array 會自動保留 literal value。要區分推斷出的 2xx success body 與非 2xx error body，不再需要 `as const`。

亦可使用 object 形式的 `output`：

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## 接入你的應用程式

把 endpoint definition 放在描述 service API 的 module，再由 component、route handler、job 或 store 重用 command builder。請在真正擁有 endpoint、credentials、interceptors 同 lifecycle 的 boundary 建立 client：

- Browser application 通常可以共用一個 client；
- Server rendering 中，如果 headers、cookies、user 或 tenant 會隨 request 改變，應為每個 request 建立 client；
- 開啟 SSE 或 WebSocket resource 的 code，亦要負責 consume 同 close。

## 下一步

- [Commands](/zh-Hant-HK/core/commands)：自動 request mapping 與自訂 schema-bound projection。
- [Errors](/zh-Hant-HK/core/errors)：三種 transport tuple 與 `RequestError` union。
- [HTTP](/zh-Hant-HK/core/http)：URL 解析、request body、output 解碼、取消與 XSRF 行為。
- [範例](/zh-Hant-HK/guide/examples)：把這些 contract 組合成由應用程式管理的實作範例。
