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
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
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
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
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

## Как читается тело

`output` — один Struct для тела 2xx; `error` — один Struct для всего остального. Если объявлено любое из двух и `responseType` не задан, representation по умолчанию `json`. Явные типы: `json`, `text`, `blob`, `arraybuffer`. Если не объявлено ни одно, `responseType` не допускается, а тело не читают вовсе.

Порядок операций:

1. `ok` выбирает сторону: `output` для 2xx, `error` для всего остального. Никогда обе.
2. Для этой стороны ничего не объявлено → тело не читают. 2xx успешен с `data === undefined`; non-2xx — это `HTTP_STATUS` с `data === undefined`. Нечитаемое тело на стороне, которую ты не объявлял, игнорируется — вместе с самим фактом, что его не удалось прочитать.
3. Media type проверяют **до** чтения тела. Несовпадение — это `RES_MEDIA_TYPE_INVALID`, и ничего не парсится и не декодируется.
4. Читают representation. Неудача — `RES_DECODE_FAILED`.
5. Struct парсит значение. Неудача — `RES_STRUCT_MISMATCH`.
6. 2xx → результат и типизированный `response.body`; non-2xx → типизированный `data` на `HTTP_STATUS`.

Декодирование происходит один раз, после цепочки interceptor’ов, так что response, собранный interceptor’ом через `makeResponse(...)`, читается точно так же, как пришедший по сети.

Успешный response — это `DecodedResponse<T>`: `url`, `status`, `statusText`, `headers`, `ok` и типизированный `body`. Там, где ничего не декодировали, ты получаешь `HttpMeta` — те же поля без `body`. `ok` значит только `200 <= status < 300`. Ни то, ни другое не является нативным `Response`. Transport failure — это fault, поэтому никакого response со status 0 вместо него нет.

## Отмени работу {#cancel-the-work}

Опции execute принимают `signal` плюс либо `abort`, либо `timeout`. **`abort` и `timeout` взаимоисключающие.** `signal` можно комбинировать с любым из них.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` — положительное safe integer в `1..2_147_483_647`. Узнанная отмена → `NET_ABORTED`; execution timeout → `NET_TIMEOUT`; другие сбои Fetch/interceptor → `NET_UNREACHABLE`. Cancel после того, как сервер принял write, **не** доказывает откат записи.

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
