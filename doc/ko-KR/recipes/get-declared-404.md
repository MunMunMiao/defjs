---
title: 선언된 404가 있는 GET
description: GET 하나를 실행하고 타입이 잡힌 200과 선언된 404로 분기해요.
---

# 선언된 404가 있는 GET

성공과 404 body를 모두 선언해요. `error.kind`와 `error.status`로 분기하면 선언된 miss에 타입이 잡힌 `error.data`를 받아요.

자세한 내용은 [HTTP](../core/http.md)와 [오류](../core/errors.md)를 보세요.

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

미선언 status는 body 디코딩 전에 `UNDECLARED_STATUS`가 돼요 — 관심 있는 status는 모두 선언해요.
