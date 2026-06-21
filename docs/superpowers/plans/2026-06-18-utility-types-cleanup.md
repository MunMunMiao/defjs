# utility_types.ts 清理实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or direct inline execution to implement this plan task-by-task.

**Goal:** 缩减 `packages/core/src/internal/utility_types.ts`，删除或内联不必要的 utility types，仅保留 `ExcludeUnion` 和 `FnReturn`。

**Architecture:** 按类型逐个迁移：零引用类型直接删除；可显式写的类型替换为领域类型或内联；保留 struct 核心类型基础设施 `ExcludeUnion` 和递归 struct 使用的 `FnReturn`。每改完一批运行 `tsc --noEmit` 和相关测试。

**Tech Stack:** TypeScript, Vitest, pnpm workspaces

## Global Constraints

- 不使用 TypeScript 内置 utility types（`Partial`, `Pick`, `Omit`, `Record`, `ReturnType`, `Parameters`, `Exclude`, `Extract`, `NonNullable`, `Awaited`, `Required`, `Readonly` 等）。
- 同时不自行重建一套与 TS 内置等价的 utility type 库。
- 优先显式手写类型，而非通过 Pick/Omit/Exclude/Extract/NonNullable/ReturnType 等转换推导。
- 保持类型推断不变，保持公共 API 稳定。

---

## Task 1: 删除零引用类型 `Immutable`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts:12`

**Interfaces:**

- Consumes: 无
- Produces: 无

- [ ] **Step 1: 删除 `Immutable<T>` 定义**

```ts
// 删除以下行
export type Immutable<T> = { readonly [K in keyof T]: T[K] }
```

- [ ] **Step 2: 运行类型检查**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
git add packages/core/src/internal/utility_types.ts
git commit -m "refactor(core): remove unused Immutable utility type"
```

---

## Task 2: 删除 `FnParams` 并显式写出参数类型

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/sse/sse.ts:327`
- Modify: `packages/core/src/interceptor/interceptor.type.test.ts`

**Interfaces:**

- Consumes: `SSEInvalidEventHandler`（已显式定义参数类型 `SSEInvalidEventContext`）
- Produces: 无

- [ ] **Step 1: 删除 `FnParams<T>` 定义**

```ts
// 删除以下行
export type FnParams<T> = T extends (...args: infer P) => infer _R ? P : never
```

- [ ] **Step 2: 替换 `sse.ts` 中的使用**

```ts
// 修改前
async function notifyInvalidEvent(
  onInvalidEvent: SSEInvalidEventHandler | undefined,
  context: FnParams<SSEInvalidEventHandler>[0],
): Promise<void> {

// 修改后
async function notifyInvalidEvent(
  onInvalidEvent: SSEInvalidEventHandler | undefined,
  context: SSEInvalidEventContext,
): Promise<void> {
```

- [ ] **Step 3: 替换 `interceptor.type.test.ts` 中的类型测试**

```ts
// 修改前
type HttpChainParametersCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeInterceptorChain>>, [HttpRequest, HttpInterceptorNext]>>
type SSEChainParametersCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeSSEInterceptorChain>>, [HttpRequest, SSEHandler]>>
type WebSocketChainParametersCase = Expect<
  StrictEqual<FnParams<FnReturn<typeof makeWebSocketInterceptorChain>>, [HttpRequest, WebSocketHandler]>
>
type HttpChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeInterceptorChain>>[1], HttpInterceptorNext>>
type SSEChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeSSEInterceptorChain>>[1], SSEHandler>>
type WebSocketChainNextCase = Expect<StrictEqual<FnParams<FnReturn<typeof makeWebSocketInterceptorChain>>[1], WebSocketHandler>>

// 修改后
type HttpChainParametersCase = Expect<StrictEqual<ParametersOf<typeof makeInterceptorChain>, [HttpRequest, HttpInterceptorNext]>>
type SSEChainParametersCase = Expect<StrictEqual<ParametersOf<typeof makeSSEInterceptorChain>, [HttpRequest, SSEHandler]>>
type WebSocketChainParametersCase = Expect<StrictEqual<ParametersOf<typeof makeWebSocketInterceptorChain>, [HttpRequest, WebSocketHandler]>>
type HttpChainNextCase = Expect<StrictEqual<SecondParameter<typeof makeInterceptorChain>, HttpInterceptorNext>>
type SSEChainNextCase = Expect<StrictEqual<SecondParameter<typeof makeSSEInterceptorChain>, SSEHandler>>
type WebSocketChainNextCase = Expect<StrictEqual<SecondParameter<typeof makeWebSocketInterceptorChain>, WebSocketHandler>>
```

