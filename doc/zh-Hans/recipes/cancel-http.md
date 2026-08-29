---
title: 取消一次 HTTP
description: 用 abort 或 timeout 打断 execute，读 ABORTED / TIMEOUT。
---

# 取消一次 HTTP

传 `signal`，再配 `abort` 或 `timeout` 其一——别同时传 `abort` 和 `timeout`。`timeout` 必须是 `1..2_147_483_647` 的正 safe integer。

细节见 [HTTP](../core/http.md#cancel-the-work)。

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

取消只说明调用方观察到了什么。它不能证明服务端写入已经回滚——mutation 重试还是要有幂等契约。
