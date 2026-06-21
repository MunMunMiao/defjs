# SSE / WebSocket Struct JSON Codec Contract Plan

> **For agentic workers:** 本文聚焦 SSE / WebSocket 的消息值转换边界。Transport / protocol 层只负责产出 raw source value，不允许根据 payload 内容自动 JSON.parse。`struct.json(inner)` 是一个 **JSON codec 标注**：当运行时走到 `kind=json` 的 struct 时，才执行 JSON 序列化 / 反序列化，然后继续交给 inner struct 校验。它不是 SSE 专用 decoder，也不是 payload-shape guessing。

---

## 0. Scope Boundary

### In scope

- SSE parser 到 struct 解析之间每一步 value 的形状。
- WebSocket text / binary / JSON envelope 与 struct 解析之间的边界。
- `struct.json(inner)` 的职责：标注某个字段 / body / message part 需要 JSON codec。
- 移除 SSE 当前 `try JSON.parse -> fallback string` 的隐式反序列化。
- 明确 plain `struct.object(...)` 收到 SSE string 时必须失败。
- 明确 `events` 内字段不应该被限定为固定字段；字段 struct 本身决定该字段如何解析。

### Out of scope

- 不重写 HTTP responseType / fetch body reader。
- 不新增独立于 struct 的 message transformer / response mapper。
- 不按 payload shape 猜测业务类型。
- 不让 SSE transport 因 `data` 看起来像 JSON 就自动反序列化。
- 不把 WebSocket binary frame 默认当 UTF-8 JSON。

---

## 1. Core Contract

### 1.1 One Sentence

Raw source value 先进入对应字段 struct；只有 struct 本身标注了 JSON codec，才执行 JSON 序列化 / 反序列化。

### 1.2 Transport Source Values

SSE parser 的 source value 来自 SSE fields：

```ts
{
  data: string
  event: string
  id: string
  retry?: number
}
```

其中 `data` 一定是 string。`data: {"a":1}` 到达 struct 前仍然是字符串：

```ts
'{"a":1}'
```

WebSocket source value 由 frame 决定：

- text frame: string
- binary frame: ArrayBuffer / Blob / typed binary value
- explicit JSON envelope helper: helper 自己先解析 envelope，再把 payload 交给 payload struct

### 1.3 Plain Struct Semantics

Plain struct 原样解析 source，不做预处理：

```ts
parseStructValue(struct.string(), 'hello')
// => 'hello'

parseStructValue(struct.string(), '{"a":1}')
// => '{"a":1}'

parseStructValue(struct.number(), '123')
// => invalid_type, source is string, not number

parseStructValue(struct.object({ a: struct.number() }), '{"a":1}')
// => invalid_type, source is string, not object
```

### 1.4 JSON Codec Annotation

`struct.json(inner)` 表示该字段 / body / message part 的 wire value 是 JSON encoded content。

```ts
const dataStruct = struct.json(
  struct.object({
    a: struct.string(),
    b: struct.number(),
  }),
)
```

当 source 是：

```ts
'{"a":"x","b":2}'
```

转换流程是：

```text
'{"a":"x","b":2}'
  -> kind=json
  -> JSON.parse(source)
  -> { a: 'x', b: 2 }
  -> inner struct.object parse
  -> { a: 'x', b: 2 }
```

如果 struct 是 plain object：

```ts
struct.object({ a: struct.string(), b: struct.number() })
```

则同一个 source 必须失败：

```text
'{"a":"x","b":2}'
  -> struct.object(...)
  -> invalid_type, expected object, received string
```

---

## 2. Current Code Findings

### 2.1 SSE Parser Produces String Data

`packages/core/src/sse/transport/parser.ts` 当前事实：

```ts
export interface EventStreamMessage {
  id: string
  event: string
  data: string
  retry?: number
}
```

`createMessageParser()` 对 `data:` 行只做字符串拼接：

```ts
case 'data':
  message.data = message.data ? `${message.data}\n${value}` : value
  break
```

结论：parser 层没有、也不应该做业务 JSON 反序列化。

### 2.2 SSE Runtime Currently Violates The Contract

`packages/core/src/sse/sse.ts` 当前行为：

```ts
const rawData = decodeEventData(message.data)
```

而 `decodeEventData()` 是：

```ts
function decodeEventData(data: string): unknown {
  if (!data) {
    return data
  }

  try {
    return JSON.parse(data) as unknown
  } catch {
    return data
  }
}
```

