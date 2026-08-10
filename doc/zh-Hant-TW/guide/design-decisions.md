---
title: 設計決策
description: Defjs 為何採用明確的用戶端、各傳輸專屬的 tuple、執行階段生命週期選項、投影式 build 與觀察器。
---

# 設計決策

本頁只說明目前 API 背後的理由。欄位與預設值請查閱各參考頁面。

## 明確建立用戶端

Defjs 沒有整個 process 共用的預設用戶端。`createClient(...)` 讓資源歸屬在呼叫處一目了然，應用程式也能針對不同端點、憑證、測試或請求範圍建立不同用戶端。

這種隔離仍有邊界。攔截器與選項 callback 可能閉包共用應用程式狀態，因此兩個 client 物件不代表周邊所有狀態都彼此隔離。`setErrorMap(...)` 也是整個 process 共用。若選項或閉包包含 request、使用者、tenant、cookie 或授權資料，伺服器端程式碼應該為每個請求建立專屬用戶端。

明確的用戶端也讓資源歸屬比較容易討論，但 client 不是資源管理器。它不會追蹤或釋放進行中的 HTTP 請求、SSE handle 或 WebSocket session。

## 各傳輸專屬的 Tuple

所有支援的指令都使用 error-first 三元素 tuple，但第三個元素會保留該傳輸自己的意義：

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

這樣不會把 HTTP response wrapper、SSE 啟動開啟快照與 WebSocket 啟動連線快照硬塞進同一個模糊抽象。第二個元素也遵循同樣原則：HTTP 回傳解碼後資料，SSE 回傳邏輯 stream handle，WebSocket 則回傳邏輯 session。

Tuple 讓預期內的啟動失敗可以明確處理，不必強迫使用例外控制流程。但這不保證任意攔截器、callback、監聽器或不受支援的值永遠不會 reject 或 throw。

## 生命週期選項屬於每次執行

端點定義描述穩定的 wire 契約，並擁有 transport queue 上限。取消、timeout、heartbeat 與 reconnect，則屬於實際擁有該工作的執行操作。

HTTP 與 SSE 在執行時接受取消選項。WebSocket 也接受每次執行的 `beforeConnect`、heartbeat、reconnect 與 protocol 選項。若傳輸支援，用戶端選項可以提供可重複使用的預設值；WebSocket incoming/outgoing 容量仍由端點定義。

這樣拆分後，同一個指令可以重複使用。背景工作與互動式畫面能用不同生命週期執行同一個指令，不必重新定義路徑或訊息 schema。

## `build` 使用投影

自訂 `build(request, input)` 收到的是從輸入 Struct 衍生的宣告式綁定檢視，不是呼叫端傳入的執行階段值。

這個檢視會記錄來源欄位如何對應到 path、query、headers 與 body。它支援欄位投影、明確指定 wire key，以及陣列的一對一投影；並刻意禁止依值分支、任意轉換與注入 literal 投影值。

這項限制讓請求建構始終繫結於宣告過的 Struct 欄位。應用程式層級的正規化與商務規則驗證，應在建立指令之前完成。支援的投影形式請見[指令](/zh-Hant-TW/core/commands)。

## 觀察器不負責控制流程

SSE `onInvalidEvent` 只觀察被丟棄的事件。觀察器 throw 的錯誤與回傳的 rejected promise 會和 stream 控制流隔離，後續處理仍會繼續；但 async 觀察器依然會被 await，因此可能延後後續訊息。

WebSocket 狀態與 runtime error 監聽器也是觀察器。它們 throw 的錯誤與 rejected promise 會被隔離：狀態監聽器失敗會轉交 runtime error 監聽器，runtime error 監聽器失敗會在可用時交給全域 `reportError`，其餘監聽器與生命週期工作仍會繼續。

生命週期決策請使用回傳的 handle 或 session。觀察器適合做範圍明確的記錄、metrics 或狀態更新，擁有者釋放時也要移除它們。

## 相關參考

- [Client](/zh-Hant-TW/core/client)說明選項組合與用戶端範圍。
- [錯誤](/zh-Hant-TW/core/errors)說明 tuple 失敗與回應是否可用。
- [SSE](/zh-Hant-TW/core/sse)與 [WebSocket](/zh-Hant-TW/core/web-socket)說明邏輯 handle、實體嘗試與終止關閉。
