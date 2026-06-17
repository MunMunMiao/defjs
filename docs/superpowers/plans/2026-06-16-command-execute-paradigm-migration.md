# Command / `client.execute()` 范式迁移实施计划

> **For agentic workers:** Execute task-by-task with checkboxes. Use subagents or execution skills only when they materially reduce risk for the current context; every commit point must satisfy the verification gates below.

**Goal:** 将 `@defjs/core` 从「lazy PromiseLike ref + 内部状态机」迁移到「Command 只读描述对象 + `client.execute(command)` 解释器」范式，同时删除不再需要的全局 client、`provideGlobalClient`、`cloneClient`。

**Architecture:**

- `defineRequest` / `defineEventStream` / `defineWebSocket` 返回 **Command Builder**，调用后得到只读 `Command` 描述对象。
- `Command` 不再是 `PromiseLike`，不暴露状态机、`cancel()`、`close()`、`onStateChange()`、`onRuntimeError()` 或 `.with()`；per-call 配置通过 builder 第二参数和 `client.execute(command, options)` 传入。
- `createClient()` 返回的 `Client` 新增 `execute(command)` 方法，按 `command.kind` 分发到三个传输层执行器。
- 移除 `HttpRequestRef` / `EventStreamRef` / `WebSocketRef` 及其状态机；保留 `HttpAwaitResult` / `StreamAwaitResult` / `SocketAwaitResult` 元组形状。
- 新增顶层 `execute(command, { client })` 作为 `client.execute(command)` 的薄封装，**必须**显式传入 client，不再依赖全局 client。
- 删除 `setGlobalClient` / `getGlobalClient` / `resetGlobalClient` / `resolveClientConfig` / `cloneClient`；删除 Angular / Vue 的 `provideGlobalClient`。

**Tech Stack:** TypeScript, Vitest, pnpm workspace, tsdown

---

## 执行门禁

- 每个 commit 前必须保持当前包可编译：至少运行对应包的 `pnpm typecheck`；禁止提交“预期编译错误”的中间态。
- `*.type.test.ts` 不由 Vitest 收集，类型测试验证统一使用 `pnpm typecheck`；需要运行时断言的测试必须放入 `*.spec.ts` 并用 `pnpm test` 验证。
- 新增测试不得依赖外网失败路径；HTTP 执行测试使用 `withHTTPHandle`、本地 test handler 或 mock fetch。
- 删除 `global.ts`、`resolve.spec.ts` 或 public exports 前，必须先完成所有源码与测试调用点迁移，并确认：

```bash
rg "setGlobalClient|resetGlobalClient|getGlobalClient|resolveClientConfig|provideGlobalClient|\.with\(\{ client" packages
```

Expected: `packages/**/src`、`packages/**/test` 和 `packages/opentelemetry-server/e2e.spec.ts` 无旧 API 命中。

- 本迁移是 public API breaking change。最终文档任务必须新增 `.changeset/*.md`，覆盖 `@defjs/core`、`@defjs/angular`、`@defjs/vue` 的迁移说明；不要添加不存在的根 `CHANGELOG.md`。

## 旧 Ref 能力迁移表

| 旧能力                                                          | 新写法                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `await useGetUser(input)`                                       | `await client.execute(useGetUser(input))`                                                                |
| `await useGetUser(input).with({ client })`                      | `await client.execute(useGetUser(input))`                                                                |
| `ref.cancel(reason)`                                            | 执行前创建 `AbortController`，调用 `client.execute(command, { signal })` 后用 `controller.abort(reason)` |
| SSE/WebSocket 连接完成前 `ref.close()`                          | 使用 `AbortController` 中止 pending `client.execute(...)`                                                |
| SSE 连接完成后 `ref.close(reason)`                              | 使用返回的 `stream.close(reason)`                                                                        |
| WebSocket 连接完成后 `ref.close(code, reason)`                  | 使用返回的 `socket.close(code, reason)`                                                                  |
| `ref.status` / `ref.error`                                      | 不再提供启动前 Ref 状态；通过返回元组、handle/session 状态和 runtime error 监听表达结果                  |
| WebSocket 启动前 `ref.onStateChange()` / `ref.onRuntimeError()` | 不再支持启动前监听；连接成功后使用返回的 session 监听                                                    |

## 文件结构映射

