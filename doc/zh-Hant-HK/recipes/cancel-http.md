---
title: Cancel 一個 HTTP call
description: Abort 或者 time out 一次 execute，再讀 ABORTED / TIMEOUT。
---

# Cancel 一個 HTTP call

傳 `signal`，再加 `abort` 或者 `timeout` 其中一個 — 唔好同時傳 `abort` 同 `timeout`。`timeout` 一定要係 `1..2_147_483_647` 入面嘅 positive safe integer。

詳情睇 [HTTP](../core/http.md#cancel-the-work)。

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

Cancellation 淨係話你 caller 觀察到咩。佢唔證明 server-side write 已經 rollback — mutation retries 要靠 idempotency contract。
