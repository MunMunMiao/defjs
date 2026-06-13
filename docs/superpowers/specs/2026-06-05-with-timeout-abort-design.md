# with 配置中 timeout 与 abort 互斥设计

## 背景

当前 `@defjs/core` 的 HTTP、SSE、WebSocket 二段 `with(...)` 配置都同时暴露 `timeout?: number` 与 `abort?: AbortSignal`。

现有运行时会把内部 ref controller、外部 `abort`、`timeout` 转换出的 signal 一起交给 `mergeAbortSignals(...)` 合并。这个语义允许两种用户取消入口同时存在，并由最先触发的 signal 决定结果是 `ABORTED` 还是 `TIMEOUT`。用户确认要采用方案 A：把 public `with` 配置里的 `timeout` 与 `abort` 定义为互斥，并在类型层和运行时同时区分。

这是 breaking change。需要同步更新类型、运行时、测试和 `packages/core/design.md`。

## 目标

1. HTTP、SSE、WebSocket 的 public `with(...)` 配置中，`timeout` 与 `abort` 在 TypeScript 层互斥。
2. JavaScript、`as any`、动态对象等绕过类型的调用，在运行时也稳定失败。
3. 冲突时不进入 transport、interceptor、SSE retry、WebSocket reconnect。
4. 保留内部 signal 合并能力，让 ref 自身的 `cancel()` / `close()` controller 仍可与单个用户取消入口合并。
5. 文档明确说明迁移路径：需要组合多个取消来源时，用户自行构造组合后的 `AbortSignal` 并只传入 `abort`。
6. `fetch` 只能通过 `Client` / `ClientSseOptions` 配置；需要动态切换 fetch 或其它 client 级能力时，通过 `with({ client })` 切换 client，不在 SSE 的 request-level `with(...)` 中配置 `fetch`。

## 非目标

1. 不把 `abort` 扩展成 boolean、`AbortController` 或回调。它仍只表示外部 `AbortSignal`。
2. 不在本轮把 public `abort` 重命名为 `signal`。
3. 不引入完整 cancellation descriptor 重构。
4. 不删除或削弱 `mergeAbortSignals(...)`。
5. 不新增 warning 模式或静默优先级规则。
6. 不允许在 client 以外的位置配置 `fetch`；这属于 client 级 transport 能力，不属于单次 request/stream 的 `with` 配置。

## 现有证据

- HTTP `UseRequestConfig` 当前包含 `abort?: AbortSignal` 与 `timeout?: number`：`packages/core/src/http/http.ts:18-24`。
- SSE `UseEventStreamConfig` 当前包含 `abort?: AbortSignal`、`timeout?: number`，并额外暴露 request-level `fetch?: typeof fetch`：`packages/core/src/sse/sse.ts:17-23`。本设计将同时收敛这个 `fetch` 边界：`fetch` 应只存在于 client 配置。
- WebSocket `UseWebSocketConfig` 当前包含 `abort?: AbortSignal` 与 `timeout?: number`：`packages/core/src/web_socket/web_socket.ts:118-127`。
- HTTP 在构造 request 时合并二者：`packages/core/src/http/http.ts:196-210`。
- SSE 在构造 request 时合并二者：`packages/core/src/sse/sse.ts:198-205`。
- WebSocket 在启动前合并二者：`packages/core/src/web_socket/web_socket.ts:318`。
- `mergeAbortSignals(...)` 会把 positive `timeout` 转换为 `AbortSignal.timeout(timeout)` 并用 `AbortSignal.any(...)` 合并：`packages/core/src/internal/abort.ts:1-22`。
- fetch transport 使用最终 `request.abort` 作为 `RequestInit.signal`，并根据 signal reason 区分 `ABORTED` / `TIMEOUT`：`packages/core/src/http/transport/fetch.ts:82-99`、`packages/core/src/http/transport/fetch.ts:127-142`。
- 文档当前在 HTTP、SSE、WebSocket 示例中展示了同时传 `timeout` 与 `abort`，需要改成二选一。

## 设计方案

### 共享取消配置类型

新增一个共享 public 类型，用显式 union + `never` 表达互斥：

