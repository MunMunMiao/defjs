---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Используйте `defineRequest` для определения HTTP-ендпоинта, затем выполняйте его через `Client.execute()`. Основной пакет автоматически обрабатывает валидацию схем, диспатч по коду состояния, слияние сигналов и парсинг тела ответа.

## Определение ендпоинта

`defineRequest` принимает объект определения с `method`, `path`, `input` (опционально), `output` (опционально) и `build` (опционально).

Когда указан `input`, `build` тоже должен быть указан, чтобы описать, как поля input отображаются в части запроса (path params, query params, headers, body).

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

Если input не нужен, опустите и `input`, и `build`:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## Отображение output по кодам состояния

`output` отображает HTTP-коды состояния на схемы. Рантайм выбирает подходящую схему по коду состояния ответа.

Поддерживаются как объектная, так и массивная форма:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// Объектная форма: ключи — коды состояния, значения — схемы
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// Массивная форма: поддерживает отображение нескольких кодов на одну схему
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

Если сервер возвращает код состояния, не объявленный в `output`, запрос падает с `DefinitionError`, чей `code` — `UNDECLARED_STATUS`.

## Вывод типов данных успеха / ошибки

`output` управляет выводом TypeScript-типов. `Client.execute()` возвращает `HttpAwaitResult`, который автоматически различает данные успеха 2xx от данных ошибки не-2xx.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result типизируется как { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data типизируется как { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### Типовые помощники

- `RequestSuccessData<TOutput>`: Извлекает все типы 2xx-схем из `output`. Если нет 2xx-отображения, выводит как `unknown`.
- `RequestErrorData<TOutput>`: Извлекает все типы не-2xx-схем из `output`. Если нет не-2xx-отображения, выводит как `unknown`.

## Выполнение запроса

Вызовите `Client.execute()` с командой. Второй аргумент — опциональные `HttpExecuteOptions`:

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* пользовательский контекст, читаемый перехватчиками */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // алиас, эквивалентно abort
})
```

Возвращаемый `HttpAwaitResult` — тройка:

| Позиция | Тип                                      | Значение                                                   |
| ------- | ---------------------------------------- | ---------------------------------------------------------- |
| 0       | `RequestError<TErrorData> \| null`       | Объект ошибки; `null` при успехе                           |
| 1       | `TSuccess \| undefined`                  | Данные успеха; `undefined` при неудаче                     |
| 2       | `SettledResponse<TSuccess> \| undefined` | Обёртка сырого ответа с `status`, `headers`, `body` и т.д. |

## Отмена и таймаут

`abort`, `timeout` и `signal` управляют жизненным циклом запроса. **`abort` и `timeout` нельзя использовать вместе** — это вызывает валидационную ошибку до отправки запроса.

### Использование AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// Отменить позже
controller.abort()

// После отмены error.kind === 'transport', code === 'ABORTED'
```

### Использование таймаута

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // 5-секундный таймаут
})

// После таймаута error.kind === 'transport', code === 'TIMEOUT'
```

### Слияние внешних сигналов

Если переданы и `abort`, и `signal`, фреймворк сливает их в один `AbortSignal`. `timeout` также участвует как `AbortSignal.timeout()`. Любой сигнал, сработавший, прерывает запрос.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // слит с abort
})
```

### Различение ошибок

Отмена и таймаут — оба `TransportError`, различимые по `error.code`:

| Сценарий      | `error.code`    | Описание                                              |
| ------------- | --------------- | ----------------------------------------------------- |
| Ручная отмена | `ABORTED`       | `controller.abort()` или внешний сигнал сработал      |
| Таймаут       | `TIMEOUT`       | `timeout` истёк, или сработал `AbortSignal.timeout()` |
| Сетевой сбой  | `NETWORK_ERROR` | Другие исключения из fetch                            |

## Прогресс загрузки / отправки

Отслеживайте прогресс через `onDownloadProgress` и `onUploadProgress`.

### Прогресс загрузки

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` содержит три поля:

- `lengthComputable`: Вернул ли сервер `Content-Length`
- `loaded`: Байт получено на данный момент
- `total`: Всего байт (валидно только при `lengthComputable === true`)

### Прогресс отправки

Прогресс отправки работает только когда тело запроса — `ReadableStream<Uint8Array>`. Фреймворк оборачивает поток и вызывает коллбеки после каждого чанка.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## Типы ответов

По умолчанию, если `output` объявлен, фреймворк автоматически парсит ответ как `json`. Можно переопределить через `responseType`, или указать его, когда `output` — `undefined`.

```typescript
import { defineRequest } from '@defjs/core'

// Явный тип ответа
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// Нет output, нужен только сырой ответ
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

Поддерживаемые значения `responseType`:

| Значение      | Описание                                                          |
| ------------- | ----------------------------------------------------------------- |
| `json`        | Читать текст, затем `JSON.parse()`; пустое тело возвращает `null` |
| `text`        | Вернуть текстовую строку напрямую                                 |
| `blob`        | Вернуть `Blob`                                                    |
| `arraybuffer` | Вернуть `ArrayBuffer`                                             |

Когда `responseType` — `json` и `output` определяет схему для возвращённого кода состояния, фреймворк валидирует распарсенный JSON против схемы. Если валидация не проходит, возвращается `DefinitionError` с `code: 'RESPONSE_VALIDATION_FAILED'`.

## Что дальше

- [Клиент →](/core/client) — Создание `Client`, перехватчики, XSRF, глобальные опции
- [SSE →](/core/sse) — Server-Sent Events и потоковые ответы
- [WebSocket →](/core/web-socket) — Двунаправленная коммуникация в реальном времени
