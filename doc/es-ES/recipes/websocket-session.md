---
title: Abrir una sesión WebSocket
description: Conecta, envía un envelope tipado, recibe una vez, luego cierra y await closed.
---

# Abrir una sesión WebSocket

Los envelopes JSON usan un `type` string no vacío. Tú gestionas el unsubscribe, `close` y `await session.closed`.

Ver detalles en [WebSocket](../core/web-socket.md).

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

La reconexión es opt-in (`withWebSocketReconnect`). El heartbeat también. Los WebSockets del navegador no admiten cabeceras arbitrarias de handshake — usa cookies, subprotocolos o un ticket de corta duración.