这是需要删除的隐式反序列化。它会让 `struct.object(...)` 在 SSE JSON-looking string 下意外成功，违反 struct 明确标注原则。

### 2.3 `struct.object(...)` Correctly Rejects String

`packages/core/src/struct/parse.ts` 当前事实：

```ts
function parseObjectValue(..., input: unknown, ...): ParseResult<{ [key: string]: unknown }> {
  if (!isPlainObject(input)) {
    return failure(issue(path, 'invalid_type', 'object', input))
  }
}
```

结论：`struct.object(...)` 收到 SSE `data` string 时失败是正确行为，不是要绕开的错误。

### 2.4 Current `struct.json(...)` Is Request Body Wrapper

`packages/core/src/struct/facade.ts` 当前事实：

```ts
export const struct = {
  json: createJsonBodyStruct,
}
```

`packages/core/src/struct/constructors.ts` 当前事实：

```ts
export function createJsonBodyStruct<S extends StructLike<unknown, unknown, boolean>>(struct: S): RequestBodyStruct<'json', S> {
  return createRequestBodyStruct('json', struct)
}
```

当前 `requestBody` parse 只是委托 inner struct：

```ts
function parseRequestBodyValue(definition: RequestBodyDefinition, input: unknown, path: Path, mode: ParseMode): ParseResult<unknown> {
  return parseValue(definition.struct as RuntimeStruct, input, path, mode)
}
```

结论：现有 `struct.json(...)` 还没有实现通用 JSON codec 标注行为。后续实现要让 `kind=json` 真正成为 JSON codec 标记，而不是在 SSE 层临时 JSON.parse。

### 2.5 Current Event Struct Shape Is Also A Legacy Constraint

当前 `EventStructs` 是：

```ts
export type EventStructs = { [key: string]: AnyStruct }
```

当前输出类型固定成：

```ts
{
  data: Infer<TEvents[K]>
  event: K
  id?: string
  retry?: number
}
```

这表示当前代码把 `events` 当成 event-name -> data-struct map。目标设计需要重新明确 `events` 的字段语义：字段不应被限定为固定事件名或固定 payload 形状；运行时应按字段 struct 通用解析 source object。

### 2.6 Why The Old Behavior Is Misleading

旧实现有一个容易误导的链路：

1. SSE parser 正确产出 `message.data` string。
2. SSE runtime 在进入 struct 之前调用 `decodeEventData()`。
3. `decodeEventData()` 对 JSON-looking string 执行 `JSON.parse`。
4. `struct.object(...)` 因为收到的已经是 object，所以看起来“支持 SSE JSON object”。

这不是设计正确，而是 transport 层提前改写了 source value。它隐藏了两个事实：

- 用户声明 `struct.object(...)` 时，真实 wire source 仍然是 string。
- 用户没有用 struct 明确标注 JSON codec，却得到了 JSON decode 后的值。

正确的因果关系应该反过来：只有 struct 显式标注 `kind=json`，运行时才允许进入 JSON codec 流程。

---

## 3. Value Conversion Flow

### 3.1 Plain Text SSE

Raw SSE:

```text
event: log
id: 1
data: hello

```

Parser output:

```ts
{
  event: 'log',
  id: '1',
  data: 'hello',
  retry: undefined,
}
```

Field struct:

```ts
events: {
  data: struct.string(),
}
```

Conversion:

```text
source.data = 'hello'
  -> struct.string()
  -> 'hello'
```

Output value:

```ts
{
  data: 'hello',
}
```

### 3.2 JSON Object Without Annotation

Raw SSE:

```text
event: patch
id: 2
data: {"a":"x","b":2}

```

Parser output:

```ts
{
  event: 'patch',
  id: '2',
  data: '{"a":"x","b":2}',
  retry: undefined,
}
```

Field struct:

```ts
events: {
  data: struct.object({
    a: struct.string(),
    b: struct.number(),
  }),
}
```

Conversion:

```text
source.data = '{"a":"x","b":2}'
  -> struct.object({ a, b })
  -> invalid_type, expected object, received string
```

Expected result: validation failure. This is correct.

### 3.3 JSON Object With `struct.json(...)`

Raw SSE:

```text
event: patch
id: 2
data: {"a":"x","b":2}

```

Parser output:

```ts
{
  event: 'patch',
  id: '2',
  data: '{"a":"x","b":2}',
  retry: undefined,
}
```

Field struct:

```ts
events: {
  data: struct.json(
    struct.object({
      a: struct.string(),
      b: struct.number(),
    }),
  ),
}
```

