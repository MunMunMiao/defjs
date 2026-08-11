---
title: Struct
description: Описывайте строгое структурное декодирование, обязательный и необязательный вход, псевдонимы и обработку StructError.
---

# Struct

Struct описывают строгое структурное декодирование и сетевое кодирование. Отсутствующие обязательные и недопустимые значения приводят к ошибке, а не к созданию значений по умолчанию.

Используйте фасад `struct` и тип `Infer<T>` из корневой точки входа:

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Конструкторы

Основные конструкторы:

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` и `struct.unknown()` принимают любые значения, кроме `null` и `undefined`; для их явного разрешения используются те же модификаторы. Для бинарных данных предназначены `struct.blob()`, `struct.file()` и `struct.arrayBuffer()`.

Каждый Struct поддерживает модификаторы:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Строгий разбор

Для декодирования вне команды используйте `struct.parse(schema, input)`. Метод возвращает фиксированный error-first кортеж:

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

Для всех модификаторов действует один договор: отсутствие и `undefined` допустимы только с `.optional()` или `.nullish()`, явный `null` — только с `.null()` или `.nullish()`. `.null()` не делает значение необязательным.

Отсутствующие optional- и nullish-поля объекта не попадают в результат; на верхнем уровне они декодируются в `undefined`. Неизвестные ключи отбрасываются. Декодированные объекты и записи имеют null-прототип.

Строгое глубокое сравнение в Node учитывает прототипы, поэтому объект, разобранный Struct, не равен по глубине литералу с теми же полями. Проверяйте эту границу явно либо создавайте поверхностную копию только внутри проверки:

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

Spread здесь создаёт только поверхностную копию для проверки. Вложенные Struct-объекты тоже имеют null-прототип. Не добавляйте глобальную нормализацию или клонирование в production-путь только ради тестового matcher.

При включённом `exactOptionalPropertyTypes` выведенные объектные входы используют точные необязательные свойства. Опускайте optional- или nullish-ключ вместо присваивания ему `undefined`:

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

Во время выполнения `struct.parse` защитно принимает явный `undefined` из неизвестного входа и опускает ключ. Эта нормализация не расширяет статически выведенный входной тип вызывающего кода.

## Обязательный объектный вход и части запроса

Свойства объекта обязательны в TypeScript и во время выполнения, если их Struct не optional или nullish. Каждая объявленная в `struct.request(...)` часть тоже обязательна; необъявленные части не входят во входной тип.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

Отсутствие `query` — ошибка, а `query: {}` допустим. Отсутствующее обязательное поле, явный `undefined`, запрещённый `null` или неверный runtime-тип прерывают весь разбор без частичного результата.

Составные Struct останавливаются на первом определённом issue. Длина входного кортежа должна точно совпадать с объявленной. `struct.or(...)` по-прежнему пробует альтернативы по порядку, а `struct.discriminatedUnion(...)` выбирает объявленную ветвь.

Если поля discriminator используют alias, `struct.discriminatedUnion(...)` читает первый действительно присутствующий сетевой discriminator в порядке объявления вариантов. После выбора ветви alias последующих вариантов не читаются.

Struct проверяют объявленную структуру, но не правила приложения об авторизации, диапазонах, суммах, форматах и переходах состояния. Публичного DSL для refine/range/format нет.

`struct.number()` принимает положительную и отрицательную `Infinity`; среди чисел JavaScript он исключает только `NaN`. До создания команды проверяйте конечность, диапазон и правила предметной области в коде приложения. Не помещайте эти проверки в `build`: туда приходит проекция, привязанная к схеме, а не значения вызывающего кода.

## Тела запросов

`struct.request(...)` объединяет части для прямого сетевого отображения:

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Границы тела:

| Struct                     | Кодирование       |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Обычный текст     |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

Автоматическое отображение запроса и ограничения транспортов описаны в разделе [«Команды»](/ru-RU/core/commands).

## Псевдонимы

`.alias(name)` меняет сетевой ключ, не меняя логический ключ TypeScript.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

`logicalUser` использует `{ id, displayName }`; `wireKeyError` указывает на отсутствие логического ключа `id`. Публичный `struct.parse` читает только логические значения и не принимает сетевые ключи как вход отдельного parse.

Wire-псевдонимы применяются только при JSON-кодировании и декодировании транспорта:

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`requestWireBody` равен `{ user_id, display_name }`, а `responseUser` снова имеет вид `{ id, displayName }`. Автоматическое построение запроса также применяет псевдонимы к исходящим ключам path, query, headers, URL-encoded и multipart; явные целевые ключи пользовательской проекции `build` не меняются.

## `StructError`

Ошибка структурного декодирования создаёт `StructError`, часто доступный как `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

`StructError` предоставляет:

- `issues` — исходный массив `StructIssue[]`;
- `format()` — вложенное дерево сообщений;
- `flatten()` — сообщения формы и полей верхнего уровня;
- `prettify()` — многострочное человекочитаемое представление.

`StructIssue.received` может содержать входные данные или данные ответа. Стандартные сообщения могут включать представление этого значения. Пути и форматированные ключи тоже могут происходить из недоверенных данных, особенно у записей. Перед записью в журнал или возвратом проверяйте и маскируйте `issues`, сообщения, `format()`, `flatten()` и `prettify()`.

## Глобальные сообщения об ошибках

`setErrorMap(...)` заменяет генерацию сообщений во всём процессе:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

Карта глобальна, а не привязана к клиенту. Её изменение влияет на последующие ошибки Struct во всех клиентах одной среды JavaScript. Не захватывайте в колбэке состояние отдельного запроса и согласуйте установку в приложениях, которые делят процесс.

## Что дальше

- [Команды](/ru-RU/core/commands) — отображение полей Struct на запросы и сообщения.
- [Ошибки](/ru-RU/core/errors) — представление ошибок Struct в кортежах выполнения.
- [HTTP](/ru-RU/core/http) — декодирование ответа и ошибки представления.