| 文件                                                                                | 职责                                                                                                                                  |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/core/src/client/command.ts`                                               | 新增：`BaseCommand`；Task 5 在三个传输 Command 类型存在后收窄 `Command` 联合类型                                                      |
| `packages/core/src/client/resolve.ts`                                               | 修改：`Client` 接口增加 `execute()` 重载                                                                                              |
| `packages/core/src/client/client.ts`                                                | 修改：`createClient` 返回完整 Client；新增顶层 `execute()`；删除 `cloneClient`；保留 `resolveClientConfig` 直到所有旧调用点迁移完成   |
| `packages/core/src/client/client.spec.ts`                                           | 删除 `cloneClient` 与 global client 相关测试                                                                                          |
| `packages/core/src/client/client.type.test.ts`                                      | 删除 `cloneClient` 类型测试                                                                                                           |
| `packages/core/src/client/execute.spec.ts`                                          | 新增：Client.execute 与顶层 execute 测试                                                                                              |
| `packages/core/src/client/global.ts`                                                | 删除（旧 API 调用点清零后）                                                                                                           |
| `packages/core/src/client/resolve.spec.ts`                                          | 删除（旧 API 调用点清零后）                                                                                                           |
| `packages/core/src/client/public_api.ts`                                            | 修改：移除 `cloneClient` / global client 导出                                                                                         |
| `packages/core/src/http/http.ts`                                                    | 修改：定义 `HttpCommand` / `RequestCommandBuilder`；改写 `defineRequest`；`executeHttpEndpoint` → `executeHttpCommand`；移除 Ref      |
| `packages/core/src/http/public_api.ts`                                              | 修改：导出 Command 类型，移除 Ref                                                                                                     |
| `packages/core/src/sse/sse.ts`                                                      | 修改：定义 `EventStreamCommand` / builder；改写 `defineEventStream`；`executeEventStreamEndpoint` → `runEventStreamCommand`；移除 Ref |
| `packages/core/src/sse/public_api.ts`                                               | 修改：导出 Command 类型，移除 Ref                                                                                                     |
| `packages/core/src/web_socket/web_socket.ts`                                        | 修改：定义 `WebSocketCommand` / builder；改写 `defineWebSocket`；`executeWebSocketEndpoint` → `runWebSocketCommand`；移除 Ref         |
| `packages/core/src/web_socket/public_api.ts`                                        | 修改：导出 Command 类型，移除 Ref                                                                                                     |
| `packages/core/src/public_api.ts`                                                   | 修改：导出 `Command` / `execute`                                                                                                      |
| `packages/angular/src/core.ts`                                                      | 移除 `provideGlobalClient`                                                                                                            |
| `packages/angular/src/public_api.ts`                                                | 移除 `provideGlobalClient` 导出                                                                                                       |
| `packages/vue/src/core.ts`                                                          | 移除 `provideGlobalClient`                                                                                                            |
| `packages/vue/src/public_api.ts`                                                    | 移除 `provideGlobalClient` 导出                                                                                                       |
| `packages/vue/src/core.browser.spec.ts`                                             | 改调用方式，移除 provideGlobalClient 测试                                                                                             |
| `packages/vue/test/core.spec.ts`                                                    | 改调用方式，移除 provideGlobalClient 测试                                                                                             |
| `packages/opentelemetry-server/e2e.spec.ts`                                         | 改调用方式，移除 `setGlobalClient`                                                                                                    |
| `packages/core/README.md` / `packages/angular/README.md` / `packages/vue/README.md` | 删除全局 client / cloneClient / provideGlobalClient 文档                                                                              |
| `packages/opentelemetry-server/src/option.ts`                                       | 不变                                                                                                                                  |

---

### Task 1: 创建 `BaseCommand` / `Command` 并更新 `Client` 接口

**Files:**

- Create: `packages/core/src/client/command.ts`
- Modify: `packages/core/src/client/resolve.ts`
- Modify: `packages/core/src/client/client.ts`
- Test: `packages/core/src/client/execute.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/src/client/execute.spec.ts
import { describe, expect, test } from 'vitest'
import { createClient } from './client'
import { withEndpoint } from './option'

describe('Client.execute', () => {
  test('client should have execute method', () => {
    const client = createClient(withEndpoint('https://example.com'))
    expect(typeof client.execute).toBe('function')
  })
})
```

Run: `cd packages/core && pnpm test src/client/execute.spec.ts`  
Expected: FAIL — `client.execute` 不存在。

- [ ] **Step 2: 新增可编译的 `BaseCommand` / 临时 `Command` 类型**

```ts
// packages/core/src/client/command.ts
export interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

export type Command = BaseCommand<string>
```

> Task 1 不引用尚未创建的 `HttpCommand` / `EventStreamCommand` / `WebSocketCommand`，避免提交不可编译状态。Task 5 会在三个传输 Command 类型都存在后收窄 `Command` 联合类型并增加 overload。

- [ ] **Step 3: 修改 `Client` 接口为最小可编译形状**

```ts
// packages/core/src/client/resolve.ts
import type { Command } from './command'
import type { ClientConfig } from './config'

export interface Client {
  readonly [CLIENT]: ClientConfig

  execute(command: Command, options?: { signal?: AbortSignal }): Promise<unknown>
}
```

- [ ] **Step 4: 让 `createClient()` 返回带 `execute()` 的 Client**

保留当前 `createClient` 内的默认 `ClientConfig` 构造逻辑，只抽出返回对象：

```ts
// packages/core/src/client/client.ts
import type { Command } from './command'

function createClientFromConfig(config: ClientConfig): Client {
  return {
    [CLIENT]: config,
    execute(command: Command): Promise<unknown> {
      return Promise.reject(new Error(`Unsupported command kind: ${command.kind}`))
    },
  }
}

export function createClient(...options: ClientOption[]): Client {
  const conf: ClientConfig = {
    endpoint: '',
    http: { ...DEFAULT_HTTP_OPTIONS },
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {
      WebSocket: globalThis.WebSocket,
      beforeConnect: undefined,
      heartbeat: undefined,
      protocols: undefined,
      queue: undefined,
      reconnect: undefined,
    },
    xsrf: undefined,
  }

  for (const option of options) {
    option(conf)
  }

  return createClientFromConfig(conf)
}
```

Run: `cd packages/core && pnpm test src/client/execute.spec.ts && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/client/command.ts packages/core/src/client/resolve.ts packages/core/src/client/client.ts packages/core/src/client/execute.spec.ts
git commit -m "feat(core): add command base and client execute shell"
```

---

### Task 2: HTTP `HttpCommand` / `RequestCommandBuilder` 与 `executeHttpCommand`

**Files:**

- Modify: `packages/core/src/http/http.ts`
- Modify: `packages/core/src/http/public_api.ts`
- Test: `packages/core/src/http/http.type.test.ts`
- Test: `packages/core/src/client/execute.spec.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/src/http/http.type.test.ts
import { expectTypeOf } from 'vitest'
import { defineRequest } from './http'
import { number, object, string } from '../struct'

const useGetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({ id: number() }),
  output: { 200: object({ name: string() }) },
})