Conversion:

```text
source.data = '{"a":"x","b":2}'
  -> struct kind=json
  -> JSON.parse(source.data)
  -> { a: 'x', b: 2 }
  -> inner struct.object parse
  -> { a: 'x', b: 2 }
```

Output value:

```ts
{
  data: {
    a: 'x',
    b: 2,
  },
}
```

### 3.4 JSON Boolean Field

Raw SSE:

```text
event: ok
data: true

```

Parser output:

```ts
{
  event: 'ok',
  id: '',
  data: 'true',
  retry: undefined,
}
```

Without JSON annotation:

```ts
events: {
  data: struct.boolean(),
}
```

Conversion:

```text
source.data = 'true'
  -> struct.boolean()
  -> invalid_type, expected boolean, received string
```

With JSON annotation:

```ts
events: {
  data: struct.json(struct.boolean()),
}
```

Conversion:

```text
source.data = 'true'
  -> struct kind=json
  -> JSON.parse('true')
  -> true
  -> inner struct.boolean parse
  -> true
```

### 3.5 JSON String Field

Raw SSE:

```text
event: title
data: "hello"

```

Parser output:

```ts
{
  event: 'title',
  id: '',
  data: '"hello"',
  retry: undefined,
}
```

Plain string struct:

```ts
events: {
  data: struct.string(),
}
```

Output:

```ts
{
  data: '"hello"',
}
```

JSON string struct:

```ts
events: {
  data: struct.json(struct.string()),
}
```

Output:

```ts
{
  data: 'hello',
}
```

This distinction is intentional.

### 3.6 Correct Full Flow

Raw SSE:

```text
event: patch
id: 42
data: {"a":"hello","b":7}

```

User struct:

```ts
events: {
  event: struct.string(),
  id: struct.string(),
  data: struct.json(
    struct.object({
      a: struct.string(),
      b: struct.number(),
    }),
  ),
}
```

Correct value flow:

```text
raw bytes
  -> TextDecoder
  -> lines:
     'event: patch'
     'id: 42'
     'data: {"a":"hello","b":7}'
     ''
  -> parser message:
     {
       event: 'patch',
       id: '42',
       data: '{"a":"hello","b":7}',
       retry: undefined,
     }
  -> source object:
     {
       event: 'patch',
       id: '42',
       data: '{"a":"hello","b":7}',
       retry: undefined,
     }
  -> events.event: struct.string()
     source.event = 'patch'
     output.event = 'patch'
  -> events.id: struct.string()
     source.id = '42'
     output.id = '42'
  -> events.data: struct.json(inner)
     source.data = '{"a":"hello","b":7}'
     JSON.parse(source.data)
     parsed = { a: 'hello', b: 7 }
     inner struct.object parse
     output.data = { a: 'hello', b: 7 }
  -> final output:
     {
       event: 'patch',
       id: '42',
       data: { a: 'hello', b: 7 },
     }
```

Why this is correct:

- The parser never changes `data` from string to object.
- The runtime does not infer JSON from payload shape.
- JSON parsing is caused only by the `data` field struct being `kind=json`.

### 3.7 Incorrect Full Flow

Raw SSE:

```text
event: patch
id: 42
data: {"a":"hello","b":7}

```

User struct:

```ts
events: {
  event: struct.string(),
  id: struct.string(),
  data: struct.object({
    a: struct.string(),
    b: struct.number(),
  }),
}
```

Incorrect old flow:

```text
parser message.data = '{"a":"hello","b":7}'
  -> decodeEventData(message.data)
  -> JSON.parse(message.data)
  -> { a: 'hello', b: 7 }
  -> struct.object({ a, b })
  -> success
```

Why this is wrong:

- `struct.object(...)` was declared against an object source, but the actual SSE source is string.
- The runtime silently inserted JSON parsing before struct parsing.
- The success depends on data content looking like JSON, not on an explicit struct marker.

Correct behavior for the same struct:

```text
parser message.data = '{"a":"hello","b":7}'
  -> no pre-parse
  -> struct.object({ a, b })
  -> invalid_type, expected object, received string
```

To make it valid, the user must mark the field:

```ts
events: {
  data: struct.json(
    struct.object({
      a: struct.string(),
      b: struct.number(),
    }),
  ),
}
```

### 3.8 Real User Case

用户想消费一个 SSE stream，服务端发送的是 JSON encoded business payload：

