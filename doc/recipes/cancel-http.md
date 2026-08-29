---
title: Cancel an HTTP call
description: Abort or time out an execute call and read ABORTED / TIMEOUT.
---

# Cancel an HTTP call

Pass `signal` plus either `abort` or `timeout` — not both `abort` and `timeout`. `timeout` must be a positive safe integer in `1..2_147_483_647`.

See [HTTP](../core/http.md#cancel-the-work) for details.

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

Cancellation tells you what the caller observed. It does not prove a server-side write rolled back — keep mutation retries behind an idempotency contract.