const command = useGetUser({ id: 1 })
expectTypeOf(command.kind).toEqualTypeOf<'http'>()
expectTypeOf(command.input).toEqualTypeOf<{ id: number }>()
```

```ts
// packages/core/src/client/execute.spec.ts
import { describe, expect, test, vi } from 'vitest'
import { createClient } from './client'
import { withEndpoint, withHTTPHandle } from './option'
import { defineRequest } from '../http/http'
import { number, object, string } from '../struct'

describe('Client.execute HTTP command', () => {
  test('executes an HTTP command with configured transport', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ name: 'Ada' }), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    )
    const client = createClient(withEndpoint('https://api.example.com'), withHTTPHandle(fetchMock))
    const useGetUser = defineRequest({
      method: 'GET',
      path: '/users/:id',
      input: object({ id: number() }),
      output: { 200: object({ name: string() }) },
    })

    const [err, data] = await client.execute(useGetUser({ id: 1 }))

    expect(err).toBeNull()
    expect(data).toEqual({ name: 'Ada' })
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
```

Run: `cd packages/core && pnpm test src/client/execute.spec.ts && pnpm typecheck`  
Expected: FAIL — `HttpCommand` / builder 不存在。

- [ ] **Step 2: 在 `http.ts` 中定义 `HttpCommand` / `RequestCommandBuilder`，移除 `client` 配置**

```ts
// packages/core/src/http/http.ts
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'

export interface HttpCommand<
  TInput extends AnyStruct | undefined,
  TOutput extends RequestOutputShape | undefined,
> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
  readonly config?: UseRequestConfig
}

export type RequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>, config?: UseRequestConfig) => HttpCommand<TInput, TOutput>
    : (input: EndpointInput<TInput>, config?: UseRequestConfig) => HttpCommand<TInput, TOutput>
```

同时从 `UseRequestBaseConfig` 中移除 `client?: Client`：

```ts
interface UseRequestBaseConfig {
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}
```

- [ ] **Step 3: 改写 `defineRequest`**

```ts
export function defineRequest<TInput extends AnyStruct, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithBuild<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinitionWithoutBuild<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput>
export function defineRequest<TInput extends AnyStruct | undefined = undefined, TOutput extends RequestOutputShape | undefined = undefined>(
  definition: RequestDefinition<TInput, TOutput>,
): RequestCommandBuilder<TInput, TOutput> {
  function create(input?: EndpointInput<TInput>, config?: UseRequestConfig): HttpCommand<TInput, TOutput> {
    return {
      kind: 'http',
      definition,
      input,
      config,
    } as HttpCommand<TInput, TOutput>
  }

  return ((input?: EndpointInput<TInput>, config?: UseRequestConfig) => create(input, config)) as RequestCommandBuilder<TInput, TOutput>
}
```

- [ ] **Step 4: 将 `executeHttpEndpoint` 改为 `executeHttpCommand`**

删除 `createHttpRequestRef`、`HttpRequestRef`、`UseRequestEndpointFn`、`HttpRefState`。将原 `executeHttpEndpoint` 重命名为 `executeHttpCommand`，签名改为：

```ts
export async function executeHttpCommand<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  clientConfig: ClientConfig,
  command: HttpCommand<TInput, TOutput>,
  options?: { signal?: AbortSignal },
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>> {
  const { definition, input, config = {} } = command
  const controller = new AbortController()

  const fail = (
    error: RequestError<RequestErrorData<TOutput>>,
    response?: SettledResponse<unknown>,
  ): HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>> => {
    return [error, undefined, response]
  }

  if (hasAbortTimeoutConflict(config)) {
    return fail(createAbortTimeoutConflictError() as RequestError<RequestErrorData<TOutput>>)
  }

  const requestAbort = config.abort
  if (requestAbort?.aborted) {
    return fail(createTransportError(requestAbort.reason ?? ERR_ABORTED) as RequestError<RequestErrorData<TOutput>>)
  }

  let parsedInput: ParsedInput<TInput>
  try {
    parsedInput = (await parseEndpointInput(definition.input, input)) as ParsedInput<TInput>
  } catch (error) {
    return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error) as RequestError<RequestErrorData<TOutput>>)
  }

  const responseType = resolveDefaultResponseType(definition.output, definition.responseType)
  let request
  try {
    request = createHttpRequest(definition.method, definition.path, parsedInput, definition.build, {
      abort: mergeAbortSignals(controller.signal, [config.abort, options?.signal], config.timeout),
      baseEndpoint: clientConfig.endpoint,
      context: config.context,
      downloadProgress: config.onDownloadProgress,
      input: definition.input,
      queryParamsSerializer: clientConfig.queryParamsSerializer,
      responseType,
      timeout: config.timeout,
      uploadProgress: config.onUploadProgress,
      withCredentials: clientConfig.withCredentials,
      xsrf: clientConfig.xsrf,
    })
  } catch (error) {
    return fail(createDefinitionError('REQUEST_VALIDATION_FAILED', error) as RequestError<RequestErrorData<TOutput>>)
  }

  let response: HttpResponse<unknown>
  try {
    const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
    const chain = makeInterceptorChain(httpInterceptors)
    response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
  } catch (error) {
    return fail(createTransportError(error) as RequestError<RequestErrorData<TOutput>>)
  }

  const settledResponse = toSettledResponse(response)

  if (response.status === 0) {
    return fail(createTransportError(response.error) as RequestError<RequestErrorData<TOutput>>, settledResponse)
  }

  if (!definition.output) {
    const ignoredResponse = { ...settledResponse, body: null } as SettledResponse<undefined>
    if (ignoredResponse.ok) {
      return [null, undefined as RequestSuccessData<TOutput>, ignoredResponse]
    }
    const errorMessage = getHttpErrorMessage(response)
    return fail(
      createHttpStatusError(response.status, errorMessage, ignoredResponse) as RequestError<RequestErrorData<TOutput>>,
      ignoredResponse,
    )
  }

  const schema = resolveOutputSchema(definition.output, response.status)
  if (!schema) {
    return fail(
      createDefinitionError('UNDECLARED_STATUS', new Error(`Undeclared status: ${response.status}`), settledResponse) as RequestError<
        RequestErrorData<TOutput>
      >,
      settledResponse,
    )
  }

  let parsedBody: unknown
  try {
    parsedBody = parseStructResponse(schema, response.body, responseType)
  } catch (error) {
    return fail(
      createDefinitionError('RESPONSE_VALIDATION_FAILED', error, settledResponse) as RequestError<RequestErrorData<TOutput>>,
      settledResponse,
    )
  }

  if (settledResponse.ok) {
    const successResponse = { ...settledResponse, body: parsedBody as RequestSuccessData<TOutput> }
    return [null, parsedBody as RequestSuccessData<TOutput>, successResponse]
  }

  const errorMessage = getHttpErrorMessage(response)
  return fail(
    createHttpStatusError(response.status, errorMessage, settledResponse, parsedBody as RequestErrorData<TOutput>) as RequestError<
      RequestErrorData<TOutput>
    >,
    settledResponse,
  )
}
```

> 函数体其余辅助函数（`resolveOutputSchema`、`parseStructResponse`、`getHttpErrorMessage`）保持原样。

- [ ] **Step 5: 更新 `http/public_api.ts` 并运行测试**

```ts
// packages/core/src/http/public_api.ts
export type { HttpProgressEvent, HttpProgressFn, HttpRequest, HttpResponseType } from '../internal/http_request'
export * from './http'
export type { RequestOutputShape, ResponseGroupItem } from './request'
export { fetchHandler } from './transport/fetch'
```

Run: `cd packages/core && pnpm test src/client/execute.spec.ts && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/http/ packages/core/src/client/execute.spec.ts
git commit -m "feat(core): HttpCommand, RequestCommandBuilder and executeHttpCommand"
```

---

### Task 3: SSE `EventStreamCommand` / builder 与 `executeEventStreamCommand`

**Files:**

- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/sse/public_api.ts`
- Test: `packages/core/src/sse/sse.type.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/src/sse/sse.type.test.ts
import { expectTypeOf } from 'vitest'
import { defineEventStream } from './sse'
import { object, string } from '../struct'

const useEvents = defineEventStream({
  path: '/events',
  events: { message: object({ text: string() }) },
})

const command = useEvents()
expectTypeOf(command.kind).toEqualTypeOf<'event-stream'>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
```

