---
title: HTTP-Aufruf abbrechen
description: Abort oder Timeout eines execute-Aufrufs und ABORTED / TIMEOUT lesen.
---

# HTTP-Aufruf abbrechen

Gib `signal` plus entweder `abort` oder `timeout` — nicht beides `abort` und `timeout`. `timeout` muss eine positive Safe Integer in `1..2_147_483_647` sein.

Details siehe [HTTP](../core/http.md#cancel-the-work).

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

Cancellation sagt dir, was der Caller beobachtet hat. Sie beweist nicht, dass ein server-seitiger Write zurückgerollt wurde — halte Mutation-Retries hinter einem Idempotency-Vertrag.
