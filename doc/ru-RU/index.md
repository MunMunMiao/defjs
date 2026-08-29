---
title: Defjs
description: Типизированные команды HTTP, SSE и WebSocket — явный клиент и error-first результаты.
---

# Defjs

Опиши эндпоинт, собери непрозрачную команду и выполни её. Одна и та же форма для HTTP, SSE и WebSocket.

```ts get-health.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

const [error, result, response] = await client.execute(getHealth())
if (!error) console.log(result.ok, response.status)
```

Defjs не кеширует результаты, не ретраит за тебя и не закрывает стримы, если ты забыл. Отмена и cleanup — на тебе.

## Выбери транспорт

| Тебе нужно                           | Начни с                           | Успешный результат                           |
| ------------------------------------ | --------------------------------- | -------------------------------------------- |
| Запрос + ответ по статусу            | [HTTP](./core/http.md)            | Декодированные данные + `HttpResponse`       |
| Долгоживущая лента событий с сервера | [SSE](./core/sse.md)              | Один стрим + снимок `open` при старте        |
| Двунаправленная сессия               | [WebSocket](./core/web-socket.md) | Одна сессия + снимок `connection` при старте |

Впервые здесь? Пройди [Начало работы](./guide/getting-started.md), потом возьми [рецепт](./recipes/get-declared-404.md). Хочешь понять «зачем так»? Читай [Проектные решения](./guide/design-decisions.md) уже после того, как что-то прогнал.

## Выбери пакет

| Пакет                         | Когда                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `@defjs/core`                 | `createClient` (HTTP + SSE + WebSocket)                                                 |
| `@defjs/react`                | `ClientProvider` / `useClient` — см. [React](./plugins/react.md)                        |
| `@defjs/vue`                  | Плагин + `injectClient` — см. [Vue](./plugins/vue.md)                                   |
| `@defjs/opentelemetry-server` | Исходящие spans/metrics — см. [OpenTelemetry Server](./plugins/opentelemetry-server.md) |

## Формы результатов

Все три транспорта возвращают error-first кортеж из трёх элементов. Позиции совпадают, смыслы — нет:

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]`
- WebSocket → `[error, session, connection]`

При ошибке старта второй элемент — `undefined`. Третий есть только если транспорт успел выдать ответ или снимок. См. [Ошибки](./core/errors.md).

## Владение на одном дыхании

Abort HTTP, когда запрос уже не нужен. Закрой SSE и `await stream.closed`. Закрой WebSocket и `await session.closed`. На сервере создавай клиент внутри границы запроса, если опции захватывают cookies, auth или tenant. Перед логом маскируй URL, заголовки и тела.

## Связанные рецепты

- [GET с объявленным 404](./recipes/get-declared-404.md)
- [POST JSON](./recipes/post-json.md)
- [Отменить HTTP-вызов](./recipes/cancel-http.md)
- [Читать SSE-стрим](./recipes/consume-sse.md)
- [Открыть WebSocket-сессию](./recipes/websocket-session.md)
- [Тест с локальным Fetch handle](./recipes/test-with-handle.md)
