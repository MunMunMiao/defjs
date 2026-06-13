# with timeout/abort 互斥 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `@defjs/core` 的 HTTP/SSE/WebSocket `with(...)` 配置在类型层与运行时都禁止同时传入 `timeout` 和 `abort`，并把 SSE `fetch` 收敛到 client 级配置。

**Architecture:** 复用现有 `packages/core/src/internal/abort.ts` 作为 cancellation 边界，在其中增加共享互斥类型和运行时冲突 helper，避免新建额外内部模块。HTTP、SSE、WebSocket 的 public `Use*Config` 改成 base config 与 `UseCancellationConfig` 的交叉类型，并在执行入口最早返回 definition error。SSE 执行路径只从 `clientConfig.sse.fetch` 读取 fetch，动态切换通过 `with({ client })`。

**Tech Stack:** TypeScript、Vitest、Vitest typecheck、DOM `AbortSignal`、当前 `@defjs/core` tuple error 风格。

**Commit policy:** 本计划不包含 `git commit` 步骤；执行时只修改、验证并汇报。除非用户另行明确授权，否则不要提交。

---

## File Structure

- Modify: `packages/core/src/internal/abort.ts`
  - 在现有 abort helper 文件中增加 `UseCancellationConfig`、字段级冲突检测、冲突 definition error 创建。
- Modify: `packages/core/src/internal/abort.spec.ts`
  - 在现有 abort helper 测试中补充冲突 helper 的字段级判断和错误对象形态。
- Modify: `packages/core/src/http/http.ts`
  - `UseRequestConfig` 改成 base config + `UseCancellationConfig`；执行入口早失败。
- Modify: `packages/core/src/sse/sse.ts`
  - `UseEventStreamConfig` 改成 base config + `UseCancellationConfig`，移除 request-level `fetch`；执行入口早失败；handler 使用 `clientConfig.sse.fetch`。
- Modify: `packages/core/src/web_socket/web_socket.ts`
  - `UseWebSocketConfig` 改成 base config + `UseCancellationConfig`；执行入口早失败。
- Modify: `packages/core/src/http/http.type.test.ts`
  - HTTP `with` 类型互斥测试。
- Modify: `packages/core/src/sse/sse.type.test.ts`
  - SSE `with` 类型互斥测试，以及 `stream.with({ fetch })` 不再允许。
- Modify: `packages/core/src/web_socket/web_socket.type.test.ts`
  - WebSocket `with` 类型互斥测试，并保护 heartbeat 泛型推断。
- Modify: `packages/core/src/http/http.error.spec.ts`
  - HTTP runtime 冲突优先于 abort/parse/transport。
- Modify: `packages/core/src/sse/sse.spec.ts`
  - 现有 request-level fetch 用例改为 client-level fetch；增加 SSE runtime 冲突测试。
- Modify: `packages/core/src/web_socket/web_socket.spec.ts`
  - WebSocket runtime 冲突测试，确保不进入 beforeConnect / socket startup。
- Modify: `packages/core/design.md`
  - HTTP/SSE/WebSocket 示例改成 `timeout` 与 `abort` 二选一；SSE 配置清单移除 `fetch`；补迁移说明。

---

### Task 1: 扩展现有 abort helper

**Files:**

- Modify: `packages/core/src/internal/abort.ts`
- Modify: `packages/core/src/internal/abort.spec.ts`

- [ ] **Step 1: Write the failing helper tests**

Modify the import in `packages/core/src/internal/abort.spec.ts`:

```ts
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals } from './abort'
```

Add these tests inside `describe('abort helpers', () => { ... })`, after the existing timeout merge test:

