---
title: إلغاء استدعاء HTTP
description: أجهض أو حدّد مهلة لتنفيذ execute واقرأ ABORTED / TIMEOUT.
---

# إلغاء استدعاء HTTP

مرّر `signal` مع إما `abort` أو `timeout` — لا تجمع `abort` و`timeout`. يجب أن يكون `timeout` عددًا صحيحًا آمنًا موجبًا في `1..2_147_483_647`.

انظر [HTTP](../core/http.md#cancel-the-work) للتفاصيل.

```ts cancel-report.ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getReport = defineRequest({ method: 'GET', path: '/report' })

const controller = new AbortController()
const pending = client.execute(getReport(), {
  signal: controller.signal,
  timeout: 5_000,
})

controller.abort('screen closed')
const [error] = await pending

if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancelled')
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error) {
  console.error(error.code)
} else {
  console.log('got the report')
}
```

```txt
caller cancelled
```

الإلغاء يخبرك بما رآه المستدعي. لا يثبت أن كتابة على الخادم تراجعت — أبقِ إعادة محاولات الطفرات خلف عقد تكرار آمن.
