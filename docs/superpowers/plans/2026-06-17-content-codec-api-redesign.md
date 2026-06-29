# Content Codec Annotation Redesign Plan

> **For agentic workers:** 本文把 `struct.json(...)`、`struct.formData(...)`、`struct.text()`、`struct.urlencoded(...)`、`struct.blob()`、`struct.arrayBuffer()` 统一看作 **content boundary annotation**：它们声明“某个已选边界期望什么 content codec”。这些 annotation 只有被具体 boundary adapter 选中时才形成 codec 语义；普通 struct parse / encode 仍保持 logical value 语义。Transport / protocol 层只负责产出 raw source value；运行时必须先选中用户声明的 struct / descriptor，再根据这个声明调用对应 codec 或 primitive decoder。不得因为 payload 看起来像 JSON、text、form data 或 binary 就自动猜测并改写值。

Status: revised on 2026-06-22. This document is a development plan, not a statement that the target API already exists.

---

## 0. Scope Boundary

### 0.1 In Scope

- 重新定义 request body wrapper 的概念：它不只是 HTTP 专用 wrapper，而是 content codec annotation 在 HTTP body 边界上的当前实现形态。
- 明确 logical value、wire/source content、codec metadata 三者的边界。
- 明确 `struct.json(inner)` 的目标职责：声明 JSON content，进入边界时 JSON decode / encode，再交给 inner struct 校验 / 编码。
- 明确 primitive content decoder 的职责：在文本型 source boundary 中，`struct.string()`、`struct.number()`、`struct.boolean()` 可以按“已选 struct”触发对应 primitive decoder；这不是 payload shape guessing。
- 明确 structured content 的职责：object / array / record 等结构化文本必须通过显式 content codec（例如 `struct.json(inner)`）解码，plain `struct.object(...)` 不自动 JSON.parse。
- 明确 HTTP request body、SSE `message.data`、WebSocket JSON envelope 各自如何选择 struct，再如何应用 codec。
- 移除 SSE 当前 `try JSON.parse -> raw string on parse error` 的隐式反序列化。
- 保留现有 HTTP request body authoring input：用户传 logical object，而不是 JSON string。
- 保留 `alias` 作为 field-level wire-key metadata；content codec 不替代 alias、placement、routing 或 responseType。

### 0.2 First Landing Scope

首批实现应该收敛在可审查、可回滚的阶段：

1. 文档与概念对齐。
2. 类型词汇桥接，不改变行为。
3. HTTP request body dispatcher consolidation，保持当前行为不变。
4. SSE source-boundary decoder，作为明确的行为变更单独落地。

### 0.3 Deferred / Out Of Scope

- 不重写 HTTP responseType / fetch body reader。HTTP response parsing 继续由 `responseType` 驱动。
- 不新增独立于 struct 的 message transformer / response mapper。
- 不按 payload shape 猜测业务类型。
- 不让 SSE transport 因 `data` 看起来像 JSON 就自动反序列化。
- 不把 WebSocket binary frame 默认当 UTF-8 JSON。
- 不在首批实现里承诺 raw `ws.text(...)` / `ws.binary(...)` public API；当前 WebSocket contract 是 typed JSON envelope。
- 不把 `defineEventStream.events` 从 event-name map 改成 full source-object API；这属于单独的 breaking design。
- 不把 content codec metadata 公开成新的稳定 public type，除非同时更新 public type tests 和导出策略。

---

## 1. Core Contract

### 1.1 One Sentence

**Boundary selection comes first; codec dispatch comes second.**

运行时先根据边界规则选中用户声明的 struct / descriptor：

- HTTP request 先由 `struct.request({ body })` 选中 body descriptor。
- SSE 先由 `message.event || 'message'` 选中 `events[eventName] ?? events.default`。
- WebSocket JSON envelope 先由 envelope 的 `type` 选中 message struct。

只有被选中的声明可以触发 JSON parse/stringify、primitive text decode、form serialization、text handling 或 binary pass-through。`formData`、`urlencoded`、`blob`、`arrayBuffer` 等 annotation 是否可用取决于具体 boundary；不要从 HTTP request body 支持推导出 SSE / WebSocket 也自动支持。Transport 不根据 payload 内容自行猜测。

### 1.2 Logical Value vs Wire / Source Content

Content codec annotation 必须区分两种值：

```text
logical authoring value
  -> inner struct parse / encode
  -> content codec encode
  -> wire content

wire / source content
  -> content codec decode or primitive decoder
  -> inner struct parse
  -> logical output value
```

关键约束：

- Inner struct 继续拥有 TypeScript input / output 和 validation。
- Codec metadata 不应污染 `_struct.input` / `_struct.output`。
- `struct.request({ body: struct.json(objectStruct) })` 的调用者继续传 logical object，而不是 JSON string。
- SSE `message.data` 的 raw source 是 string；选中的 event struct 决定这个 string 是 raw text、primitive text、JSON content，还是 invalid source。

