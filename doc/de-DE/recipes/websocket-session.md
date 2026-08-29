---
title: WebSocket-Session öffnen
description: Verbinden, einen typisierten Envelope senden, einmal empfangen, dann schließen und closed abwarten.
---

# WebSocket-Session öffnen

JSON-Envelopes nutzen einen nicht-leeren String `type`. Du besitzt Unsubscribe, `close` und `await session.closed`.

Details siehe [WebSocket](../core/web-socket.md).

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

Reconnect ist opt-in (`withWebSocketReconnect`). Heartbeat ebenfalls. Browser-WebSockets können keine beliebigen Handshake-Headers nehmen — nutze Cookies, Subprotocols oder ein short-lived Ticket.
