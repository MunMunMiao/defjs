---
title: Consume 一條 SSE stream
description: 開 typed event stream，iterate 一次，之後 close 同 await closed。
---

# Consume 一條 SSE stream

每條 stream 淨係一個 async iterator。將 `close` + `await stream.closed` 放喺 `finally`，提早 exit 都唔會 leak Fetch attempt。

詳情睇 [SSE](../core/sse.md)。

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

SSE 預設會 retry transient network/read failures。用 `withSSEReconnect({ attempts: N })` cap 住，或者 `attempts: 0` 關閉。
