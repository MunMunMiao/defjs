---
title: HTTP
description: Собирайте HTTP-URL и тела, выбирайте Struct по статусу ответа, отменяйте работу, настраивайте credentials и XSRF и учитывайте границу Fetch.
---

# HTTP

`defineRequest(...)` создаёт фабрику HTTP-команды. Описания и проекции входных данных разобраны в разделе [«Команды»](/ru-RU/core/commands); эта страница посвящена сетевому поведению и жизненному циклу HTTP.

## Построение URL

`withEndpoint(...)` должен получать абсолютный базовый URL. Его путь сохраняется как каталог:

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Если завершающего слеша нет, он добавляется к базовому пути. Query и hash базового эндпоинта отбрасываются.

Значение `path` у эндпоинта — относительный путь контракта. Начальный слеш допустим: перед разрешением его удаляют, поэтому базовый каталог не заменяется. Реализация отклоняет:

- абсолютные URL и URL, начинающиеся с `//`;
- пути с `?`;
- пути с `#`.

Плейсхолдеры пути записываются как `:name`:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Передавайте в плейсхолдеры исходные значения. Defjs сериализует каждый скаляр, отклоняет пустое значение и целые значения `.` или `..`, а затем ровно один раз применяет `encodeURIComponent` перед подстановкой. `/`, `?`, `#`, `%`, пробелы и Unicode остаются внутри одного сегмента пути. Не кодируйте значения заранее: `%` считается исходным вводом и кодируется как `%25`.

## Кодирование запроса

Для прямого отображения на сетевые части используйте `struct.request(...)`:

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Struct тела выбирает кодирование и Content-Type по умолчанию:

| Struct тела                | Тело в сети           | `Content-Type` по умолчанию                       |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | Строка                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | Задаётся платформой вместе с boundary             |
| `struct.blob()`            | `Blob`                | Тип Blob или `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

В пользовательском `build` доступны соответствующие методы HTTP-билдера. Методы-сеттеры заменяют часть запроса; `addHeaders`, `addFormData` и `addFormUrlEncoded` дополняют текущую часть. Все значения должны происходить из проекции, привязанной к схеме.

### Значения query

Стандартный кодировщик query принимает плоские скалярные значения и массивы скаляров. Вложенные объекты приводят к ошибке при построении запроса.

`withQueryParamsSerializer((params, rawParams) => string)` меняет представление уже принятых плоских значений. Он получает `URLSearchParams` и закодированную плоскую запись. Вложенные query-объекты от этого не становятся допустимыми: их отклоняют до сериализации.

Псевдонимы становятся исходящими ключами query, пути и заголовков. Вызывающий код по-прежнему использует логические имена полей Struct.

## Статусы и декодирование output

`output` сопоставляет коды статуса со Struct ответа:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

Во время выполнения Struct выбирается по точному статусу. Если `output` объявлен, любой несовпавший статус приводит к `UNDECLARED_STATUS`. Тела объявленных 2xx образуют объединение успешных данных, а тела объявленных не-2xx — тип `error.data`.

`response.ok` означает только `status >= 200 && status < 300`. Он не говорит об успешном декодировании `output`, бизнес-проверке или авторизации.

Если `output` объявлен, а `responseType` не указан, ответ по умолчанию разбирается как `json`. Явные режимы: `json`, `text`, `blob` и `arraybuffer`. Затем выбранный Struct выполняет структурное декодирование. Без `output` нельзя указать `responseType`, данные результата равны `undefined`, а у возвращённой обёртки ответа `body: null`. Runtime по мере возможности отменяет body ответа, а не читает и не декодирует его.

Результат команды классифицируется в фиксированном порядке: transport failure при status 0 → отсутствие `output` → точное совпадение status или `UNDECLARED_STATUS` → `response.error` → декодирование Struct. Поэтому ошибки представления body могут возникать только при объявленном `output`; ветвь с необъявленным status по-прежнему имеет приоритет, если Fetch записал такую ошибку.

### Ошибки представления тела

Если для точно совпавшего объявленного output JSON или другой codec тела завершается ошибкой, Fetch сохраняет исходное исключение в `HttpResponse.error`. Выполнение команды останавливается до применения выходного Struct и возвращает `[RESPONSE_VALIDATION_FAILED, undefined, response]`; исключение остаётся в `cause`, а типизированное `error.data` не создаётся.

Обычный ответ не-2xx не заполняет `response.error`: его статус представлен полями `status` и `ok`. Если статус не-2xx и тело объявлены, а тело корректно, Struct декодируется, и итоговая ошибка `HTTP_STATUS` сохраняет типизированное тело в `error.data`.

## Результат HTTP

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

При успехе `response` — обёртка Defjs `HttpResponse`, тело которой соответствует `data`. При ошибке доступность ответа зависит от того, насколько далеко дошло выполнение. Полная классификация приведена в разделе [«Ошибки»](/ru-RU/core/errors).

## Отмена и тайм-аут

HTTP принимает при выполнении `abort`, `signal` и `timeout`:

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` объединяется с внутренним сигналом клиента и положительным тайм-аутом. Отдельное поле `abort` — альтернативный сигнал отмены, сохранённый текущим API. Одновременно передавать `abort` и `timeout` нельзя: результатом будет `REQUEST_VALIDATION_FAILED`. `signal` можно сочетать с любым из них.

