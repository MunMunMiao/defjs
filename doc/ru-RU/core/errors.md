---
title: Ошибки
description: Обрабатывайте кортежи результатов разных транспортов и ветвитесь по обычному дискриминированному объединению RequestError.
---

# Ошибки

Каждый поддерживаемый транспорт возвращает трёхэлементный кортеж с ошибкой на первом месте, но третий элемент зависит от транспорта.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP возвращает декодированные данные и обёртку Defjs `SettledResponse`.
- SSE возвращает логический хендл потока и снимок открытия при запуске.
- WebSocket возвращает логический сеанс и снимок подключения при запуске.

При ошибке второй элемент равен `undefined`. Третий тоже может быть `undefined`, если запуск завершился раньше, чем транспорт успел создать соответствующий снимок.

## `RequestError`

`RequestError` — обычный дискриминированный объект, который возвращается в кортеже. Он не наследует нативный класс `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Экспортируемое объединение называется `RequestError<TErrorData>`.

Сначала ветвитесь по `kind`, а при необходимости затем по `code`.

### Ошибки HTTP-статуса

Объявленный HTTP-ответ не-2xx создаёт:

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

Поле `data` есть только у `HttpStatusError`. Его тип — объединение тел всех объявленных не-2xx ответов эндпоинта. Проверка `error.status` сейчас не сужает это объединение. Если тела разных статусов имеют разную форму, используйте структурную проверку или собственный дискриминатор приложения.

### Транспортные ошибки

Сбой сети, отмена или тайм-аут создают:

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

У транспортных ошибок нет полей `data` и `response`.

### Ошибки описания

Структурное декодирование входа, построение запроса, декодирование ответа или необъявленный HTTP-статус могут создать:

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Код                          | Текущая причина                                                                               |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Не удалось структурно декодировать вход, построить запрос или обработать привязки из `build`. |
| `RESPONSE_VALIDATION_FAILED` | Объявленный ответ или ответ при запуске SSE не прошёл проверку структуры или содержимого.     |
| `UNDECLARED_STATUS`          | HTTP вернул статус без соответствующего Struct при объявленном `output`.                      |

`UNDECLARED_STATUS` относится и к несовпавшим 2xx, и к несовпавшим не-2xx статусам.

## Ветвление

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

Не записывайте в журнал `cause`, `data`, заголовки и тела ответов или URL без явной политики маскирования и хранения.

## Доступность ответа

`SettledResponseLike` и `SettledResponse` — обёртки Defjs, а не нативные объекты `Response`. Они предоставляют статус, текст статуса, заголовки, URL, тело, необязательную информацию об ошибке, а settled-обёртки — ещё и флаг `ok`. `ok` означает только статус из диапазона 2xx.

Для HTTP:

- у объявленной ошибки HTTP-статуса есть `error.response`;
- у ошибок декодирования output и необъявленных статусов может быть `error.response`;
- при ошибке входных данных, отмене до ответа, исключении перехватчика или транспортном ответе со статусом 0 в кортеже может не быть ответа.

При неудачном запуске SSE третий элемент всё же может содержать снимок открытия, если ответ пришёл до ошибки проверки содержимого или статуса. При неудачном запуске WebSocket снимок подключения доступен только тогда, когда его успели получить.

## Фабрики ошибок и константы

Корневая точка входа экспортирует вспомогательные фабрики для интеграционного кода:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` нормализует отмену, тайм-аут и другие причины.
- `createDefinitionError(code, cause, response?)` создаёт ошибку описания.
- `createHttpStatusError(status, message, response, data?)` создаёт ошибку HTTP-статуса.
- `ERR_ABORTED` и `ERR_TIMEOUT` — общие значения `Error`, которые распознаёт нормализатор.

Эти фабрики создают обычные объекты `RequestError`, а не выбрасывают их.

Встроенные пути команд преобразуют ожидаемые ошибки запуска в кортежи. Но обработка кортежа не охватывает произвольный код расширений: пользовательские перехватчики и колбэки приложения могут выбросить ошибку, а передача неподдерживаемой команды в общую реализацию `execute` отклоняет Promise.

## Что дальше

- [HTTP](/ru-RU/core/http) — выбор Struct по статусу и декодирование ответа.
- [SSE](/ru-RU/core/sse) — отличие ошибки запуска от ошибок после открытия.
- [WebSocket](/ru-RU/core/web-socket) — ошибки во время работы и окончательное закрытие.
