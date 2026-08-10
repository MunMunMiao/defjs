---
title: 設計決策
description: 說明 Defjs 為何明確建立 client、按 transport 區分 tuple、把 lifecycle option 留在 execution、以 projection 建構 request，以及 observer 的邊界。
---

# 設計決策

本頁只解釋目前 API 背後的取捨。欄位與預設值請查閱對應的 reference page。

## 明確建立 Client

Defjs 沒有 process-wide default client。`createClient(...)` 令所有權在呼叫位置清楚可見；應用程式亦可因應不同 endpoint、credentials、測試或 request scope 建立不同 client。

這種隔離並不絕對。Interceptor 與 option callback 可以透過 closure 共用應用程式 state，所以兩個 client object 不會自動隔離周邊所有狀態。`setErrorMap(...)` 亦是 process-global。伺服器端 option 或 closure 一旦包含 request、user、tenant、cookie 或 authorization 資料，就應建立 request-scoped client。

明確的 client 亦較容易交代資源所有權，但 client 並非 resource manager。它不會追蹤或 dispose 進行中的 HTTP request、SSE handle 或 WebSocket session。

## Transport-Specific Tuple

所有受支援的 command 都回傳 error-first 三項 tuple，但第三項保留各 transport 自己的意思：

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

這樣就不會把 HTTP response wrapper、SSE startup-open snapshot 與 WebSocket startup-connection snapshot 塞進同一個含糊抽象。第二項亦遵循相同原則：HTTP 回傳解碼後的 data，SSE 回傳 logical stream handle，WebSocket 則回傳 logical session。

Tuple 令預期內的 startup failure 保持明確，毋須強迫應用程式以 exception 控制流程。但這不保證任意 interceptor、callback、listener 或不受支援的值永遠不會 reject 或 throw。

## Lifecycle Option 由 Execution 決定

Endpoint definition 用來描述穩定的 wire contract，同時擁有 transport queue 上限。至於 cancellation、timeout、heartbeat 同 reconnect，應由真正負責這次工作的 execution 決定。

HTTP 同 SSE 可在 execution 時傳入 cancellation option。WebSocket 亦可為單次 execution 設定 `beforeConnect`、heartbeat、reconnect 同 protocol option。Transport 共用的預設值放入 client option；WebSocket incoming/outgoing 容量仍由 endpoint 定義。

這樣一來，command 就可以重用。Background job 同互動頁面可按各自的 lifecycle 執行同一個 command，不必重新定義 path 或 message schema。

## `build` 使用 Projection

自訂 `build(request, input)` 會收到由 input Struct 衍生的 **declarative binding view**，拿不到呼叫方實際傳入的 runtime value。

這個 view 只記錄來源欄位如何投影至 path、query、headers 同 body。它支援 field projection、明確 wire key 同 array 一對一投影，但刻意禁止按值分支、任意 transform，以及注入 literal projection value。

這個限制確保 request construction 一直綁定已宣告的 Struct 欄位。建立 command 前，應用應先處理 normalization 同 business validation。支援的 projection 形式見 [Commands](/zh-Hant-HK/core/commands)。

## Observer 不負責控制流

SSE `onInvalidEvent` 只觀察被丟棄的 event。它拋出的錯誤同回傳的 rejected promise 會與 stream control flow 隔離，後續處理仍會繼續；但 async observer 依然會被 await，可能拖慢後續 message。

WebSocket state 與 runtime-error listener 也是 observer。它們拋出的錯誤同 rejected promise 會被隔離：state listener 失敗會轉交 runtime-error listener，runtime-error listener 失敗會在可用時交給全局 `reportError`，其餘 listener 同 lifecycle work 仍會繼續。

Lifecycle decision 應以回傳的 handle 或 session 為準。Observer 只適合做受限 logging、metrics 或 state update；擁有者 dispose 時要移除它們。

## 相關參考

- [Client](/zh-Hant-HK/core/client)：option 組合與 client scope。
- [Errors](/zh-Hant-HK/core/errors)：tuple failure 與 response availability。
- [SSE](/zh-Hant-HK/core/sse) 與 [WebSocket](/zh-Hant-HK/core/web-socket)：logical handle、實體連線嘗試與 terminal close。
