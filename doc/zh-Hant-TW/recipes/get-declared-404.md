---
title: 已宣告 404 的 GET
description: 執行一次 GET，並依型別化的 200 與已宣告 404 分支。
---

# 已宣告 404 的 GET

同時宣告成功與 404 body。用 `error.kind` 與 `error.status` 分支 — 對已宣告的 miss 會拿到型別化的 `error.data`。

細節見 [HTTP](../core/http.md) 與[錯誤](../core/errors.md)。

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

未宣告的狀態碼會在 body 解碼前變成 `UNDECLARED_STATUS` — 你在意的狀態碼都要宣告。