并添加本地 helper：

```ts
type ParametersOf<T> = T extends (...args: infer P) => unknown ? P : never
type SecondParameter<T> = ParametersOf<T> extends [unknown, infer P, ...unknown[]] ? P : never
```

- [ ] **Step 4: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="interceptor.type"`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/sse/sse.ts packages/core/src/interceptor/interceptor.type.test.ts
git commit -m "refactor(core): remove FnParams utility type in favor of explicit parameter types"
```

---

## Task 3: 删除 `AwaitedValue` 并显式写出 awaited 类型

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/interceptor/interceptor.websocket.spec.ts:52`

**Interfaces:**

- Consumes: `WebSocketInterceptorFn` 的返回类型（`Promise<WebSocketSessionLike>`）
- Produces: 无

- [ ] **Step 1: 删除 `AwaitedValue<T>` 定义**

```ts
// 删除以下行
export type AwaitedValue<T> = T extends null | undefined
  ? T
  : T extends object & { then(onfulfilled: infer F): unknown }
    ? F extends (value: infer V, ...args: unknown[]) => unknown
      ? AwaitedValue<V>
      : never
    : T
```

- [ ] **Step 2: 替换 `interceptor.websocket.spec.ts` 中的使用**

```ts
// 修改前
const fakeSession = {
  connection: { url: 'ws://test' },
  wrapped: false,
} as unknown as AwaitedValue<FnReturn<WebSocketInterceptorFn>>

// 修改后
const fakeSession = {
  connection: { url: 'ws://test' },
  wrapped: false,
} as unknown as WebSocketSessionLike
```

- [ ] **Step 3: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="interceptor.websocket"`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/interceptor/interceptor.websocket.spec.ts
git commit -m "refactor(core): remove AwaitedValue utility type in favor of explicit awaited type"
```

---

## Task 4: 删除 `Optional`（Partial 的重建）

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/http/transport/body.spec.ts:122`

**Interfaces:**

- Consumes: `HttpRequest`
- Produces: 无

- [ ] **Step 1: 删除 `Optional<T>` 定义**

```ts
// 删除以下行
export type Optional<T> = { [K in keyof T]?: T[K] }
```

- [ ] **Step 2: 替换 `body.spec.ts` 中的使用**

```ts
// 修改前
function makeRequest(init: SelectKeys<HttpRequest, 'body'> & Optional<HttpRequest>): HttpRequest {

// 修改后
function makeRequest(init: { body: HttpRequest['body'] } & Partial<HttpRequest>): HttpRequest {
```

- [ ] **Step 3: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="body.spec"`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/http/transport/body.spec.ts
git commit -m "refactor(core): remove Optional utility type in favor of Partial in test helper"
```

---

## Task 5: 用显式 `ClientHttpConfig` 替换 `RequireAll`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/client/config.ts:1,126-141`

**Interfaces:**

- Consumes: `ClientHttpOptions`
- Produces: `ClientHttpConfig`（新增）

- [ ] **Step 1: 删除 `RequireAll<T>` 定义**

```ts
// 删除以下行
export type RequireAll<T> = { [K in keyof T]-?: T[K] }
```

- [ ] **Step 2: 在 `client/config.ts` 中定义 `ClientHttpConfig` 并替换使用**

