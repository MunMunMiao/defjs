---
title: POST JSON
description: Envía un cuerpo JSON con struct.json y decodifica un 201 declarado.
---

# POST JSON

Envuelve el cuerpo en `struct.json(...)`. Los nombres lógicos de campo se quedan en TypeScript; los alias de cable van en el Struct.

Ver detalles en [Comandos](../core/commands.md) y [HTTP](../core/http.md).

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
