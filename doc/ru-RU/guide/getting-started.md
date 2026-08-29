---
title: 'Начало работы: один HTTP-запрос'
description: Опиши GET /users/:id, прогони через локальный Fetch handle, потом укажи на реальный API.
---

# Начало работы: один HTTP-запрос

Ты опишешь `GET /users/:id`, выполнишь через явный клиент и декодируешь и `200`, и объявленный `404`. Локальный handler держит первый прогон офлайн; команда не меняется, когда подставишь настоящий сервис.

## Шаг 1 — Установка

`@defjs/core` — ESM и хочет Node.js 22+, Bun или Deno. Node запускает `.ts` напрямую — в package.json нужен `"type": "module"`. В браузере по-прежнему нужны бандлер и Fetch.

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

## Шаг 2 — Опиши запрос

Создай `src/get-user.ts`. `struct.request(...)` держит path отдельно от query, headers и body.

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

`defineRequest(...)` возвращает builder. Вызов `getUser(...)` собирает непрозрачную команду, которую ты передашь в `client.execute(...)`.

## Шаг 3 — Выполни локально

Подключи клиентский Fetch handle — можно бежать без сети. Defjs всё равно валидирует input, собирает `Request`, диспатчит по статусу и парсит тело.

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

Запусти:

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

Попробуй отсутствующего пользователя — смени path id на `8` и запусти снова:

```txt
User not found
```

При успехе: `error` — `null`, `user` — Struct-output для `200`, `response` — `HttpResponse`. При объявленном `404`: `error.kind` — `'http'`, `error.status` — `404`, а `error.data` типизирован как `NotFound`. Второй элемент кортежа при ошибке — `undefined`.

## Шаг 4 — Укажи на реальный API

Убери `withHTTPHandle(...)` и поставь настоящий base URL, когда сервис реализует `GET /v1/users/:id` с такими телами.

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

Та же команда. Другой клиент.

## Когда результат другой

- Плохой input / невалидная сборка / конфликтующие cancel-опции → `REQUEST_VALIDATION_FAILED`
- Объявленный non-2xx → `HTTP_STATUS` с типизированным `error.data`
- Объявленное тело не декодируется → `RESPONSE_VALIDATION_FAILED`
- Статус без объявления → `UNDECLARED_STATUS` (до decode тела)
- Падение Fetch / отмена / таймаут → `NETWORK_ERROR` / `ABORTED` / `TIMEOUT`

`timeout` — положительное safe integer в `1..2_147_483_647`. Не передавай `abort` и `timeout` вместе; `signal` можно комбинировать с любым из них. Отмена говорит, что увидел вызывающий — не то, закоммитил ли сервер запись.

## Дальше по рецептам

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
- [Читать SSE-стрим](../recipes/consume-sse.md)
- [Открыть WebSocket-сессию](../recipes/websocket-session.md)
- [Тест с локальным Fetch handle](../recipes/test-with-handle.md)
