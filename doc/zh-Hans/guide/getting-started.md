---
title: 快速开始
description: 安装 Defjs，定义类型化 HTTP 端点，创建 client，并在自己的应用中调用它。
---

# 快速开始

Defjs 让应用只定义一次 API 契约，然后复用同一套类型化输入、运行时解码和明确的 transport 结果。

## 安装

在应用中安装 core package：

```sh
pnpm add @defjs/core
```

如果项目使用其他 package manager，请换成对应的 npm、Yarn 或 Bun 命令。`@defjs/core` 是 ESM。在 Node.js 中运行时，当前 package metadata 要求 Node 22 或更高版本。

打包后的 ESM HTTP consumer 已在 Node.js 22、24、26、Bun 1.3.14 和 Deno 2.9.5 上完成实测。编译应用后，对应的命令形式如下：

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

Deno 命令使用 `node_modules` 中已经安装的 package；请将网络权限替换为应用实际需要访问的精确 API host。Bun 和 Deno 实测覆盖文档所述的 HTTP 范围，并不代表所有 platform API 或 transport。浏览器 build 使用常规 bundler，以及平台提供的必要 Fetch 和 WebSocket 能力。

跨 runtime 测试只应断言 `error.kind`、`error.code` 等稳定的 Defjs 字段。不要依赖特定引擎的原生 `Error` message 或 JSON parse 文本；Node.js、Bun 和 Deno 可能采用不同格式。

只在应用确实需要时安装 adapter：

| 应用场景             | Packages                                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------- |
| React 18+            | `@defjs/core`、`@defjs/react`、`react`                                                    |
| Vue 3+               | `@defjs/core`、`@defjs/vue`、`vue`                                                        |
| 服务端 OpenTelemetry | `@defjs/core`、`@defjs/opentelemetry-server`、`@opentelemetry/api`、`@opentelemetry/core` |

::: tip 文档要和安装版本一致
这些页面描述当前文档版本对应的 API。先确认应用实际安装的版本。如果 export 或 option 不同，请查看该版本的文档和 release notes，不要混用不同版本的示例。
:::

## 定义第一个请求

假设你的 API 提供 `GET /users/:id`。请把 base URL 和 response Struct 换成自己服务的真实契约。

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

`defineRequest(...)` 返回一个 **command builder**。调用 `getUser(...)` 会创建一个 **command**，其中保存端点定义和本次调用的输入。随后，`client.execute(...)` 返回 HTTP 三元素 tuple：

```typescript
;[error, result, response]
```

成功时，`error` 是 `null`，`result` 是解码后的输出数据，`response` 是 Defjs `HttpResponse` wrapper。失败时，`result` 是 `undefined`；如果没有收到 response，response wrapper 也是 `undefined`。

### 自动保留 status 字面量

`defineRequest(...)` 对 `output` 使用 const generic，因此 inline 数组项和分组 status 数组会自动保留字面量值。区分推断出的 2xx 成功 body 与非 2xx 错误 body 时，不再需要 `as const`。

也可以使用对象形式的 output：

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## 接入你的应用

把端点定义放在描述服务 API 的 module 中，再从 component、route handler、job 或 store 复用 command builder。请在真正拥有 endpoint、credential、interceptor 和生命周期的边界创建 client：

- 浏览器应用通常可以共享一个 client；
- 服务端渲染中，如果 header、cookie、用户或 tenant 会随请求变化，应为每个请求创建 client；
- 打开 SSE 或 WebSocket 资源的代码，也必须负责消费并关闭它。

## 下一步

- [Commands](/zh-Hans/core/commands)：自动请求映射和自定义 schema-bound projection。
- [Errors](/zh-Hans/core/errors)：三种 transport tuple 和 `RequestError` union。
- [HTTP](/zh-Hans/core/http)：URL 解析、请求 body、输出解码、取消和 XSRF 行为。
- [示例](/zh-Hans/guide/examples)：把这些契约组合成由应用管理的配方。
