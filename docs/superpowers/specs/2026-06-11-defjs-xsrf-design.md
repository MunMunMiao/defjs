# defjs XSRF 设计

## 背景

defjs 需要提供一套适合多 runtime 的 XSRF 能力，但不能模糊不同运行环境的安全边界。当前代码库的 client API 已经采用 Go-style options 形式：[`createClient(...options)`](../../../packages/core/src/client/client.ts)，并通过 [`ClientOption`](../../../packages/core/src/client/option.ts) 修改 [`ClientConfig`](../../../packages/core/src/client/config.ts)。

本设计目标是在不破坏现有 client / request / transport 分层的前提下，引入一套学习 Angular 的 XSRF 机制：默认不开启，显式开启后在浏览器中只对同源的 mutating 请求自动为请求头注入 token；在非浏览器 runtime 中不自动读取任何运行时上下文，只通过显式 provider 提供 token。core 只决定是否注入 header，不决定 token 从哪里来。

## 验证结论

- MDN / OWASP / Angular 都支持“不可预测 token + 服务端逐次验证 + JS API 通过自定义 header 传回”的 XSRF/CSRF 模式。
- Angular 的 client-side XSRF 只覆盖 client half：默认 cookie 名是 `XSRF-TOKEN`，默认 header 名是 `X-XSRF-TOKEN`，且只对 mutating 请求、relative / same-origin URL 生效。
- `HttpXsrfTokenExtractor#getToken()` 是同步签名，并且会对每个请求调用一次；因此 defjs 的 token provider 第一版保持同步更合理。

## 设计目标

- 学习 Angular / MDN / OWASP 的 client-side XSRF 语义。
- 保持 defjs 现有 `createClient(...options)` API 风格。
- 默认不开启，必须显式启用。
- browser runtime 内置自动 cookie -> header 行为。
- non-browser runtime 不自动推断用户上下文，只允许显式 token provider。
- core 统一决定是否注入 header，provider 只负责提供 token。
- 不把 SSR 框架上下文转发逻辑塞进 core。
- 不把 `withCredentials` 作为 XSRF 的前置条件；Fetch 的默认 `same-origin` credentials 已经覆盖同源请求。

## 非目标

- 不实现服务端 CSRF 防御体系。
- 不在 core 中自动读取 Node/SSR incoming request cookies。
- 不提供 per-request XSRF override。
- 不支持 cross-origin 自动注入。
- 不把 credentialed CORS 当作 XSRF 的默认工作模式。
- 第一版不扩展到 SSE 或 WebSocket。

## Public API

新增一个 `ClientOption`：

```ts
createClient(withEndpoint('/api'), withCredentials(true), withXSRF())
```

支持自定义：

```ts
createClient(
  withEndpoint('/api'),
  withXSRF({
    cookieName: 'CUSTOM-XSRF-TOKEN',
    headerName: 'X-CUSTOM-XSRF-TOKEN',
    tokenProvider: myTokenProvider,
  }),
)
```

建议新增类型：

```ts
export interface XSRFTokenProviderContext {
  request: HttpRequest
}

export type XSRFTokenProvider = (context: XSRFTokenProviderContext) => string | null | undefined
```

`XSRFTokenProvider` 第一版保持同步，不返回 `Promise`。原因是当前 `createFetchRequestInit` / `createFetchRequest` 的请求构造链是同步的；同时 Angular 的 `HttpXsrfTokenExtractor#getToken()` 也是同步的、按请求调用的提取器。若上游真的需要异步取 token，应在更高层先 resolve 再把结果放进同步闭包，而不是把 core 的 transport 链改成异步。

```ts
export interface ClientXSRFOptions {
  cookieName?: string
  headerName?: string
  tokenProvider?: XSRFTokenProvider
}

export function withXSRF(options?: ClientXSRFOptions): ClientOption
```

默认值：

- `cookieName = 'XSRF-TOKEN'`
- `headerName = 'X-XSRF-TOKEN'`
- `tokenProvider = undefined`

`withXSRF()` 的含义是启用 XSRF，并使用 Angular 风格默认值。

## Runtime 行为矩阵

### Browser runtime

启用 `withXSRF()` 后，只有满足以下条件时才自动注入 header：

1. 请求方法属于 `POST`、`PUT`、`PATCH`、`DELETE`
2. 请求最终解析出的 URL 与当前浏览器文档 origin 同源
3. 请求头里还没有目标 XSRF header
4. 成功拿到非空 token

