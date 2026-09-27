---
title: Design decisions
description: 點解 Defjs 要將 contracts、commands、transport results、decoding 同 ownership 寫得咁明確。
---

# Design decisions

Defjs 刻意做咗幾個 trade-offs。Convenience APIs 好多時會隱藏邊個 own 住 request、stream 或者 session。Defjs 要呢條 boundary 睇得見，等你可以 reuse 同一個 endpoint contract，又唔會靜靜雞拎住 cache、retry scheduler 或者 resource manager。

## 聲明即斷言

呢六條規則決定咗「response 點讀」嘅所有問題。編咗號，方便日後討論時直接引用，唔使重新推導一次。

### 1. 你聲明嘅就係你斷言嘅

`output` 嘅意思係「`ok` 係 true 嘅時候，body **就係**呢個形狀」。`error` 嘅意思係「`ok` 係 false 嘅時候，body **就係**呢個形狀」。聲明唔係提示，亦唔係盡力而為嘅期望，而係對「會收到啲咩」嘅斷言。

### 2. `ok` 係唯一分流點，而且只走一邊

2xx 用 `output` 讀。其他一律用 `error` 讀。絕對唔會兩邊都試，亦唔會拿另一邊嚟墊底。

### 3. 現實同斷言唔一致就係失敗，而且要明確報

唔猜 format、唔降級、唔靜靜雞。係後端改咗、gateway 插手，抑或有人改過個 response，**都唔影響結論**——library 分唔出，亦唔應該裝到分得出。

呢條最多人想放寬，所以值得將情況講清楚。假設有個壞蛋可以改寫你個頁面本應按 `output` 解析嘅 `200`，而你收到嘅係 `3xx`、`4xx` 或者 `5xx`。報錯唔係麻煩，而係唯一安全嘅結果。「以防萬一」將原始 body 交俾你，等於俾任何可以注入 response 嘅人一條路，繞過你自己要求嘅 validation。

### 4. 解碼失敗就冇 body

body **就係**解碼之後嘅值。解碼失敗就冇值——唔存在半成品 body 俾你睇。出錯細節喺 `cause` 上面；response 只保留 metadata，其他冇。

呢條由 type system 強制，唔靠約定：解碼 fault 嘅 `response` 係 `HttpMeta`，根本冇 `body` field，去拿佢就係 compile error。

### 5. 唔想被斷言綁住，就唔好聲明

唔寫 `output` 意思係「我唔關心 2xx 嘅 body」——佢根本唔會被讀。唔寫 `error` 對其餘 status 同理。呢個係明示 opt-out，唔係漏咗，而且徹底：你 opt out 嗰一邊嘅 body 讀唔出，唔係你嘅事，連「佢讀唔出」呢件事本身都唔係。

### 6. 3xx 唔係 error code 區間

如果你知道某個 endpoint 會回 redirect status，就唔好俾 `output` 傳對應嘅 schema，或者聲明一個接受空值嘅 schema。否則報錯係預期結果，唔係缺陷。

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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
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

解碼**只發生一次，而且係喺 interceptor chain 之後**。Interceptor 用 `makeResponse(...)` 造出嚟嘅 response，同線上真實嚟嘅 response 會被一模一樣地解讀：response 由邊嚟，唔影響佢點被讀，所以唔存在「信 interceptor」呢條要考慮嘅岔路。

次序係：media type，然後 representation，然後 Struct。

| 冇守住嘅係                                | Fault                                          |
| ----------------------------------------- | ---------------------------------------------- |
| Media type 唔係所聲明 representation 要嘅 | `RES_MEDIA_TYPE_INVALID`——讀 body **之前**就報 |
| Bytes 唔係嗰個 representation             | `RES_DECODE_FAILED`                            |
| 值唔符合嗰個 Struct                       | `RES_STRUCT_MISMATCH`                          |
| 非 2xx，而 `error` 解到                   | `HTTP_STATUS`，`data` 有 type                  |
| 非 2xx，而冇聲明 `error`                  | `HTTP_STATUS`，`data: undefined`               |

先查 media type，就係將「我要 JSON，收到 HTML」變成一個精確嘅 fault，而唔係一個 parser error，而且完全跳過讀取、解析同 Struct。

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
  output: struct.object({ accepted: struct.number() }),
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
