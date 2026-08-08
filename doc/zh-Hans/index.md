---
layout: home

hero:
  name: Defjs
  text: HTTP、SSE 和 WebSocket 的类型化命令
  tagline: 用 Struct 定义 wire shape，显式创建 client，并清楚保留每种 transport 的结果与生命周期语义。
  actions:
    - theme: brand
      text: 开始使用
      link: /zh-Hans/guide/getting-started
    - theme: alt
      text: 在 GitHub 查看
      link: https://github.com/defjs/defjs

features:
  - title: 端点契约
    details: 明确区分端点定义、command builder 和 command。Struct 会在运行时解码调用方输入和 transport 数据。
  - title: 按 transport 区分结果
    details: HTTP、SSE 和 WebSocket 都返回 error-first 三元素 tuple；第三项分别是 response wrapper、启动 open 快照或启动 connection 快照。
  - title: Interceptor 链
    details: 在 client 上注册 HTTP、SSE 和 WebSocket interceptor。每种 transport 只筛选自己的 interceptor，并按洋葱顺序执行。
  - title: 显式生命周期
    details: SSE 可以重试网络错误和读取错误。WebSocket 重连需要显式开启。应用仍负责迭代、取消和终止关闭。
  - title: 运行时解码
    details: 使用驱动 TypeScript 推断的同一套 Struct 契约，解码输入、response、stream event 和 WebSocket message。
  - title: 应用集成
    details: 通过 Vue 或 React 共享 client，并在服务端应用中添加 outbound OpenTelemetry instrumentation。
---

## 创建类型化 API Client

先描述应用需要调用的 HTTP、SSE 或 WebSocket 契约。Defjs 会把定义变成 command builder，在运行时验证数据，并保留明确的 transport 结果。

HTTP 的核心流程很短：为自己的 API 创建 client，定义端点，调用 command builder，再执行 command。

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

把 client 指向应用实际使用的服务，并让 Struct 匹配该服务的真实 response 契约。Credential、UI state、retry、取消和资源清理仍由应用负责。

## 接着读

- [快速开始](/zh-Hans/guide/getting-started)：安装 package，并在应用中完成第一个类型化请求。
- [Client](/zh-Hans/core/client)：option 组合规则和三个 `execute` overload。
- [Commands](/zh-Hans/core/commands)：端点定义、command builder、command 和 schema-bound projection。
- [HTTP](/zh-Hans/core/http)、[SSE](/zh-Hans/core/sse) 和 [WebSocket](/zh-Hans/core/web-socket)：各 transport 的行为与生命周期责任。
- [Vue](/zh-Hans/plugins/vue)、[React](/zh-Hans/plugins/react) 和 [OpenTelemetry Server](/zh-Hans/plugins/opentelemetry-server)：把 Defjs 接入应用 framework 和 telemetry 配置。
