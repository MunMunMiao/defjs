---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# Ошибки

Все результаты выполнения в `@defjs/core` возвращаются как тройки `[error, result, response]`. `error` — это `RequestError`: дискриминантное объединение с полями `kind` и `code`. Ветвление по `kind` и `code` — рекомендуемый паттерн вместо сравнения строк.

## Структура RequestError

`RequestError` — объединение трёх типов ошибок:

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Все ошибки имеют общие поля:

| Поле       | Тип                                     | Описание                                                        |
| ---------- | --------------------------------------- | --------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | Категория ошибки для top-level ветвления                        |
| `code`     | `string`                                | Точный код ошибки для second-level ветвления                    |
| `message`  | `string`                                | Человекочитаемое описание ошибки                                |
| `data`     | `unknown`                               | Дополнительные данные (только для `http` и `definition` ошибок) |
| `response` | `SettledResponseLike`                   | Сырой объект ответа (только для `http` и `definition` ошибок)   |

### HttpStatusError

Возникает, когда сервер возвращает не-2xx код состояния, определённый в `output`.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

Тип `data` выводится из `output`-схемы для соответствующего кода состояния. Например, `output: { 404: notFoundStruct }` сужает `error.data` до выведенного типа `notFoundStruct`.

### TransportError

Возникает при сетевых или транспортных сбоях, включая прерывание, таймаут и общие сетевые ошибки.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

Возникает при ошибках определения или валидации запроса.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Код                          | Сценарий срабатывания                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Input-параметры не прошли валидацию `input` struct, или `build` выбросил исключение |
| `RESPONSE_VALIDATION_FAILED` | Тело ответа не прошло валидацию `output` struct для возвращённого кода состояния    |
| `UNDECLARED_STATUS`          | Сервер вернул 2xx код состояния, не объявленный в `output`                          |

## Классификация и ветвление ошибок

**Не используйте** сравнение строк для определения типов ошибок:

```typescript
// Не рекомендуется: хрупко и без сужения типов
if (error.message.includes('timeout')) { ... }
```

**Рекомендуется**: Ветвление по `kind` и `code` для точного сужения типов:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error сужается до HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data сужается до { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error сужается до TransportError
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
      // error сужается до DefinitionError
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

## Встроенные константы

`@defjs/core` экспортирует две константы для идентификации конкретных транспортных ошибок:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED: Запрос активно отменён
// ERR_TIMEOUT: Запрос превысил таймаут
```

### Триггеринг отмены в перехватчиках

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### Использование с AbortController

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### Создание транспортных ошибок вручную

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## Вспомогательные функции

### `createTransportError`

Нормализует сырое исключение в `TransportError`.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

Нормализует сырое исключение в `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

Нормализует не-2xx ответ в `HttpStatusError`.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## Что дальше

- [Клиент →](/core/client) — Создание клиентов и выполнение команд
- [HTTP-запросы →](/core/http) — `defineRequest` и паттерны output
- [SSE →](/core/sse) — Ошибки SSE и стратегии переподключения
- [WebSocket →](/core/web-socket) — Обработка ошибок WebSocket-соединения