```ts
test('should detect abort and timeout field conflict', () => {
  const signal = new AbortController().signal

  expect(hasAbortTimeoutConflict(undefined)).toBe(false)
  expect(hasAbortTimeoutConflict({})).toBe(false)
  expect(hasAbortTimeoutConflict({ abort: signal })).toBe(false)
  expect(hasAbortTimeoutConflict({ timeout: 100 })).toBe(false)
  expect(hasAbortTimeoutConflict({ abort: signal, timeout: 100 })).toBe(true)
  expect(hasAbortTimeoutConflict({ abort: signal, timeout: 0 })).toBe(true)
  expect(hasAbortTimeoutConflict({ abort: signal, timeout: undefined })).toBe(false)
})

test('should create a request validation definition error for abort timeout conflict', () => {
  const error = createAbortTimeoutConflictError()

  expect(error.kind).toBe('definition')
  expect(error.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error.message).toBe('with.abort and with.timeout cannot be used together')
  expect(error.cause).toBeInstanceOf(Error)
})
```

- [ ] **Step 2: Run helper test and verify it fails**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/internal/abort.spec.ts
```

Expected: FAIL because `createAbortTimeoutConflictError` and `hasAbortTimeoutConflict` are not exported yet.

- [ ] **Step 3: Implement helper exports in existing abort module**

Modify `packages/core/src/internal/abort.ts` so the file starts with this import and helper block before `mergeAbortSignals(...)`:

```ts
import { createDefinitionError, type DefinitionError } from '../error'

export const ABORT_TIMEOUT_CONFLICT_MESSAGE = 'with.abort and with.timeout cannot be used together'

export type UseCancellationConfig =
  | {
      abort?: AbortSignal
      timeout?: never
    }
  | {
      abort?: never
      timeout?: number
    }

export interface CancellationConfigLike {
  abort?: unknown
  timeout?: unknown
}

export function hasAbortTimeoutConflict(config: CancellationConfigLike | undefined): boolean {
  return config !== undefined && config.abort !== undefined && config.timeout !== undefined
}

export function createAbortTimeoutConflictError(): DefinitionError {
  return createDefinitionError('REQUEST_VALIDATION_FAILED', new Error(ABORT_TIMEOUT_CONFLICT_MESSAGE))
}
```

Keep the existing `mergeAbortSignals(...)` implementation unchanged below that block.

- [ ] **Step 4: Run helper test and verify it passes**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/internal/abort.spec.ts
```

Expected: PASS.

- [ ] **Step 5: Check the helper diff**

Run:

```bash
git diff -- packages/core/src/internal/abort.ts packages/core/src/internal/abort.spec.ts
```

Expected: diff only adds the helper types/functions/tests; `mergeAbortSignals(...)` behavior stays unchanged.

---

### Task 2: 实现 public config 类型互斥并补 type tests

**Files:**

- Modify: `packages/core/src/http/http.ts:18-25`
- Modify: `packages/core/src/sse/sse.ts:17-23`
- Modify: `packages/core/src/web_socket/web_socket.ts:118-127`
- Modify: `packages/core/src/http/http.type.test.ts`
- Modify: `packages/core/src/sse/sse.type.test.ts`
- Modify: `packages/core/src/web_socket/web_socket.type.test.ts`
- Modify: `packages/core/src/sse/sse.spec.ts:167-193`

- [ ] **Step 1: Write failing HTTP type tests**

Modify the import in `packages/core/src/http/http.type.test.ts`:

```ts
import { struct } from '../struct'
import { defineRequest, type UseRequestConfig } from './index'
```

Add these cases after `const requiredRef = requiredEndpoint(requiredInput)`:

```ts
requiredRef.with({ timeout: 100 })
requiredRef.with({ abort: new AbortController().signal })
requiredRef.with({ abort: AbortSignal.timeout(100) })

const requestTimeoutConfig = { timeout: 100 } satisfies UseRequestConfig
const requestAbortConfig = { abort: new AbortController().signal } satisfies UseRequestConfig
void requestTimeoutConfig
void requestAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
requiredRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error abort must be an AbortSignal.
requiredRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
requiredRef.with({ abort: new AbortController() })

// @ts-expect-error abort must be an AbortSignal, not a callback.
requiredRef.with({ abort: () => {} })
```

- [ ] **Step 2: Write failing SSE type tests**

Modify the imports in `packages/core/src/sse/sse.type.test.ts`:

