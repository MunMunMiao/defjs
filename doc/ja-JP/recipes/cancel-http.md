---
title: HTTP 呼び出しをキャンセルする
description: execute を abort またはタイムアウトさせ、ABORTED / TIMEOUT を読み取ります。
---

# HTTP 呼び出しをキャンセルする

`signal` に加えて `abort` か `timeout` のどちらかを渡します — `abort` と `timeout` の両方は不可です。`timeout` は `1..2_147_483_647` の正の安全な整数である必要があります。

詳細は [HTTP](../core/http.md#cancel-the-work) を見てください。

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

キャンセルは呼び出し側が観測したことを伝えます。サーバー側の書き込みがロールバックされたことの証明にはなりません — ミューテーションのリトライは冪等性の契約の後ろに置いてください。
