# packages/core 类型内联重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `packages/core` 中“为了抽离而抽离”的类型别名和接口显式内联到使用处，减少不必要的抽象层，同时不改变类型推理结果。

**Architecture:** 按依赖链和模块边界分五波实施。每一波只修改一组高内聚的类型，修改后独立跑类型检查和单元测试，确认通过后再进入下一波。Public API 导出类型的移除放在最后一波，作为 breaking change 集中处理。

**Tech Stack:** TypeScript 5.x, Vitest, pnpm monorepo, `packages/core`

## Global Constraints

- 每波修改后必须执行：
  - `npx tsc --noEmit -p packages/core/tsconfig.json`
  - `pnpm run test:type`（即 `vitest run --typecheck`）
  - 受影响模块的单元测试
- 全部五波完成后必须执行：`pnpm run test`
- 每波独立 commit，commit message 格式：`refactor(core): inline <wave summary>`
- 不修改运行时行为；只修改类型定义和类型注解。
- 保留真正的共享工具类型和领域抽象类型：`ExcludeUnion`、`FnReturn`、`WebSocketState`、`EventSchemas`、`SocketSchemas`。
- 接受 breaking change：被 `client/public_api.ts` 导出的部分类型将在第五波移除。

---

## Task 1: Wave 1 — Zero-risk cleanup

**Files:**

- Modify: `packages/core/src/client/command.ts`
- Modify: `packages/core/src/internal/request_builder.ts`
- Modify: `packages/core/src/web_socket/queue.ts`
- Modify: `packages/core/src/web_socket/reconnect.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/internal/http_response.ts`
- Modify: `packages/core/src/struct/codec/query.ts`
- Modify: `packages/core/src/struct/encode.ts`
- Modify: `packages/core/src/struct/codec/common.ts`
- Modify: `packages/core/src/struct/codec/urlencoded.ts`
- Modify: `packages/core/src/http/transport/fetch.ts`

**Interfaces:**

- Consumes: 现有 `WebSocketQueueOptions`、`WebSocketReconnectOptions`、`RequestBuilder`、`HttpResponse`、`RequestBuildValue`、`RuntimeSchema` 等。
- Produces: 移除 `CommandEntry`、`HttpRequestBuildContext`、`WebSocketQueueConfig`、`WebSocketReconnectConfig`、`HttpResponseBody`、`ScalarRequestBuildValue`、`EncodeChild`、`TaggedObject`、`TagObjectOptions`、`SearchParamScalar`、`RequestInitWithDuplex`（fetch.ts）这些别名；使用处直接写原始类型。

- [ ] **Step 1: Verify baseline tests pass**

Run:

```bash
pnpm run test:type
npx tsc --noEmit -p packages/core/tsconfig.json
```

Expected: both pass (the branch may have pre-existing failures unrelated to these types; if so, note them and ensure they do not worsen).

- [ ] **Step 2: Remove dead `CommandEntry` and update related imports**

In `packages/core/src/client/command.ts`, delete line 34:

```ts
export type CommandEntry = HttpCommandEntry | EventStreamCommandEntry | WebSocketCommandEntry
```

No other changes are needed because `CommandEntry` is not referenced anywhere.

- [ ] **Step 3: Inline `HttpRequestBuildContext` in request_builder.ts**

In `packages/core/src/internal/request_builder.ts`, delete line 137:

```ts
export type HttpRequestBuildContext = RequestBuilder
```

Then replace the fallback branch of `RequestBuildContext` (lines 152-156) with:

```ts
export type RequestBuildContext<TTransport extends RequestTransport = 'http'> = TTransport extends 'webSocket'
  ? WebSocketRequestBuildContext
  : TTransport extends 'sse'
    ? SSERequestBuildContext
    : RequestBuilder
```

No imports change because `RequestBuilder` is already defined in the same file.

- [ ] **Step 4: Inline `WebSocketQueueConfig` and update imports**

In `packages/core/src/web_socket/queue.ts`, change the import on line 1 from:

```ts
import type { WebSocketQueueOptions } from '../client/config'
```

to the same (already correct), and keep the function signature:

```ts
export function createSendQueue(config?: WebSocketQueueOptions): SendQueue
```

Delete line 3 (the alias definition):

```ts
export type WebSocketQueueConfig = WebSocketQueueOptions
```

In `packages/core/src/web_socket/web_socket.ts`, change line 3 from:

```ts
import type { ClientConfig, WebSocketBeforeConnect, WebSocketReconnectOptions, WebSocketQueueOptions } from '../client/config'
```

