---
title: GET mit deklariertem 404
description: Ein GET ausführen und zwischen typisiertem 200 und deklariertem 404 branchen.
---

# GET mit deklariertem 404

Deklariere sowohl Success- als auch 404-Bodies. Branche auf `error.kind` und `error.status` — du bekommst typisiertes `error.data` für den deklarierten Miss.

Details siehe [HTTP](../core/http.md) und [Fehler](../core/errors.md).

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

Ein undeclared Status wird zu `UNDECLARED_STATUS` vor Body-Decoding — deklariere jeden Status, der dich interessiert.