Run: `cd packages/core && pnpm typecheck`  
Expected: FAIL。

- [ ] **Step 2: 在 `sse.ts` 中定义 `EventStreamCommand` / `EventStreamCommandBuilder`，移除 `client` 配置**

```ts
// packages/core/src/sse/sse.ts
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'

export interface EventStreamCommand<
  TInput extends AnyStruct | undefined,
  TEvents extends EventSchemas,
> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
  readonly config?: UseEventStreamConfig
}

export type EventStreamCommandBuilder<TInput extends AnyStruct | undefined, TEvents extends EventSchemas> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>, config?: UseEventStreamConfig) => EventStreamCommand<TInput, TEvents>
    : (input: EndpointInput<TInput>, config?: UseEventStreamConfig) => EventStreamCommand<TInput, TEvents>
```

从 `UseEventStreamBaseConfig` 中移除 `client?: Client`。

- [ ] **Step 3: 改写 `defineEventStream`**

```ts
export function defineEventStream<TInput extends AnyStruct, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinitionWithBuild<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinitionWithoutBuild<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents>
export function defineEventStream<TInput extends AnyStruct | undefined = undefined, TEvents extends EventSchemas = EventSchemas>(
  definition: EventStreamDefinition<TInput, TEvents>,
): EventStreamCommandBuilder<TInput, TEvents> {
  const endpoint: EventStreamEndpoint<TInput, TEvents> = {
    ...definition,
    kind: 'event-stream' as const,
    method: definition.method ?? 'GET',
  }

  function create(input?: EndpointInput<TInput>, config?: UseEventStreamConfig): EventStreamCommand<TInput, TEvents> {
    return {
      kind: 'event-stream',
      endpoint,
      input,
      config,
    } as EventStreamCommand<TInput, TEvents>
  }

  return ((input?: EndpointInput<TInput>, config?: UseEventStreamConfig) => create(input, config)) as EventStreamCommandBuilder<
    TInput,
    TEvents
  >
}
```

- [ ] **Step 4: 将 `executeEventStreamEndpoint` 改为 `runEventStreamCommand` + 导出 `executeEventStreamCommand`**

删除 `createEventStreamRef`、`EventStreamRef`、`UseEventStreamEndpointFn`、`StreamRefState` 的 public 类型（`StreamRefState` 仍作为内部状态对象保留）。

新增导出包装函数：

```ts
export async function executeEventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  clientConfig: ClientConfig,
  command: EventStreamCommand<TInput, TEvents>,
  options?: { signal?: AbortSignal },
): Promise<StreamAwaitResult<EventStreamData<TEvents>>> {
  const { endpoint, input, config = {} } = command
  const controller = new AbortController()
  const state: StreamRefState<EventStreamData<TEvents>> = { status: 'idle' }
  return runEventStreamCommand(clientConfig, endpoint, input, config, controller, state, options)
}
```

将原 `executeEventStreamEndpoint` 重命名为 `runEventStreamCommand`，签名改为：