### 1.3 No Transport Guessing

Rejected behavior:

```ts
try {
  return JSON.parse(data)
} catch {
  return data
}
```

原因：

- 结果类型取决于 payload spelling，而不是用户声明。
- malformed JSON 会被当作 string 继续处理，隐藏协议 / 数据错误。
- `struct.object(...)` 会因为 transport 偷偷 JSON.parse 而在 string source 上意外成功。
- 用户无法区分“我声明了 JSON content”与“transport 猜中了 JSON”。

### 1.4 Primitive Decoder vs Structured Codec

文本型 source boundary 可以根据 **已选 struct** 调用 primitive decoder：

| Selected struct                                      | Raw text source | Target behavior                          |
| ---------------------------------------------------- | --------------- | ---------------------------------------- |
| `struct.string()`                                    | `hello`         | `'hello'`                                |
| `struct.string()`                                    | `{"a":1}`       | `'{"a":1}'`，仍是文本                    |
| `struct.number()`                                    | `123`           | `123`，由 number decoder 产生            |
| `struct.boolean()`                                   | `true`          | `true`，由 boolean decoder 产生          |
| `struct.object({ a: struct.number() })`              | `{"a":1}`       | invalid source；object 不自动 JSON.parse |
| `struct.array(struct.number())`                      | `[1,2]`         | invalid source；array 不自动 JSON.parse  |
| `struct.json(struct.object({ a: struct.number() }))` | `{"a":1}`       | JSON.parse 后 inner object parse         |

这不是 payload shape guessing，因为 decoder 由 selected struct 决定。结构化文本仍然必须使用显式 content codec，例如 `struct.json(inner)`。

### 1.5 Alias, Placement, Routing Stay Separate

- `alias(...)` 继续是 field-level wire-key metadata。
- `struct.request({ path, query, headers, body })` 继续负责 HTTP placement。
- SSE event-name grouping 继续负责 event routing。
- WebSocket envelope `type` 继续负责 message routing。
- HTTP responseType 继续负责 response body reader 和 response parse strategy。

Content codec annotation 只回答：“已选边界上的 content 应该如何从 wire/source 进入 logical value，或者反向出去？”

---

## 2. Current Code Facts

### 2.1 Struct Type Model Already Preserves Logical Input / Output

Current type layer has a single logical input/output pair:

```ts
export interface StructLike<I = unknown, O = unknown, OO extends boolean = boolean> {
  readonly _struct: StructTypes<I, O, OO>
}
```

Request body wrappers preserve inner input/output:

```ts
export interface RequestBodyStructTypes<C extends RequestBodyCodec, S extends StructLike<unknown, unknown, boolean>> extends StructTypes<
  StructInput<S>,
  StructOutput<S>,
  false
> {
  codec: C
  input: StructInput<S>
  output: StructOutput<S>
}
```

Evidence:

- `packages/core/src/struct/types.ts:12-20`
- `packages/core/src/struct/types.ts:158-171`
- `packages/core/src/struct/types.ts:184-189`

Implication: content codec metadata should stay beside the wrapper / descriptor, while logical authoring input stays derived from inner struct.

### 2.2 Current `struct.json(...)` Is A Request Body Wrapper

Current constructors:

```ts
export function createJsonBodyStruct<S extends StructLike<unknown, unknown, boolean>>(struct: S): RequestBodyStruct<'json', S> {
  return createRequestBodyStruct('json', struct)
}
```

Current request-body parse delegates to inner struct:

```ts
function parseRequestBodyValue(definition: RequestBodyDefinition, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  return parseValue(definition.struct as RuntimeStruct, input, path, mode)
}
```

Evidence:

- `packages/core/src/struct/constructors.ts:239-268`
- `packages/core/src/struct/parse.ts:227-229`
- `packages/core/src/struct/facade.ts:64`

Implication: target `struct.json(inner)` should be documented as content annotation, but implementation must not globally change ordinary `parseStructValue()` to require string source. Boundary adapters must opt into wire/source codec behavior.

### 2.3 HTTP Request Materialization Is The Existing Codec Boundary

Current request builder switches on body descriptor:

