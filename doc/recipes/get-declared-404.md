---
title: GET with a declared 404
description: Execute one GET and branch on typed 200 vs declared 404.
---

# GET with a declared 404

Declare both success and 404 bodies. Branch on `error.kind` and `error.status` — you get typed `error.data` for the declared miss.

See [HTTP](../core/http.md) and [Errors](../core/errors.md) for details.

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

An undeclared status is `kind: 'definition'` / `UNDECLARED_STATUS`. `error.response` may still be present; that body is not Struct-decoded as success — declare every status you care about.