```ts
import { createClient } from '../client'
import { struct } from '../struct'
import { defineEventStream, type EventStreamData, type EventStreamRef, type StreamAwaitResult, type UseEventStreamConfig } from './index'
```

Add these cases after `type InputCases = ...`:

```ts
const streamRef = useRequiredStream({ roomId: 'room-1' })
const streamClient = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    fetch: globalThis.fetch,
  },
})

streamRef.with({ timeout: 100 })
streamRef.with({ abort: new AbortController().signal })
streamRef.with({ abort: AbortSignal.timeout(100) })
streamRef.with({ client: streamClient })

const streamTimeoutConfig = { timeout: 100 } satisfies UseEventStreamConfig
const streamAbortConfig = { abort: new AbortController().signal } satisfies UseEventStreamConfig
void streamTimeoutConfig
void streamAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
streamRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error request-level fetch was removed; configure fetch on client.sse and pass client.
streamRef.with({ fetch: globalThis.fetch })

// @ts-expect-error abort must be an AbortSignal.
streamRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
streamRef.with({ abort: new AbortController() })

// @ts-expect-error abort must be an AbortSignal, not a callback.
streamRef.with({ abort: () => {} })
```

Add `void streamRef` near the existing `void requestInputStream` line:

```ts
void requestInputStream
void streamRef
```

- [ ] **Step 3: Write failing WebSocket type tests**

Modify the import in `packages/core/src/web_socket/web_socket.type.test.ts`:

```ts
import { struct } from '../struct'
import {
  defineWebSocket,
  type UseWebSocketConfig,
  type WebSocketIncomingData,
  type WebSocketOutgoingData,
  type WebSocketRef,
  type WebSocketSession,
} from './index'
```

Add these cases after `type InputCases = ...`:

```ts
const socketRef = useSocket({ roomId: 'room-1' })

socketRef.with({ timeout: 100 })
socketRef.with({ abort: new AbortController().signal })
socketRef.with({ abort: AbortSignal.timeout(100) })
socketRef.with({
  heartbeat: {
    intervalMs: 1000,
    isAck: (message) => message.type === 'joined',
    message: () => ({ text: 'hello', type: 'message' }),
  },
})

const socketTimeoutConfig = { timeout: 100 } satisfies UseWebSocketConfig<ExpectedIncoming, ExpectedOutgoing>
const socketAbortConfig = { abort: new AbortController().signal } satisfies UseWebSocketConfig<ExpectedIncoming, ExpectedOutgoing>
void socketTimeoutConfig
void socketAbortConfig

// @ts-expect-error with.abort and with.timeout are mutually exclusive.
socketRef.with({ abort: new AbortController().signal, timeout: 100 })

// @ts-expect-error abort must be an AbortSignal.
socketRef.with({ abort: true })

// @ts-expect-error abort must be an AbortSignal, not an AbortController.
socketRef.with({ abort: new AbortController() })

// @ts-expect-error abort must be an AbortSignal, not a callback.
socketRef.with({ abort: () => {} })
```

Add `void socketRef` near the existing `void requestInputSocket` line:

```ts
void requestInputSocket
void socketRef
```

- [ ] **Step 4: Run typecheck and verify it fails for the expected reasons**

Run:

```bash
bun x vitest run --typecheck --config packages/core/vitest.config.typecheck.ts
```

Expected: FAIL because the new `@ts-expect-error` directives are unused: current config types still allow `{ abort, timeout }`, and SSE still allows request-level `fetch`.

- [ ] **Step 5: Update HTTP config type**

Modify the existing abort import in `packages/core/src/http/http.ts`:

```ts
import { mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Replace the current `UseRequestConfig` interface with:

```ts
interface UseRequestBaseConfig {
  client?: Client
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}

