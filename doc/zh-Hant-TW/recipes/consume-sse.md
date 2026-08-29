---
title: 消費 SSE 串流
description: 開啟型別化的事件串流，迭代一次，然後 close 並 await closed。
---

# 消費 SSE 串流

每個串流只有一個 async iterator。把 `close` + `await stream.closed` 放在 `finally`，避免提早離開時漏掉 Fetch attempt。

細節見 [SSE](../core/sse.md)。

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

SSE 預設會重試暫時性的網路／讀取失敗。用 `withSSEReconnect({ attempts: N })` 設上限，或用 `attempts: 0` 關掉。
