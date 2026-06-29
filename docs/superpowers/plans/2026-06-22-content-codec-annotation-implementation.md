# Content Codec Annotation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the first landing of content codec annotations: preserve HTTP request body behavior while making SSE event data decoding depend on the selected event struct instead of transport-level JSON guessing.

**Architecture:** Keep `StructLike` logical input/output unchanged. HTTP remains the request-body materialization boundary, with a small internal vocabulary bridge around the existing request body codec names. SSE gains a private source-boundary decoder that first resolves `events[eventName] ?? events.default`, then decodes raw string data according to the selected struct.

**Tech Stack:** TypeScript, Vitest, tsgo, pnpm, `@defjs/core`, VitePress docs.

## Global Constraints

- Boundary selection happens before codec dispatch.
- `_struct.input` and `_struct.output` continue to represent logical authoring input and parsed output.
- `struct.json(inner)` in HTTP request input accepts the inner logical object, not a JSON string.
- Ordinary `parseStructValue()` and `encodeStructValue()` keep logical value semantics.
- WebSocket remains unchanged in this implementation.
- Do not implement WebSocket `ws.json(...)`, raw `ws.text(...)`, raw `ws.binary(...)`, HTTP response codecs, or a full-source-object SSE API.
- Do not export any public `ContentCodec*` type.
- Do not rename runtime kind `requestBody`.
- Missing SSE event structs must report `missing-struct` with raw `message.data` and must not parse JSON or primitives first.
- Selected SSE decode/parse failures must report `validation-failed`; invalid JSON under `struct.json(inner)` must not fall back to raw string.
- `onInvalidEvent` observer failures must remain swallowed.
- Preserve HTTP request behavior: JSON alias-aware encode with exactly one `JSON.stringify`, JSON content type, urlencoded/FormData/text/HTML/Blob/ArrayBuffer behavior, stream request support, `contentType: null`, and stale body-content-type protection.
- Do not commit unless the user explicitly asks.

---

## File Structure

- Modify: `packages/core/src/struct/types.ts`
  - Add private-to-package vocabulary aliases for content boundary codecs/descriptors without changing public exports or runtime behavior.
- Modify: `packages/core/src/struct/types.public.type.test.ts`
  - Assert `ContentCodecKind` and `ContentBoundaryDescriptor` are not exported from the public struct entrypoint.
- Modify: `packages/core/src/struct/types.runtime.type.test.ts`
  - Assert logical input/output types for `struct.json`, `struct.formData`, `struct.urlencoded`, `struct.text`, and `struct.request({ body: struct.json(inner) })` remain unchanged.
- Modify: `packages/core/src/internal/request_builder.ts`
  - Optionally use the internal vocabulary alias in request body dispatcher signatures; preserve all behavior.
- Modify: `packages/core/src/internal/request_builder.spec.ts`
  - Add characterization tests around default request-shape body materialization and manual builder behavior so the HTTP boundary remains stable during the refactor.
- Modify: `packages/core/src/sse/sse.ts`
  - Remove transport-level `decodeEventData()` JSON guessing.
  - Add a private SSE source-boundary decoder.
  - Decode raw string data only after the event struct is selected.
- Modify: `packages/core/src/sse/sse.spec.ts`
  - Add target runtime tests for SSE primitive, JSON-wrapper, alias, invalid JSON, missing struct, unsupported wrapper, and observer behavior.
- Modify: `packages/core/src/sse/transport/parser.spec.ts`
  - Add or keep one parser-level characterization test proving parser emits data as raw string.
- Modify: `doc/core/sse.md`
  - Document explicit `struct.json(struct.object(...))` for JSON SSE data and migration away from accidental JSON guessing.

---

### Task 1: Add internal content codec vocabulary and lock logical types

**Files:**

- Modify: `packages/core/src/struct/types.ts:145-152`
- Modify: `packages/core/src/struct/types.public.type.test.ts:1-25`
- Modify: `packages/core/src/struct/types.runtime.type.test.ts:1-158`

**Interfaces:**

- Consumes: existing `RequestBodyCodec`, `RequestBodyDescriptor`, `StructLike`, `Infer`, `struct`.
- Produces:
  - `export type ContentCodecKind = RequestBodyCodec`
  - `export type ContentBoundaryDescriptor = RequestBodyDescriptor`
  - These aliases are internal package vocabulary only. They must not be exported from `packages/core/src/struct/public_api.ts` or `packages/core/src/struct/index.ts`.

- [ ] **Step 1: Add failing public API type test for non-exported content codec vocabulary**

  Edit `packages/core/src/struct/types.public.type.test.ts` so the import block includes these negative assertions directly after the existing `RequestBodyCodec` assertion:

  ```ts
  // @ts-expect-error ContentCodecKind is internal.
  import type { ContentCodecKind } from './index'

  // @ts-expect-error ContentBoundaryDescriptor is internal.
  import type { ContentBoundaryDescriptor } from './index'
  ```

  Then extend the exported missing-type aliases at the bottom:

  ```ts
  export type MissingObjectShape = ObjectShape
  export type MissingRequestShape = RequestShape
  export type MissingRequestBodyCodec = RequestBodyCodec
  export type MissingContentCodecKind = ContentCodecKind
  export type MissingContentBoundaryDescriptor = ContentBoundaryDescriptor
  ```