to the same (already correct). Keep `UseWebSocketBaseConfig.queue` as `WebSocketQueueOptions` (line 151) and change the re-export on line 216 from:

```ts
export type { WebSocketReconnectOptions }
```

to:

```ts
export type { WebSocketQueueOptions, WebSocketReconnectOptions }
```

Remove any separate `WebSocketQueueConfig` re-export if present (there is none).

- [ ] **Step 5: Inline `WebSocketReconnectConfig` and update imports**

In `packages/core/src/web_socket/reconnect.ts`, change line 13 from:

```ts
export function normalizeReconnectConfig(config: WebSocketReconnectOptions | undefined): NormalizedReconnectConfig | undefined
```

to the same (already correct). Delete line 4:

```ts
export type WebSocketReconnectConfig = WebSocketReconnectOptions
```

In `packages/core/src/web_socket/web_socket.ts`, keep `UseWebSocketBaseConfig.reconnect` as `WebSocketReconnectOptions` (line 152). The re-export on line 216 already exports `WebSocketReconnectOptions`.

- [ ] **Step 6: Inline `HttpResponseBody` as `unknown`**

In `packages/core/src/internal/http_response.ts`, delete line 1:

```ts
export type HttpResponseBody = unknown
```

Then update the import in `packages/core/src/http/transport/fetch.ts` (line 5) from:

```ts
import type { HttpResponse, HttpResponseBody } from '../../internal/http_response'
```

to:

```ts
import type { HttpResponse } from '../../internal/http_response'
```

And change line 19 from:

```ts
export function isReadableStreamBody(body: HttpRequest['body'] | FnReturn<typeof serializeHttpBody>): body is ReadableStream<Uint8Array> {
```

to:

```ts
export function isReadableStreamBody(body: HttpRequest['body'] | unknown): body is ReadableStream<Uint8Array> {
```

Check `packages/core/src/handler/fetch/fetch.ts` and `packages/core/src/handler/xhr/xhr.ts`; if they import `HttpResponseBody`, replace usages with `unknown` and remove the import. (They currently use it only as a generic argument to `HttpResponse`.)

- [ ] **Step 7: Inline `ScalarRequestBuildValue` in query.ts**

In `packages/core/src/struct/codec/query.ts`, delete line 9:

```ts
type ScalarRequestBuildValue = boolean | null | number | string
```

Change line 70 from:

```ts
function normalizeScalarRecordValue(label: string, key: string, value: unknown): boolean | null | number | string {
```

to the same (already correct). The type is already inline; just remove the alias.

- [ ] **Step 8: Inline `EncodeChild` in encode.ts**

In `packages/core/src/struct/encode.ts`, delete line 6:

```ts
export type EncodeChild = (schema: RuntimeSchema, value: unknown) => unknown
```

Change line 9 from:

```ts
  encodeObject?: (schema: RuntimeSchema, value: { [key: string]: unknown }, encodeChild: EncodeChild) => unknown
```

to:

```ts
  encodeObject?: (schema: RuntimeSchema, value: { [key: string]: unknown }, encodeChild: (schema: RuntimeSchema, value: unknown) => unknown) => unknown
```

- [ ] **Step 9: Inline `TaggedObject` and `TagObjectOptions` in common.ts**

In `packages/core/src/struct/codec/common.ts`, delete lines 9-13:

```ts
export type TaggedObject = { [key: string]: unknown }

export type TagObjectOptions = {
  requireTag?: boolean
}
```

Replace every `TaggedObject` in the file with `{ [key: string]: unknown }`. There are usages on lines 26, 27, 50, 55, 66, 71, 97, 169. For example, line 26 becomes:

```ts
const output: { [key: string]: unknown } = Object.create(null)
```

Replace every `TagObjectOptions` with `{ requireTag?: boolean }`. There are usages on lines 18, 35, 53, 65, 80, 106, 139, 143, 163, 207. For example, line 18 becomes:

```ts
options: { requireTag?: boolean } = {},
```

- [ ] **Step 10: Inline `SearchParamScalar` in urlencoded.ts**

In `packages/core/src/struct/codec/urlencoded.ts`, delete line 6:

```ts
export type SearchParamScalar = boolean | null | number | string
```

Change the signature of `isSearchParamScalar` and `stringifySearchParamScalar` to use `boolean | null | number | string` directly. Current definitions are around lines 40-60. For example:

```ts
export function isSearchParamScalar(value: unknown): value is boolean | null | number | string
export function stringifySearchParamScalar(value: boolean | null | number | string): string
```

