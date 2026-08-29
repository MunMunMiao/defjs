---
title: 'Erste Schritte: ein HTTP-Request'
description: Definiere GET /users/:id, führe ihn gegen ein lokales Fetch-Handle aus, dann zeige auf eine echte API.
---

# Erste Schritte: ein HTTP-Request

Du definierst `GET /users/:id`, führst ihn über einen expliziten Client aus und dekodierst sowohl `200` als auch deklariertes `404`. Der lokale Handler hält den ersten Lauf offline; der Command bleibt derselbe, wenn du einen echten Service einhängst.

## Schritt 1 — Installieren

`@defjs/core` ist ESM und will Node.js 22+, Bun oder Deno. Node führt die `.ts`-Datei direkt aus — `"type": "module"` in die package.json. Im Browser brauchst du weiterhin Bundler und Fetch.

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

## Schritt 2 — Request definieren

Lege `src/get-user.ts` an. `struct.request(...)` hält Path-Werte getrennt von Query, Headers und Body.

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

`defineRequest(...)` gibt den Builder zurück. Der Aufruf `getUser(...)` baut den opaken Command, den du an `client.execute(...)` übergibst.

## Schritt 3 — Lokal ausführen

Verdrahte ein client-lokales Fetch-Handle, damit du ohne Netzwerk laufen kannst. Defjs validiert weiterhin Input, baut den `Request`, dispatcht nach Status und parst den Body.

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

So startest du:

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

Probier einen fehlenden User — ändere die Path-id auf `8` und lauf nochmal:

```txt
User not found
```

Bei Erfolg: `error` ist `null`, `user` ist der `200`-Struct-Output, `response` ist ein `HttpResponse`. Bei deklariertem `404`: `error.kind` ist `'http'`, `error.status` ist `404`, und `error.data` ist typisiert als `NotFound`. Der zweite Tupel-Eintrag ist bei Fehler `undefined`.

## Schritt 4 — Auf eine echte API zeigen

Lass `withHTTPHandle(...)` weg und setze die echte Base-URL, wenn der Service `GET /v1/users/:id` mit diesen Bodies implementiert.

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

Gleicher Command. Anderer Client.

## Wenn das Ergebnis abweicht

- Schlechter Input / ungültiger Build / konfliktierende Cancel-Options → `REQUEST_VALIDATION_FAILED`
- Deklariertes Non-2xx → `HTTP_STATUS` mit typisiertem `error.data`
- Deklarierter Body, der nicht dekodiert → `RESPONSE_VALIDATION_FAILED`
- Status ohne Deklaration → `UNDECLARED_STATUS` (vor Body-Decode)
- Fetch-Fail / Cancel / Timeout → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` muss eine positive Safe Integer in `1..2_147_483_647` sein. Gib nicht `abort` und `timeout` zusammen; `signal` kann mit jedem der beiden kombiniert werden. Cancellation sagt dir, was der Caller gesehen hat — nicht, ob ein Server-Write committed hat.

## Nächste Rezepte

- [GET mit deklariertem 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [HTTP-Aufruf abbrechen](../recipes/cancel-http.md)
- [SSE-Stream konsumieren](../recipes/consume-sse.md)
- [WebSocket-Session öffnen](../recipes/websocket-session.md)
- [Mit lokalem Fetch-Handle testen](../recipes/test-with-handle.md)
