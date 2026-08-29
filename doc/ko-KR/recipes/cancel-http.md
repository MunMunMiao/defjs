---
title: HTTP 호출 취소하기
description: execute 호출을 abort하거나 타임아웃하고 ABORTED / TIMEOUT을 읽어요.
---

# HTTP 호출 취소하기

`signal`에 `abort` 또는 `timeout` 중 하나를 더해요 — `abort`와 `timeout`을 함께 쓰지 마세요. `timeout`은 `1..2_147_483_647` 범위의 양의 안전 정수여야 해요.

자세한 내용은 [HTTP](../core/http.md#cancel-the-work)를 보세요.

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

취소는 호출자가 관찰한 결과를 알려 줘요. 서버 쪽 쓰기가 롤백됐다는 증명은 아니에요 — 변경 재시도는 멱등성 계약 뒤에 두세요.
