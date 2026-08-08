---
title: Команды
description: Описывайте эндпоинты, создавайте фабрики команд и команды, отображайте входные Struct на сеть и выводите типы HTTP-ответов.
---

# Команды

В Defjs есть три связанных этапа:

1. **Описание эндпоинта** задаёт стабильный контракт HTTP, SSE или WebSocket.
2. **Фабрика команды** — функция, которую возвращает `defineRequest`, `defineEventStream` или `defineWebSocket`.
3. **Команда** — значение, которое возвращает вызов фабрики с входными данными. Именно команду передают в `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

Здесь объект, переданный в `defineRequest`, — описание эндпоинта, `getUser` — фабрика команды, а `command` — команда.

## Описание HTTP-эндпоинта

`defineRequest(...)` принимает следующие поля:

| Поле           | Значение                                                                        |
| -------------- | ------------------------------------------------------------------------------- |
| `method`       | Строка с HTTP-методом.                                                          |
| `path`         | Относительный путь эндпоинта с необязательными плейсхолдерами `:name`.          |
| `input`        | Struct для структурного декодирования входных данных команды.                   |
| `build`        | Проекция входных полей в части запроса, привязанная к схеме. Требует `input`.   |
| `output`       | Соответствие статусов Struct для декодирования ответа и вывода типа результата. |
| `responseType` | Необязательный режим ответа: `json`, `text`, `blob` или `arraybuffer`.          |

Используйте `struct.request(...)`, когда поля команды напрямую соответствуют частям запроса:

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

Вызывающий код использует логические имена полей. Псевдонимы выбирают сетевые ключи.

## Необязательность аргумента фабрики

Фабрика без `input` не принимает аргумент:

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

На границе типов все свойства входного объектного Struct необязательны для вызывающего кода. Части запроса тоже необязательны. Структурное декодирование заполняет выходные поля, не помеченные `.optional()`, нулевыми значениями, поэтому ни объектная форма, ни `struct.request(...)` не делают аргумент фабрики обязательным.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search() // Accepted. The decoded q value is ''.
search({ query: { q: 'docs' } })
```

Если фабрика обязана получить аргумент, используйте примитивный Struct или массив. Здесь число проецируется в параметр пути:

```typescript
const getUserById = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.number(),
  build(request, input) {
    request.setPathParams({ id: input })
  },
})

// getUserById() // TypeScript error: an argument is required.
getUserById(42)
```

Речь только о наличии аргумента, а не о бизнес-проверках. Вызывающий код всё равно может передать любое значение, допустимое входным типом Struct, а отсутствующие объектные поля получат нулевые значения.

## Автоматическое построение запроса

Если `input` задан через `struct.request(...)`, а `build` отсутствует, Defjs автоматически отображает объявленные части:

- `path` заменяет плейсхолдеры пути;
- `query` становится query-параметрами;
- `headers` становится заголовками запроса;
- `body` использует собственную обёртку тела.

Тело запроса должно явно задавать поддерживаемую границу:

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

Не помещайте голый `struct.object(...)` в `request.body`: `struct.request(...)` его отклонит. HTTP поддерживает все формы тела. SSE не поддерживает секцию тела, а WebSocket — секции заголовков и тела.

## Пользовательский `build`

Используйте `build(request, input)`, когда логические поля должны попасть в другие части запроса или получить другие сетевые ключи. Параметр `input` — **проекция, привязанная к схеме**, а не разобранное значение вызывающего кода.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }] as const,
})
```

Проекция умеет:

- выбирать объявленные поля;
- задавать сетевые ключи назначения;
- отображать каждый элемент массива ровно в один элемент через `.map(...)`;
- кодировать выбранный объект с псевдонимами его полей при привязке к JSON.

Проекция не умеет читать значения вызывающего кода, ветвиться по ним, выполнять произвольные преобразования, менять число элементов массива или подставлять литералы. Например, `request.setJson({ version: 'v1' })` недопустим: строка `'v1'` не взята из представления входных привязок.

Нормализуйте и проверяйте данные приложения до создания команды. В `build` оставляйте только декларативное отображение на сетевой формат.

### Возможности `build`

| Назначение                                                   | HTTP | SSE | WebSocket |
| ------------------------------------------------------------ | ---- | --- | --------- |
| `setPathParams`, `setQueryParams`                            | Да   | Да  | Да        |
| `setHeaders`, `addHeaders`                                   | Да   | Да  | Нет       |
| Методы тела для JSON, текста, HTML, форм, Blob и ArrayBuffer | Да   | Нет | Нет       |

Контекст `build` в TypeScript зависит от транспорта. Проверки во время выполнения тоже отклоняют неподдерживаемый результат, если проверку типов обошли.

## Вывод типов HTTP-ответа

`output` поддерживает объектное соответствие и массив пар статус/тело:

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Unauthorized = struct.object({ message: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const arrayOutput = [
  { status: 200, body: User },
  { status: [401, 403], body: Unauthorized },
] as const
```

Тип успешного HTTP-результата — объединение тел объявленных ответов 2xx. `error.data` — объединение тел объявленных ответов не-2xx. Для массивной формы нужен `as const`, чтобы сохранить литералы статусов и сгруппированные readonly-массивы.

Когда `output` объявлен, каждому полученному статусу должен соответствовать Struct. Любой несовпавший статус, как 2xx, так и не-2xx, приводит к `UNDECLARED_STATUS`. Без `output` тело ответа игнорируется, а результат равен `undefined`.

## Описания SSE и WebSocket

В `defineEventStream(...)` вместо HTTP-поля `output` используется карта `events`. Имя события выбирает Struct, а необязательная запись `default` обрабатывает во время выполнения необъявленные имена.

```typescript
const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` объявляет карту входящих `incoming` и необязательную карту исходящих `outgoing` сообщений. В конверте сообщения используется дискриминатор `type`.

```typescript
const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

Декодирование, очереди, переподключение и владение закрытием описаны в разделах [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket).

## Считайте команды непрозрачными

Прикладной код должен создавать команды и передавать их в `Client.execute(...)`. Не полагайтесь на теги транспорта или структурную рефлексию.

Корневая точка входа сейчас экспортирует интерфейсы команд транспортов и низкоуровневые функции выполнения. Для рекомендованного сценария они не нужны, а обязательства по их долгосрочной стабильности в этой документации не определены. Символы тегов команд и функции-предикаты, которые распределяют команды во время выполнения, из корневой точки входа не экспортируются.

## Что дальше

- [Клиент](/ru-RU/core/client) — перегрузки выполнения и композиция опций.
- [HTTP](/ru-RU/core/http) — URL, кодирование, ответы и отмена.
- [Struct](/ru-RU/core/struct) — структурное декодирование и нулевые значения.