Check `multipart.ts` and `query.ts` for direct references to `SearchParamScalar`; they should not have any because they only import the functions. Remove any direct imports of `SearchParamScalar` if present.

- [ ] **Step 11: Inline `RequestInitWithDuplex` in fetch.ts**

In `packages/core/src/http/transport/fetch.ts`, delete lines 11-13:

```ts
type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}
```

Change line 45 from:

```ts
    } as RequestInitWithDuplex)
```

to:

```ts
    } as RequestInit & { duplex?: 'half' })
```

Change line 19's `isReadableStreamBody` parameter type as already done in Step 6. Also change line 11's `isReadableStreamBody` return type if it references `FnReturn<typeof serializeHttpBody>`; replace with `unknown`.

- [ ] **Step 12: Run Wave 1 verification**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm run test:type
npx vitest run src/client src/internal src/web_socket src/struct src/http
```

Expected: all pass.

- [ ] **Step 13: Commit Wave 1**

```bash
git add packages/core/src/client/command.ts \
  packages/core/src/internal/request_builder.ts \
  packages/core/src/web_socket/queue.ts \
  packages/core/src/web_socket/reconnect.ts \
  packages/core/src/web_socket/web_socket.ts \
  packages/core/src/internal/http_response.ts \
  packages/core/src/struct/codec/query.ts \
  packages/core/src/struct/encode.ts \
  packages/core/src/struct/codec/common.ts \
  packages/core/src/struct/codec/urlencoded.ts \
  packages/core/src/http/transport/fetch.ts
git commit -m "refactor(core): inline zero-risk type aliases (wave 1)"
```

---

## Task 2: Wave 2 — HTTP derivation chain inlining

**Files:**

- Modify: `packages/core/src/http/http.ts`

**Interfaces:**

- Consumes: existing `UseCancellationConfig`, `HttpContext`, `HttpProgressFn`, `AnyStruct`, `Infer`, `RequestOutputShape`, `RequestBuildHandler`, `HttpResponseType`.
- Produces: `UseRequestConfig` directly contains base fields; `RequestSuccessData` and `RequestErrorData` contain inlined derivation; `RequestDefinition` and `defineRequest` overloads directly express the conditional branches.

- [ ] **Step 1: Inline `UseRequestBaseConfig` into `UseRequestConfig`**

In `packages/core/src/http/http.ts`, replace lines 23-29:

```ts
interface UseRequestBaseConfig {
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
}

export type UseRequestConfig = UseRequestBaseConfig & UseCancellationConfig
```

with:

```ts
export type UseRequestConfig = {
  context?: HttpContext
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
} & UseCancellationConfig
```

- [ ] **Step 2: Inline `ExpandStatus` into `OutputPairs`**

Replace lines 45-57:

```ts
type ExpandStatus<T> = T extends readonly (infer U extends number)[] ? U : T extends number ? T : never

type OutputPairs<TOutput extends RequestOutputShape> = TOutput extends readonly (infer TItem)[]
  ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
    ? { body: TBody; status: ExpandStatus<TStatus> }
    : never
  : {
      [K in keyof TOutput]: K extends `${infer TStatus extends number}`
        ? TOutput[K] extends AnyStruct
          ? { body: TOutput[K]; status: TStatus }
          : never
        : never
    }[keyof TOutput]
```

with:

```ts
type OutputPairs<TOutput extends RequestOutputShape> = TOutput extends readonly (infer TItem)[]
  ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
    ? { body: TBody; status: TStatus extends readonly (infer U extends number)[] ? U : TStatus extends number ? TStatus : never }
    : never
  : {
      [K in keyof TOutput]: K extends `${infer TStatus extends number}`
        ? TOutput[K] extends AnyStruct
          ? { body: TOutput[K]; status: TStatus }
          : never
        : never
    }[keyof TOutput]
```

- [ ] **Step 3: Inline `OutputPairs` into `SuccessSchemaOf` and `ErrorSchemaOf`**

Replace lines 59-75 with two self-contained types. The new `SuccessSchemaOf` becomes:

```ts
type SuccessSchemaOf<TOutput extends RequestOutputShape> = (
  TOutput extends readonly (infer TItem)[]
    ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
      ? { body: TBody; status: TStatus extends readonly (infer U extends number)[] ? U : TStatus extends number ? TStatus : never }
      : never
    : {
        [K in keyof TOutput]: K extends `${infer TStatus extends number}`
          ? TOutput[K] extends AnyStruct
            ? { body: TOutput[K]; status: TStatus }
            : never
          : never
      }[keyof TOutput]
) extends infer TPair
  ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
    ? `${TStatus}` extends `2${string}`
      ? TBody
      : never
    : never
  : never