```ts
async function runEventStreamCommand<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  clientConfig: ClientConfig,
  endpoint: EventStreamEndpoint<TInput, TEvents>,
  input: EndpointInput<TInput> | undefined,
  config: UseEventStreamConfig,
  controller: AbortController,
  state: StreamRefState<EventStreamData<TEvents>>,
  options?: { signal?: AbortSignal },
): Promise<StreamAwaitResult<EventStreamData<TEvents>>>
```

函数体做三处替换：

1. 删除 `clientConfig = resolveClientConfig(config.client)` 块，直接使用参数 `clientConfig`。
2. `createEventStreamRequest(...)` 调用增加 `timeout: config.timeout`。
3. `mergeAbortSignals(controller.signal, [config.abort], config.timeout)` 改为 `mergeAbortSignals(controller.signal, [config.abort, options?.signal], config.timeout)`。

其余逻辑（`transformStreamMessage`、`notifyInvalidEvent` 等）保持不变。

- [ ] **Step 5: 更新 `sse/public_api.ts` 并运行测试**

```ts
// packages/core/src/sse/public_api.ts
export * from './sse'
export type {
  EventStreamCloseInfo,
  EventStreamHandle,
  EventStreamOpenInfo,
  FetchEventStreamErrorContext,
  FetchEventStreamOptions,
} from './transport/event_stream'
```

Run: `cd packages/core && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/sse/
git commit -m "feat(core): EventStreamCommand, builder and executeEventStreamCommand"
```

---

### Task 4: WebSocket `WebSocketCommand` / builder 与 `executeWebSocketCommand`

**Files:**

- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/web_socket/public_api.ts`
- Test: `packages/core/src/web_socket/web_socket.type.test.ts`

- [ ] **Step 1: 写失败测试**

```ts
// packages/core/src/web_socket/web_socket.type.test.ts
import { expectTypeOf } from 'vitest'
import { defineWebSocket } from './web_socket'
import { object, string } from '../struct'

const useChat = defineWebSocket({
  path: '/ws',
  incoming: { message: object({ text: string() }) },
})

const command = useChat()
expectTypeOf(command.kind).toEqualTypeOf<'web-socket'>()
expectTypeOf(command.endpoint.path).toEqualTypeOf<string>()
```

Run: `cd packages/core && pnpm typecheck`  
Expected: FAIL。

- [ ] **Step 2: 在 `web_socket.ts` 中定义 `WebSocketCommand` / `WebSocketCommandBuilder`，移除 `client` 配置**

```ts
// packages/core/src/web_socket/web_socket.ts
import type { BaseCommand } from '../client/command'
import type { ClientConfig } from '../client/config'

export interface WebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
  readonly config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>
}

export type WebSocketCommandBuilder<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
> =
  IsInputOptional<TInput> extends true
    ? (
        input?: EndpointInput<TInput>,
        config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
      ) => WebSocketCommand<TInput, TIncoming, TOutgoing>
    : (
        input: EndpointInput<TInput>,
        config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
      ) => WebSocketCommand<TInput, TIncoming, TOutgoing>
```

从 `UseWebSocketBaseConfig` 中移除 `client?: Client`。

- [ ] **Step 3: 改写 `defineWebSocket`**

```ts
export function defineWebSocket<
  TInput extends AnyStruct,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinitionWithBuild<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinitionWithoutBuild<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
export function defineWebSocket<
  TInput extends AnyStruct | undefined = undefined,
  TIncoming extends SocketSchemas = SocketSchemas,
  TOutgoing extends SocketSchemas | undefined = undefined,
>(definition: WebSocketDefinition<TInput, TIncoming, TOutgoing>): WebSocketCommandBuilder<TInput, TIncoming, TOutgoing> {
  const endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing> = {
    ...definition,
    kind: 'web-socket' as const,
  }

  function create(
    input?: EndpointInput<TInput>,
    config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ): WebSocketCommand<TInput, TIncoming, TOutgoing> {
    return {
      kind: 'web-socket',
      endpoint,
      input,
      config,
    } as WebSocketCommand<TInput, TIncoming, TOutgoing>
  }

  return ((
    input?: EndpointInput<TInput>,
    config?: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  ) => create(input, config)) as WebSocketCommandBuilder<TInput, TIncoming, TOutgoing>
}
```

- [ ] **Step 4: 将 `executeWebSocketEndpoint` 改为 `runWebSocketCommand` + 导出 `executeWebSocketCommand`**

删除 `createWebSocketRef`、`WebSocketRef`、`UseWebSocketEndpointFn`。`SocketRefState` 作为内部状态类型保留。

新增导出包装函数：

```ts
export async function executeWebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  clientConfig: ClientConfig,
  command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
  options?: { signal?: AbortSignal },
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>> {
  const { endpoint, input, config } = command
  const controller = new AbortController()
  const state: SocketRefState<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> = {
    listeners: {
      runtimeError: new Set(),
      stateChange: new Set(),
    },
    status: 'idle',
  }
  return runWebSocketCommand(clientConfig, endpoint, input, config, controller, state, options)
}
```

将原 `executeWebSocketEndpoint` 重命名为 `runWebSocketCommand`，签名改为：

```ts
async function runWebSocketCommand<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  clientConfig: ClientConfig,
  endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>,
  input: EndpointInput<TInput> | undefined,
  config: UseWebSocketConfig<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>> | undefined,
  controller: AbortController,
  state: SocketRefState<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>,
  options?: { signal?: AbortSignal },
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>
```

函数体做三处替换：

1. 删除 `clientConfig = resolveClientConfig(config?.client)` 块，直接使用参数 `clientConfig`。
2. `mergeAbortSignals(controller.signal, [config?.abort], config?.timeout)` 改为 `mergeAbortSignals(controller.signal, [config?.abort, options?.signal], config?.timeout)`。
3. 其余逻辑（`createWebSocketBuild`、`createWebSocketRequest`、session 生命周期、心跳、重连、队列）保持不变。

- [ ] **Step 5: 更新 `web_socket/public_api.ts` 并运行测试**

```ts
// packages/core/src/web_socket/public_api.ts
export * from './web_socket'
```

Run: `cd packages/core && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/web_socket/
git commit -m "feat(core): WebSocketCommand, builder and executeWebSocketCommand"
```

---

### Task 5: 实现 `createClient` 的 `execute()` 与顶层 `execute()`，并删除 `cloneClient`

**Files:**

- Modify: `packages/core/src/client/client.ts`
- Modify: `packages/core/src/client/client.spec.ts`
- Modify: `packages/core/src/client/client.type.test.ts`
- Test: `packages/core/src/client/execute.spec.ts`

- [ ] **Step 1: 写失败测试**

在 `packages/core/src/client/execute.spec.ts` 中追加：

```ts
test('top-level execute requires a client', async () => {
  const { execute } = await import('./index')

  const command = { kind: 'http' as const, definition: {} as any, input: undefined }
  await expect(execute(command)).rejects.toThrow('No client provided')
})
```

Run: `cd packages/core && pnpm test src/client/execute.spec.ts`  
Expected: FAIL — `execute` 未导出。

- [ ] **Step 2: 重构 `createClient` 并新增 `execute()`，删除 `cloneClient`**

```ts
// packages/core/src/client/command.ts
import type { HttpCommand } from '../http/http'
import type { EventStreamCommand } from '../sse/sse'
import type { WebSocketCommand } from '../web_socket/web_socket'

export interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

export type Command = HttpCommand<any, any> | EventStreamCommand<any, any> | WebSocketCommand<any, any, any>
```

```ts
// packages/core/src/client/client.ts
import type { Command } from './command'
import type { ClientConfig } from './config'
import { executeHttpCommand } from '../http/http'
import { executeEventStreamCommand } from '../sse/sse'
import { executeWebSocketCommand } from '../web_socket/web_socket'

function createClientFromConfig(config: ClientConfig): Client {
  return {
    [CLIENT]: config,
    execute(command: Command, options?: { signal?: AbortSignal }) {
      switch (command.kind) {
        case 'http':
          return executeHttpCommand(config, command, options) as Promise<unknown>
        case 'event-stream':
          return executeEventStreamCommand(config, command, options) as Promise<unknown>
        case 'web-socket':
          return executeWebSocketCommand(config, command, options) as Promise<unknown>
      }
    },
  } as Client
}

export function createClient(...options: ClientOption[]): Client {
  const conf: ClientConfig = {
    endpoint: '',
    http: { ...DEFAULT_HTTP_OPTIONS },
    interceptors: [],
    queryParamsSerializer: DEFAULT_QUERY_PARAMS_SERIALIZER,
    sse: { ...DEFAULT_SSE_OPTIONS },
    webSocket: {
      WebSocket: globalThis.WebSocket,
      beforeConnect: undefined,
      heartbeat: undefined,
      protocols: undefined,
      queue: undefined,
      reconnect: undefined,
    },
    xsrf: undefined,
  }

  for (const option of options) {
    option(conf)
  }

  return createClientFromConfig(conf)
}

export async function execute<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined>(
  command: HttpCommand<TInput, TOutput>,
  options?: { client?: Client; signal?: AbortSignal },
): Promise<HttpAwaitResult<RequestSuccessData<TOutput>, RequestErrorData<TOutput>>>

export async function execute<TInput extends AnyStruct | undefined, TEvents extends EventSchemas>(
  command: EventStreamCommand<TInput, TEvents>,
  options?: { client?: Client; signal?: AbortSignal },
): Promise<StreamAwaitResult<EventStreamData<TEvents>>>

export async function execute<
  TInput extends AnyStruct | undefined,
  TIncoming extends SocketSchemas,
  TOutgoing extends SocketSchemas | undefined,
>(
  command: WebSocketCommand<TInput, TIncoming, TOutgoing>,
  options?: { client?: Client; signal?: AbortSignal },
): Promise<SocketAwaitResult<WebSocketIncomingData<TIncoming>, WebSocketOutgoingData<TOutgoing>>>

