# packages/core 类型内联重构设计

## 背景

`packages/core` 中存在大量“为了抽离而抽离”的类型别名和接口。它们只使用一次、没有独立语义、只是给简单类型表达式起了个名字，反而增加了阅读时的跳转成本和认知负担。本设计目标是在不影响类型推理的前提下，把这些类型显式内联到使用处，减少不必要的抽象层。

本次重构接受 breaking change：部分被 `client/public_api.ts` 导出的类型也将被移除，由使用处直接内联替代。

## 核心原则

1. **只内联“为了抽离而抽离”的类型**：使用次数 ≤3、无独立语义、仅是简写或透传的类型。
2. **保留真正的领域抽象和共享工具**：
   - `ExcludeUnion`、`FnReturn` 等共享工具类型保留。
   - `WebSocketState`、`EventSchemas`、`SocketSchemas` 等核心领域类型保留。
   - 复杂的 HTTP 输出推导链虽然要内联中间步骤，但保留最终面向用户的 `RequestSuccessData` / `RequestErrorData`。
3. **显式编写**：用原始类型表达式、元组字面量、对象字面量直接替换别名，不引入新的工具类型。
4. **不影响类型推理**：每波修改后必须跑 `tsc --noEmit` 和 `vitest --typecheck`，确保推导结果不变。

## 五波改动清单

### 第一波：零风险清理

| 类型                       | 文件                          | 操作                                                             |
| -------------------------- | ----------------------------- | ---------------------------------------------------------------- |
| `CommandEntry`             | `client/command.ts`           | 删除（死代码）                                                   |
| `HttpRequestBuildContext`  | `internal/request_builder.ts` | 内联为 `RequestBuilder`                                          |
| `WebSocketQueueConfig`     | `web_socket/queue.ts`         | 内联为 `WebSocketQueueOptions`                                   |
| `WebSocketReconnectConfig` | `web_socket/reconnect.ts`     | 内联为 `WebSocketReconnectOptions`                               |
| `HttpResponseBody`         | `internal/http_response.ts`   | 内联为 `unknown`                                                 |
| `ScalarRequestBuildValue`  | `struct/codec/query.ts`       | 内联为 `boolean \| null \| number \| string`                     |
| `EncodeChild`              | `struct/encode.ts`            | 内联函数签名                                                     |
| `TaggedObject`             | `struct/codec/common.ts`      | 内联为 `{ [key: string]: unknown }` 或 `Record<string, unknown>` |
| `TagObjectOptions`         | `struct/codec/common.ts`      | 内联为 `{ requireTag?: boolean }`                                |

### 第二波：HTTP 局部推导链内联

在 `http/http.ts` 中内联：

| 类型                                                           | 操作                                                                  |
| -------------------------------------------------------------- | --------------------------------------------------------------------- |
| `UseRequestBaseConfig`                                         | 展开到 `UseRequestConfig`                                             |
| `ExpandStatus`                                                 | 展开到 `OutputPairs`                                                  |
| `OutputPairs`                                                  | 展开到 `SuccessSchemaOf` / `ErrorSchemaOf`                            |
| `SuccessSchemaOf`                                              | 展开到 `RequestSuccessData`                                           |
| `ErrorSchemaOf`                                                | 展开到 `RequestErrorData`                                             |
| `RequestDefinitionBase`                                        | 展开到 `RequestDefinitionWithoutBuild` / `RequestDefinitionWithBuild` |
| `RequestDefinitionWithoutBuild` / `RequestDefinitionWithBuild` | 展开到 `RequestDefinition` 联合类型和 `defineRequest` 重载            |
| `IsInputOptional`                                              | 展开到 `RequestCommandBuilder` 条件类型                               |

### 第三波：SSE / WebSocket 配置链内联

| 类型                        | 文件                            | 操作                                                      |
| --------------------------- | ------------------------------- | --------------------------------------------------------- |
| `UseEventStreamConfig`      | `sse/sse.ts`                    | 展开为 `UseEventStreamBaseConfig & UseCancellationConfig` |
| `EventStreamExecuteOptions` | `sse/sse.ts`                    | 展开为完整形式                                            |
| `KnownEventKey`             | `sse/sse.ts`                    | 在映射类型中用 `as K extends 'default' ? never : K` 过滤  |
| `KnownSocketKey`            | `web_socket/web_socket.ts`      | 同上                                                      |
| `RequestInitWithDuplex`     | `http/transport/fetch.ts`       | 内联为 `RequestInit & { duplex?: 'half' }`                |
| `RequestInitWithDuplex`     | `sse/transport/event_stream.ts` | 同上                                                      |

