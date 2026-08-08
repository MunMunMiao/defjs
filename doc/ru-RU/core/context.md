---
title: Контекст
description: Передавайте метаданные области запроса по цепочкам перехватчиков HTTP и SSE с помощью HttpContext.
---

# Контекст

`HttpContext` — контейнер метаданных с ключами-токенами. Он сопровождает выполнение HTTP или SSE и доступен в `HttpRequest`, который получают перехватчики. Сам по себе контекст не сериализуется в URL, заголовки или тело.

## Токены и значения по умолчанию

Создайте типизированный токен с фабрикой значения по умолчанию:

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

Если в контексте нет сохранённого значения, `context.get(token)` вызывает фабрику токена. Результат не записывается в контекст, поэтому фабрика с состоянием может возвращать новое значение при каждом чтении отсутствующего токена. Предпочитайте детерминированные значения по умолчанию.

## Создание и передача контекста

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` изменяет контекст и возвращает тот же объект для цепочки вызовов. `get(...)` и `set(...)` выбрасывают `TypeError`, если значение не является токеном, созданным через `makeHttpContextToken(...)`.

Перехватчик читает тот же объект:

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

Используйте фиксированные имена операций и заранее проверенный набор метаданных. По умолчанию не записывайте в журнал секреты, исходные заголовки, тела, URL и query-строки.

## Семантика ссылок

При выполнении `HttpContext` передаётся по ссылке. Если перехватчик изменит его, это увидят последующие перехватчики и вызывающий код, который хранит тот же объект.

Создавайте новый контекст для каждого запроса, если он содержит данные запроса, пользователя, арендатора, трассировки, cookie или авторизации. Переиспользование одного изменяемого контекста в параллельных операциях может привести к утечке или перезаписи метаданных.

Сейчас опции выполнения HTTP и SSE принимают `context`, а опции WebSocket — нет. Логический хендл SSE сохраняет контекст запроса для своих попыток подключения, но приложение всё равно должно считать этот контекст принадлежащим области запроса потока.

## Копирование и объединение

`makeHttpContext(existing)` создаёт поверхностную копию карты токенов:

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

Карты независимы, но хранящиеся в них объектные значения глубоко не клонируются.

`makeHttpContext(entries)` принимает пары токен/значение:

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` возвращает новый контекст. Для одинакового токена значение из `secondary` заменяет значение из `primary`.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

Если передать только один контекст, функция всё равно вернёт копию. Без аргументов она вернёт пустой контекст.

## API контекста

| Член                | Поведение                                                    |
| ------------------- | ------------------------------------------------------------ |
| `set(token, value)` | Сохраняет значение и возвращает тот же контекст.             |
| `get(token)`        | Возвращает сохранённое значение или вызывает фабрику токена. |
| `has(token)`        | Проверяет, сохранено ли значение.                            |
| `del(token)`        | Удаляет значение и возвращает тот же контекст.               |
| `keys()`            | Перебирает сохранённые токены.                               |
| `length`            | Число сохранённых токенов.                                   |

Для проверок во время выполнения доступны `isHttpContext(...)` и `isHttpContextToken(...)`.

Отображение данных на запрос — отдельная задача. Автоматические секции запроса и проекции, привязанные к схеме, описаны в разделе [«Команды»](/ru-RU/core/commands), а поведение цепочки — в разделе [«Перехватчики»](/ru-RU/core/interceptors).
