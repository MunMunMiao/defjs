---
title: Ouvrir une session WebSocket
description: Connecte, envoie une enveloppe typée, reçois une fois, puis ferme et attends closed.
---

# Ouvrir une session WebSocket

Les enveloppes JSON utilisent un `type` string non vide. Tu possèdes le désabonnement, `close` et `await session.closed`.

Voir [WebSocket](../core/web-socket.md) pour les détails.

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

Le reconnect est opt-in (`withWebSocketReconnect`). Le heartbeat aussi. Les WebSockets navigateur ne peuvent pas prendre d’en-têtes de handshake arbitraires — utilise cookies, sous-protocoles ou un ticket de courte durée.