export async function execute(command: Command, options?: { client?: Client; signal?: AbortSignal }): Promise<unknown> {
  if (!options?.client) {
    throw new Error('No client provided')
  }
  return options.client.execute(command, { signal: options.signal })
}
```

从 `client.ts` 中删除 `export function cloneClient(...)` 整个函数。

同步更新 `packages/core/src/client/public_api.ts`：

```ts
// packages/core/src/client/public_api.ts
export { createClient, execute } from './client'
export type { BaseCommand, Command } from './command'
```

保留现有 `config`、`option`、`resolve` 导出；从 public API 删除 `cloneClient`，global client 导出等旧调用点清零后再删。

保留 `resolveClientConfig` 和 `getGlobalClient` 导入，直到旧端点和测试调用点全部迁移并通过删除 gate 后再删。

- [ ] **Step 3: 删除 `cloneClient` 相关测试与类型测试**

在 `packages/core/src/client/client.spec.ts` 中删除所有 `cloneClient` 测试，例如：

- `should cloneClient override endpoint and transport seams`
- `should cloneClient preserve previous endpoint when not overridden`
- `should cloneClient preserve previous webSocket protocols when not overridden`
- `should cloneClient copy existing webSocket timing options`
- `should cloneClient override webSocket protocols with spread`
- `should cloneClient copy existing sse timing options`
- `should cloneClient override sse reconnect with spread`
- `should cloneClient override sse queue with spread`
- `should cloneClient preserve xsrf config when not overridden`
- `should cloneClient keep xsrf undefined when source client has none`
- `should cloneClient keep webSocket queue undefined when source client has none`
- `should cloneClient allow xsrf overrides after cloning`

在 `packages/core/src/client/client.type.test.ts` 中删除 `cloneClient` 的 import 与使用。

- [ ] **Step 4: 运行测试**

Run: `cd packages/core && pnpm test src/client/execute.spec.ts src/client/client.spec.ts && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/client/command.ts packages/core/src/client/client.ts packages/core/src/client/client.spec.ts packages/core/src/client/client.type.test.ts packages/core/src/client/execute.spec.ts
git commit -m "feat(core): Client.execute dispatcher, top-level execute, remove cloneClient"
```

---

### Task 6: 移除 Angular / Vue `provideGlobalClient`，保留 core global 直到调用点清零

**Files:**

- Modify: `packages/angular/src/core.ts`
- Modify: `packages/angular/src/public_api.ts`
- Modify: `packages/vue/src/core.ts`
- Modify: `packages/vue/src/public_api.ts`
- Modify: `packages/vue/src/core.browser.spec.ts`
- Modify: `packages/vue/test/core.spec.ts`

- [ ] **Step 1: 记录旧 API 调用点 baseline，不删除 core global**

```bash
rg "setGlobalClient|resetGlobalClient|getGlobalClient|resolveClientConfig|provideGlobalClient|\.with\(\{ client" packages
```

Expected: 仍会命中 core 与测试旧调用点；本 Task 只清理 Angular / Vue 的 `provideGlobalClient`。`packages/core/src/client/global.ts`、`resolve.spec.ts` 和 core public exports 暂时保留，等 Task 8 迁移完所有调用点后再删。

- [ ] **Step 2: 清理 Angular / Vue 的 `provideGlobalClient`**

```ts
// packages/angular/src/core.ts
// 删除 provideGlobalClient 函数及 import { setGlobalClient }
```

```ts
// packages/angular/src/public_api.ts
export { injectClient, provideClient, withEndpoint, withInterceptors } from './core'
```

```ts
// packages/vue/src/core.ts
// 删除 provideGlobalClient 函数及 import { setGlobalClient }
```

```ts
// packages/vue/src/public_api.ts
export { HTTP_CLIENT, injectClient, provideClient, withEndpoint, withInterceptors } from './core'
```

- [ ] **Step 3: 更新 Vue 中 `provideGlobalClient` 相关测试**

删除或改写以下测试：

- `should create a Plugin with provideGlobalClient`
- `should set global client with provideGlobalClient`
- `test/core.spec.ts` 中所有 `provideGlobalClient` 相关 `it`

保留的测试改为使用 `provideClient`：

```ts
const app = createApp({})
app.use(provideClient(withEndpoint('https://api.example.com')))
const client = injectClient()
expect(isClient(client)).toBe(true)
```

- [ ] **Step 4: 运行验证**

Run: `cd packages/vue && pnpm test && pnpm typecheck`  
Expected: PASS（provideGlobalClient 相关测试已删除）。

> 注：其它 core 测试（http/sse/web_socket）仍使用旧 `setGlobalClient`/`await ref`，会在 Task 8 统一改写；此处禁止删除 core global。

- [ ] **Step 5: Commit**

```bash
git add packages/angular/src/core.ts packages/angular/src/public_api.ts packages/vue/src/core.ts packages/vue/src/public_api.ts packages/vue/src/core.browser.spec.ts packages/vue/test/core.spec.ts
git commit -m "feat(angular,vue): remove provideGlobalClient"
```

---

### Task 7: 更新 Angular / Vue 调用用例

**Files:**

- Modify: `packages/vue/src/core.browser.spec.ts`
- Modify: `packages/vue/test/core.spec.ts`
- Modify: `packages/angular/` 中的测试（如有）

- [ ] **Step 1: 将 Vue 测试中的旧调用改为 `client.execute(command)`**

```ts
// 原
const [error, users] = await getUsers().with({ client: getGlobalClient() })

// 新
const client = injectClient()
const [error, users] = await client.execute(getUsers())
```

- [ ] **Step 2: 运行 Vue 测试**

Run: `cd packages/vue && pnpm test`  
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add packages/vue/
git commit -m "test(vue): migrate tests to client.execute"
```

---

### Task 8: 重写核心单元测试、类型测试与 OpenTelemetry e2e

**Files:**

- Modify: `packages/core/src/http/http.spec.ts`
- Modify: `packages/core/src/http/http.browser.spec.ts`
- Modify: `packages/core/src/http/http.client.spec.ts`
- Modify: `packages/core/src/http/http.context.spec.ts`
- Modify: `packages/core/src/http/http.error.spec.ts`
- Modify: `packages/core/src/http/http.response_type.spec.ts`
- Modify: `packages/core/src/sse/sse.spec.ts`
- Modify: `packages/core/src/sse/sse.browser.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.browser.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.heartbeat.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.lifecycle.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.node.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.reconnect.spec.ts`
- Modify: 所有 `packages/core/src/**/*.type.test.ts`
- Modify: `packages/opentelemetry-server/e2e.spec.ts`
- Delete: `packages/core/src/client/global.ts`
- Delete: `packages/core/src/client/resolve.spec.ts`

- [ ] **Step 1: 统一替换模式**

HTTP：

- `beforeEach(() => setGlobalClient(client))` / `afterEach(() => resetGlobalClient())` → 删除。
- `const ref = useGetUser(...)` → `const command = useGetUser(...)`
- `await ref` / `await ref.with({ client })` → `await client.execute(command)`
- `ref.cancel()` → 传 `AbortSignal` 到 `client.execute(command, { signal })`
- 多次 `await` 同一 ref 的测试改为每次 `client.execute` 都发起请求。

SSE / WebSocket：

