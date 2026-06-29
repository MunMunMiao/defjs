# Content Codec Annotation Implementation Design

Date: 2026-06-22

## 1. Goal

Implement the first landing of `Content Codec Annotation Redesign Plan`:

- Phase 1: internal type vocabulary bridge, no behavior change.
- Phase 2: HTTP request body dispatcher consolidation, preserving behavior.
- Phase 3: SSE source-boundary decoder, replacing transport-level JSON guessing with selected-struct-driven decoding.

This design intentionally does not implement WebSocket `ws.json(...)`, raw `ws.text(...)`, raw `ws.binary(...)`, HTTP response codecs, or a full-source-object SSE API.

## 2. Core Contract

Boundary selection happens before codec dispatch.

- HTTP first selects the request body descriptor from `struct.request({ body })`.
- SSE first resolves `events[eventName] ?? events.default`.
- WebSocket remains unchanged in this implementation.

Only the selected boundary declaration may trigger JSON parsing, primitive text decoding, form serialization, text handling, or binary pass-through. Ordinary `parseStructValue()` and `encodeStructValue()` keep logical value semantics.

## 3. Architecture Boundaries

### 3.1 Struct Logical Layer

Keep the existing `StructLike<I, O, OO>` model. `_struct.input` and `_struct.output` continue to represent logical authoring input and parsed output.

`RequestBodyStruct<C, S>` continues to delegate input/output to `S`. A JSON request body still accepts the inner logical object as user input, not a JSON string.

No public `ContentCodec*` type is exported in this landing.

### 3.2 HTTP Request Boundary

HTTP request building remains the existing request-body content boundary.

The implementation may add internal aliases such as `ContentCodecKind = RequestBodyCodec` if useful, but should avoid public API churn. The main implementation seam is the request builder body materialization path, especially `setRequestShapeBody()` and nearby body helpers.

The refactor must preserve:

- JSON alias-aware encode and exactly one `JSON.stringify`.
- `application/json` for JSON bodies.
- `application/x-www-form-urlencoded;charset=UTF-8` for urlencoded bodies.
- FormData serialization and content-type deletion behavior.
- `text/plain;charset=UTF-8` for text bodies.
- `text/html;charset=UTF-8` for `setHtml(...)`.
- Blob type detection.
- ArrayBuffer `application/octet-stream` default.
- `ReadableStream<Uint8Array>` request bodies.
- Streaming support probe, upload-progress wrapping, `ERR_STREAMING_REQUEST_UNSUPPORTED`, and fetch `duplex: 'half'`.
- Manual builder projection semantics for `setJson`, `setText`, `setHtml`, `setFormData`, `setFormUrlEncoded`, `addFormData`, `addFormUrlEncoded`, `setBlob`, and `setArrayBuffer`.
- `contentType: null` suppression and stale body-content-type protection.

Manual builder paths are projection-based and must not be forced into a single-inner-struct dispatcher.

### 3.3 SSE Data Boundary

SSE parser remains transport-only. `EventStreamMessage.data` remains raw string.

Target runtime flow:

1. Compute `eventName = message.event || 'message'`.
2. Resolve `eventStruct = events[eventName] ?? events.default`.
3. If missing, notify `missing-struct` with raw `message.data` and return without decoding.
4. If present, call an SSE boundary-only decoder with `(eventStruct, message.data)`.
5. Return `EventStreamData<TEvents>` with decoded logical `data`.

The decoder must not change `_struct.input`, primitive constructors, or ordinary `parseStructValue()` behavior.

SSE first-landing source semantics:

- `struct.string()` returns raw untrimmed text.
- `struct.text()` behaves like raw text.
- `struct.number()` trims text, applies `Number(trimmed)`, and accepts only finite, non-`NaN` values. Empty text is invalid.
- `struct.boolean()` trims text and accepts only exact `true` / `false`.
- `struct.json(inner)` unwraps the JSON request-body/content wrapper, `JSON.parse(rawText)`, then runs alias-aware inner parse.
- `struct.any()` and `struct.unknown()` receive raw string as logical value.
- Plain object, array, record, literal, enum, union, intersection, date, and bigint structs receive raw string through ordinary parse. They only pass if ordinary parse accepts that string.
- `urlencoded`, `formData`, `blob`, and `arrayBuffer` are unsupported at the SSE string boundary in this landing and should fail through `validation-failed`.

