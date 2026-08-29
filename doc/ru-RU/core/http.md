---
title: HTTP
description: Опиши запрос, выполни, ветвись по статусу и отменяй через signal или timeout.
---

# HTTP

Опиши → выполни → ветвись по кортежу → отмени, когда экран ушёл. Весь HTTP-цикл.

## Базовая настройка

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## Собери URL

`withEndpoint(...)` нужен валидный абсолютный URL. Pathname эндпоинта остаётся как directory; query и hash отбрасываются до разрешения команды.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Path placeholders — сырые scalars, кодируются ровно один раз. Пустые значения и `.` / `..` отклоняются. Слэши, `?`, `#`, `%`, пробелы и Unicode в одном placeholder остаются одним encoded сегментом — не пре-кодируй.

Path определения не может содержать `?` или `#`, и не может быть absolute или protocol-relative. Default query encoder принимает scalars и массивы scalars. Nested/complex query values нужен `withQueryParamsSerializer(...)`, иначе сборка падает.

## Закодируй input

`struct.request(...)` держит path, query, headers и body отдельно. Wrapper тела выбирает codec и content type:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Алиасы переписывают только outbound wire-ключи. Распарсенные значения и input команд держат логические имена.

| Wrapper                    | Runtime body      | Default content type                                           |
| -------------------------- | ----------------- | -------------------------------------------------------------- |
| `struct.json(inner)`       | JSON string       | `application/json`                                             |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                     |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`              |
| `struct.formData(shape)`   | `FormData`        | Platform multipart boundary; Defjs чистит stale `Content-Type` |
| `struct.blob()`            | `Blob`            | Blob type или `application/octet-stream`                       |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                     |

Кастомный `build` даёт те же location/codec setters. Финальная запись тела побеждает (value + content-type metadata). High-level команды не превращают произвольный объект в body — объяви wrapper или используй matching setter.

## Диспатч по статусу

`output` — map статус → Struct или `{ status, body }[]`. С `output` и без `responseType` representation по умолчанию `json`. Явные типы: `json`, `text`, `blob`, `arraybuffer`.

Порядок операций:

1. Status `0` → transport error.
2. Нет `output` → 2xx успех с `data === undefined`; non-2xx → `HTTP_STATUS` с `error.data === undefined`. Тело не декодируется.
3. С `output` точный объявленный статус выбирает свой Struct. Array form: более поздний match перекрывает более ранний grouped match.
4. Необъявленный статус → `UNDECLARED_STATUS` **до** decode тела.
5. Сбой representation → `RESPONSE_VALIDATION_FAILED`, без partial data.
6. Декодированный объявленный 2xx → результат; декодированный объявленный non-2xx → типизированный `error.data` на `HTTP_STATUS`.

У `HttpResponse` есть `url`, `status`, `statusText`, `headers`, `body`, `error` и `ok`. `ok` значит только `200 <= status < 300`. Это значение Defjs, не native `Response`. Без `output` `responseType` не разрешён.

## Отмени работу

Опции execute принимают `signal` плюс либо `abort`, либо `timeout`. **`abort` и `timeout` взаимоисключающие.** `signal` можно комбинировать с любым из них.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` — положительное safe integer в `1..2_147_483_647`. Узнанная отмена → `ABORTED`; execution timeout → `TIMEOUT`; другие сбои Fetch/interceptor → `NETWORK_ERROR`. Cancel после того, как сервер принял write, **не** доказывает откат записи.

## Credentials и XSRF

`withCredentials(true)` ставит Fetch `credentials: 'include'` для HTTP и SSE. Он не создаёт `Authorization` и не настраивает WebSocket auth. `false` оставляет credentials unspecified.

`withXSRF(...)` — только HTTP. Defaults: `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. Header инжектится только для non-safe methods, только если вызывающий его ещё не поставил, и только для same-origin browser requests. Пропускает `GET`, `HEAD`, `OPTIONS`, `TRACE`. Вне браузера передай синхронный request-scoped `tokenProvider`, если нужна injection.

Держи credentials, XSRF tokens и query strings вне routine логов. Не используй query params как общий канал credentials.

## Progress и граница Fetch

`onDownloadProgress` бежит, пока читается явное response representation. `lengthComputable` true только при положительном `Content-Length`. Нет `responseType` → нет decode тела → нет body-read progress.

`onUploadProgress` смотрит на `ReadableStream<Uint8Array>` request body, пока Fetch его читает. Обычные body wrappers не дают raw stream setter — upload progress в основном для low-level construction.

`fetchHandler(httpRequest, fetchImpl?)` — более низкая Fetch-граница: собирает native `Request`, вызывает Fetch, читает representation, возвращает `HttpResponse`. Он **не** валидирует input команды, не диспатчит `output` и не гоняет interceptors. Полезен для injected transport tests — не замена `client.execute`.

## Пределы replay

Defjs **не** auto-retry HTTP. Ретрай read всё равно нуждается в проверенной timeout/network/duplicate политике. Ретрай mutation нуждается в replayable bytes, поддержке сервера, idempotency key, привязанном к auth scope + request bytes, и receiver duplicate policy.

Граница client/command/Fetch не знает, закоммитился ли failed write. Держи replay-решения в приложении или проверенном interceptor. Interceptors могут short-circuit или заменить low-level request; финальные status и body всё равно должны удовлетворять контракту команды.

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Отменить HTTP-вызов](../recipes/cancel-http.md)
- [Тест с локальным Fetch handle](../recipes/test-with-handle.md)
