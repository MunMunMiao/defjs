---
title: WebSocket セッションを開く
description: 接続し、型付きエンベロープを 1 つ送り、1 つ受け取り、close して closed を await します。
---

# WebSocket セッションを開く

JSON エンベロープは空でない文字列の `type` を使います。購読解除、`close`、`await session.closed` は呼び出し側の責任です。

詳細は [WebSocket](../core/web-socket.md) を見てください。

```ts chat.ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))

const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, session] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code)
} else {
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
    session.close(1000, 'consumer-finished')
    await session.closed
  }
}
```

```txt
message Hello
```

再接続はオプトインです（`withWebSocketReconnect`）。ハートビートもオプトインです。ブラウザーの WebSocket は任意のハンドシェイクヘッダーを取れません — cookie、サブプロトコル、短命チケットを使ってください。