```

`ErrorSchemaOf` mirrors the above, with the success branch returning `never` and the error branch returning `TBody`.

- [ ] **Step 4: Inline `SuccessSchemaOf` and `ErrorSchemaOf` into `RequestSuccessData` and `RequestErrorData`**

Replace lines 77-87 with inlined derivations. For example, `RequestSuccessData` becomes:

```ts
export type RequestSuccessData<TOutput extends RequestOutputShape | undefined> = [TOutput] extends [undefined]
  ? undefined
  : [
        (
          NonNullable<TOutput> extends readonly (infer TItem)[]
            ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
              ? { body: TBody; status: TStatus extends readonly (infer U extends number)[] ? U : TStatus extends number ? TStatus : never }
              : never
            : {
                [K in keyof NonNullable<TOutput>]: K extends `${infer TStatus extends number}`
                  ? NonNullable<TOutput>[K] extends AnyStruct
                    ? { body: NonNullable<TOutput>[K]; status: TStatus }
                    : never
                  : never
              }[keyof NonNullable<TOutput>]
        ) extends infer TPair
          ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
            ? `${TStatus}` extends `2${string}`
              ? TBody
              : never
            : never
          : never,
      ] extends [never]
    ? unknown
    : Infer<
        (
          NonNullable<TOutput> extends readonly (infer TItem)[]
            ? TItem extends { body: infer TBody extends AnyStruct; status: infer TStatus }
              ? { body: TBody; status: TStatus extends readonly (infer U extends number)[] ? U : TStatus extends number ? TStatus : never }
              : never
            : {
                [K in keyof NonNullable<TOutput>]: K extends `${infer TStatus extends number}`
                  ? NonNullable<TOutput>[K] extends AnyStruct
                    ? { body: NonNullable<TOutput>[K]; status: TStatus }
                    : never
                  : never
              }[keyof NonNullable<TOutput>]
        ) extends infer TPair
          ? TPair extends { body: infer TBody extends AnyStruct; status: infer TStatus extends number }
            ? `${TStatus}` extends `2${string}`
              ? TBody
              : never
            : never
          : never
      >
```

`RequestErrorData` mirrors the above for non-2xx status codes. Add a concise comment above each explaining the derivation intent.

- [ ] **Step 5: Inline `RequestDefinitionBase` and branch types**

Replace lines 89-115 with a single `RequestDefinition` type and update `defineRequest` overloads. The new `RequestDefinition` directly expresses the conditional:

```ts
export type RequestDefinition<
  TInput extends AnyStruct | undefined = undefined,
  TOutput extends RequestOutputShape | undefined = undefined,
> =
  | {
      method: string
      output?: TOutput
      path: string
      responseType?: HttpResponseType
      build?: never
      input?: TInput
    }
  | (TInput extends AnyStruct
      ? {
          method: string
          output?: TOutput
          path: string
          responseType?: HttpResponseType
          build: RequestBuildHandler<TInput>
          input: TInput
        }
      : never)
```

Update the two `defineRequest` overloads to use this unified type directly. The implementation signature on line 133 can remain as `RequestDefinition<TInput, TOutput>`.

- [ ] **Step 6: Inline `IsInputOptional` into `RequestCommandBuilder`**

Delete lines 121-125:

```ts
type IsInputOptional<TInput extends AnyStruct | undefined> = [TInput] extends [undefined]
  ? true
  : {} extends EndpointInput<TInput>
    ? true
    : false