export type UseRequestConfig = UseRequestBaseConfig & UseCancellationConfig
```

- [ ] **Step 6: Update SSE config type and remove request-level fetch**

Modify the existing abort import in `packages/core/src/sse/sse.ts`:

```ts
import { mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Replace the current `UseEventStreamConfig` interface with:

```ts
interface UseEventStreamBaseConfig {
  client?: Client
  context?: HttpContext
}

export type UseEventStreamConfig = UseEventStreamBaseConfig & UseCancellationConfig
```

- [ ] **Step 7: Update WebSocket config type**

Modify the existing abort import in `packages/core/src/web_socket/web_socket.ts`:

```ts
import { mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Replace the current `UseWebSocketConfig` interface with:

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

- [ ] **Step 8: Convert the existing SSE request-level fetch runtime spec to client-level fetch**

In `packages/core/src/sse/sse.spec.ts`, replace the `.with({ fetch: ... })` setup in `should decode event payloads with struct key aliases` with this client-level setup:

```ts
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    fetch: (async () =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('event: profile\ndata: {"display_name":"Miao"}\n\n'))
            controller.close()
          },
        }),
        {
          headers: {
            'content-type': 'text/event-stream',
          },
          status: 200,
        },
      )) as unknown as typeof fetch,
  },
})

const [error, stream] = await useAliasStream().with({ client })
```

- [ ] **Step 9: Run typecheck and verify it passes**

Run:

```bash
bun x vitest run --typecheck --config packages/core/vitest.config.typecheck.ts
```

Expected: PASS.

- [ ] **Step 10: Check type diff**

Run:

```bash
git diff -- \
  packages/core/src/http/http.ts \
  packages/core/src/sse/sse.ts \
  packages/core/src/web_socket/web_socket.ts \
  packages/core/src/http/http.type.test.ts \
  packages/core/src/sse/sse.type.test.ts \
  packages/core/src/web_socket/web_socket.type.test.ts \
  packages/core/src/sse/sse.spec.ts
```

Expected: diff only changes `Use*Config` shapes, type tests, and the existing SSE alias test's fetch setup.

---

### Task 3: HTTP runtime 早失败

**Files:**

- Modify: `packages/core/src/http/http.error.spec.ts`
- Modify: `packages/core/src/http/http.ts:154-170`

- [ ] **Step 1: Write failing HTTP runtime tests**

Add these tests after `should return aborted error when signal is already aborted` in `packages/core/src/http/http.error.spec.ts`:

```ts
test('should reject with.abort and with.timeout before parsing HTTP input', async () => {
  const controller = new AbortController()
  const useRequest = defineRequest({
    input: struct.object({
      id: struct.string(),
    }),
    method: 'GET',
    output: {
      200: struct.null(),
    },
    path: '/null',
  })

  const ref = useRequest({ id: 1 } as never).with({ abort: controller.signal, timeout: 1 } as never)
  const [error, result, response] = await ref

  expect(result).toBeUndefined()
  expect(response).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
})

test('should prefer HTTP cancellation config conflict over an already aborted signal', async () => {
  const controller = new AbortController()
  controller.abort(ERR_ABORTED)
  const useRequest = defineRequest({
    method: 'GET',
    output: {
      200: struct.null(),
    },
    path: '/null',
  })

  const ref = useRequest().with({ abort: controller.signal, timeout: 1 } as never)
  const [error, result, response] = await ref

  expect(result).toBeUndefined()
  expect(response).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
})
```

- [ ] **Step 2: Run HTTP runtime tests and verify they fail**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/http/http.error.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal"
```

Expected: FAIL. The conflict case currently proceeds to input parsing or abort handling instead of returning the cancellation config definition error.

- [ ] **Step 3: Implement HTTP early conflict check**

Modify the abort import in `packages/core/src/http/http.ts`:

```ts
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Add this block immediately after `state.status = 'pending'` in `executeHttpEndpoint(...)`, before the `requestAbort` fast path:

```ts
if (hasAbortTimeoutConflict(config)) {
  const definitionError = createAbortTimeoutConflictError()
  state.error = definitionError as RequestError<RequestErrorData<TOutput>>
  state.status = 'error'
  return [definitionError as RequestError<RequestErrorData<TOutput>>, undefined, undefined]
}
```

- [ ] **Step 4: Run HTTP runtime tests and verify they pass**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/http/http.error.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal"
```

