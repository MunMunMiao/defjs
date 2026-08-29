---
title: GET 配 declared 404
description: Execute 一次 GET，按 typed 200 vs declared 404 分支。
---

# GET 配 declared 404

同時 declare success 同 404 bodies。用 `error.kind` 同 `error.status` 分支 — declared miss 會畀你 typed `error.data`。

詳情睇 [HTTP](../core/http.md) 同 [Errors](../core/errors.md)。

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

Undeclared status 會喺 body decoding 之前變成 `UNDECLARED_STATUS` — 你在意嘅 status 都要 declare。