```text
event: position_snapshot
id: 1001
data: {"account":"U10086","positionId":9527,"closed":false}

```

The desired parsed value:

```ts
{
  event: 'position_snapshot',
  id: '1001',
  data: {
    account: 'U10086',
    positionId: 9527,
    closed: false,
  },
}
```

Correct struct:

```ts
events: {
  event: struct.string(),
  id: struct.string(),
  data: struct.json(
    struct.object({
      account: struct.string(),
      positionId: struct.number(),
      closed: struct.boolean(),
    }),
  ),
}
```

Wrong struct:

```ts
events: {
  data: struct.object({
    account: struct.string(),
    positionId: struct.number(),
    closed: struct.boolean(),
  }),
}
```

Why the wrong struct must fail:

- SSE `data` arrives as `'{"account":"U10086","positionId":9527,"closed":false}'`.
- `struct.object(...)` cannot parse string.
- Allowing it to pass would mean the transport layer performed implicit JSON decoding.

### 3.9 Custom Events Fields And Uncertainty

`events` must not be treated as a closed, fixed shape. SSE has familiar fields (`event`, `id`, `data`, `retry`), but the user-facing struct should stay generic:

```ts
events: {
  data: struct.string(),
}
```

```ts
events: {
  id: struct.string(),
  data: struct.json(orderStruct),
}
```

```ts
events: {
  event: struct.string(),
  data: struct.json(orderStruct),
  receivedAt: struct.date(),
}
```

This creates uncertainty for the runtime:

- It cannot assume `data` is always present in the user's output shape.
- It cannot assume all users want `event`, `id`, or `retry`.
- It cannot assume a field should be JSON parsed because the field name is `data`.
- It cannot assume a field should be ignored because it is not one of the SSE protocol fields.

The resolution is simple: build a source object from whatever transport facts are available, then parse only through the user-provided field struct. Standard SSE facts can provide `event`, `id`, `data`, and `retry`; any extra field such as `receivedAt` must come from an explicit source builder / adapter, not from magic. If a field needs JSON, the field struct says so with `struct.json(...)`. If it does not, the source value stays unchanged.

---

## 4. Target API Direction

### 4.1 `struct.json(inner)` Becomes A Codec Annotation

The target behavior for `struct.json(inner)`:

```ts
function parseJsonCodec(inner, source, path) {
  if (typeof source !== 'string') {
    return failure(issue(path, 'invalid_type', 'JSON string', source))
  }

  let parsed
  try {
    parsed = JSON.parse(source)
  } catch (cause) {
    return failure(issue(path, 'invalid_json', 'valid JSON string', source, cause))
  }

  return parseStructTuple(inner, parsed, path)
}

function encodeJsonCodec(inner, value) {
  const encoded = encodeStructValue(inner, value)
  return JSON.stringify(encoded)
}
```

Properties:

- It is triggered by struct kind, not by payload shape.
- JSON.parse failure is a validation failure, not fallback to string.
- Inner struct validation happens after JSON.parse.
- The output type is inner output.
- This mechanism is reusable across SSE, WebSocket, HTTP body, and any future field source.

### 4.2 SSE Runtime

Target SSE handling:

```ts
function handleSseMessage(events, message) {
  const source = {
    data: message.data,
    event: message.event || 'message',
    id: message.id || undefined,
    retry: message.retry,
  }

  return parseStructValue(struct.object(events), source)
}
```

If the public API keeps event-name grouping, event selection must happen separately from data field parsing. It must not introduce a pre-parse step:

```ts
function handleNamedSseEvent(eventsByName, message) {
  const eventName = message.event || 'message'
  const struct = eventsByName[eventName] ?? eventsByName.default

  if (!struct) {
    return invalidEvent('missing-struct', message)
  }

  return parseStructValue(struct, message.data)
}
```

The important rule is unchanged: `message.data` is passed as string. No `decodeEventData()`.

### 4.3 WebSocket Runtime

Raw text frame:

```ts
function handleWebSocketText(struct, data) {
  return parseStructValue(struct, data)
}
```

Raw binary frame:

```ts
function handleWebSocketBinary(struct, data) {
  return parseStructValue(struct, data)
}
```

Explicit JSON envelope helper:

```ts
function handleWebSocketJsonEnvelope(messageMap, data) {
  const envelope = JSON.parse(data)
  const type = envelope.type
  const struct = messageMap[type] ?? messageMap.default

  if (!struct) {
    return undefined
  }

  const payload = 'data' in envelope ? envelope.data : omitType(envelope)
  return parseStructValue(struct, payload)
}
```

