---
title: GET avec un 404 déclaré
description: Exécute un GET et branche sur 200 typé vs 404 déclaré.
---

# GET avec un 404 déclaré

Déclare les corps de succès et de 404. Branche sur `error.kind` et `error.status` — tu obtiens `error.data` typé pour le miss déclaré.

Voir [HTTP](../core/http.md) et [Erreurs](../core/errors.md) pour les détails.

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

Un statut non déclaré devient `UNDECLARED_STATUS` avant le décodage du body — déclare chaque statut qui t’importe.
