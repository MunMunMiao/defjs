---
title: 선언된 404가 있는 GET
description: GET 하나를 실행하고 타입이 잡힌 200과 선언된 404로 분기해요.
---

# 선언된 404가 있는 GET

성공과 404 body를 모두 선언해요. `error.code`와 `error.status`로 분기하면 선언된 miss에 타입이 잡힌 `error.data`를 받아요.

자세한 내용은 [HTTP](../core/http.md)와 [오류](../core/errors.md)를 보세요.

```ts twoslash get-user.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))

if (error?.code === 'HTTP_STATUS' && error.status === 404) {
  console.log(error.data.message)
} else if (error) {
  console.error(error.code)
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

```txt
Loaded Ada from 200
```

2xx가 아닌 모든 status는 `HTTP_STATUS`예요. `error`를 선언하면 그 body에 타입이 붙고, 빼면 `err.data`가 `undefined`가 되고 body도 읽히지 않아요. 하나의 `error` Struct가 2xx 아닌 모든 status를 담당하니, 모양이 다를 때는 `struct.or(...)`나 판별 가능한 union을 쓰세요.
