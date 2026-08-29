---
title: Cancelar una llamada HTTP
description: Aborta o aplica timeout a un execute y lee ABORTED / TIMEOUT.
---

# Cancelar una llamada HTTP

Pasa `signal` más `abort` o `timeout` — no ambos `abort` y `timeout`. `timeout` debe ser un entero seguro positivo en `1..2_147_483_647`.

Ver detalles en [HTTP](../core/http.md#cancel-the-work).

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

La cancelación te dice lo que observó el llamador. No demuestra que una escritura en el servidor se revirtió — mantén los reintentos de mutación detrás de un contrato de idempotencia.
