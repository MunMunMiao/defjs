---
title: SSE 스트림 소비하기
description: 타입이 잡힌 이벤트 스트림을 열고, 한 번 순회한 뒤 닫고 closed를 await 해요.
---

# SSE 스트림 소비하기

스트림당 async iterator는 하나예요. 조기 종료로 Fetch 시도가 새지 않도록 `finally`에 `close` + `await stream.closed`를 넣어요.

자세한 내용은 [SSE](../core/sse.md)를 보세요.

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

SSE는 기본적으로 네트워크/읽기 실패를 재시도하지 않습니다. `withSSEReconnect(...)`으로 명시적으로 활성화하세요. 재연결을 설정하면 `attempts`의 기본값은 `3`이며, `attempts: 0`은 재시도를 비활성화합니다.
