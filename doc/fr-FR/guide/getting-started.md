---
title: 'Bien démarrer : une requête HTTP'
description: Définis GET /users/:id, exécute-la via un handle Fetch local, puis pointe-la vers une vraie API.
---

# Bien démarrer : une requête HTTP

Tu vas définir `GET /users/:id`, l’exécuter via un client explicite, et décoder à la fois `200` et un `404` déclaré. Le handler local garde le premier run hors ligne ; la commande reste la même quand tu branches un vrai service.

## Étape 1 — Installer

`@defjs/core` est ESM et veut Node.js 22+, Bun ou Deno. Node exécute le `.ts` directement — mets `"type": "module"` dans package.json. Dans un navigateur, tu as toujours besoin de ton bundler et de Fetch.

::: tabs
== bun

```sh
bun add @defjs/core
```

== npm

```sh
npm install @defjs/core
```

== pnpm

```sh
pnpm add @defjs/core
```

== yarn

```sh
yarn add @defjs/core
```

== deno

```sh
deno add npm:@defjs/core
```

:::

## Étape 2 — Définir la requête

Crée `src/get-user.ts`. `struct.request(...)` garde les valeurs de chemin séparées de la query, des en-têtes et du body.

```ts get-user.ts
import { defineRequest, struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const command = getUser({ path: { id: 7 } })
void command
```

`defineRequest(...)` renvoie le builder. Appeler `getUser(...)` construit la commande opaque que tu passeras à `client.execute(...)`.

## Étape 3 — L’exécuter en local

Branche un handle Fetch local au client pour tourner sans réseau. Defjs valide quand même l’entrée, construit la `Request`, dispatche selon le statut et parse le body.

```ts get-user.ts
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
})

const NotFound = struct.object({
  message: struct.string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
  ],
})

const handle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const client = createClient(withEndpoint('https://api.example.test'), withHTTPHandle(handle))

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }), {
  timeout: 5_000,
})

if (error) {
  if (error.kind === 'http' && error.status === 404) {
    console.log(error.data.message)
  } else {
    console.error(error.kind, error.code)
  }
} else {
  console.log(`Loaded ${user.name} from ${response.status}`)
}
```

Lance :

::: tabs
== bun

```sh
bun src/get-user.ts
```

== npm

```sh
node src/get-user.ts
```

== pnpm

```sh
node src/get-user.ts
```

== yarn

```sh
node src/get-user.ts
```

== deno

```sh
deno run src/get-user.ts
```

:::

```txt
Loaded Ada from 200
```

Essaie un utilisateur manquant — change l’id du path en `8` et relance :

```txt
User not found
```

En succès : `error` est `null`, `user` est la sortie Struct du `200`, `response` est un `HttpResponse`. Sur un `404` déclaré : `error.kind` vaut `'http'`, `error.status` vaut `404`, et `error.data` est typé `NotFound`. Le deuxième élément du tuple vaut `undefined` en échec.

## Étape 4 — Pointer vers une vraie API

Retire `withHTTPHandle(...)` et mets la vraie base URL quand le service implémente `GET /v1/users/:id` avec ces corps.

```ts
import { createClient, withEndpoint, withHTTPHandle } from '@defjs/core'

const localHandle: typeof fetch = async (input, init) => {
  const request = new Request(input, init)
  const id = new URL(request.url).pathname.split('/').at(-1)

  if (id === '7') {
    return Response.json({ id: 7, name: 'Ada' }, { status: 200 })
  }

  return Response.json({ message: 'User not found' }, { status: 404 })
}

const localClient = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(localHandle))
const realClient = createClient(withEndpoint('https://api.example.com/v1'))
void localClient
void realClient
```

Même commande. Client différent.

## Quand le résultat change

- Mauvaise entrée / build invalide / options d’annulation conflictuelles → `REQUEST_VALIDATION_FAILED`
- Non-2xx déclaré → `HTTP_STATUS` avec `error.data` typé
- Corps déclaré qui ne décode pas → `RESPONSE_VALIDATION_FAILED`
- Statut sans déclaration → `UNDECLARED_STATUS` (avant le décodage du body)
- Échec Fetch / annulation / timeout → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` doit être un entier sûr positif dans `1..2_147_483_647`. Ne passe pas `abort` et `timeout` ensemble ; `signal` peut se combiner avec l’un ou l’autre. L’annulation te dit ce que l’appelant a vu — pas si une écriture serveur a été commitée.

## Recettes suivantes

- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Annuler un appel HTTP](../recipes/cancel-http.md)
- [Consommer un flux SSE](../recipes/consume-sse.md)
- [Ouvrir une session WebSocket](../recipes/websocket-session.md)
- [Tester avec un handle Fetch local](../recipes/test-with-handle.md)