- [ ] **Step 2: Add failing logical type tests for content annotations**

  Edit `packages/core/src/struct/types.runtime.type.test.ts` after the existing request-body negative assertion around `struct.request({ body: struct.object(...) })` and before the default/passthrough negative assertions. Add this block:

  ```ts
  const JsonBody = struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
      score: struct.number(),
    }),
  )
  type JsonBodyCase = Expect<StrictEqual<Infer<typeof JsonBody>, { displayName: string; score: number }>>
  expectTypeOf<(typeof JsonBody)['_struct']['input']>().toEqualTypeOf<{ displayName?: string | undefined; score?: number | undefined }>()
  expectTypeOf<(typeof JsonBody)['_struct']['output']>().toEqualTypeOf<{ displayName: string; score: number }>()

  const FormDataBody = struct.formData({
    file: struct.blob(),
    title: struct.string(),
  })
  type FormDataBodyCase = Expect<StrictEqual<Infer<typeof FormDataBody>, { file: Blob; title: string }>>
  expectTypeOf<(typeof FormDataBody)['_struct']['input']>().toEqualTypeOf<{ file?: Blob | undefined; title?: string | undefined }>()
  expectTypeOf<(typeof FormDataBody)['_struct']['output']>().toEqualTypeOf<{ file: Blob; title: string }>()

  const UrlencodedBody = struct.urlencoded({
    page: struct.number(),
    q: struct.string(),
  })
  type UrlencodedBodyCase = Expect<StrictEqual<Infer<typeof UrlencodedBody>, { page: number; q: string }>>
  expectTypeOf<(typeof UrlencodedBody)['_struct']['input']>().toEqualTypeOf<{ page?: number | undefined; q?: string | undefined }>()
  expectTypeOf<(typeof UrlencodedBody)['_struct']['output']>().toEqualTypeOf<{ page: number; q: string }>()

  const TextBody = struct.text()
  type TextBodyCase = Expect<StrictEqual<Infer<typeof TextBody>, string>>
  expectTypeOf<(typeof TextBody)['_struct']['input']>().toEqualTypeOf<string | undefined>()
  expectTypeOf<(typeof TextBody)['_struct']['output']>().toEqualTypeOf<string>()

  const RequestWithJsonBody = struct.request({ body: JsonBody })
  expectTypeOf<(typeof RequestWithJsonBody)['_struct']['input']>().toEqualTypeOf<{
    body?: { displayName?: string | undefined; score?: number | undefined } | undefined
  }>()
  expectTypeOf<(typeof RequestWithJsonBody)['_struct']['output']>().toEqualTypeOf<{
    body: { displayName: string; score: number }
  }>()
  ```

  Extend the final `Cases` union to include the new type cases:

  ```ts
  export type Cases =
    | AliasOutputCase
    | AnyGuard
    | DateCase
    | FormDataBodyCase
    | IntersectionCase
    | JsonBodyCase
    | MatrixCase
    | ProfileCase
    | SingleIntersectionCase
    | TextBodyCase
    | UnionCase
    | UrlencodedBodyCase
  ```

- [ ] **Step 3: Run type tests and confirm the new internal aliases are missing**

  Run:

  ```sh
  pnpm --filter @defjs/core test:type
  ```

  Expected before implementation: FAIL because `ContentCodecKind` and `ContentBoundaryDescriptor` do not exist on `./index`, and the `@ts-expect-error` lines may report unused depending on TypeScript resolution. The logical type tests should either pass or show an exact type mismatch that must be preserved by the implementation decision, not papered over.

- [ ] **Step 4: Add internal vocabulary aliases without public export**

  Edit `packages/core/src/struct/types.ts` around the request body codec definitions. Replace this block:

  ```ts
  export type RequestBodyCodec = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'urlencoded'
  export const REQUEST_SECTION_KEYS = ['path', 'query', 'headers', 'body'] as const
  export type RequestSectionKey = (typeof REQUEST_SECTION_KEYS)[number]

  export type RequestBodyDescriptor = {
    codec: RequestBodyCodec
    struct: RuntimeStruct
  }
  ```

  with this block:

  ```ts
  export type RequestBodyCodec = 'arrayBuffer' | 'blob' | 'formData' | 'json' | 'text' | 'urlencoded'
  export type ContentCodecKind = RequestBodyCodec
  export const REQUEST_SECTION_KEYS = ['path', 'query', 'headers', 'body'] as const
  export type RequestSectionKey = (typeof REQUEST_SECTION_KEYS)[number]

  export type RequestBodyDescriptor = {
    codec: RequestBodyCodec
    struct: RuntimeStruct
  }
  export type ContentBoundaryDescriptor = RequestBodyDescriptor
  ```

  Do not edit `packages/core/src/struct/public_api.ts`; it must remain:

  ```ts
  export type { AnyStruct, FlattenedStructError, FormattedStructError, Infer, Struct, StructIssue } from './types'
  ```

