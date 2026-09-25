---
title: Consommer un flux SSE
description: Ouvre un flux d’événements typé, itère une fois, puis ferme et attends closed.
---

# Consommer un flux SSE

Un itérateur async par flux. Mets `close` + `await stream.closed` dans `finally` pour que les sorties anticipées ne fuient pas la tentative Fetch.

Voir [SSE](../core/sse.md) pour les détails.

```ts twoslash notifications.ts
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, stream] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code)
} else {
  try {
    for await (const event of stream) {
      if (event.event === 'message') {
        console.log(event.data.text)
        break
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

```txt
hello from the server
```

SSE ne réessaie pas les échecs réseau ou de lecture par défaut. Active les retries explicitement avec `withSSEReconnect(...)`. Lorsque reconnect est configuré, `attempts` vaut `3` par défaut ; `attempts: 0` désactive les retries.