Expected: PASS.

- [ ] **Step 5: Check HTTP runtime diff**

Run:

```bash
git diff -- packages/core/src/http/http.ts packages/core/src/http/http.error.spec.ts
```

Expected: diff only adds the early conflict check and the two runtime tests.

---

### Task 4: SSE runtime 早失败并移除 request-level fetch 执行路径

**Files:**

- Modify: `packages/core/src/sse/sse.spec.ts`
- Modify: `packages/core/src/sse/sse.ts:157-224`

- [ ] **Step 1: Write failing SSE cancellation conflict tests**

Modify `packages/core/src/sse/sse.spec.ts` imports:

```ts
import { createClient, resetGlobalClient, setGlobalClient } from '../client'
import { ERR_ABORTED } from '../error'
import { createSSEInterceptor } from '../interceptor'
import { struct, tag } from '../struct'
import { defineEventStream } from './index'
```

Add these tests after `should allow closing stream refs before startup`:

```ts
test('should reject with.abort and with.timeout before starting SSE transport', async () => {
  const controller = new AbortController()
  let interceptorCalls = 0
  const client = createClient({
    endpoint: inject('testServerHost'),
    interceptors: [
      createSSEInterceptor(async (req, next) => {
        interceptorCalls += 1
        return await next(req)
      }),
    ],
  })
  const useStream = defineEventStream({
    events: {
      message: struct.string(),
    },
    path: '/sse/basic',
  })

  const ref = useStream().with({ client, abort: controller.signal, timeout: 1 } as never)
  const [error, stream, open] = await ref

  expect(stream).toBeUndefined()
  expect(open).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
  expect(interceptorCalls).toBe(0)
})

test('should prefer SSE cancellation config conflict over an already aborted signal', async () => {
  const controller = new AbortController()
  controller.abort(ERR_ABORTED)
  const useStream = defineEventStream({
    events: {
      message: struct.string(),
    },
    path: '/sse/basic',
  })

  const ref = useStream().with({ abort: controller.signal, timeout: 1 } as never)
  const [error, stream, open] = await ref

  expect(stream).toBeUndefined()
  expect(open).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
})
```

- [ ] **Step 2: Run SSE tests and verify they fail**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/sse/sse.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal|struct key aliases"
```

Expected: FAIL because the conflict cases currently proceed into existing abort/merge behavior instead of returning the cancellation config definition error. The alias stream case should continue to pass through client-level fetch.

- [ ] **Step 3: Implement SSE early conflict check and client-only fetch**

Modify the abort import in `packages/core/src/sse/sse.ts`:

```ts
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Add this block immediately after `state.status = 'connecting'` in `executeEventStreamEndpoint(...)`, before `config.abort?.aborted`:

```ts
if (hasAbortTimeoutConflict(config)) {
  const definitionError = createAbortTimeoutConflictError()
  state.error = definitionError
  state.status = 'error'
  return [definitionError, undefined, undefined]
}
```

Replace the SSE handler fetch option so it no longer reads `config.fetch`:

```ts
const sseHandler: SSEHandler = (req) =>
  fetchEventStream(req, {
    fetch: clientConfig.sse.fetch,
    async transformMessage(message) {
      return await transformStreamMessage(endpoint.events, message)
    },
  }) as Promise<EventStreamHandle<unknown>>
```