- [ ] **Step 5: Run type tests and confirm public API remains closed**

  Run:

  ```sh
  pnpm --filter @defjs/core test:type
  ```

  Expected after implementation: PASS. The `@ts-expect-error` assertions for `ContentCodecKind` and `ContentBoundaryDescriptor` must be consumed because those names are not public exports from `./index`.

- [ ] **Step 6: Run core typecheck**

  Run:

  ```sh
  pnpm --filter @defjs/core typecheck
  ```

  Expected: PASS.

---

### Task 2: Preserve and lightly consolidate HTTP request body boundary behavior

**Files:**

- Modify: `packages/core/src/internal/request_builder.ts:1-278`
- Modify: `packages/core/src/internal/request_builder.spec.ts:52-759`

**Interfaces:**

- Consumes: `ContentBoundaryDescriptor` from `../struct/types`, existing `buildRequest()`, `struct.request()`, manual `RequestBuilder` methods.
- Produces: no public API changes. `setRequestShapeBody(state, descriptor, bodyValue)` still materializes request-shaped bodies exactly as before.

- [ ] **Step 1: Add characterization tests for JSON request-shaped body stringification and aliasing**

  In `packages/core/src/internal/request_builder.spec.ts`, inside `describe('request_builder general', () => { ... })`, add this test after the existing `json sets body and content type` test:

  ```ts
  test('request-shaped json body applies aliases and stringifies exactly once', () => {
    const input = struct.request({
      body: struct.json(
        struct.object({
          displayName: struct.string().alias('display_name'),
          nested: struct.object({
            traceId: struct.string().alias('trace_id'),
          }),
        }),
      ),
    })

    const built = buildRequest(
      {
        body: {
          displayName: 'Miao',
          nested: { traceId: 'trace-1' },
        },
      },
      undefined,
      { input },
    )

    expect(built.body).toBe('{"display_name":"Miao","nested":{"trace_id":"trace-1"}}')
    expect(JSON.parse(built.body as string)).toEqual({ display_name: 'Miao', nested: { trace_id: 'trace-1' } })
    expect(built.bodyContentType).toBe('application/json')
  })
  ```

- [ ] **Step 2: Add characterization test for default request-shaped text/html/manual builder separation**

  Add this test after the existing `html sets body and content type` / `xml sets body and content type` tests:

  ```ts
  test('manual html builder remains separate from request-shaped text body defaulting', () => {
    const input = struct.request({ body: struct.text() })

    const defaultBuilt = buildRequest({ body: '<p>plain</p>' }, undefined, { input })
    const htmlBuilt = buildRequest(
      { body: '<p>html</p>' },
      (request, view) => {
        request.setHtml(view.body)
      },
      { input },
    )

    expect(defaultBuilt.body).toBe('<p>plain</p>')
    expect(defaultBuilt.bodyContentType).toBe('text/plain;charset=UTF-8')
    expect(htmlBuilt.body).toBe('<p>html</p>')
    expect(htmlBuilt.bodyContentType).toBe('text/html;charset=UTF-8')
  })
  ```

- [ ] **Step 3: Add characterization tests for default request-shaped FormData and URLSearchParams**

  Add this test near the existing `distinguishes urlencoded and formData body wrappers` test:

  ```ts
  test('request-shaped urlencoded and formData bodies keep their boundary materializers', () => {
    const urlencodedInput = struct.request({
      body: struct.urlencoded({
        page: struct.number(),
        q: struct.string(),
      }),
    })
    const formDataInput = struct.request({
      body: struct.formData({
        avatar: struct.blob(),
        title: struct.string(),
      }),
    })
    const avatar = new Blob(['avatar'], { type: 'image/png' })

    const urlencoded = buildRequest({ body: { page: 1, q: 'zen kit' } }, undefined, { input: urlencodedInput })
    const multipart = buildRequest({ body: { avatar, title: 'profile' } }, undefined, { input: formDataInput })

    expect(urlencoded.body).toBeInstanceOf(URLSearchParams)
    expect((urlencoded.body as URLSearchParams).toString()).toBe('page=1&q=zen+kit')
    expect(urlencoded.bodyContentType).toBe('application/x-www-form-urlencoded;charset=UTF-8')

    expect(multipart.body).toBeInstanceOf(FormData)
    expect((multipart.body as FormData).get('avatar')).toBe(avatar)
    expect((multipart.body as FormData).get('title')).toBe('profile')
    expect(multipart.bodyContentType).toBeUndefined()
  })
  ```

- [ ] **Step 4: Run HTTP request builder tests before refactor**

  Run:

  ```sh
  pnpm --filter @defjs/core exec vitest run --config vitest.config.ts src/internal/request_builder.spec.ts
  ```

  Expected before implementation: PASS. These are characterization tests for behavior that already exists.

