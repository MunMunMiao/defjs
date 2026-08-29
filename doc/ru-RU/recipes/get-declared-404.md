---
title: GET с объявленным 404
description: Выполни один GET и ветвись по типизированному 200 vs объявленному 404.
---

# GET с объявленным 404

Объяви и success, и 404 тела. Ветвись по `error.kind` и `error.status` — для объявленного miss получишь типизированный `error.data`.

Подробности — в [HTTP](../core/http.md) и [Ошибки](../core/errors.md).

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

Необъявленный статус становится `UNDECLARED_STATUS` до decode тела — объявляй каждый статус, который тебе важен.