- [ ] **Step 4: Run SSE tests and verify they pass**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/sse/sse.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal|struct key aliases"
```

Expected: PASS.

- [ ] **Step 5: Check SSE runtime diff**

Run:

```bash
git diff -- packages/core/src/sse/sse.ts packages/core/src/sse/sse.spec.ts
```

Expected: diff only adds the early conflict check, removes request-level fetch usage in execution, converts the alias fetch setup to client-level, and adds the two conflict tests.

---

### Task 5: WebSocket runtime 早失败

**Files:**

- Modify: `packages/core/src/web_socket/web_socket.spec.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts:266-318`

- [ ] **Step 1: Write failing WebSocket conflict tests**

Add these tests after `should return transport error with invalid client` in `packages/core/src/web_socket/web_socket.spec.ts`:

```ts
test('should reject with.abort and with.timeout before starting websocket transport', async () => {
  const controller = new AbortController()
  let beforeConnectCalls = 0
  const useSocket = defineWebSocket({
    incoming: {},
    path: '/ws/basic',
  })

  const ref = useSocket().with({
    abort: controller.signal,
    beforeConnect: () => {
      beforeConnectCalls += 1
    },
    timeout: 1,
  } as never)
  const [error, socket, connection] = await ref

  expect(socket).toBeUndefined()
  expect(connection).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
  expect(beforeConnectCalls).toBe(0)
})

test('should prefer websocket cancellation config conflict over an already aborted signal', async () => {
  const controller = new AbortController()
  controller.abort(ERR_ABORTED)
  const useSocket = defineWebSocket({
    incoming: {},
    path: '/ws/basic',
  })

  const ref = useSocket().with({ abort: controller.signal, timeout: 1 } as never)
  const [error, socket, connection] = await ref

  expect(socket).toBeUndefined()
  expect(connection).toBeUndefined()
  expect(error?.kind).toBe('definition')
  expect(error?.code).toBe('REQUEST_VALIDATION_FAILED')
  expect(error?.message).toBe('with.abort and with.timeout cannot be used together')
  expect(ref.status).toBe('error')
})
```

- [ ] **Step 2: Run WebSocket tests and verify they fail**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/web_socket/web_socket.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal"
```

Expected: FAIL because the runtime still merges `config?.abort` and `config?.timeout` at `mergeAbortSignals(...)`.

- [ ] **Step 3: Implement WebSocket early conflict check**

Modify the abort import in `packages/core/src/web_socket/web_socket.ts`:

```ts
import { createAbortTimeoutConflictError, hasAbortTimeoutConflict, mergeAbortSignals, type UseCancellationConfig } from '../internal/abort'
```

Add this block immediately after `setSocketState(state, 'connecting')` in `executeWebSocketEndpoint(...)`, before `parseEndpointInput(...)`:

```ts
if (hasAbortTimeoutConflict(config)) {
  const definitionError = createAbortTimeoutConflictError()
  state.error = definitionError
  setSocketState(state, 'error')
  return [definitionError, undefined, undefined]
}
```

- [ ] **Step 4: Run WebSocket tests and verify they pass**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src/web_socket/web_socket.spec.ts --testNamePattern="with.abort and with.timeout|already aborted signal"
```

Expected: PASS.

- [ ] **Step 5: Check WebSocket runtime diff**

Run:

```bash
git diff -- packages/core/src/web_socket/web_socket.ts packages/core/src/web_socket/web_socket.spec.ts
```

Expected: diff only adds the early conflict check and the two runtime tests.

---

### Task 6: 更新设计文档

**Files:**

- Modify: `packages/core/design.md:576-599`
- Modify: `packages/core/design.md:711-732`
- Modify: `packages/core/design.md:801-836`

- [ ] **Step 1: Update HTTP `with` example and config list**

In `packages/core/design.md`, replace the HTTP configured call example with:

```ts
const [error, data, response] = await getUserInfo({
  path: { id: 1 },
  query: { withProfile: true },
}).with({
  client,
  timeout: 10_000,
  onUploadProgress(event) {},
  onDownloadProgress(event) {},
  context,
})
```

Then replace the HTTP second-stage config list with:

```md
第二段 HTTP 配置：

1. `client?: Client`
2. `timeout?: number`
3. `abort?: AbortSignal`
4. `onUploadProgress?: HttpProgressFn`
5. `onDownloadProgress?: HttpProgressFn`
6. `context?: HttpContext`

