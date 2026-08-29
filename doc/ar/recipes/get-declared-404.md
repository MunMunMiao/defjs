---
title: GET مع 404 معلَن
description: نفّذ GET واحدًا وفرّع على 200 مُنوَّع مقابل 404 معلَن.
---

# GET مع 404 معلَن

أعلن أجسام النجاح و404 معًا. فرّع على `error.kind` و`error.status` — تحصل على `error.data` مُنوَّعًا للفقدان المعلَن.

انظر [HTTP](../core/http.md) و[الأخطاء](../core/errors.md) للتفاصيل.

```ts get-user.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))

if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

```txt
Loaded Ada from 200
```

الحالة غير المعلَنة تصبح `UNDECLARED_STATUS` قبل فك ترميز الجسم — أعلن كل حالة تهتم بها.
