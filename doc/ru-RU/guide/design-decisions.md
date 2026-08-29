---
title: Проектные решения
description: Почему Defjs держит контракты, команды, результаты транспорта, декодирование и владение явными.
---

# Проектные решения

У Defjs несколько осознанных trade-off’ов. Удобные API часто прячут, кто владеет запросом, стримом или сессией. Defjs держит эту границу на виду — один и тот же контракт эндпоинта можно переиспользовать, не подхватывая молча кеш, планировщик ретраев или менеджер ресурсов.

## Явные клиенты

Цена: нет process-wide дефолта. На сервере это плюс — создавай клиент внутри границы запроса, когда опции или замыкания захватывают auth, cookies, пользователей, tenants или метаданные запроса. Явный клиент всё равно не изолирует состояние, пойманное interceptor’ом. Сама идентичность клиента — не security boundary.

Клиент диспатчит команды. Он не владеет активной работой. Кто стартовал HTTP-запрос, SSE-стрим или WebSocket-сессию — тот обязан отменить или закрыть и дождаться terminal promise.

## Определения, builders и команды

Определение — стабильный контракт: method, path, input Struct, mapping output, лимиты транспорта. Builder — вызываемое представление. Вызов создаёт одну непрозрачную команду для одного выполнения.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

Фоновая задача и UI-владелец могут выполнить один и тот же shape `getUser` с разными cancel/retry политиками. Непрозрачная команда мешает app-коду цепляться за внутренние transport tags или symbols.

## Результаты по транспорту

Все три транспорта используют error-first кортеж. Один generic «response» стёр бы факты жизненного цикла.

- HTTP → `[error, data, response]` — декодированный output + `HttpResponse`
- SSE → `[error, stream, open]` — один логический стрим + снимок startup response
- WebSocket → `[error, session, connection]` — логическая сессия + снимок startup connection

Третье значение — снимок, не promise, что будущие reconnect’ы сохранят то же физическое соединение. При ошибке старта ответ/снимок всё равно может быть, если транспорт успел его создать. После старта lifecycle принадлежит возвращённому handle или session.

## Runtime-декодирование

TypeScript-inference описывает ожидания; он не проверит ответ сервера в runtime. Struct-парсинг — вторая половина контракта. Defjs валидирует input команды до сборки запроса, декодирует выбранное representation, затем парсит matching Struct.

Такой порядок держит status и body как отдельные факты. Точный выбор объявленного статуса идёт **до** decode тела. Объявленный non-2xx → типизированный `error.data`. Сломанное объявленное тело → `RESPONSE_VALIDATION_FAILED`. Необъявленный статус → `UNDECLARED_STATUS` (не untyped success/failure). Строже, чем «какой JSON приехал», зато можно принимать безопасное решение.

## Пределы `build`

Автоматический mapping через `struct.request(...)` — дефолт, когда input уже имеет path/query/headers/body. Кастомный `build(request, input)` — ограниченная проекция, когда форма вызывающего и wire-форма расходятся:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` — schema-bound view, не runtime-объект вызывающего. Проекция может выбирать объявленные поля, переименовывать targets и мапить один элемент исходного массива в один output. Она не может ветвиться по значениям, инжектить литералы или менять cardinality. Нормализуй бизнес-данные и value-dependent валидацию до создания команды.

## Observers и где жить политике

Interceptors — для transport-wide политики: auth, tracing, short-circuit, проверенный retry. Они бегут только для своего транспорта и складываются в onion order. Опции execute — для lifetime конкретной работы: `signal`, `timeout`, WebSocket heartbeat, opt-in reconnect.

Observers сообщают, что случилось, не становясь вторым владельцем. SSE `onInvalidEvent`, WebSocket state listeners и runtime-error listeners — для ограниченных diagnostics и metrics. Возвращённый stream/session по-прежнему владеет iteration, close, unsubscribe и terminal waiting. Кеширование, подавление stale-результатов, идемпотентность и mapping доменных ошибок живут вокруг `client.execute(...)`, где приложение видит свою политику и состояние.

## OpenAPI, sourcemaps и телеметрия

Defjs не генерирует и не синхронизирует второй OpenAPI-контракт. Если OpenAPI уже авторитетен — держи его и добавь runtime-валидацию на границе приложения. Для нового сервиса определения эндпоинтов и Structs могут быть прямым wire-контрактом — без второго источника правды.

`withOpenTelemetryServer(...)` добавляет **outbound** инструментализацию Defjs к клиенту. Он не инициализирует OpenTelemetry SDK. `tracer` обязателен, `meter` опционален, все три транспорта включены по умолчанию, а WebSocket query propagation выключена по умолчанию. Держи имена операций статичными и с низкой cardinality. Propagation, hooks, URL, заголовки, payloads, causes и retention считай потенциально чувствительными.

Sourcemaps — решение деплоя, не поведение Defjs. Публичная map с `sourcesContent` раскрывает исходники; hidden map всё ещё содержит source и пути; отключение maps убирает source-level symbolication. Private maps — деплойные артефакты отладки с явными правилами доступа и retention.

## Связанные рецепты

- [GET с объявленным 404](../recipes/get-declared-404.md)
- [Тест с локальным Fetch handle](../recipes/test-with-handle.md)
