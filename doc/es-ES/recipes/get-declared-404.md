---
title: GET con un 404 declarado
description: Ejecuta un GET y ramifica entre 200 tipado y 404 declarado.
---

# GET con un 404 declarado

Declara tanto el cuerpo de éxito como el de 404. Ramifica con `error.kind` y `error.status` — obtienes `error.data` tipado para el miss declarado.

Ver detalles en [HTTP](../core/http.md) y [Errores](../core/errors.md).

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

Un estado no declarado se convierte en `UNDECLARED_STATUS` antes de decodificar el cuerpo — declara todos los estados que te importan.