```ts
function setRequestShapeBody(state: RequestBuilderState, descriptor: RequestBodyDescriptor, bodyValue: unknown): void {
  switch (descriptor.codec) {
    case 'json':
      setJsonBody(state, encodeKeyedValue(descriptor.struct, bodyValue))
      return
    case 'urlencoded':
      setFormUrlEncodedBody(state, encodeFlatRecord(descriptor.struct, bodyValue, 'urlencoded'))
      return
    case 'formData':
      setFormDataBody(state, encodeFlatRecord(descriptor.struct, bodyValue, 'formData'))
      return
    case 'text':
      setTextBody(state, String(encodeValue(descriptor.struct, bodyValue) ?? ''))
      return
    case 'blob': {
      const encoded = encodeValue(descriptor.struct, bodyValue) as HttpRequest['body']
      const contentType = typeof Blob !== 'undefined' && encoded instanceof Blob && encoded.type ? encoded.type : undefined
      setRawBody(state, encoded, { contentType })
      return
    }
    case 'arrayBuffer':
      setRawBody(state, encodeValue(descriptor.struct, bodyValue) as HttpRequest['body'], { contentType: 'application/octet-stream' })
      return
  }
}
```

JSON then stringifies once and records JSON content type:

```ts
function setJsonBody(state: RequestBuilderState, value: unknown, options?: RequestBodyOptions): void {
  setBody(state, JSON.stringify(value), resolveBodyContentTypeOption(options, 'application/json'))
}
```

Evidence:

- `packages/core/src/internal/request_builder.ts:252-280`
- `packages/core/src/internal/request_builder.ts:95-123`
- `packages/core/src/internal/request_builder.ts:369-468`
- `packages/core/src/internal/http_request.ts:13-19`
- `packages/core/src/http/transport/body.ts:5-81`
- `packages/core/src/http/transport/fetch_init.ts:4-82`
- `packages/core/src/http/http.ts:326-330`

Implications:

- HTTP request body is already a content boundary.
- JSON body must not be double-stringified.
- JSON body must preserve codec-derived `application/json`; a string body without metadata would look like `text/plain`.
- Manual builder paths are stable behavior: `setJson`, `setText`, `setHtml`, `setFormData`, `setFormUrlEncoded`, `setBlob`, `setArrayBuffer`, and additive form/urlencoded helpers must keep their projection semantics.
- Existing HTML / XML text requests depend on `setHtml(...)` and `text/html;charset=UTF-8`.
- Existing streaming uploads may use `ReadableStream<Uint8Array>` body; fetch init must preserve streaming support detection, upload-progress wrapping, `ERR_STREAMING_REQUEST_UNSUPPORTED`, and `duplex: 'half'`.
- HTTP response parsing stays out of this redesign; `responseType === 'json'` still uses existing alias-aware JSON value decode.

### 2.4 SSE Parser Produces Raw String Data

Current parser contract:

```ts
export interface EventStreamMessage {
  id: string
  event: string
  data: string
  retry?: number
}
```

`createMessageParser()` concatenates `data:` lines as strings.

Evidence:

- `packages/core/src/sse/transport/parser.ts:6-10`
- `packages/core/src/sse/transport/parser.ts:145-194`

Implication: SSE transport is already correct. The problematic behavior is in runtime pre-parse, not parser.

### 2.5 SSE Runtime Currently Guesses JSON

Current runtime:

```ts
const rawData = decodeEventData(message.data)
```

Current invalid-event reasons:

```ts
reason: 'missing-struct' | 'validation-failed'
```

Evidence:

- `packages/core/src/sse/sse.ts:277-323`
- `packages/core/src/sse/sse.ts:326-349`
- `packages/core/src/sse/sse.ts:365-379`

Implications:

- `decodeEventData()` is the seam to remove.
- Unknown event handling must keep current `missing-struct` naming unless a separate breaking rename is planned.
- `onInvalidEvent` is observer-only; observer exceptions must not tear down the stream.

### 2.6 SSE Public Shape Is Event-Name Map

Current public shape:

```ts
export type EventStructs = { [key: string]: AnyStruct }
```

Output is an event union with payload in `data`:

```ts
export type EventStreamData<TEvents extends EventStructs> = KnownEventUnion<TEvents> | DefaultEventUnion<TEvents>
```

Evidence:

- `packages/core/src/sse/sse.ts:27-55`

Implication: this plan keeps event-name grouping. A full source-object SSE API is deferred.

### 2.7 Current WebSocket Is Typed JSON Envelope

Current outgoing path:

```ts
return JSON.stringify(normalizeSocketPayload(message.type, serializeStructPayload(struct, payload)))
```

Current incoming path decodes frame text and JSON.parses envelope before selecting struct:

```ts
const decoded = await decodeWebSocketData(raw)
if (!isRecord(decoded) || typeof decoded['type'] !== 'string') {
  return undefined
}
const struct = incoming[messageType] ?? incoming['default']
```

Evidence:

- `packages/core/src/web_socket/codec.ts:10-35`
- `packages/core/src/web_socket/codec.ts:39-87`
- `packages/core/src/web_socket/web_socket.ts:33-82`
- `packages/core/src/web_socket/public_api.ts:1`