token 解析规则：

1. 如果配置了 `tokenProvider`，优先使用 provider 返回值
2. 否则，从 `document.cookie` 读取 `cookieName`

以下情况静默跳过，不报错：

- 未启用 `withXSRF()`
- 方法不是 mutating method
- 目标 URL 与当前浏览器 origin 非同源
- token 不存在或为空
- header 已由用户显式设置
- 当前环境无法访问浏览器 API（例如缺少 `document.cookie` 或 `location.origin`）

说明：relative URL 不是单独的安全类别；它只是解析后仍然与当前 origin 同源时才会注入。

### Non-browser runtime

包括 Node、Bun、Deno、SSR server 等环境。

默认行为：

- 启用了 `withXSRF()` 但未提供 `tokenProvider` 时，不注入，不报错，静默跳过
- 不自动读取服务端 request cookies，也不假设存在浏览器式 `document.cookie` 或 cookie jar
- 不自动转发 SSR 请求上下文
- 不从运行时推断 token 来源；如果要在 SSR 中使用，必须由更高层显式把 token 解析好并以同步 provider 形式注入

说明：Deno 明确不遵循 same-origin policy 且 `credentials` 不属于已实现的 Web Platform 能力；Bun 的 cookies 属于服务器侧 API；Node 提供 browser-compatible `fetch` / `Request`，但这不等于浏览器式 cookie 上下文，所以 core 不能把“有 fetch”误判为“有 XSRF 环境”。（[Deno web platform APIs](https://docs.deno.com/runtime/reference/web_platform_apis/)，[Bun Web APIs](https://bun.sh/docs/runtime/web-apis/)，[Bun Cookies](https://bun.sh/docs/runtime/cookies/)，[Node globals](https://nodejs.org/api/globals.html#class-request)）

如果提供 `tokenProvider`：

- 仍然沿用与 browser 相同的 method / same-origin / header 优先级规则
- same-origin 仍然采用严格判断：只对同源目标请求注入，绝不把 cross-origin 伪装成可注入
- 只是 token 来源改为 provider

### 与 `withCredentials` 的关系

`withXSRF` 和 `withCredentials` 相互独立：

- `withCredentials` 只影响 `RequestInit.credentials`
- `withXSRF` 只影响是否写入 token header
- 同源请求在 Fetch 里默认就是 `same-origin` credentials，因此 `withXSRF` 不要求调用方必须启用 `withCredentials`
- 跨域 credentialed request 仍然属于 cross-origin，不会因此自动获得 XSRF header
- 两者可以同时使用，但互不作为启用条件

如果调用方刻意启用 credentialed CORS，后端仍需单独审计 CORS 与 CSRF 策略；core 不会把跨域请求升级成自动安全。

## 内部数据流

### 1. ClientConfig

在 [`packages/core/src/client/config.ts`](../../../packages/core/src/client/config.ts) 中新增：

```ts
export interface ClientXSRFConfig {
  cookieName: string
  headerName: string
  tokenProvider?: XSRFTokenProvider
}
```

并在 `ClientConfig` 上增加：

```ts
xsrf?: ClientXSRFConfig
```

`undefined` 表示未启用 XSRF。

### 2. Client option 写入

在 [`packages/core/src/client/option.ts`](../../../packages/core/src/client/option.ts) 中新增：

```ts
export function withXSRF(options: ClientXSRFOptions = {}): ClientOption {
  return (config) => {
    config.xsrf = {
      cookieName: options.cookieName ?? 'XSRF-TOKEN',
      headerName: options.headerName ?? 'X-XSRF-TOKEN',
      tokenProvider: options.tokenProvider,
    }
  }
}
```

### 3. createClient / cloneClient 传播

在 [`packages/core/src/client/client.ts`](../../../packages/core/src/client/client.ts) 中：

- `createClient` 初始化 `conf.xsrf = undefined`
- `cloneClient` 复制 `prev.xsrf`

这样 XSRF 配置会和其他 client 级配置一样被继承和覆盖。

### 4. HttpRequest 传播

在 [`packages/core/src/internal/http_request.ts`](../../../packages/core/src/internal/http_request.ts) 中增加：

```ts
xsrf?: ClientXSRFConfig
```

在 [`packages/core/src/http/request.ts`](../../../packages/core/src/http/request.ts) 的 `createHttpRequest` 构造结果时，将 client config 的 `xsrf` 带入 `HttpRequest`。

### 5. fetch transport 最终注入

在 [`packages/core/src/http/transport/fetch.ts`](../../../packages/core/src/http/transport/fetch.ts) 中，由 `createFetchRequestInit(request)` 在最终创建 `RequestInit` 前执行 XSRF 逻辑。

推荐拆出以下辅助逻辑：

- `isMutatingMethod(method)`
- `isSameOriginRequest(request)`
- `readBrowserXSRFCookie(name)`
- `resolveXSRFToken(request)`
- `applyXSRFHeaderIfNeeded(request, headers)`

核心流程：

1. 检查 `request.xsrf` 是否存在
2. 检查 method 是否属于 `POST / PUT / PATCH / DELETE`
3. 检查 header 是否已存在
4. 检查 URL 是否为同源请求
5. 解析 token
6. token 非空则写入 header

## Header 注入规则

- 只注入一个 header：`headerName`
- 如果用户或 interceptor 已经显式设置该 header，自动逻辑不得覆盖
- header 匹配按 `Headers` 语义处理，大小写不敏感
- same-origin 规则固定，不提供额外配置项，也不提供 cross-origin allowlist

## same-origin 规则

第一版固定使用 strict same-origin，不把 `same-site` 当作自动放行条件。

- Browser runtime：只有当最终解析出的请求 URL 与当前 `location.origin` 同源时才允许自动注入。relative URL 只是此规则的简写。
- Non-browser runtime：只有当最终解析出的请求 URL 与客户端配置的 `baseEndpoint` 所在 origin 同源时才允许走 provider 注入路径；core 不读取也不猜测 SSR 的入站请求 origin。
- Cross-origin URL：禁止自动注入，无论是否设置 `withCredentials`

如果应用把多个同站子域都纳入信任边界，应该在服务端显式处理，不要让 core 默认为 `same-site`。

## 与分层的关系

- option 层只负责写配置
- request 层只负责传递配置
- transport 层负责最终浏览器相关判定与 header 注入

不把浏览器 cookie 读取逻辑放进 interceptor 层，避免浏览器专属行为污染通用拦截抽象。

## 测试矩阵

### `packages/core/src/http/transport/fetch.spec.ts`

补充以下核心测试：

1. `POST` + browser token + same-origin → 注入默认 header
2. `GET` / `HEAD` → 不注入
3. relative URL → 注入
4. same-origin absolute URL → 注入
5. cross-origin absolute URL → 不注入
6. 自定义 cookie/header 名 → 生效
7. header 已存在 → 不覆盖
8. token 为空 → 跳过
9. browser 中 provider 优先于 cookie
10. non-browser + no provider → 跳过
11. non-browser + provider → 注入
12. `withCredentials = false` 的同源请求仍可注入
13. `withCredentials = true` 的跨域请求仍不自动注入

### `packages/core/src/http/http.browser.spec.ts`

补充真实浏览器测试：

1. 写入 `document.cookie`
2. 创建启用 `withXSRF()` 的 client
3. 发起 `POST` 请求
4. 由测试服务端回显 header
5. 断言请求头中包含 `X-XSRF-TOKEN`

### `packages/core/src/http/http.spec.ts`

补充配置传播测试：

1. 创建启用 `withXSRF()` 的 client
2. 通过 interceptor 捕获 `HttpRequest`
3. 断言 `request.xsrf` 存在且值正确

### 不新增的测试面

第一版不要求在 SSE / WebSocket 测试中覆盖 XSRF，因为该能力只针对 HTTP fetch transport。

## 兼容性与迁移

- 现有 client 不受影响，因为默认不开启
- 现有 `withCredentials`、interceptors、request builder 均可继续按原方式工作
- 只有显式使用 `withXSRF()` 的调用方才会启用该能力

## 设计结论

最终方案是：

- 新增 `withXSRF(options?)`，作为 `ClientOption`
- 默认关闭，显式开启后采用 Angular 风格默认名与注入规则
- browser runtime 内置 cookie -> header 自动注入，但只对 strict same-origin 的 mutating 请求生效
- non-browser runtime 不自动处理上下文，仅允许通过同步 `tokenProvider` 提供 token
- `withCredentials` 与 `withXSRF` 解耦，前者只管 credentials，后者只管 XSRF header
- XSRF 逻辑在 fetch transport 最终执行，不扩散到 request 定义层或 interceptor 主逻辑
- 后端仍需逐次验证 token；如果启用 credentialed CORS 或 Fetch Metadata，属于服务端额外防线，不由 core 自动兜底
