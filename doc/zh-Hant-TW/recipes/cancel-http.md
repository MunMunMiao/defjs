---
title: 取消 HTTP 呼叫
description: Abort 或逾時一個 execute 呼叫，並讀取 ABORTED / TIMEOUT。
---

# 取消 HTTP 呼叫

傳 `signal`，再加上 `abort` 或 `timeout` 其中一個 — 不要同時傳 `abort` 跟 `timeout`。`timeout` 必須是 `1..2_147_483_647` 的正 safe integer。

細節見 [HTTP](../core/http.md#cancel-the-work)。

```ts cancel-report.ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getReport = defineRequest({ method: 'GET', path: '/report' })

const controller = new AbortController()
const pending = client.execute(getReport(), {
  signal: controller.signal,
  timeout: 5_000,
})

controller.abort('screen closed')
const [error] = await pending

if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancelled')
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error) {
  console.error(error.code)
} else {
  console.log('got the report')
}
```

```txt
caller cancelled
```

取消告訴你的是呼叫端觀察到的結果。它不能證明伺服器端寫入已回滾 — mutation 重試請放在 idempotency 契約後面。