- [ ] **Step 5: Use the internal descriptor vocabulary in the request body dispatcher**

  Edit `packages/core/src/internal/request_builder.ts` import line 1. Replace:

  ```ts
  import type { AnyStruct, RequestBodyDescriptor } from '../struct/types'
  ```

  with:

  ```ts
  import type { AnyStruct, ContentBoundaryDescriptor } from '../struct/types'
  ```

  Then replace the dispatcher signature:

  ```ts
  function setRequestShapeBody(state: RequestBuilderState, descriptor: RequestBodyDescriptor, bodyValue: unknown): void {
  ```

  with:

  ```ts
  function setRequestShapeBody(state: RequestBuilderState, descriptor: ContentBoundaryDescriptor, bodyValue: unknown): void {
  ```

  Keep the switch body exactly equivalent:

  ```ts
  function setRequestShapeBody(state: RequestBuilderState, descriptor: ContentBoundaryDescriptor, bodyValue: unknown): void {
    switch (descriptor.codec) {
      case 'json':
        setJsonBody(state, encodeKeyedValue(descriptor.struct, bodyValue))
        return
      case 'urlencoded':
        setFormUrlEncodedBody(state, encodeFlatRecord(descriptor.struct, bodyValue, 'urlencoded'))
        return
      case 'formData':
        setFormDataBody(state, encodeFlatRecord(descriptor.struct, bodyValue, 'formData') as { [key: string]: RequestFormDataValue })
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

- [ ] **Step 6: Run focused HTTP tests after refactor**

  Run:

  ```sh
  pnpm --filter @defjs/core exec vitest run --config vitest.config.ts src/internal/request_builder.spec.ts src/http/transport/body.spec.ts src/http/transport/fetch.spec.ts src/http/transport/fetch.streaming.spec.ts
  ```

  Expected: PASS. This verifies request builder behavior, stale content-type protection, FormData header deletion, and streaming body handling remain intact.

- [ ] **Step 7: Run core typecheck**

  Run:

  ```sh
  pnpm --filter @defjs/core typecheck
  ```

  Expected: PASS.

---

### Task 3: Add SSE source-boundary target tests

**Files:**

- Modify: `packages/core/src/sse/transport/parser.spec.ts:106-166`
- Modify: `packages/core/src/sse/sse.spec.ts:1-859`

**Interfaces:**

- Consumes: `createClient`, `withEndpoint`, `withSSEHandle`, `withSSEOptions`, `defineEventStream`, `struct`.
- Produces: failing tests describing the target SSE behavior before implementation.

- [ ] **Step 1: Add parser characterization test for JSON-looking raw string data**

  In `packages/core/src/sse/transport/parser.spec.ts`, add this test after `should parse message fields, ids and retry values`:

  ```ts
  test('should keep json-looking data as raw string at parser boundary', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage)

    await parseLine(encoder.encode('event: profile\ndata: {"display_name":"Miao"}\n\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: 'profile',
        data: '{"display_name":"Miao"}',
        retry: undefined,
      },
    ])
  })
  ```

- [ ] **Step 2: Add local SSE response helper in `sse.spec.ts`**

  Near the imports in `packages/core/src/sse/sse.spec.ts`, add these helpers before `describe('request event stream runtime', () => {`:

  ```ts
  function createSSEClientFromText(text: string, options?: Parameters<typeof withSSEOptions>[0]): Client {
    return createClient(
      withEndpoint('https://api.example.com'),
      withSSEHandle(
        (async () =>
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(text))
                controller.close()
              },
            }),
            {
              headers: { 'content-type': 'text/event-stream' },
              status: 200,
            },
          )) as unknown as typeof fetch,
      ),
      ...(options ? [withSSEOptions(options)] : []),
    )
  }

  async function collectStreamEvents<T>(stream: AsyncIterable<T>): Promise<T[]> {
    const events: T[] = []
    for await (const event of stream) {
      events.push(event)
    }
    return events
  }
  ```

  If TypeScript rejects the spread tuple for `withSSEOptions`, use this exact alternative instead:

  ```ts
  function createSSEClientFromText(text: string, options?: Parameters<typeof withSSEOptions>[0]): Client {
    const handle = withSSEHandle(
      (async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode(text))
              controller.close()
            },
          }),
          {
            headers: { 'content-type': 'text/event-stream' },
            status: 200,
          },
        )) as unknown as typeof fetch,
    )

    return options
      ? createClient(withEndpoint('https://api.example.com'), handle, withSSEOptions(options))
      : createClient(withEndpoint('https://api.example.com'), handle)
  }
  ```

- [ ] **Step 3: Add missing-struct test proving no JSON parse happens before selection**

  In `packages/core/src/sse/sse.spec.ts`, after the existing `should invoke onInvalidEvent for unknown event types` test, add:

  ```ts
  test('should report missing struct with raw data without decoding first', async () => {
    const invalidEvents: Array<{ data: string; event: string; reason: string }> = []
    const client = createSSEClientFromText('event: unknown\ndata: {"display_name":"Miao"}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({
          data: context.message.data,
          event: context.message.event,
          reason: context.reason,
        })
      },
    })
    const useStream = defineEventStream({
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      {
        data: '{"display_name":"Miao"}',
        event: 'unknown',
        reason: 'missing-struct',
      },
    ])
  })
  ```

- [ ] **Step 4: Add primitive string/number/boolean target tests**

  Add this block near the existing `should parse empty event data` and validation failure tests:

  ```ts
  test('should keep string event data as raw untrimmed text', async () => {
    const client = createSSEClientFromText('data: {"ok":true}\n\ndata:   padded text  \n\n')
    const useStream = defineEventStream({
      events: { message: struct.string() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: '{"ok":true}', event: 'message', id: undefined, retry: undefined },
      { data: '  padded text', event: 'message', id: undefined, retry: undefined },
    ])
  })

  test('should decode finite number event data from trimmed text', async () => {
    const client = createSSEClientFromText('data:  42  \n\ndata: -1.5\n\n')
    const useStream = defineEventStream({
      events: { message: struct.number() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: 42, event: 'message', id: undefined, retry: undefined },
      { data: -1.5, event: 'message', id: undefined, retry: undefined },
    ])
  })

  test('should reject empty non-finite and NaN number event data', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data:\n\ndata: NaN\n\ndata: Infinity\n\ndata: -Infinity\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      events: { message: struct.number() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      { data: '', reason: 'validation-failed' },
      { data: 'NaN', reason: 'validation-failed' },
      { data: 'Infinity', reason: 'validation-failed' },
      { data: '-Infinity', reason: 'validation-failed' },
    ])
  })

  test('should decode boolean event data only from exact true and false text', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data: true\n\ndata: false\n\ndata: TRUE\n\ndata: 1\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      events: { message: struct.boolean() },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      { data: true, event: 'message', id: undefined, retry: undefined },
      { data: false, event: 'message', id: undefined, retry: undefined },
    ])
    expect(invalidEvents).toEqual([
      { data: 'TRUE', reason: 'validation-failed' },
      { data: '1', reason: 'validation-failed' },
    ])
  })
  ```

  Note: the parser strips one leading space after `data:` per SSE rules. Therefore `data:   padded text` becomes `  padded text`, not `   padded text`.

- [ ] **Step 5: Add JSON wrapper target tests**

  Add this block after the existing alias test or near other decode tests:

  ```ts
  test('should require struct.json wrapper for object JSON event data', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('event: profile\ndata: {"display_name":"Miao"}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      events: {
        profile: struct.object({
          displayName: struct.string().alias('display_name'),
        }),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '{"display_name":"Miao"}', reason: 'validation-failed' }])
  })

  test('should parse struct.json wrapped object event data with aliases', async () => {
    const client = createSSEClientFromText('event: profile\ndata: {"display_name":"Miao","nested":{"trace_id":"trace-1"}}\n\n')
    const useStream = defineEventStream({
      events: {
        profile: struct.json(
          struct.object({
            displayName: struct.string().alias('display_name'),
            nested: struct.object({
              traceId: struct.string().alias('trace_id'),
            }),
          }),
        ),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([
      {
        data: { displayName: 'Miao', nested: { traceId: 'trace-1' } },
        event: 'profile',
        id: undefined,
        retry: undefined,
      },
    ])
  })

  test('should report invalid JSON under struct.json without raw-text retry', async () => {
    const invalidEvents: Array<{ data: string; hasCause: boolean; reason: string }> = []
    const client = createSSEClientFromText('event: profile\ndata: {not-json}\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({
          data: context.message.data,
          hasCause: context.cause !== undefined,
          reason: context.reason,
        })
      },
    })
    const useStream = defineEventStream({
      events: {
        profile: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '{not-json}', hasCause: true, reason: 'validation-failed' }])
  })

  test('should preserve inner issue paths for struct.json event data', async () => {
    const causes: unknown[] = []
    const client = createSSEClientFromText('event: profile\ndata: {"display_name":123}\n\n', {
      onInvalidEvent: async (context) => {
        causes.push(context.cause)
      },
    })
    const useStream = defineEventStream({
      events: {
        profile: struct.json(struct.object({ displayName: struct.string().alias('display_name') })),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(causes[0]).toMatchObject({
      name: 'StructError',
      issues: [
        {
          path: ['displayName'],
        },
      ],
    })
  })
  ```

- [ ] **Step 6: Add plain array and unsupported wrapper tests**

  Add this block near the JSON wrapper target tests:

  ```ts
  test('should reject plain array JSON text without struct.json wrapper', async () => {
    const invalidEvents: Array<{ data: string; reason: string }> = []
    const client = createSSEClientFromText('data: ["a","b"]\n\n', {
      onInvalidEvent: async (context) => {
        invalidEvents.push({ data: context.message.data, reason: context.reason })
      },
    })
    const useStream = defineEventStream({
      events: { message: struct.array(struct.string()) },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([{ data: '["a","b"]', reason: 'validation-failed' }])
  })

  test('should reject unsupported request body wrappers at SSE string boundary', async () => {
    const invalidEvents: Array<{ event: string; reason: string }> = []
    const client = createSSEClientFromText(
      'event: form\ndata: title=Miao\n\nevent: urlencoded\ndata: title=Miao\n\nevent: blob\ndata: bytes\n\nevent: arrayBuffer\ndata: bytes\n\n',
      {
        onInvalidEvent: async (context) => {
          invalidEvents.push({ event: context.message.event, reason: context.reason })
        },
      },
    )
    const useStream = defineEventStream({
      events: {
        arrayBuffer: struct.arrayBuffer(),
        blob: struct.blob(),
        form: struct.formData({ title: struct.string() }),
        urlencoded: struct.urlencoded({ title: struct.string() }),
      },
      path: '/events',
    })

    const [error, stream] = await client.execute(useStream())

    expect(error).toBeNull()
    if (!stream) {
      throw new Error('Expected stream')
    }
    await expect(collectStreamEvents(stream)).resolves.toEqual([])
    expect(invalidEvents).toEqual([
      { event: 'form', reason: 'validation-failed' },
      { event: 'urlencoded', reason: 'validation-failed' },
      { event: 'blob', reason: 'validation-failed' },
      { event: 'arrayBuffer', reason: 'validation-failed' },
    ])
  })
  ```

- [ ] **Step 7: Run focused SSE tests and confirm target failures**

  Run:

  ```sh
  pnpm --filter @defjs/core exec vitest run --config vitest.config.ts src/sse/transport/parser.spec.ts src/sse/sse.spec.ts
  ```

  Expected before implementation: FAIL for the new target tests that require `struct.string()` raw JSON text, selected `struct.number()` text decoding, explicit `struct.json(...)`, and missing-struct raw handling. Existing parser characterization should pass.

---

### Task 4: Implement selected-struct-driven SSE decoding

**Files:**

- Modify: `packages/core/src/sse/sse.ts:17-374`

**Interfaces:**

- Consumes:
  - `AnyStruct` from `../struct`
  - `decodeJson` from `../struct/codec/json`
  - `parseStructValue` from `../struct/introspection`
  - `DEFINITION` from `../struct/symbols`
  - `RuntimeStruct` from `../struct/types`
- Produces private helpers:
  - `parseEventData(struct: AnyStruct, data: string): unknown`
  - `decodeSSEEventData(struct: AnyStruct, data: string): unknown`
  - `parseSSENumber(data: string): number`
  - `parseSSEBoolean(data: string): boolean`
  - `parseSSEJsonBody(struct: RuntimeStruct, data: string): unknown`

- [ ] **Step 1: Update imports for runtime introspection and logical parsing**

  In `packages/core/src/sse/sse.ts`, replace the current struct imports:

  ```ts
  import type { AnyStruct, Infer } from '../struct'
  import { decodeJson } from '../struct/codec/json'
  ```

  with:

  ```ts
  import type { AnyStruct, Infer } from '../struct'
  import { decodeJson } from '../struct/codec/json'
  import { parseStructValue } from '../struct/introspection'
  import { DEFINITION } from '../struct/symbols'
  import type { RuntimeStruct } from '../struct/types'
  ```

- [ ] **Step 2: Stop decoding before event struct selection**

  In `transformStreamMessage()`, delete this line:

  ```ts
  const rawData = decodeEventData(message.data)
  ```

  Then replace the success branch data parse:

  ```ts
  data: await parseEventData(eventStruct, rawData),
  ```

  with:

  ```ts
  data: await parseEventData(eventStruct, message.data),
  ```

  The missing-struct branch must remain before the `try` block and must keep `data: message.data`.

- [ ] **Step 3: Replace old transport-level JSON guessing helpers**

  In `packages/core/src/sse/sse.ts`, replace the old helpers:

  ```ts
  function parseEventData(struct: AnyStruct, data: unknown): unknown {
    return decodeJson(struct, data)
  }

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

  with:

  ```ts
  function parseEventData(struct: AnyStruct, data: string): unknown {
    return decodeSSEEventData(struct, data)
  }

  function decodeSSEEventData(struct: AnyStruct, data: string): unknown {
    const runtime = struct as unknown as RuntimeStruct
    const definition = runtime[DEFINITION]

    switch (definition.kind) {
      case 'any':
      case 'unknown':
      case 'string':
        return parseStructValue(struct, data)
      case 'number':
        return parseStructValue(struct, parseSSENumber(data))
      case 'boolean':
        return parseStructValue(struct, parseSSEBoolean(data))
      case 'requestBody':
        if (definition.codec === 'json') {
          return parseSSEJsonBody(definition.struct as RuntimeStruct, data)
        }
        throw new TypeError(`SSE event data does not support ${definition.codec} content codec`)
      case 'arrayBuffer':
      case 'blob':
        throw new TypeError(`SSE event data does not support ${definition.kind} content codec`)
      default:
        return parseStructValue(struct, data)
    }
  }

  function parseSSENumber(data: string): number {
    const trimmed = data.trim()
    if (!trimmed) {
      throw new TypeError('SSE number event data must not be empty')
    }

    const value = Number(trimmed)
    if (!Number.isFinite(value)) {
      throw new TypeError('SSE number event data must be finite')
    }

    return value
  }

  function parseSSEBoolean(data: string): boolean {
    const trimmed = data.trim()
    if (trimmed === 'true') {
      return true
    }
    if (trimmed === 'false') {
      return false
    }
    throw new TypeError('SSE boolean event data must be true or false')
  }

  function parseSSEJsonBody(struct: RuntimeStruct, data: string): unknown {
    return decodeJson(struct, JSON.parse(data) as unknown)
  }
  ```

  This implementation intentionally leaves plain object/array/record/literal/enum/union/intersection/date/bigint structs on the ordinary logical parse path with the raw string.

- [ ] **Step 4: Run focused SSE tests**

  Run:

  ```sh
  pnpm --filter @defjs/core exec vitest run --config vitest.config.ts src/sse/transport/parser.spec.ts src/sse/sse.spec.ts
  ```

  Expected after implementation: PASS. If a test fails because the exact parser whitespace is different, inspect the received string and adjust only the test expectation to the parser’s established raw-data behavior; do not reintroduce JSON guessing.

- [ ] **Step 5: Run SSE type tests**

  Run:

  ```sh
  pnpm --filter @defjs/core exec vitest run --config vitest.config.node.ts --typecheck.only --typecheck.include "src/sse/**/*.type.test.ts"
  ```

  Expected: PASS.

- [ ] **Step 6: Run core behavior and type gates**

  Run:

  ```sh
  pnpm --filter @defjs/core test
  pnpm --filter @defjs/core typecheck
  ```

  Expected: PASS.

---

### Task 5: Document explicit SSE JSON content annotations

**Files:**

- Modify: `doc/core/sse.md:10-44`
- Modify: `doc/core/sse.md:121-143`

**Interfaces:**

- Consumes: implemented behavior from Task 4.
- Produces: docs explaining that SSE JSON payloads require `struct.json(inner)` and raw text primitives remain text-first.

- [ ] **Step 1: Update the event definition example to use `struct.json` for object JSON data**

  In `doc/core/sse.md`, replace the example in “Defining an Event Stream”:

  ```ts
  const useNotifications = defineEventStream({
    path: '/v1/notifications',
    events: {
      message: struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
      heartbeat: struct.string(),
    },
  })
  ```

  with:

  ```ts
  const useNotifications = defineEventStream({
    path: '/v1/notifications',
    events: {
      message: struct.json(
        struct.object({
          id: struct.number(),
          text: struct.string(),
        }),
      ),
      heartbeat: struct.string(),
    },
  })
  ```

- [ ] **Step 2: Update default event example**

  In `doc/core/sse.md`, replace:

  ```ts
  const useMixedStream = defineEventStream({
    path: '/v1/events',
    events: {
      userconnect: struct.object({ uid: struct.number() }),
      default: struct.object({ note: struct.string() }),
    },
  })
  ```

  with:

  ```ts
  const useMixedStream = defineEventStream({
    path: '/v1/events',
    events: {
      userconnect: struct.json(struct.object({ uid: struct.number() })),
      default: struct.json(struct.object({ note: struct.string() })),
    },
  })
  ```

- [ ] **Step 3: Add explicit content decoding section**

  After “Default Event Struct” and before “Event Streams with Input”, add:

  ````md
  ### Event Data Content Decoding

  SSE transport delivers each `data:` payload as text. Defjs first selects the event struct from `events[eventName] ?? events.default`, then decodes the text according to that selected struct.

  Use `struct.json(inner)` when the server sends JSON text for an event:

  ```typescript
  const useProfileStream = defineEventStream({
    path: '/v1/profile-events',
    events: {
      profile: struct.json(
        struct.object({
          displayName: struct.string().alias('display_name'),
        }),
      ),
    },
  })
  ```
  ````

  For primitive text payloads:
  - `struct.string()` and `struct.text()` read the raw event text.
  - `struct.number()` trims the text and accepts only finite numeric values.
  - `struct.boolean()` trims the text and accepts only exact `true` or `false`.

  Plain `struct.object(...)` and `struct.array(...)` do not parse JSON text by themselves. Wrap them in `struct.json(...)` for JSON event data.

  ```

  ```

- [ ] **Step 4: Add migration note in invalid event section**

  In “Invalid Event Handling: onInvalidEvent”, after the paragraph introducing the observer, add:

  ```md
  A common validation failure is declaring `struct.object(...)` for an event whose `data:` field is JSON text. Declare `struct.json(struct.object(...))` instead. Invalid JSON under `struct.json(...)` is reported as `validation-failed` and is not retried as raw text.
  ```

- [ ] **Step 5: Run docs verification**

  Run:

  ```sh
  pnpm --filter doc test
  pnpm --filter doc typecheck
  pnpm --filter doc docs:build
  ```

  Expected: PASS.

---

### Task 6: Final verification and regression sweep

**Files:**

- Verify only; no planned source edits.

**Interfaces:**

- Consumes: all changes from Tasks 1-5.
- Produces: verified working implementation, or a precise failure report with failing commands and outputs.

- [ ] **Step 1: Run core type tests**

  Run:

  ```sh
  pnpm --filter @defjs/core test:type
  ```

  Expected: PASS.

- [ ] **Step 2: Run core typecheck**

  Run:

  ```sh
  pnpm --filter @defjs/core typecheck
  ```

  Expected: PASS.

- [ ] **Step 3: Run core tests**

  Run:

  ```sh
  pnpm --filter @defjs/core test
  ```

  Expected: PASS.

- [ ] **Step 4: Run docs tests and build because `doc/core/sse.md` changed**

  Run:

  ```sh
  pnpm --filter doc test
  pnpm --filter doc typecheck
  pnpm --filter doc docs:build
  ```

  Expected: PASS.

- [ ] **Step 5: Run workspace gates**

  Run:

  ```sh
  pnpm check
  pnpm test
  ```

  Expected: PASS.

- [ ] **Step 6: Inspect changed files**

  Run:

  ```sh
  git status --short
  git diff --check
  ```

  Expected:
  - `git diff --check` prints no output.
  - Changed files are limited to the implementation files, tests, docs, the previously modified redesign plan, the confirmed spec, and this implementation plan.
  - No WebSocket runtime or docs files are changed.

- [ ] **Step 7: Report honestly**

  In the final implementation report, include:

  ```md
  已完成：

  - HTTP request body boundary behavior preserved; request-shaped dispatcher now uses internal content-boundary vocabulary.
  - SSE now selects the event struct before decoding data.
  - `struct.json(inner)` is required for JSON SSE data; primitive string/number/boolean source semantics are covered.
  - Docs updated for explicit SSE JSON content annotations.

  验证：

  - `pnpm --filter @defjs/core test:type` — PASS
  - `pnpm --filter @defjs/core typecheck` — PASS
  - `pnpm --filter @defjs/core test` — PASS
  - `pnpm --filter doc test` — PASS
  - `pnpm --filter doc typecheck` — PASS
  - `pnpm --filter doc docs:build` — PASS
  - `pnpm check` — PASS
  - `pnpm test` — PASS
  - `git diff --check` — PASS

  未做：

  - 未实现 WebSocket `ws.json(...)` / `ws.text(...)` / `ws.binary(...)`。
  - 未改 HTTP response codec。
  - 未提交 git commit。
  ```

  If any command fails, replace `PASS` with `FAIL` and include the exact failing command and the relevant error output.

---

## Self-Review

### Spec coverage

- Phase 1 internal type vocabulary bridge: Task 1 adds internal aliases and negative public export tests.
- Phase 2 HTTP request body dispatcher consolidation: Task 2 preserves behavior and changes the dispatcher to the internal descriptor vocabulary.
- Phase 3 SSE source-boundary decoder: Tasks 3 and 4 add tests and implementation for selected-struct-driven decoding.
- HTTP behavior constraints: Task 2 covers JSON, text/html split, URLSearchParams, FormData, Blob, ArrayBuffer, content types, and relies on focused transport tests for stream/stale header behavior.
- SSE missing-struct order: Task 3 missing-struct test and Task 4 removal of pre-selection `decodeEventData()` cover this.
- SSE primitive semantics: Task 3 tests and Task 4 helpers cover string, number, boolean, any/unknown through raw parse path.
- `struct.json(inner)` alias-aware parse and invalid JSON: Task 3 JSON wrapper tests and Task 4 `parseSSEJsonBody()` cover this.
- Unsupported SSE codecs: Task 3 unsupported wrapper test and Task 4 `requestBody` / binary rejection cover this.
- Docs: Task 5 updates `doc/core/sse.md` only.
- WebSocket non-goal: no task modifies WebSocket files.

### Placeholder scan

未发现占位符、延后实现语句或未具体化的测试说明。每个会改动源码的步骤都列出了文件、代码块、命令和预期结果。

### Type consistency

The plan consistently uses current branch names: `StructLike`, `AnyStruct`, `Infer`, `EventStructs`, `RequestBodyCodec`, `RequestBodyDescriptor`, `RequestBodyStruct`, `struct.request`, `struct.json`, `struct.formData`, and `struct.urlencoded`. The produced internal aliases are named `ContentCodecKind` and `ContentBoundaryDescriptor`, and they are not added to `public_api.ts`.