Implication: raw `ws.text(...)` / `ws.binary(...)` helpers are not first-landing APIs. WebSocket should first gain an explicit JSON envelope marker only if public API is approved.

---

## 3. Target Boundary Model

### 3.1 Shared Vocabulary

Conceptually, the project should use one vocabulary:

```ts
type ContentCodecKind = 'json' | 'urlencoded' | 'formData' | 'text' | 'blob' | 'arrayBuffer'
```

Do not rush this into public API. First landing may keep existing internal names:

- `RequestBodyCodec`
- `RequestBodyStruct<C, S>`
- `RequestBodyDescriptor`
- runtime kind `requestBody`

The semantic shift is: those request body names are the first concrete consumer of a more general content-boundary annotation model. `struct.blob()` and `struct.arrayBuffer()` remain binary primitive structs in ordinary parsing; they are accepted as HTTP body descriptors by `createRequestBodyDescriptor()`. `formData` and `urlencoded` remain HTTP request body codecs unless another boundary explicitly defines support.

### 3.2 Ordinary Struct Parse / Encode Remains Logical

Ordinary struct operations remain logical schema-tree operations:

```text
parseStructValue(struct.json(inner), logicalValue)
  -> delegates to inner for logical validation

encodeStructValue(struct.json(inner), logicalValue)
  -> delegates to inner for logical encoding
```

Wire/source conversion only happens when a boundary adapter explicitly asks for it:

```text
HTTP request body adapter
SSE selected event data adapter
WebSocket envelope adapter
future raw WebSocket text/binary adapter
```

This avoids the `_struct.input` conflict: `struct.json(inner)` does not make every call site pass JSON strings.

### 3.3 HTTP Request Boundary

HTTP remains section-shaped:

```ts
struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ q: struct.string().optional() }),
  headers: struct.object({ authorization: struct.string() }),
  body: struct.json(
    struct.object({
      name: struct.string(),
    }),
  ),
})
```

Authoring input remains logical:

```ts
{
  body: {
    name: 'MunMun'
  }
}
```

Wire body is produced at the HTTP boundary:

```text
logical body
  -> inner object encode with alias-aware JSON value mapping
  -> JSON.stringify once
  -> Content-Type: application/json
```

### 3.4 SSE Event Data Boundary

Current API stays event-name grouping:

```ts
defineEventStream({
  path: '/events',
  events: {
    log: struct.string(),
    progress: struct.number(),
    patch: struct.json(
      struct.object({
        op: struct.string(),
        value: struct.number(),
      }),
    ),
  },
})
```

Runtime flow:

```text
SSE bytes
  -> EventStreamMessage { event, id, data: string, retry }
  -> eventName = message.event || 'message'
  -> selected = events[eventName] ?? events.default
  -> if selected is missing: notify missing-struct with raw message.data and return
  -> selected struct drives source-boundary decode
  -> EventStreamData<TEvents> with data = decoded logical value
```

Examples:

| Selected event struct                                | Raw `data:`  | Target output / behavior                  |
| ---------------------------------------------------- | ------------ | ----------------------------------------- |
| `struct.string()`                                    | `hello`      | `'hello'`                                 |
| `struct.string()`                                    | `{"a":1}`    | `'{"a":1}'`                               |
| `struct.number()`                                    | `123`        | `123`                                     |
| `struct.boolean()`                                   | `true`       | `true`                                    |
| `struct.object({ a: struct.number() })`              | `{"a":1}`    | invalid source; no JSON guessing          |
| `struct.json(struct.object({ a: struct.number() }))` | `{"a":1}`    | `{ a: 1 }`                                |
| `struct.json(struct.string())`                       | `"hello"`    | `'hello'`                                 |
| `struct.json(struct.number())`                       | `"123"`      | inner validation failure after JSON.parse |
| `struct.json(struct.object(...))`                    | `{bad json}` | invalid JSON, no raw-text retry           |

The important rule: `struct.object(...)` never means “parse JSON text into object”. The user must declare `struct.json(struct.object(...))` for JSON object content.

SSE textual primitive semantics for first landing:

- `struct.string()` returns the raw untrimmed text.
- `struct.number()` trims text, applies `Number(trimmed)`, and accepts only finite, non-`NaN` values; empty text is invalid.
- `struct.boolean()` trims text and accepts only exact `true` / `false`.
- `struct.text()` is treated as raw text, equivalent to `struct.string()` at the SSE data boundary.
- `struct.json(inner)` is recognized as a JSON request-body/content wrapper: unwrap the inner struct, `JSON.parse(rawText)`, then run alias-aware decode / inner parse. Do not pass the wrapper itself to the current alias mapper.
- `struct.any()` / `struct.unknown()` receive raw string as logical value.
- Plain `literal` / `enum` / `union` / `intersection` / `object` / `array` / `record` / `date` / `bigint` structs receive raw string through ordinary logical parse; they only pass if ordinary parse accepts that string.
- `urlencoded`, `formData`, `blob`, and `arrayBuffer` wrappers / primitives are unsupported at the SSE string boundary in the first landing and should produce `validation-failed`, not ad-hoc coercion.