`ws.json(map)` is a protocol helper for a JSON envelope. It is not a generic source decoder and should not affect raw text or binary handlers.

---

## 5. Contract Examples

### 5.1 SSE Data Field

| Field declaration                                          | Raw `data:`  | Source to field struct | Expected result                     |
| ---------------------------------------------------------- | ------------ | ---------------------- | ----------------------------------- |
| `data: struct.string()`                                    | `hello`      | `'hello'`              | `'hello'`                           |
| `data: struct.string()`                                    | `{"a":1}`    | `'{"a":1}'`            | `'{"a":1}'`                         |
| `data: struct.string()`                                    | `"hello"`    | `'"hello"'`            | `'"hello"'`                         |
| `data: struct.number()`                                    | `123`        | `'123'`                | invalid type                        |
| `data: struct.boolean()`                                   | `true`       | `'true'`               | invalid type                        |
| `data: struct.object({ a: struct.number() })`              | `{"a":1}`    | `'{"a":1}'`            | invalid type                        |
| `data: struct.array(struct.number())`                      | `[1,2]`      | `'[1,2]'`              | invalid type                        |
| `data: struct.json(struct.number())`                       | `123`        | `'123'`                | `123`                               |
| `data: struct.json(struct.boolean())`                      | `true`       | `'true'`               | `true`                              |
| `data: struct.json(struct.string())`                       | `"hello"`    | `'"hello"'`            | `'hello'`                           |
| `data: struct.json(struct.object({ a: struct.number() }))` | `{"a":1}`    | `'{"a":1}'`            | `{ a: 1 }`                          |
| `data: struct.json(struct.array(struct.number()))`         | `[1,2]`      | `'[1,2]'`              | `[1, 2]`                            |
| `data: struct.json(struct.number())`                       | `"123"`      | `'"123"'`              | invalid type after JSON.parse       |
| `data: struct.json(struct.object(...))`                    | `{bad json}` | `'{bad json}'`         | invalid JSON, no fallback           |
| `data: struct.arrayBuffer()`                               | `SGVsbG8=`   | `'SGVsbG8='`           | invalid type without explicit codec |

### 5.2 SSE Full Message Shape

If the API exposes the full SSE source object:

```ts
events: {
  event: struct.string(),
  id: struct.string().optional(),
  data: struct.json(
    struct.object({
      a: struct.string(),
      b: struct.number(),
    }),
  ),
  retry: struct.number().optional(),
}
```

Raw SSE:

```text
event: patch
id: 2
retry: 1000
data: {"a":"x","b":2}

```

Output:

```ts
{
  event: 'patch',
  id: '2',
  data: { a: 'x', b: 2 },
  retry: 1000,
}
```

### 5.3 WebSocket

| Frame / helper         | Declaration                       | Source value            | Expected result                    |
| ---------------------- | --------------------------------- | ----------------------- | ---------------------------------- |
| raw text frame         | `struct.string()`                 | string                  | raw string                         |
| raw text frame         | `struct.number()`                 | string                  | invalid type                       |
| raw text frame         | `struct.json(struct.object(...))` | JSON string             | object after kind=json             |
| raw binary frame       | `struct.arrayBuffer()`            | ArrayBuffer             | ArrayBuffer                        |
| raw binary frame       | `struct.json(inner)`              | ArrayBuffer             | invalid type, expected JSON string |
| explicit JSON envelope | `ws.json({ message: struct })`    | parsed envelope payload | `struct` output                    |

---

## 6. Compatibility Strategy

### Phase 0: Characterization Tests

- [ ] Capture current SSE parser output: `data` is string.
- [ ] Capture current invalid behavior: `decodeEventData()` auto JSON.parse makes object data accidentally succeed.
- [ ] Capture plain `struct.object(...)` rejecting string.
- [ ] Capture current `struct.json(...)` as requestBody wrapper.
- [ ] Capture current WebSocket JSON envelope behavior.

### Phase 1: Struct JSON Codec

- [ ] Introduce a real `kind=json` struct / wrapper.
- [ ] Preserve existing request body API shape where possible.
- [ ] Parse path: string source -> JSON.parse -> inner struct parse.
- [ ] Encode path: inner encode -> JSON.stringify.
- [ ] JSON.parse failure produces explicit validation error.
- [ ] Inner struct failure preserves inner issue path.
- [ ] Non-string source for `kind=json` fails unless a future codec explicitly supports other sources.

