---
title: Проектные решения
description: Решения в дизайне API, которые могут отличаться от распространённых паттернов в других HTTP-библиотеках.
---

# Проектные решения

Defjs намеренно отходит от некоторых распространённых паттернов, встречающихся в других HTTP-библиотеках. Этот документ объясняет логику каждого решения.

## Явное проектирование клиента

Defjs требует, чтобы каждый клиент создавался явно. Вы создаёте `Client` с помощью `createClient` и передаёте его туда, где он нужен.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Почему такой дизайн:

- **Дружелюбно к тестам**: Передавайте разные экземпляры `Client` напрямую в тесты, не нужно сбрасывать или мокать какое-либо состояние.
- **Мультисреднее сосуществование**: Несколько клиентов могут работать параллельно в одном процессе (например, internal API + public API) без вмешательства.
- **Прозрачность зависимостей**: Вызывающий должен явно держать `Client`, делая зависимости видимыми для статического анализа и code review.

Если нужен общий клиент в приложении, экспортируйте его из модуля:

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## Интеграция с фреймворками

`@defjs/angular`, `@defjs/vue` и `@defjs/react` интегрируют явные клиенты с моделью зависимостей каждого фреймворка. Angular и Vue используют `provideClient` / `injectClient`; React использует `ClientProvider` / `useClient`. Это позволяет регистрировать и получать клиентов в рамках дерева компонентов или сервисов.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // используйте client.execute(...) в логике компонента
}
```

## Опции уровня запроса передаются в `execute`, а не в строитель

Опции уровня запроса (`abort`, `timeout`, `heartbeat`, `reconnect` и т.д.) передаются через второй аргумент `client.execute`, а не в командо-строитель.

```typescript
// Правильно: опции уровня запроса передаются в execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## Перегруженный `execute` по типу команды

`client.execute` перегружен и автоматически возвращает правильный тип результата в зависимости от типа `Command`.

```typescript
// HTTP-запрос — возвращает HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// SSE-поток — возвращает StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — возвращает SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` — наблюдатель

SSE-обработчик `onInvalidEvent` является наблюдателем. Исключения, выброшенные внутри него, молча игнорируются и не прерывают поток.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // Даже если здесь выброшено исключение, поток продолжается
    },
  },
})
```

## Консолидация подмодуля ошибок

Все символы ошибок экспортируются из основной точки входа `@defjs/core`.

| Экспорт                 | Описание                    | Типичное использование                                      |
| ----------------------- | --------------------------- | ----------------------------------------------------------- |
| `RequestError`          | Тип-объединение ошибок      | Ветвление `switch (error.kind)`                             |
| `ERR_ABORTED`           | Идентификатор прерывания    | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | Идентификатор таймаута      | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | Создать транспортную ошибку | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | Создать ошибку определения  | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | Создать HTTP-ошибку         | `createHttpStatusError(404, 'Not Found', response, data)`   |

Импортируйте из основной точки входа:

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## Ветвление ошибок по `kind` и `code`

Defjs рекомендует ветвление по `kind` и `code` вместо сравнения строк.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Строгие правила определения endpoint

Defjs применяет строгое правило: **если указан `build`, то `input` тоже должен быть указан.**

```typescript
// Правильно: есть input и build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// Правильно: нет input и нет build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// Ошибка: есть build, но нет input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // TypeScript-ошибка: отсутствует схема input
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

Это правило также применяется к `defineEventStream` и `defineWebSocket`.

## Зависимости

| Пакет            | Требуемая версия |
| ---------------- | ---------------- |
| `@defjs/core`    | `^0.4.0`         |
| `@defjs/angular` | `19.x`           |
| `@defjs/vue`     | `^0.4.0`         |
| `@defjs/react`   | `^0.4.0`         |

Диапазон peer-зависимостей Angular: `>=18.0.0 <=22.0.0`. Диапазон peer-зависимостей React: `>=18.0.0`. Среда выполнения Node: `>=26`.

## Что дальше

- [Клиент →](/core/client) — Явное проектирование клиента и конфигурация
- [Команды →](/core/commands) — Определение команд и правила input
- [Ошибки →](/core/errors) — Структура `RequestError` и ветвление
