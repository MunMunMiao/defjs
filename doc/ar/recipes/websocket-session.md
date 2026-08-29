---
title: فتح جلسة WebSocket
description: اتصل، أرسل غلافًا مُنوَّعًا واحدًا، استقبل مرة، ثم أغلق وانتظر closed.
---

# فتح جلسة WebSocket

أغلفة JSON تستخدم `type` سلسلة غير فارغة. أنت تملك إلغاء الاشتراك و`close` و`await session.closed`.

انظر [WebSocket](../core/web-socket.md) للتفاصيل.

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

إعادة الاتصال اختيارية (`withWebSocketReconnect`). نبض القلب اختياري أيضًا. WebSocket في المتصفح لا يقبل رؤوس مصافحة عشوائية — استخدم ملفات تعريف الارتباط أو البروتوكولات الفرعية أو تذكرة قصيرة العمر.
