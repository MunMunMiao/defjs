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

- HTTP возвращает декодированные данные и обёртку Defjs `HttpResponse`.
- SSE возвращает логический хендл потока и снимок открытия при запуске.
- WebSocket возвращает логический сеанс и снимок подключения при запуске.

При ошибке второй элемент равен `undefined`. Третий тоже может быть `undefined`, если запуск завершился раньше, чем транспорт успел создать соответствующий снимок.

## `RequestError`

`RequestError` — обычный дискриминированный объект, который возвращается в кортеже. Он не наследует нативный класс `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

Экспортируемое объединение называется `RequestError<TErrorData>`.

Сначала ветвитесь по `kind`, а при необходимости затем по `code`.

### Ошибки HTTP-статуса

Объявленный HTTP-ответ не-2xx создаёт:

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

Параметры типа идут в порядке: данные, затем статус. Широкий экспортируемый `RequestError<TErrorData>` по-прежнему удобен на границах приложения, а выполнение эндпоинта возвращает объединение веток `HttpStatusError<Data, Status>` для конкретных статусов. Поэтому проверка `error.status` сужает `error.data` до тела, объявленного для этого статуса:

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // Для этого эндпоинта оставшиеся статусы 409 | 422 используют одно тело конфликта.
    console.error(error.data.conflict)
  }
}
```

Поле `data` есть только у `HttpStatusError`. Сохраняйте это объединение, связанное со статусом, на границе эндпоинта и не расширяйте его до несвязанного объединения данных.

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
  response?: HttpResponse<unknown>
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

### Мост к нативному `Error`

Некоторым интеграциям требуется выбрасываемый нативный `Error`. Создавайте новую диагностическую ошибку на этой границе и по умолчанию раскрывайте только стабильные классификации `kind`, `code` и доступный HTTP-`status`:

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

Новая ошибка сохраняет собственный stack, созданный на границе. Мост никогда не прикрепляет и не копирует исходный `cause`, его сообщение или stack frames, `data`, заголовки или тела ответов, а также URL запроса и ответа. Сами строки stack frame могут содержать URL и секреты, поэтому копирование выбранных frames причины не является безопасным поведением по умолчанию. Рабочий проект `examples/observability-redacted-logging` проверяет сохранённый статус 404 и гарантирует, что данные ответа и намеренно содержащий секрет stack причины не раскрываются.

## Доступность ответа

`HttpResponse` — обёртка Defjs, а не нативный объект `Response`. Она предоставляет статус, текст статуса, заголовки, URL, тело, `error` и `ok`. `ok` означает только статус из диапазона 2xx. `error` предназначен для ошибок транспорта или представления тела; у обычного ответа не-2xx он пуст.

Корректное объявленное тело не-2xx декодируется Struct и сохраняется с типом в `HttpStatusError.data`. Некорректное представление вместо этого создаёт `RESPONSE_VALIDATION_FAILED` с исходным исключением codec в `cause`, ответом, если он был получен, и без `data`.

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
