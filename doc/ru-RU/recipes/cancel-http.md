---
title: Отменить HTTP-вызов
description: Abort или timeout execute и читай ABORTED / TIMEOUT.
---

# Отменить HTTP-вызов

Передай `signal` плюс либо `abort`, либо `timeout` — не оба `abort` и `timeout`. `timeout` — положительное safe integer в `1..2_147_483_647`.

Подробности — в [HTTP](../core/http.md#cancel-the-work).

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

Отмена говорит, что увидел вызывающий. Она не доказывает, что серверная запись откатилась — держи ретраи мутаций за контрактом идемпотентности.
