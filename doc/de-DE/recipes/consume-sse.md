---
title: SSE-Stream konsumieren
description: Typisierten Event-Stream öffnen, einmal iterieren, dann schließen und closed abwarten.
---

# SSE-Stream konsumieren

Ein Async-Iterator pro Stream. Packe `close` + `await stream.closed` in `finally`, damit frühe Exits den Fetch-Versuch nicht leaken.

Details siehe [SSE](../core/sse.md).

```ts notifications.ts
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

SSE retried transient Network-/Read-Failures defaultmäßig. Cap sie mit `withSSEReconnect({ attempts: N })`, oder disable mit `attempts: 0`.