### 第四波：Command 元组链内联

在 `client/command.ts` 中：

| 类型                         | 操作                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `HttpDispatchCommand`        | 内联为 `HttpCommand<AnyStruct \| undefined, RequestOutputShape \| undefined>` |
| `EventStreamDispatchCommand` | 内联为 `EventStreamCommand<AnyStruct \| undefined, EventSchemas>`             |
| `WebSocketDispatchCommand`   | 内联为 `WebSocketCommand<...>`                                                |
| `HttpCommandEntry`           | 内联为元组 `[command: HttpCommand<...>, options?: HttpExecuteOptions]`        |
| `EventStreamCommandEntry`    | 内联为元组                                                                    |
| `WebSocketCommandEntry`      | 内联为元组                                                                    |
| `UnknownCommandEntry`        | 内联为 `[command: Command, options?: unknown]`                                |

### 第五波：public API 配置类型内联

在 `client/config.ts` 中内联，并更新 `client/public_api.ts`：

| 类型                                     | 操作                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------- |
| `ClientHttpOptions` / `ClientHttpConfig` | 内联到 `ClientOptions.http` / `ClientConfig.http`                     |
| `WebSocketBeforeConnect`                 | 内联为 `() => void \| Promise<void>`                                  |
| `WebSocketHeartbeatOptions`              | 内联到 `ClientWebSocketOptions.heartbeat` 和 `withWebSocketHeartbeat` |
| `WebSocketQueueOptions`                  | 内联到 `ClientWebSocketOptions.queue` 和 `withWebSocketQueue`         |
| `WebSocketReconnectOptions`              | 内联到 `ClientWebSocketOptions.reconnect` 和 `withWebSocketReconnect` |
| `SSEInvalidEventReason`                  | 内联为字符串字面量联合                                                |
| `SSEInvalidEventMessage`                 | 内联为对象字面量                                                      |
| `SSEInvalidEventContext`                 | 内联到 `SSEInvalidEventHandler`                                       |
| `SSEInvalidEventHandler`                 | 内联为完整函数类型                                                    |
| `SSEReconnectOptions`                    | 内联到 `ClientSSEOptions.reconnect` 和 `withSSEReconnect`             |
| `SSEQueueOptions`                        | 内联到 `ClientSSEOptions.queue` 和 `withSSEQueue`                     |
| `XSRFTokenProviderContext`               | 内联为 `{ request: HttpRequest }`                                     |
| `XSRFTokenProvider`                      | 内联为完整函数类型                                                    |

## 验证策略

每波修改后必须执行：

1. `pnpm run test:type`（或 `vitest run --typecheck`）—— 确保类型测试通过。
2. `npx tsc --noEmit -p packages/core/tsconfig.json` —— 确保无编译错误。
3. 运行受影响模块的单元测试（如 `vitest run src/client`、`vitest run src/http` 等）。

全部五波完成后，跑全量测试：

```bash
pnpm run test
```

## 风险控制

- **每波独立 commit**：便于单独回滚。
- **优先处理无依赖链的类型**：第一波全部是无依赖的，失败概率最低。
- **保留复杂推导的可读性**：HTTP 推导链内联后，必要时添加行内注释说明推导意图。
- **public API 波次放最后**：因为 breaking change 影响最大，等内部重构稳定后再处理。

## 已验证的高收益候选

以下候选已通过实际类型检查验证为 `safe_to_inline`：

- `CommandEntry`（死代码，可直接删除）
- `HttpRequestBuildContext`（`RequestBuilder` 的等价别名）
- `WebSocketQueueConfig`（`WebSocketQueueOptions` 的等价别名）
- `WebSocketReconnectConfig`（`WebSocketReconnectOptions` 的等价别名）
- `ScalarRequestBuildValue`（简单联合类型，仅使用一次）

## 保留不内联的类型

以下类型虽然定义简单，但属于核心领域抽象或共享工具，不建议内联：

- `ExcludeUnion`：分布式条件类型语义，多个模块共享。
- `FnReturn`：生产代码和大量类型测试共享的函数返回类型提取工具。
- `WebSocketState`：WebSocket 模块核心领域类型，使用广泛。
- `EventSchemas` / `SocketSchemas`：SSE / WebSocket 模块核心泛型约束，使用次数极高。