### 3.5 WebSocket Boundary

Current WebSocket contract remains JSON envelope:

```ts
defineWebSocket({
  path: '/ws',
  incoming: {
    patch: struct.object({ op: struct.string() }),
  },
  outgoing: {
    ack: struct.object({ id: struct.string() }),
  },
})
```

Current runtime:

```text
raw frame
  -> text decode where applicable
  -> JSON.parse envelope
  -> envelope.type chooses struct
  -> payload passes through alias-aware struct decode
```

Target first landing does **not** promise raw frame helpers. If a public marker is approved later, prefer explicit envelope wording:

```ts
incoming: ws.json({
  patch: struct.object({ op: struct.string() }),
})
```

Raw helpers are deferred because current `receive`, `send`, queue, and heartbeat semantics assume typed envelopes.

### 3.6 Boundary Capability Matrix

| Boundary                                         | Current support                                                                                                                    | Target first landing                                                                         | Deferred                                                                     |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| HTTP request body via `struct.request({ body })` | `json`, `urlencoded`, `formData`, `text`, raw `blob`, raw `arrayBuffer`                                                            | Preserve behavior, consolidate dispatcher, document as content annotation                    | Internal rename from requestBody to contentCodec                             |
| Manual HTTP request builder                      | `setJson`, `setText`, `setHtml`, `setFormData`, `setFormUrlEncoded`, `setBlob`, `setArrayBuffer`, additive form/urlencoded helpers | Preserve projection semantics and content-type metadata, including `text/html;charset=UTF-8` | Unify only where it does not require a single inner struct                   |
| Raw / streaming HTTP request body                | `ReadableStream<Uint8Array>` body, fetch streaming probe, upload-progress wrapping, `duplex: 'half'`                               | Preserve existing transport behavior                                                         | Separate stream codec design if needed                                       |
| HTTP response body                               | `responseType` driven                                                                                                              | Out of scope; keep existing behavior                                                         | Separate response codec design if needed                                     |
| SSE event data                                   | raw parser string, runtime currently guesses JSON                                                                                  | Remove guessing; selected event struct drives defined text primitive / JSON decode           | Full source-object event API                                                 |
| WebSocket JSON envelope                          | current typed JSON envelope contract                                                                                               | Keep current behavior in first landing                                                       | Optional explicit `ws.json(map)` marker in follow-up                         |
| WebSocket raw binary                             | current frames are still decoded through the typed JSON envelope path                                                              | unchanged in first landing                                                                   | Separate receive/send/queue/heartbeat design for raw `ws.text` / `ws.binary` |

---

## 4. Implementation Phases

### Phase 0 — Plan Rewrite And Baseline

- [x] Rewrite this plan around content boundary annotations.
- [ ] Start implementation from a clean worktree / branch or explicitly isolate existing dirty changes.
- [ ] Record baseline `git status --short --branch`.
- [ ] Confirm old `packages/core/src/handler/**` deletion / migration is not part of this plan.
- [ ] Confirm HTTP path is current `packages/core/src/http/**` and `packages/core/src/internal/request_builder.ts`.

Verification for doc-only patch:

```sh
pnpm --filter doc test
pnpm --filter doc typecheck
pnpm --filter doc docs:build
```

### Phase 1 — Type Vocabulary Bridge, No Behavior Change

- [ ] Optionally add internal aliases such as `ContentCodecKind = RequestBodyCodec` and `ContentCodecDescriptor = RequestBodyDescriptor`.
- [ ] Keep public `RequestBody*` surface unchanged unless public type tests are intentionally updated.
- [ ] Keep runtime kind `requestBody` as a delegation node.
- [ ] Add type tests proving wrapper input/output remains inner input/output.
- [ ] Add type tests proving `struct.request({ body: struct.json(inner) })` still accepts logical body input, not JSON string.

Core verification:

