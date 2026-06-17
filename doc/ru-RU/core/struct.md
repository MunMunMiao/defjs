---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

`@defjs/core` предоставляет лёгкий фасад struct для объявления схем, валидации входных данных и вывода типов. Дизайн-намерение моделируется после Go's `encoding/json`: нулевое значение по умолчанию, принятие частичного input и предсказуемое поведение рантайма.

## Примитивные типы

Все схемы создаются через неймспейс `struct`, поддерживающий цепочечные вызовы `.optional()`, `.null()`, `.nullish()` и `.tag(...)`.

### Скаляры

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
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
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

Обертки тела определяют транспортную кодировку:

| Обертка                    | Кодировка          |
| -------------------------- | ------------------ |
| `struct.json(schema)`      | `JSON.stringify`   |
| `struct.urlencoded(shape)` | `URLSearchParams`  |
| `struct.formData(shape)`   | `FormData`         |
| `struct.text()`            | Plain text         |
| `struct.blob()`            | Binary Blob        |
| `struct.arrayBuffer()`     | Binary ArrayBuffer |

## Вывод типов `Infer<T>`

`struct.Infer<T>` извлекает выходной тип схемы. Это единственный типовой помощник, который нужно освоить.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` также работает для `struct.array(...)`, `struct.union(...)`, `struct.request(...)`:

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError и отображение ошибок

При валидационном сбое рантайм возвращает `StructError`, содержащий полный `SchemaIssue[]`.

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

## Система тегов

Теги — это метаданные, прикреплённые к полям, читаемые кодеками, request builders или внешними адаптерами. Ядро предоставляет 6 встроенных неймспейсов:

| Неймспейс               | Назначение                   | Поведение без аргументов     |
| ----------------------- | ---------------------------- | ---------------------------- |
| `tag.json()`            | Wire-ключ JSON-поля          | Fallback на имя поля         |
| `tag.urlencoded()`      | Wire-ключ URL-encoded поля   | Fallback на имя поля         |
| `tag.multipart()`       | Wire-ключ multipart поля     | Fallback на имя поля         |
| `tag.query(fieldName)`  | Wire-ключ query-параметра    | **Имя нужно указывать явно** |
| `tag.uri(fieldName)`    | Wire-ключ URI path-параметра | **Имя нужно указывать явно** |
| `tag.header(fieldName)` | Wire-ключ HTTP-заголовка     | **Имя нужно указывать явно** |

### Пример использования

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### Пользовательский Config Tag

`tag.defineConfig` позволяет сторонним библиотекам определять свой неймспейс и config-ключ:

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

Правила:

- Внутри одного неймспейса поздний `value` переопределяет ранний `value`.
- Внутри одного неймспейса и одного ключа `config` поздний value переопределяет ранний.
- Config-значение может быть только `string | number | boolean`.

### Чтение тегов

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## Интроспекция полей

`getStructFields` разворачивает объектную схему в читаемый список полей, содержащий ключ поля, под-схему и материализованные теги.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

Вместе с `isObjectStruct` для безопасной проверки типа перед интроспекцией:

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
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
