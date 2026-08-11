---
title: Начало работы
description: Установите Defjs, опишите типизированный HTTP-эндпоинт, создайте клиент и вызовите его из приложения.
---

# Начало работы

Defjs позволяет один раз описать контракт API, а затем использовать его в приложении с типизированным вводом, декодированием во время выполнения и явными результатами транспорта.

## Установка

Добавьте core-пакет в приложение:

```sh
pnpm add @defjs/core
```

Если проект использует другой менеджер пакетов, выполните аналогичную команду npm, Yarn или Bun. `@defjs/core` поставляется как ESM. При запуске в Node.js текущие метаданные пакета требуют Node 22 или новее.

Упакованные ESM-потребители HTTP проверены с Node.js 22, 24 и 26, Bun 1.3.14 и Deno 2.9.5. После компиляции приложения используйте команды следующего вида:

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

Команда Deno использует пакеты, уже установленные в `node_modules`; замените сетевое разрешение точными хостами API, которые нужны приложению. Проверки Bun и Deno охватывают документированную часть HTTP, а не все API платформы или транспорты. Браузерные сборки используют обычный bundler и необходимые возможности Fetch и WebSocket платформы.

Кросс-платформенные тесты должны проверять стабильные поля Defjs, например `error.kind` и `error.code`. Не полагайтесь на зависящие от движка сообщения нативного `Error` или текст ошибок разбора JSON: Node.js, Bun и Deno могут форматировать эти детали по-разному.

Устанавливайте адаптер только тогда, когда он нужен приложению:

| Конфигурация            | Пакеты                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| React 18+               | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                  | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| Серверный OpenTelemetry | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Используйте документацию установленной версии
Эти страницы описывают API текущей версии документации. Проверьте версию, установленную в приложении. Если export или option отличается, используйте документацию и примечания к выпуску этой версии, а не смешивайте примеры разных версий.
:::

## Опишите первый запрос

Предположим, ваш API предоставляет `GET /users/:id`. Замените базовый URL и Struct ответа реальным контрактом своего сервиса.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` возвращает **фабрику команды**. Вызов `getUser(...)` создаёт **команду**, в которой хранятся описание эндпоинта и входные данные вызова. Затем `client.execute(...)` возвращает трёхэлементный HTTP-кортеж:

```typescript
;[error, result, response]
```

При успехе `error` равен `null`, `result` содержит декодированный результат, а `response` — обёртку Defjs `HttpResponse`. При ошибке `result` равен `undefined`; если ответ не был получен, обёртка ответа тоже равна `undefined`.

### Литералы статусов сохраняются автоматически

`defineRequest(...)` использует const generic для `output`, поэтому inline-элементы массива и сгруппированные массивы статусов автоматически сохраняют литеральные значения. Для разделения выведенных тел успешных ответов 2xx и ошибок остальных статусов `as const` не нужен.

Поддерживается и объектная форма `output`:

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## Подключите к приложению

Храните описания эндпоинтов в модулях, которые отражают API вашего сервиса. Используйте их фабрики команд в компонентах, route handler, фоновых задачах или store. Создавайте клиент на границе, которая владеет endpoint, учётными данными, перехватчиками и жизненным циклом.

- Браузерное приложение обычно может использовать один общий клиент.
- При серверном рендеринге создавайте клиент на каждый запрос, если меняются заголовки, cookies, пользователь или tenant.
- Код, открывающий SSE или WebSocket, должен также читать и закрывать этот ресурс.

## Что дальше

- [Команды](/ru-RU/core/commands) — автоматическое отображение запроса и пользовательские проекции, привязанные к схеме.
- [Ошибки](/ru-RU/core/errors) — кортежи всех трёх транспортов и объединение `RequestError`.
- [HTTP](/ru-RU/core/http) — разрешение URL, тела запросов, декодирование ответа, отмена и поведение XSRF.
- [Примеры](/ru-RU/guide/examples) — рецепты, где этими контрактами управляет приложение.