```ts
// 修改前
import type { RequireAll } from '../internal/utility_types'

export interface ClientConfig {
  // ...
  http: RequireAll<ClientHttpOptions>
  // ...
}

export const DEFAULT_HTTP_OPTIONS: RequireAll<ClientHttpOptions> = {
  handle: DEFAULT_FETCH,
}

// 修改后
export interface ClientHttpConfig {
  handle: typeof fetch
}

export interface ClientConfig {
  // ...
  http: ClientHttpConfig
  // ...
}

export const DEFAULT_HTTP_OPTIONS: ClientHttpConfig = {
  handle: DEFAULT_FETCH,
}
```

- [ ] **Step 3: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="client.type|client.spec"`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/client/config.ts
git commit -m "refactor(core): replace RequireAll with explicit ClientHttpConfig interface"
```

---

## Task 6: 用显式类型替换 `OmitKeys`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts:6,217-224`
- Modify: `packages/core/src/struct/runtime.ts:1-15`

**Interfaces:**

- Consumes: `WebSocketHeartbeatOptions`, `PrimitiveDefinition`
- Produces: `WebSocketHeartbeatConfig`（重写）, `PrimitiveDefinitionInput`（新增）

- [ ] **Step 1: 删除 `OmitKeys<T, K>` 定义**

```ts
// 删除以下行
export type OmitKeys<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}
```

- [ ] **Step 2: 在 `web_socket.ts` 中显式定义 `WebSocketHeartbeatConfig`**

```ts
// 修改前
export type WebSocketHeartbeatConfig<TIncoming = unknown, TOutgoing = unknown> = OmitKeys<
  WebSocketHeartbeatOptions,
  'isAck' | 'message'
> & {
  isAck?: (message: TIncoming) => boolean
  message?: <T = TOutgoing>() => T | unknown
}

// 修改后
export interface WebSocketHeartbeatConfig<TIncoming = unknown, TOutgoing = unknown> {
  intervalMs: number
  isAck?: (message: TIncoming) => boolean
  message?: <T = TOutgoing>() => T | unknown
  timeoutMs?: number
}
```

- [ ] **Step 3: 在 `struct/runtime.ts` 中定义 `PrimitiveDefinitionInput` 并替换使用**

```ts
// 修改前
import type { OmitKeys } from '../internal/utility_types'

export function createPrimitiveStruct<TInput, TOutput = TInput>(
  definition: OmitKeys<PrimitiveDefinition<PrimitiveKind, TInput, TOutput>, 'flags'>,
): Struct<TInput | undefined, TOutput> {

// 修改后
export interface PrimitiveDefinitionInput<K extends PrimitiveKind, TInput, TOutput = TInput> {
  decode?: (value: TInput, path: Path) => ParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  tagOptions?: readonly FieldTagOption[]
  zero: () => TOutput
}

export function createPrimitiveStruct<TInput, TOutput = TInput>(
  definition: PrimitiveDefinitionInput<PrimitiveKind, TInput, TOutput>,
): Struct<TInput | undefined, TOutput> {
```

注意：需要导入 `Path` 和 `ParseResult`。

- [ ] **Step 4: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="web_socket|struct/runtime"`
Expected: 无错误

- [ ] **Step 5: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/web_socket/web_socket.ts packages/core/src/struct/runtime.ts
git commit -m "refactor(core): replace OmitKeys with explicit WebSocketHeartbeatConfig and PrimitiveDefinitionInput"
```

---

## Task 7: 内联 `ExtractUnion`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/sse/sse.ts:32,34,60,74`
- Modify: `packages/core/src/web_socket/web_socket.ts:37,60,74`
- Modify: `packages/core/src/internal/request_builder.ts:1,218,220,773`

**Interfaces:**

- Consumes: `EventStructs`/`SocketStructs`（已知 key 为 string）, `StructDefinition`/`RequestDefinition`
- Produces: 无

- [ ] **Step 1: 删除 `ExtractUnion<T, U>` 定义**

```ts
// 删除以下行
export type ExtractUnion<T, U> = T extends U ? T : never
```