Для выполнения HTTP, SSE и WebSocket параметр `timeout` должен быть положительным безопасным целым числом в диапазоне `1..2_147_483_647`; `0`, отрицательные и дробные значения, `NaN`, `Infinity` и значения выше предела возвращают `REQUEST_VALIDATION_FAILED` до создания ресурса request, stream или socket.

Распознанная отмена создаёт `ABORTED`. Причина от `AbortSignal.timeout(...)` или тайм-аут выполнения создают `TIMEOUT`. Другие сбои Fetch создают `NETWORK_ERROR`.

## Credentials и XSRF

`withCredentials(true)` задаёт Fetch `credentials: 'include'` для HTTP и SSE. Значение `false` оставляет опцию Fetch незаданной, а не принудительно включает `omit`. Эта настройка не добавляет заголовок `Authorization` и не настраивает аутентификацию WebSocket.

`withXSRF(...)` действует только на HTTP-запросы. Значения по умолчанию:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

Для безопасных по RFC методов `GET`, `HEAD`, `OPTIONS` и `TRACE` добавление токена пропускается. Для всех остальных методов, включая небезопасные пользовательские методы наподобие `PROPPATCH`, перед добавлением выполняются те же проверки существующего заголовка, same-origin и токена. Уже существующий настроенный заголовок сохраняется. В браузере cookie ищется только для запросов к тому же origin. Вне браузера передайте синхронный `tokenProvider`; он имеет приоритет перед чтением cookie.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

На сервере держите провайдер токена в области запроса. `withCredentials(true)` не даёт JavaScript доступ к cross-origin cookie в браузере и не включает добавление XSRF-заголовка для cross-origin запроса.

## Наблюдатели прогресса

`onDownloadProgress` сообщает число байтов при чтении тела Fetch-ответа. `lengthComputable` равен `true` только при положительном `Content-Length`.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` наблюдает только за телом запроса типа `ReadableStream<Uint8Array>`. Текущие высокоуровневые фабрики команд предоставляют сеттеры проекций для Blob и ArrayBuffer, но не для сырого потока. Поэтому стандартного рабочего примера `defineRequest` с потоком, необходимым этой опции, сейчас нет. Не выдавайте вручную созданный поток за поддерживаемое высокоуровневое тело команды.

Колбэки прогресса выполняются на пути чтения или записи транспорта. Они должны быть быстрыми и не выбрасывать ошибки.

## Низкоуровневая граница Fetch

`fetchHandler(httpRequest, fetchImpl?)` экспортируется. Он преобразует Defjs `HttpRequest` в нативный `Request`, вызывает Fetch, разбирает выбранное представление ответа и возвращает обёртку Defjs `HttpResponse`. Сбои Fetch становятся обёртками со статусом 0.

Прямой вызов `fetchHandler` обходит:

- декодирование входа команды и проекцию запроса;
- выбор HTTP-output по статусу и декодирование Struct;
- оркестрацию клиентских перехватчиков;
- преобразование в высокоуровневый кортеж `RequestError`.

Это экспортированная низкоуровневая граница, а не рекомендуемый сценарий команд. Обязательства по её долгосрочной стабильности здесь не определены.

## Что дальше

- [Перехватчики](/ru-RU/core/interceptors) — клонирование запросов, короткое замыкание и повторы.
- [Ошибки](/ru-RU/core/errors) — ошибки HTTP-статуса, транспорта и описания.
- [Struct](/ru-RU/core/struct) — строгое структурное декодирование.
