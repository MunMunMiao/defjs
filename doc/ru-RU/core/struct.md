---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` предоставляет лёгкий фасад struct для объявления схем, валидации входных данных и вывода типов. Дизайн-намерение моделируется после Go's `encoding/json`: нулевое значение по умолчанию, принятие частичного input и предсказуемое поведение рантайма.

## Примитивные типы

Все схемы создаются через неймспейс `struct`, поддерживающий цепочечные вызовы `.optional()`, `.null()`, `.nullish()` и `.alias(name)`.

### Скаляры

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

Доступные скаляры:

| Конструктор            | Тип входа                               | Тип выхода    | Нулевое значение     |
| ---------------------- | --------------------------------------- | ------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`      | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`      | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`     | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`      | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`        | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`        | `null`               |
| `struct.any()`         | `unknown`                               | `any`         | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`     | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`        | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`        | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer` | `new ArrayBuffer(0)` |

### Опциональные и nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // Тип выхода: string | undefined
  age: struct.number().null(), // Тип выхода: number | null
  nick: struct.string().nullish(), // Тип выхода: string | null | undefined
})
```

### Перечисления и литералы

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### Массивы, кортежи, записи

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### Объединения и пересечения

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### Дискриминантные объединения

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## Схемы запросов

`struct.request(...)` организует `path`, `query`, `headers` и `body` в единую структуру input для автоматического построения HTTP-запроса ендпоинтом.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

Обертки тела определяют транспортную кодировку:

| Обертка                    | Кодировка          |
| -------------------------- | ------------------ |
| `struct.json(struct)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## Вывод типов `Infer<T>`

`Infer<T>` извлекает выходной тип схемы. Это единственный типовой помощник, который нужно освоить.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` также работает для `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError и отображение ошибок

При валидационном сбое рантайм возвращает `StructError`, содержащий полный `StructIssue[]`.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### Форматирование ошибок

```typescript
error.format() // Древовидный объект { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Плоский объект { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // Строка: "× name: Expected string, received undefined"
```

### Глобальное отображение ошибок

Заменить дефолтные сообщения через `setErrorMap`:

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Поле ${issue.path.join('.')} обязательно`
  }
  return undefined // Непокрытые issues используют дефолтные сообщения
})
```

## Field Aliases

`.alias(name)` — единственный встроенный механизм field wire-name. Он меняет только внешний key, используемый при кодировании/декодировании JSON, query, headers, path, urlencoded и FormData; он не меняет имя свойства TypeScript, выходной тип, request section, body codec или ключи, явно записанные в `build(ctx, input)`. Поля без alias используют свой object field key.

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

The same alias is used by JSON, query, path params, headers, urlencoded bodies, and multipart bodies. If the same logical value needs different names in different targets, split the struct or write explicit keys in `build(ctx, input)`.

## Field Introspection

`getStructFields` expands an object struct into a readable field list containing field key, alias, and sub-struct.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combined with `isObjectStruct` for safe type checking before introspection:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
  }
}
```

## Zero-Value fallback и частичный input

Парсер struct следует семантике Go `encoding/json`:

1. **Отсутствующие поля** → заполняются нулевым значением типа, не выбрасывая `missing_key`.
2. **Частичный input** → позволяет передавать только некоторые поля; неустановленные поля автоматически заполняются нулевыми значениями.
3. **`undefined` и `null`** → опциональные поля возвращают `undefined`; nullable поля возвращают `null`; остальные — нулевые значения.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

Это by design, не баг. Преимущества:

- Фронтенд-формы могут отправлять только изменённые поля; бэкенд всё равно получает полную структуру.
- Избегает распространения `undefined` через объекты; выход всегда безопасно обходим.
- Единая ментальная модель с Go's json unmarshaling, унифицируя кросс-языковое сотрудничество.

Если нужна строгая валидация (отсутствующие поля должны ошибаться), явно проверяйте в функции `build` ендпоинта, или используйте `struct.parseTuple` для самостоятельной обработки результата `[error, value]`.

## Что дальше

- [Команды →](/core/commands) — Использование struct с `defineRequest`, `defineEventStream` и `defineWebSocket`
- [HTTP →](/core/http) — Кодировка тела запроса и валидация ответа
- [Контекст →](/core/context) — Авто-build и возможности request builder
