---
title: Annuler un appel HTTP
description: Aborte ou timeout un execute et lis ABORTED / TIMEOUT.
---

# Annuler un appel HTTP

Passe `signal` plus soit `abort` soit `timeout` — pas `abort` et `timeout` ensemble. `timeout` doit être un entier sûr positif dans `1..2_147_483_647`.

Voir [HTTP](../core/http.md#cancel-the-work) pour les détails.

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

L’annulation te dit ce que l’appelant a observé. Elle ne prouve pas qu’une écriture côté serveur a été annulée — garde les retries de mutation derrière un contrat d’idempotence.