```ts
export type UseCancellationConfig =
  | {
      abort?: AbortSignal
      timeout?: never
    }
  | {
      abort?: never
      timeout?: number
    }
```

三类 public `with` 配置都改为 base config 与取消配置的交叉类型：

```ts
interface UseRequestBaseConfig {
  client?: Client
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}

export type UseRequestConfig = UseRequestBaseConfig & UseCancellationConfig
```

```ts
interface UseEventStreamBaseConfig {
  client?: Client
  context?: HttpContext
}

export type UseEventStreamConfig = UseEventStreamBaseConfig & UseCancellationConfig
```

```ts
interface UseWebSocketBaseConfig<TIncoming = unknown, TOutgoing = unknown> {
  beforeConnect?: WebSocketBeforeConnect
  client?: Client
  heartbeat?: WebSocketHeartbeatConfig<TIncoming, TOutgoing>
  protocols?: readonly string[]
  queue?: WebSocketQueueConfig
  reconnect?: WebSocketReconnectConfig
}

export type UseWebSocketConfig<TIncoming = unknown, TOutgoing = unknown> = UseWebSocketBaseConfig<TIncoming, TOutgoing> &
  UseCancellationConfig
```

该设计避免通用 `XOR<T, U>`，让错误和 d.ts 更直接。

同时从 `UseEventStreamConfig` 移除 request-level `fetch`。`fetch` 保留在 `ClientSseOptions` / `ClientConfig.sse` 中；如果调用方需要在不同 fetch 实现之间动态切换，应创建或 clone 对应 client，然后通过 `with({ client })` 切换。

### 运行时冲突检测

互斥按字段级判断：

```ts
config.abort !== undefined && config.timeout !== undefined
```

冲突时返回现有 tuple 风格的配置错误，不在 `.with(...)` 同步 throw：

```ts
createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('with.abort and with.timeout cannot be used together'))
```

HTTP 与 SSE 使用 definition error。WebSocket 也应使用同一错误语义；如果现有执行函数分支使用 `createTransportError` 或其他 helper，应增加局部处理，保证冲突属于配置错误而不是网络错误。

校验位置必须早于：

1. `config.abort?.aborted` fast path；
2. `parseEndpointInput(...)`；
3. `resolveClientConfig(...)`；
4. interceptor / transport；
5. SSE retry loop；
6. WebSocket reconnect loop。

因此同传 `abort` 与 `timeout` 时，即使 `abort` 已经 aborted，或 `timeout` 很短，也稳定返回配置冲突。

### 保留内部 signal 合并

互斥只限制 public `with` 里的两个用户入口，不限制内部合并。实现后仍需要调用：

```ts
mergeAbortSignals(controller.signal, [config.abort], config.timeout)
```

原因：ref 自身的 `cancel()` / `close()` controller 仍必须与单个用户取消入口合并。

### 允许组合 signal 作为迁移路径

如果用户需要“外部 signal + timeout”，迁移为：

```ts
const signal = AbortSignal.any([externalSignal, AbortSignal.timeout(10_000)])

request.with({ abort: signal })
```

`abort: AbortSignal.timeout(ms)` 也应继续允许。它可能仍按现有 transport reason 归一化成 `TIMEOUT`。

## 实施边界

### 类型改动

1. 引入共享 `UseCancellationConfig`。
2. HTTP、SSE、WebSocket 的 `Use*Config` 从 `interface` 改为 `type`。
3. 保持 WebSocket heartbeat 泛型只服务于 heartbeat，不让 cancellation union 影响 `message` / `isAck` 推断。
4. 从 `UseEventStreamConfig` 移除 `fetch?: typeof fetch`；SSE fetch 只从 `clientConfig.sse.fetch` 读取。

### 运行时改动

1. 增加小 helper，例如 `hasAbortTimeoutConflict(config)` 和/或 `createAbortTimeoutConflictError()`。
2. HTTP 执行入口最早检查冲突并返回 definition error。
3. SSE 执行入口最早检查冲突并返回 definition error。
4. WebSocket 执行入口最早检查冲突并返回同类配置错误。
5. SSE handler 不再读取 request-level `config.fetch`，只使用 `clientConfig.sse.fetch`。
6. 不改 fetch transport 的 `ABORTED` / `TIMEOUT` 映射。
7. 不改 `mergeAbortSignals(...)` 的合并实现。

