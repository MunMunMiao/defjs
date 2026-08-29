---
title: Design decisions
description: 點解 Defjs 要將 contracts、commands、transport results、decoding 同 ownership 寫得咁明確。
---

# Design decisions

Defjs 刻意做咗幾個 trade-offs。Convenience APIs 好多時會隱藏邊個 own 住 request、stream 或者 session。Defjs 要呢條 boundary 睇得見，等你可以 reuse 同一個 endpoint contract，又唔會靜靜雞拎住 cache、retry scheduler 或者 resource manager。

## Explicit clients

代價：冇 process-wide default。呢個代價喺 server 上面好有用 — 當 options 或者 closures capture auth、cookies、users、tenants 或者 request metadata 時，喺 request boundary 入面 create client。Explicit client 都唔會 isolate interceptor capture 嘅 state，而 `struct.parse(..., { errorMap })` 只覆蓋嗰一次 parse 嘅文案。Client identity 本身唔係 security boundary。

Client 負責 dispatch commands。佢唔 own 住 active work。邊個開始 HTTP request、SSE stream 或者 WebSocket session，就要 cancel 或者 close，再 await terminal promise。

## Definitions、builders 同 commands

Definition 係穩定嘅 contract：method、path、input Struct、output mapping、transport limits。Builder 係 callable view。Call 佢會 create 一個 opaque command，畀單次 execution 用。

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

Background job 同 UI owner 可以用唔同 cancel/retry policy 去 execute 同一個 `getUser` 形狀。Command 保持 opaque，就唔會令 app code 依賴 internal transport tags 或者 symbols。

## Transport-specific results

三種傳輸都用 error-first tuple。如果淨係一個 generic「response」，lifecycle facts 就會被抹走。

- HTTP → `[error, data, response]` — decoded output + `HttpResponse`
- SSE → `[error, stream, open]` — 一條 logical stream + startup response snapshot
- WebSocket → `[error, session, connection]` — logical session + startup connection snapshot

第三個 value 係 snapshot，唔係保證之後 reconnect 都係同一條 physical connection 嘅 promise。Startup 失敗時，如果 transport 已經先產出 response/snapshot，第三項仍然可以有。Startup 之後，lifecycle control 屬於 return 出嚟嘅 handle 或者 session。

## Runtime decoding

TypeScript inference 描述你 expect 嘅嘢；佢唔可以喺 runtime check server response。Struct parsing 係 contract 嘅另一半。Defjs 會喺 request construction 之前 validate command input，decode 揀中嘅 representation，再 parse 對應嘅 Struct。

呢個次序令 status 同 body 保持分開嘅 facts。Exact declared status selection 發生喺 body decode **之前**。Declared non-2xx → typed `error.data`。Malformed declared body → `RESPONSE_VALIDATION_FAILED`。Undeclared status → `UNDECLARED_STATUS`（唔係 untyped success/failure）。比起「收到咩 JSON 就係咩」更嚴，但你可以做安全決策。

## `build` 嘅界限

當 input 已經有 path/query/headers/body 時，automatic `struct.request(...)` mapping 係 default。Custom `build(request, input)` 係 constrained projection，用喺 caller shape 同 wire shape 唔一樣：

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` 係 schema-bound view，唔係 caller 嘅 runtime object。Projection 可以 select declared fields、rename targets，同將一個 source array item map 去一個 output item。佢唔可以按 values branch、inject literals，或者改 cardinality。Normalize business data，同做 value-dependent validation，都要喺 create command 之前搞掂。

## Observers 同 policy placement

Interceptors 用嚟做 transport-wide policy：auth、tracing、short-circuit、reviewed retry。佢哋淨係為自己嗰個 transport run，同以 onion order compose。Execution options 用嚟做 work-specific lifetime：`signal`、`timeout`、WebSocket heartbeat、opt-in reconnect。

Observers 報告發生咗咩事，但唔會變成第二個 owner。SSE `onInvalidEvent`、WebSocket state listeners，同 runtime-error listeners 用嚟做 bounded diagnostics 同 metrics。Return 出嚟嘅 stream/session 仍然 own iteration、close、unsubscribe 同 terminal waiting。Caching、stale-result suppression、idempotency，同 domain error mapping 應該包喺 `client.execute(...)` 外圍，等你嘅 app 睇到自己嘅 policy 同 state。

## OpenAPI、sourcemaps 同 telemetry

Defjs 唔會 generate 或者 sync 第二份 OpenAPI contract。如果 OpenAPI 已經係 authoritative，就保留佢，再喺 app boundary 加 runtime validation。對新 service，endpoint definitions 同 Structs 可以直接做 wire contract — 唔使第二個 source of truth。

`withOpenTelemetryServer(...)` 會為 client 加 **outbound** Defjs instrumentation。佢唔會 initialize OpenTelemetry SDK。`tracer` 必填，`meter` 可選，三種傳輸預設開，WebSocket query propagation 預設關。Keep operation names static 同 low-cardinality。Propagation、hooks、URLs、headers、payloads、causes 同 retention 都當可能敏感，要 review。

Sourcemaps 係 deployment decision，唔係 Defjs behavior。Public map 帶 `sourcesContent` 會曝光 source；hidden map 仍然有 source 同 paths；disable maps 就冇 source-level symbolication。將 private maps 當 deployable debugging artifacts，配明確 access 同 retention rules。

## Related recipes

- [GET with a declared 404](../recipes/get-declared-404.md)
- [Test with a local Fetch handle](../recipes/test-with-handle.md)
