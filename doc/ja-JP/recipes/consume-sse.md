---
title: SSE ストリームを消費する
description: 型付きイベントストリームを開き、一度だけ反復し、close して closed を await します。
---

# SSE ストリームを消費する

ストリームあたり非同期イテレータは 1 つです。早めの exit で Fetch 試行を漏らさないよう、`finally` で `close` + `await stream.closed` を置きます。

詳細は [SSE](../core/sse.md) を見てください。

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

SSE はネットワークや読み取りの失敗をデフォルトではリトライしません。`withSSEReconnect(...)` で明示的に有効にしてください。再接続を設定すると `attempts` のデフォルトは `3` になり、`attempts: 0` はリトライを無効にします。