### 文档改动

更新 `packages/core/design.md`：

1. HTTP 示例不要同时展示 `timeout` 与 `abort`。
2. SSE 示例不要同时展示 `timeout` 与 `abort`。
3. WebSocket 示例不要同时展示 `timeout` 与 `abort`。
4. 三处配置清单补充说明：`timeout` 与 `abort` 互斥。
5. 增加迁移说明：组合取消来源时自行构造组合后的 `AbortSignal` 并只传 `abort`。
6. SSE 配置清单移除 request-level `fetch`，并说明 fetch 属于 client 级配置；动态切换 fetch 应通过 `with({ client })`。

## 测试计划

### 类型测试

新增或更新 type tests，覆盖 HTTP、SSE、WebSocket：

```ts
ref.with({ timeout: 100 })
ref.with({ abort: new AbortController().signal })
ref.with({ abort: AbortSignal.timeout(100) })

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
ref.with({ abort: new AbortController().signal, timeout: 100 })
```

额外覆盖：

1. `abort: true`、`abort: new AbortController()`、`abort: () => {}` 应 `@ts-expect-error`。
2. `satisfies UseRequestConfig` / `satisfies UseEventStreamConfig` / `satisfies UseWebSocketConfig<...>` 的合法单字段配置应通过。
3. `UseEventStreamConfig` 不再接受 `fetch`，`stream.with({ fetch })` 应 `@ts-expect-error`；动态 fetch 切换应通过 `stream.with({ client })`。
4. WebSocket heartbeat 的 `message` / `isAck` 泛型推断不能退化。
5. 显式 `timeout: undefined` 的边界行为应由测试固定；若 TypeScript 在当前 tsconfig 下允许，应在运行时按字段级冲突处理显式非 `undefined` 的情况。

### 运行时测试

HTTP、SSE、WebSocket 分别覆盖：

1. 同传 `abort + timeout` 返回配置错误。
2. 冲突优先于已 aborted signal。
3. 冲突优先于极短 timeout。
4. 冲突时不进入 transport / interceptor / retry / reconnect。
5. 单独 `abort: AbortSignal.timeout(ms)` 仍保留现有 `TIMEOUT` 归一化行为。
6. SSE 动态 fetch 切换通过 `with({ client })` 生效；request-level `fetch` 不再参与执行路径。

### 推荐验证命令

- `bun x vitest run --typecheck --config packages/core/vitest.config.typecheck.ts`
- 针对 Node runtime 的相关 spec：`npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/http packages/core/src/sse packages/core/src/web_socket`
- 如改动浏览器 timeout 行为，再运行对应 browser config。

## 风险与取舍

1. 这是 breaking change。文档中旧示例和旧用户代码会失败。
2. `Use*Config` 从 interface 改 type 后，外部 declaration merging 或 `interface extends UseRequestConfig` 会受影响。
3. 互斥 union 对宽对象类型和条件 spread 更严格。动态组合配置可能需要用户收窄后再传入。
4. 只禁止字段同传，不禁止 `abort` 信号内部包含 timeout source，这是有意设计。
5. `timeout` 数值边界不是本轮核心，但建议后续单独定义 `timeout <= 0`、负数、`NaN` 的配置语义。
6. 移除 request-level `fetch` 同样是 API 收敛，会让旧的 `stream.with({ fetch })` 调用失效；迁移方式是将 fetch 放入 client 的 `sse` 配置，并通过 `with({ client })` 动态切换。

## 用户确认结果

用户已确认采用方案 A：共享互斥 cancellation 类型，覆盖 HTTP/SSE/WebSocket，并在运行时早失败。

用户补充确认：`fetch` 不应在 client 以外的位置配置；需要动态切换 client 级能力时，使用已经支持的 `with({ client })`。因此本规格同步要求移除 SSE request-level `fetch`。