### Phase 2: SSE Stops Guessing

- [ ] Remove `decodeEventData()`.
- [ ] Pass `message.data` string directly into the relevant field / payload struct.
- [ ] Update tests so `struct.object(...)` with JSON-looking SSE data fails.
- [ ] Add tests so `struct.json(struct.object(...))` succeeds.
- [ ] Keep `onInvalidEvent` observer behavior for validation failures.

### Phase 3: Revisit SSE Public Shape

- [ ] Decide whether `defineEventStream.events` is a full source field struct or still an event-name grouping.
- [ ] If event-name grouping remains, keep field parsing rules inside each selected struct.
- [ ] If full source struct is adopted, infer output from custom fields instead of fixed `{ event, data, id, retry }`.
- [ ] In either shape, no transport-level JSON.parse is allowed.

### Phase 4: WebSocket Helpers

- [ ] Keep current JSON envelope behavior only behind explicit `ws.json(map)` or documented legacy shorthand.
- [ ] Add / document `ws.text(struct)` for raw text source.
- [ ] Add / document `ws.binary(struct)` for raw binary source.
- [ ] Do not decode binary frame as UTF-8 JSON unless an explicit future codec marks that behavior.

### Phase 5: Docs And Migration

- [ ] Add conversion diagrams for SSE raw values.
- [ ] Document `struct.json(...)` as JSON codec annotation.
- [ ] Remove docs that describe `struct.json(...)` as generic source decoder.
- [ ] Add migration notes from auto JSON SSE to `data: struct.json(...)`.

---

## 7. Test Matrix

```ts
test('sse parser emits data as string')
test('sse runtime does not JSON.parse data before struct parsing')
test('sse data struct.string returns json-looking text as raw string')
test('sse data struct.number rejects numeric text')
test('sse data struct.boolean rejects boolean text')
test('sse data struct.object rejects json object text without json codec')
test('sse data struct.array rejects json array text without json codec')
test('sse data struct.json number parses numeric json text')
test('sse data struct.json boolean parses boolean json text')
test('sse data struct.json string parses json string text')
test('sse data struct.json object parses json object text')
test('sse data struct.json array parses json array text')
test('sse data struct.json reports invalid json without fallback')
test('sse data struct.json reports inner struct errors after JSON.parse')
test('websocket raw text struct receives string source as-is')
test('websocket raw binary struct receives binary source as-is')
test('websocket json envelope is explicit protocol behavior')
test('existing http request body struct.json remains compatible')
```

---

## 8. Rejected Alternatives

### 8.1 Transport-Level JSON Guessing

Rejected:

```ts
try {
  return JSON.parse(data)
} catch {
  return data
}
```

Reasons:

- It makes result type depend on payload shape instead of struct.
- `struct.string()` can unexpectedly receive object / number / boolean.
- `struct.object(...)` can accidentally succeed on SSE string data.
- JSON parse failure fallback hides protocol/data errors.
- It bypasses the explicit `kind=json` marker.

### 8.2 `struct.object(...)` Auto JSON.parse

Rejected:

- Plain object struct must mean object source.
- Auto JSON.parse would make `struct.object(...)` and `struct.json(struct.object(...))` indistinguishable in practice.
- It prevents users from seeing the true wire/source type.

### 8.3 Independent Message Transformer

Rejected:

- It creates a second parsing path outside struct.
- It can bypass field tags, zero value behavior, issue paths, and encode/decode symmetry.
- The JSON behavior already has a natural home: struct kind / codec annotation.

### 8.4 Restricting Messages To Object Payloads

Rejected:

- SSE data can be plain text.
- JSON primitive content such as `true`, `123`, or `"hello"` is valid when explicitly marked with `struct.json(...)`.
- Binary and other future codecs should be expressed explicitly, not by forcing object-only payloads.

---

## 9. Source References

Internal:

- `packages/core/src/sse/transport/parser.ts`
- `packages/core/src/sse/sse.ts`
- `packages/core/src/struct/constructors.ts`
- `packages/core/src/struct/parse.ts`
- `packages/core/src/struct/codec/json.ts`
- `packages/core/src/web_socket/codec.ts`
- `packages/core/src/http/http.ts`

External:

- [MDN Using server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [MDN WebSocket message event](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/message_event)
- [MDN WebSocket binaryType](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/binaryType)
- [Go encoding/json](https://pkg.go.dev/encoding/json)
- [Zod basics](https://zod.dev/basics)
