---
title: Struct
description: Описывайте структурное декодирование, нулевые значения, частичный объектный вход, псевдонимы и обработку StructError.
---

# Struct

Struct описывают структурное декодирование и сетевое кодирование. Выбранное поведение нулевых значений вдохновлено Go, но не является полной реализацией семантики Go `encoding/json`.

Используйте фасад `struct` и тип `Infer<T>` из корневой точки входа:

```typescript
import { struct, type Infer } from '@defjs/core'

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

`struct.any()` и `struct.unknown()` принимают значения без ограничений. Для бинарных данных предназначены `struct.blob()`, `struct.file()` и `struct.arrayBuffer()`.

Каждый Struct поддерживает модификаторы:

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Нулевые значения

Отсутствующие значения и `undefined` декодируются в нулевое значение, если Struct не помечен `.optional()`. Если Struct не допускает `null`, это значение проходит тот же путь. Struct с поддержкой `null` декодирует отсутствие, `undefined` и `null` в `null`.

Некоторые нулевые значения:

| Struct                        | Нулевое значение                                         |
| ----------------------------- | -------------------------------------------------------- |
| `string`                      | `''`                                                     |
| `number`                      | `0`                                                      |
| `boolean`                     | `false`                                                  |
| `bigint`                      | `0n`                                                     |
| `date`                        | `new Date(0)`                                            |
| массив                        | `[]`                                                     |
| объект                        | Объект, поля которого содержат свои нулевые значения     |
| кортеж                        | Кортеж, элементы которого содержат свои нулевые значения |
| enum                          | Первое объявленное значение                              |
| literal                       | Объявленный литерал                                      |
| `blob`, `file`, `arrayBuffer` | Пустое значение соответствующего типа                    |
| `any`, `unknown`              | `undefined`                                              |

Внутри объекта отсутствующее поле, отмеченное только `.optional()`, не попадает в декодированный результат. `.nullish()` одновременно делает поле необязательным и допускает `null`; для отсутствующего значения сейчас приоритет имеет поддержка `null`, поэтому результатом будет `null`.

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
})

// Decoding {} produces an object equivalent to:
// { name: '', biography: null }
```

Неизвестные ключи объекта отбрасываются. Декодированные объекты и записи имеют null-прототип. Если код зависит от методов `Object.prototype`, используйте `Object.keys`, `Object.entries` или намеренно копируйте результат в обычный объект.

## Частичный вход — намеренное поведение

Свойства входного объекта необязательны на границе TypeScript, даже когда соответствующее свойство присутствует в декодированном результате. Части запроса в `struct.request(...)` тоже необязательны.

```typescript
const Point = struct.object({
  x: struct.number(),
  y: struct.number(),
})

// A command using Point as input accepts {}.
// Structural decoding produces { x: 0, y: 0 }.
```

Не называйте такие поля обязательными. Struct не выполняют бизнес-проверки обязательности, авторизации, диапазона, суммы, формата или перехода состояния. Публичного DSL для refine/range/format нет.

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

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Псевдонимы декодируют и кодируют ключи JSON. При автоматическом построении запроса они также используются для исходящих ключей пути, query, заголовков, URL-encoded и multipart. Вызывающий код продолжает использовать логические ключи. Явные целевые ключи пользовательской проекции `build` остаются явными.

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
- [HTTP](/ru-RU/core/http) — декодирование ответа и текущее ограничение с некорректным JSON.