```

Replace line 40-43:

```ts
export type RequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> =
  IsInputOptional<TInput> extends true
    ? (input?: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
    : (input: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
```

with:

```ts
export type RequestCommandBuilder<TInput extends AnyStruct | undefined, TOutput extends RequestOutputShape | undefined> = [TInput] extends [
  undefined,
]
  ? (input?: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
  : {} extends EndpointInput<TInput>
    ? (input?: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
    : (input: EndpointInput<TInput>) => HttpCommand<TInput, TOutput>
```

- [ ] **Step 7: Run Wave 2 verification**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm run test:type
npx vitest run src/http
```

Expected: all pass.

- [ ] **Step 8: Commit Wave 2**

```bash
git add packages/core/src/http/http.ts
git commit -m "refactor(core): inline HTTP derivation chain types (wave 2)"
```

---

## Task 3: Wave 3 — SSE / WebSocket config chain inlining

**Files:**

- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/sse/transport/event_stream.ts`

**Interfaces:**

- Consumes: existing `UseCancellationConfig`, `HttpContext`, `ExcludeUnion`, `AnyStruct`, `Infer`, `EndpointInput`, `RequestBuildHandler`.
- Produces: `EventStreamExecuteOptions` is fully expanded; `KnownEventKey` / `KnownSocketKey` are removed in favor of `as K extends 'default' ? never : K`; `RequestInitWithDuplex` in event_stream.ts is inlined.

- [ ] **Step 1: Inline `UseEventStreamConfig` into `EventStreamExecuteOptions`**

In `packages/core/src/sse/sse.ts`, replace lines 24-28 and 115:

```ts
interface UseEventStreamBaseConfig {
  context?: HttpContext
}

export type UseEventStreamConfig = UseEventStreamBaseConfig & UseCancellationConfig
```

with:

```ts
interface UseEventStreamBaseConfig {
  context?: HttpContext
}
```

And replace line 115:

```ts
export type EventStreamExecuteOptions = UseEventStreamConfig & { signal?: AbortSignal }
```

with:

```ts
export type EventStreamExecuteOptions = UseEventStreamBaseConfig & UseCancellationConfig & { signal?: AbortSignal }
```

- [ ] **Step 2: Remove `KnownEventKey` and use mapped key filtering**

Replace lines 32-41:

```ts
type KnownEventKey<TEvents extends EventSchemas> = ExcludeUnion<keyof TEvents & string, 'default'>

type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in keyof TEvents & string as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[KnownEventKey<TEvents>]
```

with:

```ts
type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in keyof TEvents & string as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[keyof TEvents & string as keyof TEvents & string extends 'default' ? never : keyof TEvents & string]
```

Wait — using `as` in the index access key is awkward. Instead, keep the mapping producing a union directly:

```ts
type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in keyof TEvents & string as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[keyof TEvents & string as keyof TEvents & string extends 'default' ? never : keyof TEvents & string]
```

Better: since the mapped type already filters `'default'`, the index key can simply be `keyof TEvents & string` and TypeScript will only include non-default keys because the other keys map to `never` and are filtered. So use:

```ts
type KnownEventUnion<TEvents extends EventSchemas> = {
  [K in keyof TEvents & string as K extends 'default' ? never : K]: {
    data: Infer<TEvents[K]>
    event: K
    id?: string
    retry?: number
  }
}[keyof TEvents & string]
```

Verify with type tests that this produces the same union.

- [ ] **Step 3: Remove `KnownSocketKey` and use mapped key filtering**

In `packages/core/src/web_socket/web_socket.ts`, replace lines 57-65 similarly:

```ts
type KnownIncomingSocketUnion<TIncoming extends SocketSchemas> = {
  [K in keyof TIncoming & string as K extends 'default' ? never : K]: NormalizeSocketMessage<K, Infer<TIncoming[K]>>
}[keyof TIncoming & string]

type KnownOutgoingSocketUnion<TOutgoing extends SocketSchemas> = {
  [K in keyof TOutgoing & string as K extends 'default' ? never : K]: SocketSendMessage<K, EndpointInput<TOutgoing[K]>>
}[keyof TOutgoing & string]
```

Remove the `KnownSocketKey` type definition.

- [ ] **Step 4: Inline `RequestInitWithDuplex` in event_stream.ts**

In `packages/core/src/sse/transport/event_stream.ts`, delete lines 360-362:

```ts
type RequestInitWithDuplex = RequestInit & {
  duplex?: 'half'
}
```

Change line 364 from:

```ts
function createEventStreamRequestInit(request: HttpRequest, headers: Headers, abort?: AbortSignal): RequestInitWithDuplex {
```

to:

```ts
function createEventStreamRequestInit(request: HttpRequest, headers: Headers, abort?: AbortSignal): RequestInit & { duplex?: 'half' } {
```

Change line 376 from:

```ts
  const init: RequestInitWithDuplex = {
```

to:

```ts
  const init: RequestInit & { duplex?: 'half' } = {
```

- [ ] **Step 5: Run Wave 3 verification**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm run test:type
npx vitest run src/sse src/web_socket
```

Expected: all pass.

- [ ] **Step 6: Commit Wave 3**

```bash
git add packages/core/src/sse/sse.ts \
  packages/core/src/web_socket/web_socket.ts \
  packages/core/src/sse/transport/event_stream.ts
git commit -m "refactor(core): inline SSE and WebSocket config chain types (wave 3)"
```

---

## Task 4: Wave 4 — Command tuple chain inlining

**Files:**

- Modify: `packages/core/src/client/command.ts`
- Modify: `packages/core/src/client/client.ts`

**Interfaces:**

- Consumes: existing `HttpCommand`, `HttpExecuteOptions`, `EventStreamCommand`, `EventStreamExecuteOptions`, `WebSocketCommand`, `WebSocketExecuteOptions`, etc.
- Produces: `Command` and type guards directly reference full generic instantiations; `client.ts` directly uses the tuple type for the implementation signature.

- [ ] **Step 1: Inline `HttpDispatchCommand`, `EventStreamDispatchCommand`, `WebSocketDispatchCommand`**

In `packages/core/src/client/command.ts`, replace lines 24-26:

```ts
export type HttpDispatchCommand = HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>
export type EventStreamDispatchCommand = EventStreamCommand<AnyStruct | undefined, EventSchemas>
export type WebSocketDispatchCommand = WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined>
```

with the full instantiations at every usage point. Update line 37 `Command` to:

```ts
export type Command =
  | HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>
  | EventStreamCommand<AnyStruct | undefined, EventSchemas>
  | WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined>
```

Update type guards `isHttpCommand`, `isEventStreamCommand`, `isWebSocketCommand` to return the full instantiations directly (they already do, so just remove reliance on the aliases).

- [ ] **Step 2: Inline command entry tuple types**

Replace lines 28-35:

```ts
export type HttpCommandEntry = [command: HttpDispatchCommand, options?: HttpExecuteOptions]
export type EventStreamCommandEntry = [command: EventStreamDispatchCommand, options?: EventStreamExecuteOptions]
export type WebSocketCommandEntry = [
  command: WebSocketDispatchCommand,
  options?: WebSocketExecuteOptions<WebSocketIncomingData<SocketSchemas>, WebSocketOutgoingData<SocketSchemas | undefined>>,
]
export type CommandEntry = HttpCommandEntry | EventStreamCommandEntry | WebSocketCommandEntry
export type UnknownCommandEntry = [command: Command, options?: unknown]
```

with only the tuples needed by the type guards and `client.ts`:

```ts
export type HttpCommandEntry = [command: HttpCommand<AnyStruct | undefined, RequestOutputShape | undefined>, options?: HttpExecuteOptions]
export type EventStreamCommandEntry = [
  command: EventStreamCommand<AnyStruct | undefined, EventSchemas>,
  options?: EventStreamExecuteOptions,
]
export type WebSocketCommandEntry = [
  command: WebSocketCommand<AnyStruct | undefined, SocketSchemas, SocketSchemas | undefined>,
  options?: WebSocketExecuteOptions<WebSocketIncomingData<SocketSchemas>, WebSocketOutgoingData<SocketSchemas | undefined>>,
]
export type UnknownCommandEntry = [command: Command, options?: unknown]
```

`CommandEntry` remains deleted from Wave 1.

- [ ] **Step 3: Inline `UnknownCommandEntry` in client.ts**

In `packages/core/src/client/client.ts`, line 92, change:

```ts
function execute(...entry: UnknownCommandEntry): Promise<unknown> {
```

to:

```ts
function execute(...entry: [command: Command, options?: unknown]): Promise<unknown> {
```

Remove the `UnknownCommandEntry` import on line 1 and keep only `Command`.

- [ ] **Step 4: Run Wave 4 verification**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm run test:type
npx vitest run src/client
```

Expected: all pass.

- [ ] **Step 5: Commit Wave 4**

```bash
git add packages/core/src/client/command.ts packages/core/src/client/client.ts
git commit -m "refactor(core): inline command tuple chain types (wave 4)"
```

---

## Task 5: Wave 5 — Public API config type inlining

**Files:**

- Modify: `packages/core/src/client/config.ts`
- Modify: `packages/core/src/client/public_api.ts`
- Modify: `packages/core/src/client/option.ts`
- Modify: `packages/core/src/web_socket/web_socket.ts`
- Modify: `packages/core/src/sse/sse.ts`
- Modify: `packages/core/src/client/client.type.test.ts`

**Interfaces:**

- Consumes: existing `HttpRequest`, `Interceptor`, `QueryParamsSerializer`.
- Produces: `ClientOptions` / `ClientConfig` directly embed option/config shapes; `public_api.ts` no longer exports the inlined types; type tests that referenced removed public types are updated to assert the equivalent inline shapes.

- [ ] **Step 1: Inline `ClientHttpOptions` / `ClientHttpConfig`**

In `packages/core/src/client/config.ts`, delete lines 31-37:

```ts
export interface ClientHttpOptions {
  handle?: typeof fetch
}

export interface ClientHttpConfig {
  handle: typeof fetch
}
```

Update `ClientOptions` line 118-127:

```ts
export interface ClientOptions {
  endpoint: string
  http?: { handle?: typeof fetch }
  interceptors?: Interceptor[]
  queryParamsSerializer?: QueryParamsSerializer
  sse?: ClientSSEOptions
  webSocket?: ClientWebSocketOptions
  xsrf?: ClientXSRFOptions
  withCredentials?: boolean
}
```

Update `ClientConfig` line 129-138:

```ts
export interface ClientConfig {
  endpoint: string
  http: { handle: typeof fetch }
  interceptors: Interceptor[]
  queryParamsSerializer: QueryParamsSerializer
  sse: ClientSSEConfig
  webSocket: ClientWebSocketOptions
  xsrf?: ClientXSRFConfig
  withCredentials?: boolean
}
```

Update `DEFAULT_HTTP_OPTIONS` line 142:

```ts
export const DEFAULT_HTTP_OPTIONS: { handle: typeof fetch } = {
  handle: DEFAULT_FETCH,
}
```

- [ ] **Step 2: Inline WebSocket option types**

Delete lines 8-29:

```ts
export type WebSocketBeforeConnect = () => void | Promise<void>

export interface WebSocketReconnectOptions { ... }
export interface WebSocketHeartbeatOptions { ... }
export interface WebSocketQueueOptions { ... }
```

Update `ClientWebSocketOptions` to embed them directly:

```ts
export interface ClientWebSocketOptions {
  handle?: typeof WebSocket
  beforeConnect?: () => void | Promise<void>
  heartbeat?: WebSocketHeartbeatConfig
  protocols?: readonly string[]
  queue?: { maxSize?: number; overflow?: 'drop-newest' | 'drop-oldest' | 'error' }
  reconnect?: {
    attempts?: number
    delayMs?: number
    factor?: number
    jitter?: number
    maxDelayMs?: number
    shouldReconnect?: (context: { attempt: number; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }) => boolean
  }
}
```

In `packages/core/src/web_socket/web_socket.ts`, update `UseWebSocketBaseConfig` to use the inline shapes; `WebSocketHeartbeatConfig` remains because it is a reused generic interface.

- [ ] **Step 3: Inline SSE option types**

Delete lines 57-91:

```ts
export type SSEInvalidEventReason = ...
export interface SSEInvalidEventMessage { ... }
export interface SSEInvalidEventContext { ... }
export type SSEInvalidEventHandler = ...
export interface SSEReconnectOptions { ... }
export interface SSEQueueOptions { ... }
```

Update `ClientSSEOptions` and `ClientSSEConfig` to embed them directly:

```ts
export interface ClientSSEOptions {
  handle?: typeof fetch
  onInvalidEvent?: (context: {
    reason: 'missing-schema' | 'validation-failed'
    message: { id: string; event: string; data: string; retry?: number }
    cause?: unknown
  }) => void | Promise<void>
  reconnect?: {
    attempts?: number
    delayMs?: number
    factor?: number
    jitter?: number
    maxDelayMs?: number
    shouldReconnect?: (context: {
      attempt: number
      cause?: unknown
      lastEventId: string
      open?: { response: { status: number; statusText: string; url: string }; url: string }
    }) => boolean | Promise<boolean>
  }
  queue?: { maxSize?: number; overflow?: 'drop-newest' | 'drop-oldest' | 'error' }
  maxBufferSize?: number
}
```

`ClientSSEConfig` mirrors with `handle: typeof fetch`.
In `packages/core/src/sse/sse.ts`, update the `onInvalidEvent` parameter type to the inline function type.

- [ ] **Step 4: Inline XSRF types**

Delete lines 39-55:

```ts
export interface XSRFTokenProviderContext { ... }
export type XSRFTokenProvider = ...
export interface ClientXSRFOptions { ... }
export interface ClientXSRFConfig { ... }
```

Update `ClientOptions` and `ClientConfig` to embed `xsrf` directly:

```ts
  xsrf?: {
    cookieName?: string
    headerName?: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
```

And for `ClientConfig`:

```ts
  xsrf?: {
    cookieName: string
    headerName: string
    tokenProvider?: (context: { request: HttpRequest }) => string | null | undefined
  }
```

- [ ] **Step 5: Update public_api.ts exports**

In `packages/core/src/client/public_api.ts`, remove from the `from './config'` re-export block all types that no longer exist:

- `ClientHttpOptions`
- `WebSocketBeforeConnect`
- `WebSocketHeartbeatOptions`
- `WebSocketQueueOptions`
- `WebSocketReconnectOptions`
- `SSEInvalidEventContext`
- `SSEInvalidEventHandler`
- `SSEInvalidEventMessage`
- `SSEInvalidEventReason`
- `SSEReconnectOptions`
- `SSEQueueOptions`
- `XSRFTokenProvider`
- `XSRFTokenProviderContext`

Keep: `ClientConfig`, `ClientOptions`, `ClientSSEConfig`, `ClientSSEOptions`, `ClientWebSocketOptions`, `ClientXSRFConfig`, `ClientXSRFOptions`, `QueryParamsSerializer`.

- [ ] **Step 6: Update option.ts helper functions**

In `packages/core/src/client/option.ts`, update helper function signatures that previously accepted `WebSocketHeartbeatOptions`, `WebSocketQueueOptions`, `WebSocketReconnectOptions`, `SSEReconnectOptions`, `SSEQueueOptions` to use the inline shapes from `ClientWebSocketOptions` / `ClientSSEOptions`. For example, `withWebSocketHeartbeat(config)` parameter type becomes the inline heartbeat shape. These helpers already import from `config.ts`; since the shapes are now embedded in interfaces, extract them via indexed access or duplicate the inline shape. Prefer indexed access to keep DRY:

```ts
export function withWebSocketHeartbeat(
  config: ClientWebSocketOptions['heartbeat'],
): ClientOption { ... }
```

- [ ] **Step 7: Update client.type.test.ts**

In `packages/core/src/client/client.type.test.ts`, replace references to removed public types with inline equivalent assertions. For example, if the test asserts `XSRFTokenProviderContext`, change it to assert `{ request: HttpRequest }`. If it asserts `XSRFTokenProvider`, change it to assert `(context: { request: HttpRequest }) => string | null | undefined`. Run the type test to confirm.

- [ ] **Step 8: Run Wave 5 verification**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
pnpm run test:type
npx vitest run src/client src/sse src/web_socket
```

Expected: all pass.

- [ ] **Step 9: Commit Wave 5**

```bash
git add packages/core/src/client/config.ts \
  packages/core/src/client/public_api.ts \
  packages/core/src/client/option.ts \
  packages/core/src/web_socket/web_socket.ts \
  packages/core/src/sse/sse.ts \
  packages/core/src/client/client.type.test.ts
git commit -m "refactor(core): inline public API config types (wave 5, breaking)"
```

---

## Task 6: Final full verification

**Files:**

- All files modified in previous tasks.

**Interfaces:**

- N/A — final integration verification.

- [ ] **Step 1: Run full type check**

Run:

```bash
npx tsc --noEmit -p packages/core/tsconfig.json
```

Expected: no errors.

- [ ] **Step 2: Run all type tests**

Run:

```bash
pnpm run test:type
```

Expected: all pass.

- [ ] **Step 3: Run all unit tests**

Run:

```bash
pnpm run test
```

Expected: all pass.

- [ ] **Step 4: Review diff and finalize**

Run:

```bash
git diff --stat feat/up@{5}
```

Review the cumulative diff to ensure only type-level changes are present and no runtime behavior was altered.

- [ ] **Step 5: Report completion**

Summarize: which types were inlined/removed, which were kept, and the final test results.

---

## Spec coverage self-check

| Spec section                      | Implementing task                     |
| --------------------------------- | ------------------------------------- |
| 核心原则（保留共享工具/领域类型） | Global Constraints + all tasks        |
| Wave 1 清单                       | Task 1                                |
| Wave 2 清单                       | Task 2                                |
| Wave 3 清单                       | Task 3                                |
| Wave 4 清单                       | Task 4                                |
| Wave 5 清单                       | Task 5                                |
| 验证策略                          | Every task Step N-1 + Task 6          |
| 风险控制                          | Global Constraints + per-task commits |

## Placeholder scan

- No TBD/TODO in steps.
- No "add appropriate error handling" vague instructions.
- Every code change includes the actual code snippet.
- Every verification step includes exact commands and expected outcomes.

## Type consistency check

- `ClientWebSocketOptions['heartbeat']` / `ClientWebSocketOptions['queue']` / `ClientWebSocketOptions['reconnect']` used in `option.ts` match the inline shapes defined in `config.ts`.
- `ClientSSEOptions['reconnect']` / `ClientSSEOptions['queue']` used in `option.ts` match the inline shapes defined in `config.ts`.
- `RequestInit & { duplex?: 'half' }` is used consistently in `fetch.ts` and `event_stream.ts`.
- `Command` in `client.ts` remains the same union after aliases are removed.
