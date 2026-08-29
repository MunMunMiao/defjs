---
title: 設計決策
description: 為什麼 Defjs 要把契約、command、傳輸結果、解碼與擁有權講清楚。
---

# 設計決策

Defjs 做了幾項刻意取捨。便利 API 常把「誰擁有 request、stream、session」藏起來。Defjs 把這條邊界留在視線內，讓你能重用同一份 endpoint 契約，卻不會默默多出快取、重試排程器或資源管理器。

## 明確的 client

`createClient(...)` 把 endpoint 設定當成明確的值。不同環境或請求範圍可以有不同的 endpoint、憑證、interceptors、serializers、傳輸 handles。

代價：沒有 process-wide 預設。這在伺服器上反而有用 — 當 options 或 closures 會捕捉 auth、cookies、users、tenants 或請求 metadata 時，在請求邊界內建立 client。明確的 client 仍不會隔離 interceptor 捕捉到的狀態，而且 `struct.parse(..., { errorMap })` 只覆蓋那一次 parse 的文案。Client 身分本身不是安全邊界。

Client 負責分派 commands。它不擁有進行中的工作。誰啟動 HTTP 請求、SSE 串流或 WebSocket session，誰就要取消或關閉它，並 await 終端 promise。

## 定義、builder 與 commands

定義是穩定契約：method、path、input Struct、output 對應、傳輸限制。Builder 是可呼叫的視圖。呼叫它會為單次執行建立一個不透明 command。

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

背景工作與 UI 擁有者可以用不同的取消／重試策略執行同一個 `getUser` 形狀。讓 command 保持不透明，可避免應用程式碼依賴內部傳輸 tags 或 symbols。

## 依傳輸區分的結果

三種傳輸都用 error-first tuple。若塞成單一泛用「response」，生命週期事實會被抹掉。

- HTTP → `[error, data, response]` — 解碼後的輸出 + `HttpResponse`
- SSE → `[error, stream, open]` — 一個邏輯串流 + 啟動回應快照
- WebSocket → `[error, session, connection]` — 邏輯 session + 啟動連線快照

第三個值是快照，不是「未來重連仍是同一條實體連線」的 promise。啟動失敗時，若傳輸先產出了回應／快照，第三項仍可能存在。啟動之後，生命週期控制權屬於回傳的 handle 或 session。

## 執行階段解碼

TypeScript 推導描述的是你期待的形狀；它無法在執行階段檢查伺服器回應。Struct 剖析是契約的另一半。Defjs 會在建構請求前驗證 command input，解碼選定的 representation，再剖析對應的 Struct。

這個順序讓 status 與 body 維持為分開的事實。精確的已宣告狀態碼選擇發生在 body 解碼**之前**。已宣告的非 2xx → 型別化的 `error.data`。畸形的已宣告 body → `RESPONSE_VALIDATION_FAILED`。未宣告狀態碼 → `UNDECLARED_STATUS`（不是無型別的成敗）。比「隨便來個 JSON」更嚴，但你能做安全決策。

## `build` 的界線

當 input 已有 path／query／headers／body 時，預設走自動的 `struct.request(...)` 對應。自訂 `build(request, input)` 是呼叫端形狀與 wire 形狀不同時的受約束投影：

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

`input` 是綁定 schema 的視圖，不是呼叫端的執行階段物件。投影可以挑選已宣告欄位、重新命名目標，以及把一個來源陣列項目對到一個輸出項目。它不能依值分支、注入字面量，或改變基數。業務資料正規化與依值驗證，請在建立 command 之前做完。

## Observer 與政策放哪裡

Interceptors 負責傳輸層級政策：auth、tracing、short-circuit、審過的重試。它們只跑在所屬傳輸上，並以洋蔥順序組合。執行 options 負責單次工作的生命週期：`signal`、`timeout`、WebSocket heartbeat、選擇性重連。

Observers 回報發生了什麼，但不會變成第二個擁有者。SSE `onInvalidEvent`、WebSocket state listeners、runtime-error listeners 適合有界的診斷與 metrics。回傳的 stream／session 仍擁有 iteration、close、unsubscribe、終端等待。快取、壓制過期結果、idempotency、網域錯誤對應，應放在 `client.execute(...)` 周圍，讓應用程式能看到自己的政策與狀態。

## OpenAPI、sourcemaps 與遙測

Defjs 不會產生或同步第二份 OpenAPI 契約。若 OpenAPI 已是權威來源，就維持它，並在應用邊界加上執行階段驗證。新服務可以直接把 endpoint 定義與 Structs 當 wire 契約 — 不需要第二個真相來源。

`withOpenTelemetryServer(...)` 為 client 加上**出站** Defjs instrumentation。它不會初始化 OpenTelemetry SDK。`tracer` 必填，`meter` 選填，三種傳輸預設開啟，WebSocket query propagation 預設關閉。操作名稱保持 static、低基數。把 propagation、hooks、URLs、headers、payloads、causes、retention 都當成可能含敏感資料來審。

Sourcemaps 是部署決策，不是 Defjs 行為。公開帶 `sourcesContent` 的 map 會暴露原始碼；隱藏的 map 仍含原始碼與路徑；關閉 maps 就拿掉原始碼層級的 symbolication。把私有 maps 當成可部署的除錯產物，並訂清楚存取與保留規則。

## 相關 recipes

- [已宣告 404 的 GET](../recipes/get-declared-404.md)
- [用本機 Fetch handle 測試](../recipes/test-with-handle.md)