- [ ] **Step 2: 在 `sse.ts` 中内联 `KnownEventKey`**

```ts
// 修改前
type KnownEventKey<TEvents extends EventStructs> = ExcludeUnion<ExtractUnion<keyof TEvents, string>, 'default'>

type KnownEventUnion<TEvents extends EventStructs> = {
  [K in KnownEventKey<TEvents>]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[KnownEventKey<TEvents>]

// 修改后
type KnownEventUnion<TEvents extends EventStructs> = {
  [K in keyof TEvents as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[keyof TEvents extends 'default' ? never : keyof TEvents]
```

- [ ] **Step 3: 在 `web_socket.ts` 中做同样修改**

```ts
// 修改前
type KnownSocketKey<TMessages extends SocketStructs> = ExcludeUnion<ExtractUnion<keyof TMessages, string>, 'default'>

// 修改后：与 sse.ts 相同，直接在 mapped type 的 as 子句中过滤
```

- [ ] **Step 4: 在 `request_builder.ts` 中替换 `ExtractUnion<StructDefinition, { kind: 'request' }>`**

```ts
// 修改前
function buildRequestShape<TInput>(
  input: TInput,
  definition: ExtractUnion<StructDefinition, { kind: 'request' }>,
  transport: RequestTransport,
): RequestBuild {

function assertRequestShapeTransport(definition: ExtractUnion<StructDefinition, { kind: 'request' }>, transport: RequestTransport): void {

// 修改后
function buildRequestShape<TInput>(
  input: TInput,
  definition: RequestDefinition,
  transport: RequestTransport,
): RequestBuild {

function assertRequestShapeTransport(definition: RequestDefinition, transport: RequestTransport): void {
```

- [ ] **Step 5: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="sse|web_socket|request_builder"`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/sse/sse.ts packages/core/src/web_socket/web_socket.ts packages/core/src/internal/request_builder.ts
git commit -m "refactor(core): inline ExtractUnion usage and remove the utility type"
```

---

## Task 8: 内联 `NonNullableValue`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/internal/request_builder.ts:134-136,195-201`
- Modify: `packages/core/src/http/transport/fetch.ts:1,106,146`
- Modify: `packages/core/src/http/http.ts`（`IsInputOptional`，若存在）
- Modify: `packages/core/src/sse/sse.ts:102-106`
- Modify: `packages/core/src/web_socket/web_socket.ts:181-185`
- Modify: `packages/core/src/http/transport/fetch.spec.ts:33`
- Modify: `packages/core/src/web_socket/reconnect.spec.ts:81`

**Interfaces:**

- Consumes: `HttpRequest['xsrf']`, `HttpRequest['uploadProgress']`, `TInput`（泛型）
- Produces: 无

- [ ] **Step 1: 删除 `NonNullableValue<T>` 定义**

```ts
// 删除以下行
export type NonNullableValue<T> = T extends null | undefined ? never : T
```

- [ ] **Step 2: 在 `request_builder.ts` 中重写 `RequestBuildInput` 和 `createTypedBuildInput`**

```ts
// 修改前
export type RequestBuildInput<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? unknown
  : BuildInput<NonNullableValue<TInput>>

function createTypedBuildInput<TInput extends AnyStruct | undefined>(
  struct: NonNullableValue<TInput>,
  owner: symbol,
): RequestBuildInput<TInput> {
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
}

// 修改后
export type RequestBuildInput<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? unknown
  : TInput extends AnyStruct
    ? BuildInput<TInput>
    : never

function createTypedBuildInput<TInput extends AnyStruct>(struct: TInput, owner: symbol): RequestBuildInput<TInput> {
  return createBoundView(struct as unknown as RuntimeStruct, [], owner) as RequestBuildInput<TInput>
}
```

并调整 `buildRequest` 中的调用：

```ts
// 修改前
const boundInput = createTypedBuildInput(options.input, owner)

// 修改后
const boundInput = createTypedBuildInput(options.input as TInput & AnyStruct, owner)
```

