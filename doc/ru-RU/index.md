---
layout: home

hero:
  name: Defjs
  text: Типизированные команды для HTTP, SSE и WebSocket
  tagline: Описывайте формат данных с помощью Struct, создавайте клиентов явно и учитывайте особенности результата и жизненного цикла каждого транспорта.
  actions:
    - theme: brand
      text: Начать работу
      link: /ru-RU/guide/getting-started
    - theme: alt
      text: Открыть на GitHub
      link: https://github.com/defjs/defjs

features:
  - title: Контракты эндпоинтов
    details: Отделяйте описание эндпоинта от фабрики команды и самой команды. Struct декодируют входные данные и данные транспорта во время выполнения.
  - title: Результаты с учётом транспорта
    details: HTTP, SSE и WebSocket возвращают трёхэлементные кортежи с ошибкой на первом месте. Третий элемент — обёртка ответа, снимок открытия при запуске или снимок подключения при запуске.
  - title: Цепочки перехватчиков
    details: Регистрируйте на клиенте перехватчики HTTP, SSE и WebSocket. Каждый транспорт отбирает только свои перехватчики и выполняет их в луковичном порядке.
  - title: Явный жизненный цикл
    details: SSE умеет повторять попытки после сетевых ошибок и ошибок чтения. Переподключение WebSocket включается явно. За чтение, отмену и окончательное закрытие всё равно отвечает приложение.
  - title: Декодирование во время выполнения
    details: Декодируйте входные данные, ответы, события потоков и сообщения WebSocket теми же контрактами Struct, которые управляют выводом типов TypeScript.
  - title: Интеграции приложения
    details: Передавайте клиенты через Vue или React и добавляйте исходящую инструментацию OpenTelemetry в серверные сервисы.
---

## Создайте типизированный API-клиент

Сначала опишите контракт HTTP, SSE или WebSocket, который вызывает ваше приложение. Defjs превращает его в фабрику команд, проверяет данные во время выполнения и оставляет результат транспорта явным.

Основной HTTP-процесс короткий: создайте клиент для своего API, опишите эндпоинт, вызовите фабрику команды и выполните команду.

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

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

Направьте клиент на сервис приложения и приведите Struct в соответствие с реальным контрактом ответа. Учётные данные, состояние интерфейса, повторы, отмена и освобождение ресурсов остаются ответственностью приложения.

## Что читать дальше

- [Начало работы](/ru-RU/guide/getting-started) — установка пакета и первый типизированный запрос из приложения.
- [Клиент](/ru-RU/core/client) — композиция опций и три перегрузки `execute`.
- [Команды](/ru-RU/core/commands) — описания эндпоинтов, фабрики команд, команды и проекции, привязанные к схеме.
- [HTTP](/ru-RU/core/http), [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket) — поведение транспортов и управление жизненным циклом.
- [Vue](/ru-RU/plugins/vue), [React](/ru-RU/plugins/react) и [OpenTelemetry Server](/ru-RU/plugins/opentelemetry-server) — подключение Defjs к фреймворку и телеметрии приложения.
