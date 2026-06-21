# VitePress 文档站点规划

> 日期：2026-06-16
> 项目：defjs monorepo
> 目标：为 defjs 构建一个覆盖核心概念、框架集成和可观测性的 VitePress 文档站点

---

## 概述

本文档站点面向使用 defjs 的 TypeScript 开发者，目标是帮助他们理解库的设计哲学、快速上手、深入掌握各传输层与框架集成方式，并正确配置 OpenTelemetry 可观测性。站点采用 VitePress 构建，以简洁、代码驱动的方式组织内容，优先展示可运行的示例而非冗长解释。

---

## 页面规划

### 1. 首页 (`index.md`)

- 项目定位与一句话卖点
- 快速安装命令
- 核心特性图标列表（类型安全、多传输、拦截器、流式支持）
- 跳转到"快速开始"的 CTA

### 2. 快速开始 (`getting-started.md`)

- 安装 `@defjs/core`
- CDN 使用方式
- 三步上手：创建 Client → 定义请求 → 执行业务调用
- 完整的端到端代码示例

### 3. 核心概念

#### 3.1 Client (`core/client.md`)

- `createClient` 与配置选项（endpoint、interceptors、fetch 自定义等）
- `Client.execute` 的三种重载签名（HTTP / SSE / WebSocket）
- `isClient` / `getClientConfig` 辅助函数
- 显式客户端设计意图（无全局客户端）

#### 3.2 命令与定义 (`core/commands.md`)

- `defineRequest`：HTTP 请求定义，input/output/build 的关系
- `defineEventStream`：SSE 流定义，events 映射
- `defineWebSocket`：WebSocket 定义，incoming/outgoing 消息模式
- 命令对象结构（kind + definition + input）
- 输入可选性推导（IsInputOptional）

#### 3.3 HTTP 请求 (`core/http.md`)

- 状态码到 struct 的 output 映射
- 成功/错误数据类型推导（RequestSuccessData / RequestErrorData）
- 取消与超时配置（abort / timeout / signal）
- 下载/上传进度监听
- 响应类型（json / text / blob / arraybuffer）

#### 3.4 SSE 流 (`core/sse.md`)

- `defineEventStream` 的事件 struct 定义
- 执行结果：`[error, stream, openInfo]`
- `EventStreamHandle` 与 `stream.closed`
- 无效事件处理：`onInvalidEvent` 观察者行为
- 重连与队列配置

#### 3.5 WebSocket (`core/web-socket.md`)

- `defineWebSocket` 的 incoming / outgoing struct
- `WebSocketSession` API（send / receive / close / state / onStateChange / onRuntimeError）
- 连接生命周期状态机
- 心跳、重连、发送队列配置
- 手动关闭与 abort 行为

#### 3.6 Struct 与类型校验 (`core/struct.md`)

- `struct` facade：object、string、number、array、union、record 等
- `Infer<T>` 类型推导
- `StructError` 与错误映射
- `tag` 系统：HeaderTag、QueryTag、JsonTag、MultipartTag、UriTag、UrlencodedTag
- 字段标签与内省（getStructFields / getFieldTag）
- 零值兜底与 Partial Input 的 Go 风格设计说明

#### 3.7 拦截器 (`core/interceptors.md`)

- 三种拦截器类型：HTTP / SSE / WebSocket
- `createHttpInterceptor` / `createSSEInterceptor` / `createWebSocketInterceptor`
- 洋葱链执行模型
- 常见拦截器示例：认证、日志、重试
- 拦截器解析与过滤机制

#### 3.8 上下文与配置 (`core/context.md`)

- `HttpContext` 的传递方式
- 请求构建器（build handler）与输入解析
- 客户端配置项详解：endpoint、xsrf、withCredentials、queryParamsSerializer
- 各传输层的专属配置（sse.fetch / webSocket.heartbeat 等）

#### 3.9 错误处理 (`core/errors.md`)

- `RequestError` 结构：kind、code、message、data、response
- 错误分类：definition（校验失败）、transport（网络/中断）、http（状态码）
- `ERR_ABORTED` / `ERR_TIMEOUT` 常量
- 错误码分支建议（不再使用字符串比较）

### 4. 框架集成

#### 4.1 Angular (`packages/angular.md`)

- `provideClient` 与 `withEndpoint` / `withInterceptors`
- `injectClient` 在组件/服务中的使用
- Angular DI 与工厂拦截器
- 版本兼容性矩阵

#### 4.2 Vue (`packages/vue.md`)

- `provideClient` 作为 Vue Plugin
- `injectClient` 在组合式 API 中的使用
- 与 Angular 包 API 的对称性

### 5. OpenTelemetry 服务端集成 (`packages/opentelemetry-server.md`)

- 包定位：服务端出站追踪，不初始化 SDK
- `withOpenTelemetryServer` 配置
- tracer / meter / propagator 选项
- HTTP 语义约定与指标（http.client.request.duration）
- SSE 连接级追踪与自定义指标（defjs.client.sse.\*）
- WebSocket 连接级追踪与自定义指标（defjs.client.websocket.\*）
- WebSocket query 传播的安全风险与关闭方式
- 迁移指南：旧 API 到新配置的映射表

### 6. 示例 (`examples.md`)

- REST CRUD 完整示例（定义 + 执行 + 错误处理）
- SSE 实时通知示例
- WebSocket 聊天室示例
- 拦截器组合示例（认证 + 日志）
- Angular / Vue 最小集成示例

### 7. 迁移指南 (`migration.md`)

- 0.3 → 0.4 破坏性变更清单
- 全局客户端移除后的替代方案
- 错误子模块合并
- API 重命名对照表（withSseOptions → withSSEOptions 等）
- Endpoint 定义 stricter 规则说明

### 8. 关于 / 参考 (`about.md`)

- 设计参考与灵感来源（Angular HttpClient、Axios、Zod、tRPC 等）
- 许可证
- 贡献指引链接

---

## 站点结构（VitePress sidebar 映射）

```
docs/
  .vitepress/
    config.ts
  index.md              # 首页
  getting-started.md    # 快速开始
  core/
    client.md
    commands.md
    http.md
    sse.md
    web-socket.md
    struct.md
    interceptors.md
    context.md
    errors.md
  packages/
    angular.md
    vue.md
    opentelemetry-server.md
  examples.md
  migration.md
  about.md
```

---

## 备注

- 所有代码示例需使用 TypeScript，并保留完整的类型推断展示
- 错误处理示例优先展示 `error.code` 分支而非旧字符串比较
- SSE/WebSocket 示例需包含 `stream.closed` / `session.closed` 的清理逻辑
- 拦截器示例需展示三种 kind 的区别，避免读者混淆
- OpenTelemetry 章节需强调"不初始化 SDK"的前提，避免误导
