---
layout: home

hero:
  name: Defjs
  text: HTTP、SSE 與 WebSocket 的類型化 command
  tagline: 以 Struct 定義 wire shape，明確建立 client，並保留每種 transport 各自的結果與生命週期語義。
  actions:
    - theme: brand
      text: 開始使用
      link: /zh-Hant-HK/guide/getting-started
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/defjs/defjs

features:
  - title: Endpoint 契約
    details: 明確區分 endpoint 定義、command builder 與 command。Struct 會在 runtime 解碼呼叫方輸入及 transport 資料。
  - title: 按 transport 區分結果
    details: HTTP、SSE 與 WebSocket 都回傳 error-first 三項 tuple；第三項分別是 response wrapper、startup-open 快照及 startup-connection 快照。
  - title: Interceptor 鏈
    details: 在 client 註冊 HTTP、SSE 與 WebSocket interceptor。每種 transport 只會選取自己的 interceptor，並按洋蔥順序執行。
  - title: 明確生命週期
    details: SSE 可以重試網絡及讀取錯誤；WebSocket reconnect 則要明確啟用。應用程式仍要自行負責迭代、取消與 terminal close。
  - title: Runtime decoding
    details: 用驅動 TypeScript inference 的同一套 Struct contract，decode input、response、stream event 同 WebSocket message。
  - title: 應用程式整合
    details: 透過 Vue 或 React 共用 client，亦可在 server-side service 加入 outbound OpenTelemetry instrumentation。
---

## 建立 Typed API Client

先描述應用程式要呼叫的 HTTP、SSE 或 WebSocket contract。Defjs 會把定義變成 command builder、在 runtime 驗證資料，並清楚保留 transport result。

HTTP 核心流程很短：為自己的 API 建立 client、定義 endpoint、呼叫 command builder，再執行 command。

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

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

把 client 指向應用程式實際使用的 service，並確保 Struct 配合該 service 的真實 response contract。Credentials、UI state、retry、cancellation 同 resource cleanup 仍由應用程式負責。

## 接著讀

- [快速上手](/zh-Hant-HK/guide/getting-started)：安裝 package，並在應用程式完成第一個 typed request。
- [Client](/zh-Hant-HK/core/client)：option 組合規則與三個 `execute` overload。
- [Commands](/zh-Hant-HK/core/commands)：endpoint definition、command builder、command 同 schema-bound projection。
- [HTTP](/zh-Hant-HK/core/http)、[SSE](/zh-Hant-HK/core/sse) 同 [WebSocket](/zh-Hant-HK/core/web-socket)：各 transport 的行為與 lifecycle responsibility。
- [Vue](/zh-Hant-HK/plugins/vue)、[React](/zh-Hant-HK/plugins/react) 同 [OpenTelemetry Server](/zh-Hant-HK/plugins/opentelemetry-server)：把 Defjs 接入應用程式 framework 同 telemetry setup。