```sh
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

### Phase 2 — HTTP Request Body Dispatcher Consolidation

- [ ] Refactor `setRequestShapeBody()` around a narrow content-boundary dispatcher.
- [ ] Preserve JSON alias-aware encode and single `JSON.stringify`.
- [ ] Preserve URLSearchParams / FormData serialization.
- [ ] Preserve `text/plain;charset=UTF-8`, `text/html;charset=UTF-8`, `application/json`, `application/x-www-form-urlencoded;charset=UTF-8`, FormData header deletion, Blob type detection, ArrayBuffer octet-stream defaults.
- [ ] Preserve manual build-plan projection semantics; do not force manual `ctx.setJson(...)` / `ctx.setHtml(...)` into a single-inner-struct API.
- [ ] Preserve `setHtml(...)` / HTML / XML request tests.
- [ ] Preserve `ReadableStream<Uint8Array>` request bodies, streaming support probe, upload-progress wrapping, `ERR_STREAMING_REQUEST_UNSUPPORTED`, and fetch `duplex: 'half'`.
- [ ] Preserve `contentType: null` suppression and stale body-content-type protection.

Core verification:

```sh
pnpm --filter @defjs/core test
pnpm --filter @defjs/core typecheck
```

`pnpm --filter @defjs/core test` already runs `test:type`; use the explicit `test:type` command only for type-only phases.

### Phase 3 — SSE Source-Boundary Decoder

- [ ] Remove `decodeEventData()` guessing from `packages/core/src/sse/sse.ts`.
- [ ] Keep `packages/core/src/sse/transport/parser.ts` transport-only; `data` remains string.
- [ ] Enforce this exact order: compute `eventName`, resolve `eventStruct = events[eventName] ?? events.default`, notify `missing-struct` with raw `message.data` and return if absent, and only then call a new SSE boundary-only decoder with `(eventStruct, message.data)`.
- [ ] Unknown / missing events must never attempt JSON.parse, primitive decode, or any other data decode.
- [ ] The new decoder is SSE boundary-only. It must not change `_struct.input`, primitive struct constructors, or ordinary `parseStructValue()` semantics.
- [ ] Apply selected-struct boundary decode:
  - `struct.string()` gets raw untrimmed text.
  - `struct.number()` trims text, applies `Number(trimmed)`, accepts only finite non-`NaN` values, and rejects empty text.
  - `struct.boolean()` trims text and accepts only exact `true` / `false`.
  - `struct.text()` behaves like raw text at this boundary.
  - `struct.json(inner)` unwraps the JSON content wrapper, uses JSON.parse, then inner parse / alias decode.
  - plain object / array / record do not parse JSON text.
  - unsupported codecs (`urlencoded`, `formData`, `blob`, `arrayBuffer`) fail through `validation-failed`.
- [ ] Unknown event remains `missing-struct`.
- [ ] Selected payload failure remains `validation-failed`.
- [ ] `onInvalidEvent` observer errors remain swallowed.
- [ ] The same PR that removes SSE JSON guessing must update `doc/core/sse.md` with the migration note from unwrapped `struct.object(...)` to `struct.json(struct.object(...))`.

Required tests:

```ts
test('sse parser emits data as string')
test('sse struct.string returns raw json-looking text')
test('sse struct.number decodes finite numeric text by selected struct')
test('sse struct.number rejects empty, NaN, and Infinity text')
test('sse struct.boolean accepts only exact true and false text')
test('sse struct.object rejects json object text without json codec')
test('sse struct.array rejects json array text without json codec')
test('sse struct.json object parses json object text')
test('sse struct.json preserves aliased fields')
test('sse struct.json reports invalid json without raw-text retry')
test('sse struct.json preserves inner issue paths')
test('sse unsupported codecs fail through validation-failed')
test('sse missing event reports missing-struct without decoding data')
test('sse selected parse failure reports validation-failed')
test('sse onInvalidEvent observer errors do not tear down stream')
```

### Deferred Follow-up — WebSocket Explicit JSON Envelope Marker

This is not part of first landing. First landing preserves the current typed JSON envelope behavior, including the current frame decoding path. Do not mix a WebSocket public API change with the HTTP/SSE phases.

If a later WebSocket phase is explicitly approved:

- [ ] Add `ws.json(map)` as explicit marker for the current typed JSON envelope protocol.
- [ ] Store marker metadata on a non-string `unique symbol` so metadata cannot enter `keyof` message maps.
- [ ] Add `defineWebSocket` overloads or normalization types that unwrap marked incoming / outgoing maps before deriving `WebSocketIncomingData` and `WebSocketOutgoingData`.
- [ ] Export through `packages/core/src/web_socket/public_api.ts`, `packages/core/src/web_socket/index.ts`, and root public API only after type tests pass.
- [ ] If a later phase keeps plain map syntax, test it as an explicit current syntax decision.
- [ ] Keep raw text / binary helpers deferred until receive / send / queue / heartbeat shapes are designed.
- [ ] If a future phase changes binary frame behavior away from the current typed JSON envelope path, document it as a breaking WebSocket change with dedicated tests.

Required tests if this follow-up lands:

```ts
test('websocket json envelope marker metadata does not enter message keys')
test('websocket json envelope marker preserves incoming union inference')
test('websocket json envelope marker preserves outgoing send inference')
test('websocket plain map behavior is explicitly specified')
```

### Phase 5 — Docs And Migration Gates

Docs must be split by the phase that changes behavior:

- [ ] Concept / struct docs: update `packages/core/src/struct/README.md`, `doc/core/struct.md`, and `doc/guide/design-decisions.md` when the project adopts content-boundary terminology.
- [ ] HTTP docs: update `doc/core/http.md` only if Phase 2 changes wording, examples, or request-builder documentation; preserve `setHtml(...)` and streaming upload behavior.
- [ ] SSE migration docs: the Phase 3 PR that removes JSON guessing must update `doc/core/sse.md` with the migration example below.
- [ ] WebSocket docs: update `doc/core/web-socket.md` only in the deferred WebSocket follow-up, not in first landing.

SSE migration docs must include:

```ts
// Old accidental SSE behavior: object schema passed only because runtime guessed JSON.
events: {
  patch: struct.object({ op: struct.string() }),
}