## 4. Error Handling

SSE error handling preserves existing public behavior:

- Missing event struct: `missing-struct`.
- Selected struct decode/parse failure: `validation-failed`.
- `onInvalidEvent` observer failures are swallowed and must not tear down the stream.
- Invalid JSON under `struct.json(inner)` is a validation failure and must not fall back to raw string.
- Missing events must never attempt JSON parsing or primitive decoding.

## 5. Testing Strategy

Use TDD: write characterization and target tests before implementation.

### 5.1 Type Tests

Cover:

- `struct.json(inner)` input/output remain inner input/output in logical contexts.
- `struct.formData(...)`, `struct.urlencoded(...)`, and `struct.text()` keep existing logical input/output behavior.
- `struct.request({ body: struct.json(inner) })` accepts inner logical object input, not JSON string.
- No public `ContentCodec*` type is accidentally exported.

### 5.2 HTTP Tests

Preserve or add coverage for:

- JSON body stringified exactly once.
- JSON body content type is `application/json`.
- URL encoded, FormData, text, HTML, Blob, ArrayBuffer behavior remains unchanged.
- `setHtml(...)` keeps `text/html;charset=UTF-8` and existing HTML/XML use cases.
- `ReadableStream<Uint8Array>` upload behavior remains unchanged, including support probe, upload-progress wrapping, unsupported runtime error, and `duplex: 'half'`.
- `contentType: null` and stale body-content-type protection remain stable.

### 5.3 SSE Tests

Add or update tests for:

- Parser emits data as string.
- Missing event reports `missing-struct` without decoding data.
- `struct.string()` returns raw JSON-looking text.
- `struct.number()` decodes finite numeric text and rejects empty, `NaN`, and `Infinity` text.
- `struct.boolean()` accepts only exact `true` and `false` text.
- `struct.object(...)` rejects JSON object text without JSON codec.
- `struct.array(...)` rejects JSON array text without JSON codec.
- `struct.json(struct.object(...))` parses JSON object text.
- `struct.json(inner)` preserves aliased fields.
- `struct.json(inner)` reports invalid JSON without raw-text retry.
- `struct.json(inner)` preserves inner issue paths.
- Unsupported codecs fail through `validation-failed`.
- Selected parse failure reports `validation-failed`.
- `onInvalidEvent` observer errors do not tear down the stream.

## 6. Documentation Strategy

Update only docs tied to implemented behavior.

Required for Phase 3:

- `doc/core/sse.md` must document the migration from accidental SSE JSON guessing to explicit `struct.json(struct.object(...))`.

Optional only if Phase 2 changes examples or terminology:

- `doc/core/http.md`
- `packages/core/src/struct/README.md`
- `doc/core/struct.md`
- `doc/guide/design-decisions.md`

Do not update `doc/core/web-socket.md` in this landing. WebSocket changes are deferred.

Localized docs are out of scope unless explicitly requested later.

## 7. Verification

For type-only changes:

```sh
pnpm --filter @defjs/core test:type
pnpm --filter @defjs/core typecheck
```

For core behavior changes:

```sh
pnpm --filter @defjs/core test
pnpm --filter @defjs/core typecheck
```

If docs are changed:

```sh
pnpm --filter doc test
pnpm --filter doc typecheck
pnpm --filter doc docs:build
```

Final workspace gate after core and docs both change:

```sh
pnpm check
pnpm test
```

Only report commands as passing if actually run and passed.

## 8. Non-Goals

- No WebSocket `ws.json(...)`, `ws.text(...)`, or `ws.binary(...)` implementation.
- No WebSocket public API changes.
- No HTTP response codec redesign.
- No full-source-object SSE API.
- No global JSON-string behavior for `parseStructValue(struct.json(inner), source)`.
- No public `ContentCodec*` type export.
- No localized docs updates in this landing.

## 9. Implementation Notes

- Start from the current dirty worktree knowingly: `docs/superpowers/plans/2026-06-17-content-codec-api-redesign.md` is already modified and should stay separate from runtime changes if possible.
- Keep WebSocket files out of the runtime implementation unless tests reveal an unintended coupling.
- Prefer small internal helpers over broad renames.
- Do not rename runtime kind `requestBody` in this landing.
- If an internal content-boundary helper is introduced, keep it private to core internals unless a later public API design requires export.
