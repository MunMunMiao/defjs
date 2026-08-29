---
title: POST JSON
description: struct.json으로 JSON body를 보내고 선언된 201을 디코딩해요.
---

# POST JSON

body를 `struct.json(...)`으로 감싸요. 논리 필드 이름은 TypeScript에 두고, 와이어 별칭은 Struct에 둬요.

자세한 내용은 [명령](../core/commands.md)과 [HTTP](../core/http.md)를 보세요.

```ts create-user.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  email: struct.string(),
})

const ApiError = struct.object({
  code: struct.string(),
  message: struct.string(),
})

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 201, body: User },
    { status: [400, 409], body: ApiError },
  ],
})

const [error, user, response] = await client.execute(createUser({ body: { name: 'Ada', email: 'ada@example.com' } }))

if (error?.kind === 'http') {
  console.error(error.status, error.data.message)
} else if (error) {
  console.error(error.code)
} else {
  console.log(`Created ${user.name} → ${response.status}`)
}
```

```txt
Created Ada → 201
```
