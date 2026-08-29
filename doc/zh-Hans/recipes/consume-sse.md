---
title: 消费 SSE 流
description: 打开类型化事件流，迭代一次，再 close 并 await closed。
---

# 消费 SSE 流

一条流只配一个 async iterator。把 `close` + `await stream.closed` 放进 `finally`，提前退出才不会把 Fetch 尝试漏掉。

细节见 [SSE](../core/sse.md)。

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

SSE 默认会重试瞬时网络/读失败。用 `withSSEReconnect({ attempts: N })` 封顶，或 `attempts: 0` 关掉。