- `await useStream().with({ client })` / `await useStream()` → `await client.execute(useStream())`
- 连接完成前的 `ref.close()` → `const controller = new AbortController()` + `client.execute(command, { signal: controller.signal })` + `controller.abort(reason)`。
- 连接完成后的 `ref.close()` → 返回的 `stream.close(reason)` / `session.close(code, reason)`。
- 状态机测试改为验证返回的 handle/session 状态。

OpenTelemetry e2e：

- `setGlobalClient(client)` → 删除。
- `await useEchoHeaders({}).with({ client })` → `await client.execute(useEchoHeaders({}))`
- `await useStream()` / `await useSocket()` → `await client.execute(useStream())` / `await client.execute(useSocket())`

类型测试：

- `streamRef.with({ client: streamClient })` → `client.execute(streamCommand)`。
- `cloneClient(...)` 相关断言删除。

- [ ] **Step 2: 运行全部核心测试**

先扫描 Ref 调用残留：

```bash
rg "await use|\.with\(|\.cancel\(|ref\.close\(" packages/core/src packages/vue/src packages/vue/test packages/opentelemetry-server/e2e.spec.ts
```

Expected: 只剩新范式允许的 handle/session close，不再有 Ref/PromiseLike 调用模式。

Run: `cd packages/core && pnpm test`  
Expected: PASS。

- [ ] **Step 3: 运行 OpenTelemetry e2e**

Run: `cd packages/opentelemetry-server && pnpm test`  
Expected: PASS。

- [ ] **Step 4: 旧 API 扫描清零后删除 core global**

```bash
rg "setGlobalClient|resetGlobalClient|getGlobalClient|resolveClientConfig|provideGlobalClient|\.with\(\{ client" packages
```

Expected: `packages/**/src`、`packages/**/test` 和 `packages/opentelemetry-server/e2e.spec.ts` 无旧 API 命中。

删除：

- `packages/core/src/client/global.ts`
- `packages/core/src/client/resolve.spec.ts`

同时清理：

- `packages/core/src/client/client.ts` 中的 `import { getGlobalClient } from './global'`
- `packages/core/src/client/client.ts` 中的 `export function resolveClientConfig(...)`
- `packages/core/src/client/public_api.ts` 中的 `getGlobalClient` / `setGlobalClient` / `resetGlobalClient` 导出

- [ ] **Step 5: 删除后验证**

Run: `cd packages/core && pnpm test && pnpm typecheck`  
Expected: PASS。

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/ packages/opentelemetry-server/e2e.spec.ts
git rm packages/core/src/client/global.ts packages/core/src/client/resolve.spec.ts
git commit -m "test(core,opentelemetry-server): migrate tests and remove global client"
```

---

### Task 9: 文档更新与全量验证

**Files:**

- Modify: `packages/core/README.md`
- Modify: `packages/angular/README.md`
- Modify: `packages/vue/README.md`
- Create: `.changeset/<short-name>.md`

- [ ] **Step 1: 更新 README**

删除或替换以下内容：

- `setGlobalClient` / `getGlobalClient` / `resetGlobalClient` 相关说明。
- `cloneClient` 相关说明。
- Angular / Vue `provideGlobalClient` 相关说明。

新增示例：

```ts
const useGetUser = defineRequest({ method: 'GET', path: '/users/:id', output: { 200: UserSchema } })
const client = createClient(withEndpoint('https://api.example.com'))
const [err, user, response] = await client.execute(useGetUser({ id: 1 }))

// 顶层 execute 必须显式传 client
const [err2, user2] = await execute(useGetUser({ id: 1 }), { client })
```

- [ ] **Step 2: 新增 breaking changeset**

```md
---
'@defjs/core': major
'@defjs/angular': major
'@defjs/vue': major
---

Replace PromiseLike request refs and global client helpers with explicit Command objects and `client.execute(command)`.

Removed `setGlobalClient`, `getGlobalClient`, `resetGlobalClient`, `cloneClient`, and Angular/Vue `provideGlobalClient`.
```

- [ ] **Step 3: 运行全量类型检查**

Run: `pnpm typecheck`  
Expected: 无错误。

- [ ] **Step 4: 运行全量测试**

Run: `pnpm test`  
Expected: 全部通过。

- [ ] **Step 5: 构建验证**

Run: `pnpm build`  
Expected: 各包 dist 产物正确。

- [ ] **Step 6: Commit**

```bash
git add .changeset/ packages/core/README.md packages/angular/README.md packages/vue/README.md
git commit -m "docs(core,angular,vue): update READMEs for command/execute migration"
```

---

## Self-Review

1. **Spec coverage:** Command / `client.execute` / 顶层 `execute` / HTTP / SSE / WebSocket / 全局 client 与 `provideGlobalClient` / `cloneClient` 移除 / 测试改写 / README 更新均有明确 Task。
2. **Placeholder scan:** 无占位符；SSE / WebSocket 执行器通过「新增包装函数 + 重命名原函数」复用现有函数体，避免导出内部 helper，改动最小。
3. **Type consistency:** `HttpCommand` / `EventStreamCommand` / `WebSocketCommand` 都基于 `BaseCommand`；`Client.execute` 重载返回类型与各自 `*AwaitResult` 一致；builder 类型命名一致；顶层 `execute` 没有显式 client 时抛出 `No client provided`。
4. **最小代码:** 没有新增 `http/execute.ts` / `sse/execute.ts` / `web_socket/execute.ts` 等额外文件；执行器就地改造，内部状态/生命周期逻辑原样保留。

---

## 执行方式

默认按 Task 顺序执行。可以根据当时上下文选择 inline 执行或拆分子任务；硬性要求是每个 commit 前通过该 Task 的验证命令，并且删除 public API 前先通过旧 API 扫描门禁。