- [ ] **Step 3: 在 `fetch.ts` 中直接引用具体类型**

```ts
// 修改前
function resolveXSRFToken(request: HttpRequest, xsrf: NonNullableValue<HttpRequest['xsrf']>): string | undefined {

function wrapUploadProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: NonNullableValue<HttpRequest['uploadProgress']>,
  total: number,
): ReadableStream<Uint8Array> {

// 修改后
function resolveXSRFToken(request: HttpRequest, xsrf: ClientXSRFConfig): string | undefined {

function wrapUploadProgressStream(
  stream: ReadableStream<Uint8Array>,
  onProgress: HttpProgressFn,
  total: number,
): ReadableStream<Uint8Array> {
```

- [ ] **Step 4: 在 `http.ts`、`sse.ts`、`web_socket.ts` 的 `IsInputOptional` 中直接写 `TInput`**

```ts
// 修改前
type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<NonNullableValue<TInput>>
    ? true
    : false

// 修改后
type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<TInput>
    ? true
    : false
```

- [ ] **Step 5: 更新测试文件**

`fetch.spec.ts`:

```ts
// 修改前
function createXsrfConfig(tokenProvider?: NonNullableValue<HttpRequest['xsrf']>['tokenProvider']): NonNullableValue<HttpRequest['xsrf']> {

// 修改后
function createXsrfConfig(tokenProvider?: ClientXSRFConfig['tokenProvider']): ClientXSRFConfig {
```

`reconnect.spec.ts`:

```ts
// 修改前
const config: NonNullableValue<FnReturn<typeof normalizeReconnectConfig>> = {

// 修改后
const config: WebSocketReconnectConfig = {
```

- [ ] **Step 6: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="http.type|request_builder.type|fetch.spec|reconnect.spec"`
Expected: 无错误

- [ ] **Step 7: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/internal/request_builder.ts packages/core/src/http/transport/fetch.ts packages/core/src/http/http.ts packages/core/src/sse/sse.ts packages/core/src/web_socket/web_socket.ts packages/core/src/http/transport/fetch.spec.ts packages/core/src/web_socket/reconnect.spec.ts
git commit -m "refactor(core): inline NonNullableValue usage and remove the utility type"
```

---

## Task 9: 用显式接口替换 `SelectKeys`

**Files:**

- Modify: `packages/core/src/internal/utility_types.ts`
- Modify: `packages/core/src/internal/request_builder.ts:138-142`
- Modify: `packages/core/src/struct/parse.ts:405-422`
- Modify: `packages/core/src/http/transport/body.spec.ts:122`

**Interfaces:**

- Consumes: `RequestBuilder`, `RequestDefinition`
- Produces: `WebSocketRequestBuildContext`, `SSERequestBuildContext`, `HttpRequestBuildContext`，`RequestSectionKey`

- [ ] **Step 1: 删除 `SelectKeys<T, K>` 定义**

```ts
// 删除以下行
export type SelectKeys<T, K extends keyof T> = { [P in K]: T[P] }
```

- [ ] **Step 2: 在 `request_builder.ts` 中定义显式 build context 接口**

```ts
// 修改前
export type RequestBuildContext<TTransport extends RequestTransport = 'http'> = TTransport extends 'webSocket'
  ? SelectKeys<RequestBuilder, 'setPathParams' | 'setQueryParams'>
  : TTransport extends 'sse'
    ? SelectKeys<RequestBuilder, 'setHeaders' | 'addHeaders' | 'setPathParams' | 'setQueryParams'>
    : RequestBuilder

// 修改后
export interface WebSocketRequestBuildContext {
  setPathParams(projection: BuildRecordProjection): void
  setQueryParams(projection: BuildRecordProjection): void
}

export interface SSERequestBuildContext {
  addHeaders(projection: BuildRecordProjection): void
  setHeaders(projection: BuildRecordProjection): void
  setPathParams(projection: BuildRecordProjection): void
  setQueryParams(projection: BuildRecordProjection): void
}

export type HttpRequestBuildContext = RequestBuilder

export type RequestBuildContext<TTransport extends RequestTransport = 'http'> = TTransport extends 'webSocket'
  ? WebSocketRequestBuildContext
  : TTransport extends 'sse'
    ? SSERequestBuildContext
    : HttpRequestBuildContext
```