// Target explicit behavior.
events: {
  patch: struct.json(
    struct.object({ op: struct.string() }),
  ),
}
```

Localized docs under `doc/*/` are a separate follow-up unless explicitly in scope for the implementation PR.

### Phase 6 — Cleanup After Migration Window

- [ ] Consider renaming internal `requestBody` concepts to `contentCodec` only after behavior is covered by tests.
- [ ] Audit public API and generated declarations before deleting alias entries.
- [ ] Remove any temporary SSE raw-text retry if one was introduced.

---

## 5. Acceptance Criteria

### 5.1 Plan / Documentation Acceptance

- [ ] The first page states the accepted model: codecs are content-boundary annotations for expected content.
- [ ] The plan separates current behavior from target behavior.
- [ ] The plan keeps HTTP response parsing out of scope.
- [ ] The plan uses current SSE invalid-event reason `missing-struct`, not `missing-schema`.
- [ ] The plan marks raw WebSocket text / binary helpers as deferred.
- [ ] The first-landing docs PR contains no WebSocket breaking-change language and no raw `ws.text` / `ws.binary` migration instructions.
- [ ] The plan keeps `struct.request` as placement owner and `alias` as field-level wire-key metadata.
- [ ] The plan includes a boundary capability matrix.
- [ ] The plan includes exact verification commands.

### 5.2 Core Runtime Acceptance

- [ ] Existing HTTP request body `struct.json(inner)` call sites remain valid.
- [ ] JSON request body is stringified exactly once.
- [ ] JSON request body preserves `application/json` content type.
- [ ] `setHtml(...)` preserves `text/html;charset=UTF-8` and existing HTML / XML request behavior.
- [ ] `ReadableStream<Uint8Array>` request bodies preserve streaming support detection, upload-progress wrapping, unsupported-runtime error, and fetch `duplex: 'half'`.
- [ ] FormData request body still deletes / avoids explicit `Content-Type` unless user overrides with supported semantics.
- [ ] HTTP response `responseType: 'json'` remains response-driven and does not require response body to be string.
- [ ] SSE parser still emits `data: string`.
- [ ] SSE runtime checks `missing-struct` before any data decode.
- [ ] SSE runtime no longer calls JSON.parse before selected struct is known.
- [ ] SSE primitive decoders are selected by struct, not payload shape, and follow the documented text semantics.
- [ ] SSE plain object / array structs do not parse JSON text.
- [ ] SSE explicit `struct.json(inner)` parses JSON text and validates inner struct.
- [ ] JSON parse failure is a validation failure with no raw-text retry.
- [ ] `onInvalidEvent` behavior stays stable.

### 5.3 Type Acceptance

- [ ] `struct.json(inner)` wrapper input/output remain inner input/output in logical contexts.
- [ ] `RequestInput<typeof request>` with JSON body accepts inner logical object, not JSON string.
- [ ] SSE event data inference is based on selected event struct output.
- [ ] Follow-up only: WebSocket envelope helper, if added, preserves literal message type union and `send()` payload inference through unwrapped message maps.
- [ ] No new public `ContentCodec*` or WebSocket marker type is exported accidentally in first landing.

### 5.4 Verification Commands

For doc-only changes:

```sh
pnpm --filter doc test
pnpm --filter doc typecheck
pnpm --filter doc docs:build
```

For core type-only phases:

```sh
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

For core behavior phases:

```sh
pnpm --filter @defjs/core test
pnpm --filter @defjs/core typecheck
```

`pnpm --filter @defjs/core test` already runs `test:type`, so do not list both unless you intentionally want a redundant gate.

Final workspace gate after implementation and docs:

```sh
pnpm check
pnpm test
```

Only report these as passing if they were actually run and passed.

---

## 6. Rejected Alternatives

### 6.1 Transport-Level JSON Guessing

Rejected:

```ts
try {
  return JSON.parse(data)
} catch {
  return data
}
```

Reason: it makes runtime values depend on payload spelling instead of declarations, hides malformed JSON, and makes `struct.object(...)` indistinguishable from explicit JSON content.

### 6.2 `struct.object(...)` Auto JSON.parse

Rejected:

- Plain object struct means object source.
- Auto JSON.parse would make `struct.object(...)` and `struct.json(struct.object(...))` operationally identical.
- It prevents users from seeing the true wire/source type.

### 6.3 Global `parseStructValue()` JSON-String Behavior

Rejected:

```ts
parseStructValue(struct.json(inner), '{"a":1}')
```

should not become the universal meaning of `struct.json(inner)` in every logical context. JSON source decode belongs to content boundaries. Otherwise HTTP request authoring input would become ambiguous and existing call sites could start requiring JSON strings.

### 6.4 Independent Message Transformer

Rejected:

- It creates a second parsing path outside struct.
- It can bypass aliases, zero value behavior, issue paths, and encode/decode symmetry.
- The behavior belongs in boundary adapters that consume struct annotations.

### 6.5 First-Landing Raw WebSocket Text / Binary Helpers

Rejected for this plan:

- Current receive / send / queue / heartbeat logic assumes typed JSON envelopes.
- Raw frames have no `type` field for message routing.
- Supporting them safely requires a separate result-shape and queue design.

---

## 7. Traceability Matrix

| Target behavior                                           | Source files                                                                                                                                    | Test locations                                           | Docs                                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Request body wrapper preserves logical input/output       | `packages/core/src/struct/types.ts`, `packages/core/src/struct/constructors.ts`, `packages/core/src/struct/parse.ts`                            | `packages/core/src/struct/*.type.test.ts`, request tests | `packages/core/src/struct/README.md`, `doc/core/struct.md`, `doc/core/http.md` |
| JSON request body stringifies once and keeps content type | `packages/core/src/internal/request_builder.ts`, `packages/core/src/http/transport/body.ts`                                                     | HTTP request/body specs                                  | `doc/core/http.md`                                                             |
| HTML and streaming request paths stay compatible          | `packages/core/src/internal/request_builder.ts`, `packages/core/src/internal/http_request.ts`, `packages/core/src/http/transport/fetch_init.ts` | request builder and fetch streaming specs                | `doc/core/http.md`                                                             |
| HTTP response parsing remains responseType-driven         | `packages/core/src/http/http.ts`, `packages/core/src/http/request.ts`                                                                           | HTTP response type specs                                 | `doc/core/http.md`                                                             |
| SSE parser emits raw string data                          | `packages/core/src/sse/transport/parser.ts`                                                                                                     | `packages/core/src/sse/transport/parser.spec.ts`         | `doc/core/sse.md`                                                              |
| SSE removes JSON guessing                                 | `packages/core/src/sse/sse.ts`                                                                                                                  | `packages/core/src/sse/sse.spec.ts`                      | `doc/core/sse.md`, migration notes                                             |
| SSE selected struct drives primitive / JSON decode        | `packages/core/src/sse/sse.ts`, new content decoder helper                                                                                      | `packages/core/src/sse/sse.spec.ts`, type tests          | `doc/core/sse.md`                                                              |
| WebSocket current envelope stays stable                   | `packages/core/src/web_socket/codec.ts`, `packages/core/src/web_socket/web_socket.ts`                                                           | `packages/core/src/web_socket/*.spec.ts`, type tests     | `doc/core/web-socket.md`                                                       |
| Optional `ws.json(map)` marker preserves inference        | `packages/core/src/web_socket/public_api.ts`, `packages/core/src/web_socket/index.ts`, `packages/core/src/public_api.ts`                        | WebSocket type tests                                     | `doc/core/web-socket.md`                                                       |

---

## 8. Source References

Internal:

- `packages/core/src/struct/types.ts`
- `packages/core/src/struct/constructors.ts`
- `packages/core/src/struct/parse.ts`
- `packages/core/src/struct/encode.ts`
- `packages/core/src/struct/codec/json.ts`
- `packages/core/src/internal/request_builder.ts`
- `packages/core/src/http/request.ts`
- `packages/core/src/http/transport/body.ts`
- `packages/core/src/http/http.ts`
- `packages/core/src/sse/transport/parser.ts`
- `packages/core/src/sse/sse.ts`
- `packages/core/src/web_socket/codec.ts`
- `packages/core/src/web_socket/web_socket.ts`
- `packages/core/src/web_socket/public_api.ts`

External:

- [MDN Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN WebSocket message event](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event)
- [MDN WebSocket binaryType](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType)
- [Go encoding/json](https://pkg.go.dev/encoding/json)
- [Zod basics](https://zod.dev/basics)