`timeout` 与 `abort` 互斥。`timeout` 是便捷超时入口；`abort` 接收外部 `AbortSignal`。如果需要组合外部取消和超时，请自行构造组合后的 `AbortSignal` 并只传 `abort`。
```

- [ ] **Step 2: Update SSE `with` example and config list**

Replace the SSE configured call example with:

```ts
const [error, stream, open] = await watchUserInfo({
  path: { id: 1 },
  headers: { token: 'secret' },
}).with({
  client,
  timeout: 10_000,
  context,
})
```

Replace the SSE second-stage config list with:

```md
第二段 SSE 配置：

1. `client?: Client`
2. `timeout?: number`
3. `abort?: AbortSignal`
4. `context?: HttpContext`

`timeout` 与 `abort` 互斥。SSE 的 `fetch` 只在 client 的 `sse` 配置中设置；需要动态切换 fetch 时，创建或 clone 对应 client，然后通过 `.with({ client })` 切换。
```

- [ ] **Step 3: Update WebSocket `with` example and config list**

Replace the WebSocket configured call example with:

```ts
const [error, socket, connection] = await chatSocket({
  query: { roomId: 'room-1' },
}).with({
  client,
  protocols: ['json'],
  beforeConnect: async () => {},
  reconnect: {
    attempts: 1,
  },
  heartbeat: {
    intervalMs: 30_000,
    message: () => ({
      type: 'ping',
    }),
  },
  queue: {
    maxSize: 100,
  },
  timeout: 10_000,
})
```

Replace the WebSocket second-stage config list with:

```md
第二段 WebSocket 配置：

1. `client?: Client`
2. `protocols?: readonly string[]`
3. `beforeConnect?: () => void | Promise<void>`
4. `reconnect?: WebSocketReconnectOptions`
5. `heartbeat?: WebSocketHeartbeatOptions`
6. `queue?: WebSocketQueueOptions`
7. `timeout?: number`
8. `abort?: AbortSignal`

`timeout` 与 `abort` 互斥。需要组合多个取消来源时，请自行构造组合后的 `AbortSignal` 并只传 `abort`。
```

- [ ] **Step 4: Search docs for stale request-level fetch and timeout+abort examples**

Run:

```bash
rg -n "fetch\?: typeof fetch|fetch,|abort: ac\.signal|timeout: 10_000" packages/core/design.md
```

Expected: no SSE request-level `fetch?: typeof fetch` remains; `timeout: 10_000` may remain in examples, but it must not appear in the same `.with({ ... })` block as `abort: ac.signal`.

- [ ] **Step 5: Check docs diff**

Run:

```bash
git diff -- packages/core/design.md
```

Expected: diff only updates HTTP/SSE/WebSocket `with` examples/config lists and cancellation/fetch boundary prose.

---

### Task 7: Full verification

**Files:**

- Verify changed files from Tasks 1-6.

- [ ] **Step 1: Run typecheck**

Run:

```bash
bun x vitest run --typecheck --config packages/core/vitest.config.typecheck.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused Node runtime tests**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts \
  packages/core/src/internal/abort.spec.ts \
  packages/core/src/http/http.error.spec.ts \
  packages/core/src/sse/sse.spec.ts \
  packages/core/src/web_socket/web_socket.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Run package Node test suite**

Run:

```bash
npm exec -- vitest run --config packages/core/vitest.config.node.ts packages/core/src
```

Expected: PASS. If unrelated pre-existing failures appear, record the failing test names and compare with current branch status before changing scope.

- [ ] **Step 4: Check git diff for accidental scope creep**

Run:

```bash
git diff --stat
git diff -- \
  packages/core/src/internal/abort.ts \
  packages/core/src/http/http.ts \
  packages/core/src/sse/sse.ts \
  packages/core/src/web_socket/web_socket.ts \
  packages/core/design.md
```

Expected: diff only covers existing abort helper additions, three `with` config types, early runtime checks, SSE client-only fetch, tests, and documentation.

- [ ] **Step 5: Report verification status**

Report:

```md
实现完成。
验证：

- typecheck: PASS
- focused node specs: PASS
- package node specs: PASS
  未提交 commit：用户未授权提交。
```

If any command fails, report the failing command and exact failing test names instead of marking the task complete.
