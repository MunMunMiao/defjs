---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# Начало работы

Defjs — это TypeScript-библиотека для определения типизированных API запросов и их выполнения через различные транспорты и JavaScript-рантаймы.

## Установка

Используйте ваш пакетный менеджер:

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## Использование через CDN

Импортируйте напрямую как ES-модуль без инструментов сборки:

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## Три шага до первого запроса

### Шаг 1: Создать клиент

Клиент — это точка входа для выполнения всех запросов. Создайте экземпляр с помощью `createClient` и настройте базовый endpoint:

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Шаг 2: Определить запрос

Используйте `defineRequest` для определения типизированного HTTP-ендпоинта. Используйте `struct` для описания формы входных данных и ответов:

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
Ключи в `output` — это HTTP-коды состояния. Defjs автоматически выбирает подходящую схему во время выполнения и выводит TypeScript-типы соответственно: ответы 2xx типизируются как успешные данные, не-2xx — как данные ошибки.
:::

### Шаг 3: Выполнить

Вызовите `client.execute` с вашей командой-запросом и необязательной конфигурацией:

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error типизируется на основе не-2xx схем в output
  console.error(error.code, error.message)
  return
}

// user типизируется как { id: number; name: string }
console.log(user.name)
```

## Полный пример

Вот сквозной пример с валидацией входных данных, валидацией выходных данных, обработкой ошибок и перехватчиком:

```typescript
import { createClient, defineRequest, struct, tag, withEndpoint, withInterceptors } from '@defjs/core'

// 1. Создать клиент
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. Определить запрос
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': tag(struct.string(), { kind: 'header' }),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. Выполнить
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Краткая справка по Core API

| API                    | Описание                          | Типичное использование                                                         |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------------------ |
| `createClient`         | Создать клиент запросов           | `createClient(withEndpoint('https://api.example.com'))`                        |
| `defineRequest`        | Определить HTTP-ендпоинт          | `defineRequest({ method: 'GET', path: '/user', output: { 200: UserSchema } })` |
| `defineEventStream`    | Определить SSE-ендпоинт           | `defineEventStream({ path: '/events', events: { message: struct.string() } })` |
| `defineWebSocket`      | Определить WebSocket-ендпоинт     | `defineWebSocket({ path: '/ws', incoming, outgoing })`                         |
| `struct`               | Конструктор схем                  | `struct.object({ id: struct.number() })`                                       |
| `tag`                  | Метаданные для полей              | `tag(struct.string(), { kind: 'header' })`                                     |
| `withEndpoint`         | Задать базовый URL                | `withEndpoint('https://api.example.com')`                                      |
| `withInterceptors`     | Зарегистрировать перехватчики     | `withInterceptors([...interceptors])`                                          |
| `withCredentials`      | Включить cross-origin credentials | `withCredentials(true)`                                                        |
| `withSSEOptions`       | Настроить SSE                     | `withSSEOptions({ method: 'POST' })`                                           |
| `withWebSocketOptions` | Настроить WebSocket               | `withWebSocketOptions({ protocols: ['v1'] })`                                  |

## Что дальше

- [Клиент →](/core/client) — Создание клиентов, выполнение команд и конфигурация
- [Команды →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Ошибки →](/core/errors) — Структура `RequestError` и паттерны ветвления