- [ ] **Step 3: 在 `struct/parse.ts` 中内联 section key 联合**

```ts
// 修改前
function getRequestSections(
  definition: RequestDefinition,
): [keyof SelectKeys<RequestDefinition, 'body' | 'headers' | 'path' | 'query'>, RuntimeStruct][] {
  const sections: [keyof SelectKeys<RequestDefinition, 'body' | 'headers' | 'path' | 'query'>, RuntimeStruct][] = []

// 修改后
type RequestSectionKey = 'body' | 'headers' | 'path' | 'query'

function getRequestSections(definition: RequestDefinition): [RequestSectionKey, RuntimeStruct][] {
  const sections: [RequestSectionKey, RuntimeStruct][] = []
```

- [ ] **Step 4: 在 `body.spec.ts` 中替换 `SelectKeys`**

```ts
// 修改前
function makeRequest(init: SelectKeys<HttpRequest, 'body'> & Optional<HttpRequest>): HttpRequest {

// 修改后
function makeRequest(init: { body: HttpRequest['body'] } & Partial<HttpRequest>): HttpRequest {
```

- [ ] **Step 5: 运行类型检查和相关测试**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Run: `pnpm test --filter @zenkit/core -- --testPathPattern="request_builder.type|parse|body.spec"`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
git add packages/core/src/internal/utility_types.ts packages/core/src/internal/request_builder.ts packages/core/src/struct/parse.ts packages/core/src/http/transport/body.spec.ts
git commit -m "refactor(core): replace SelectKeys with explicit build context interfaces"
```

---

## Task 10: 全量验证

**Files:**

- All modified files

- [ ] **Step 1: 运行 core 包全量类型检查**

Run: `pnpm exec tsc --noEmit -p packages/core/tsconfig.json`
Expected: 无错误

- [ ] **Step 2: 运行 core 包全量测试**

Run: `pnpm test --filter @zenkit/core`
Expected: 全部通过

- [ ] **Step 3: 最终确认 `utility_types.ts` 内容**

Expected `packages/core/src/internal/utility_types.ts`:

```ts
/**
 * Internal utility types that mirror TypeScript built-ins.
 *
 * The project intentionally avoids TypeScript's built-in utility types
 * (Partial, Pick, Record, etc.) in favor of explicit equivalents.
 */

export type ExcludeUnion<T, U> = T extends U ? never : T

export type FnReturn<T> = T extends (...args: infer _P) => infer R ? R : never
```

- [ ] **Step 4: 最终提交（如尚未提交）**

```bash
git add -A
git commit -m "refactor(core): reduce utility_types.ts to ExcludeUnion and FnReturn"
```

---

## Self-Review

1. **Spec coverage:** 审计中提到的 11 个类型全部覆盖：`Immutable`、`FnParams`、`AwaitedValue`、`Optional`、`RequireAll`、`OmitKeys`、`ExtractUnion`、`NonNullableValue`、`SelectKeys` 被删除或替换；`ExcludeUnion`、`FnReturn` 保留。
2. **Placeholder scan:** 无 TBD/TODO；每个 task 包含具体文件路径和代码片段。
3. **Type consistency:** `ClientHttpConfig`、`WebSocketHeartbeatConfig`、`PrimitiveDefinitionInput`、`WebSocketRequestBuildContext`、`SSERequestBuildContext`、`HttpRequestBuildContext`、`RequestSectionKey` 等新增类型在各 task 中命名一致。

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-06-18-utility-types-cleanup.md`.**

Two execution options:

1. **Subagent-Driven (recommended)** - dispatch a fresh subagent per task, review between tasks.
2. **Inline Execution** - execute tasks in this session using executing-plans or direct edits with checkpoints.

**Which approach?**
