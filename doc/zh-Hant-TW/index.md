---
layout: home

hero:
  name: Defjs
  text: HTTP、SSE 與 WebSocket 的型別化指令
  tagline: 用 Struct 定義 wire shape、明確建立用戶端，並讓各種傳輸的結果與生命週期語意保持清楚可見。
  actions:
    - theme: brand
      text: 開始使用
      link: /zh-Hant-TW/guide/getting-started
    - theme: alt
      text: 前往 GitHub
      link: https://github.com/defjs/defjs

features:
  - title: 端點契約
    details: 清楚區分端點定義、指令建構器與指令。Struct 會在執行階段解碼呼叫端輸入與傳輸資料。
  - title: 各傳輸專屬的結果
    details: HTTP、SSE 與 WebSocket 都回傳 error-first 三元素 tuple；第三個元素分別是回應 wrapper、啟動開啟快照或啟動連線快照。
  - title: 攔截器鏈
    details: 在用戶端註冊 HTTP、SSE 與 WebSocket 攔截器。各傳輸只會挑出自己的攔截器，並依洋蔥順序執行。
  - title: 明確的生命週期
    details: SSE 可以針對網路與讀取失敗重試；WebSocket 重連則必須明確啟用。應用程式仍需負責迭代、取消與終止關閉。
  - title: 執行階段解碼
    details: 使用驅動 TypeScript 推導的同一套 Struct 契約，解碼輸入、回應、stream event 與 WebSocket message。
  - title: 應用程式整合
    details: 透過 Vue 或 React 共用用戶端，並在伺服器端服務加入 outbound OpenTelemetry instrumentation。
---

## 建立型別化 API 用戶端

先描述應用程式要呼叫的 HTTP、SSE 或 WebSocket 契約。Defjs 會把定義轉成指令建構器，在執行階段驗證資料，並保留明確的傳輸結果。

HTTP 核心流程很短：為自己的 API 建立用戶端、定義端點、呼叫指令建構器，再執行指令。

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

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

把用戶端指向應用程式實際使用的服務，並讓 Struct 符合該服務真正的回應契約。Credential、UI state、重試、取消與資源清理仍由應用程式負責。

## 接著閱讀

- [開始使用](/zh-Hant-TW/guide/getting-started)：安裝套件，並在應用程式完成第一個型別化請求。
- [Client](/zh-Hant-TW/core/client)：選項組合方式與三種 `execute` overload。
- [指令](/zh-Hant-TW/core/commands)：端點定義、指令建構器、指令與結構描述綁定投影。
- [HTTP](/zh-Hant-TW/core/http)、[SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)：各傳輸的行為與生命週期責任。
- [Vue](/zh-Hant-TW/plugins/vue)、[React](/zh-Hant-TW/plugins/react)與 [OpenTelemetry Server](/zh-Hant-TW/plugins/opentelemetry-server)：把 Defjs 接到應用程式框架與 telemetry 設定。
