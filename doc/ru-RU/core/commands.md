---
title: Команды
description: Опиши эндпоинты, собери непрозрачные команды, смапь input и выведи результаты транспорта.
---

# Команды

Одно определение → builder → непрозрачная команда → `client.execute`. Один pipeline для HTTP, SSE и WebSocket.

## Базовая настройка

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## Выбери определение

| Определение              | Контракт                                                                   | Успешное значение                      |
| ------------------------ | -------------------------------------------------------------------------- | -------------------------------------- |
| `defineRequest(...)`     | Method, относительный path, опциональный input, опциональный status output | Декодированные данные + `HttpResponse` |
| `defineEventStream(...)` | Path, лимиты buffer/queue, map имя события → Struct                        | `EventStreamHandle` + снимок open      |
| `defineWebSocket(...)`   | Path, incoming map, опциональный outgoing map, лимит очереди               | `WebSocketSession` + снимок connection |

Нет `input` → builder без аргумента. С `input` → передай Struct-значение, даже если все вложенные поля optional. Опциональные секции `path` / `query` / `headers` можно опустить; секцию с required полем — нельзя. Если wrapper тела есть, тело обязательно.

Держи команды непрозрачными. Не копайся в tags или symbols.

## Автоматический mapping запроса

Бери `struct.request(...)`, когда логический input уже имеет path / query / headers / body:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
})
void createUser
```

Алиасы переписывают только outbound wire-ключи. Распарсенные значения и input команд держат логические имена.

## Кастомный `build`

Тянись к `build(request, input)`, когда форма вызывающего и wire-форма расходятся. Это ограниченная проекция — не место ветвиться по auth-политике или изобретать side effects.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.setQueryParams({ q: input.q, page: input.page })
  },
  output: struct.object({ items: struct.array(struct.string()) }),
})
void search
```

## Формы `output` и `error`

`output` — один Struct для тела 2xx; `error` — один Struct для всего остального. `ok` — единственная развилка, и декодирует всегда одна сторона. Пропустить сторону значит, что это тело не прочитают: fault несёт status, а `data` остаётся `undefined`.

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
