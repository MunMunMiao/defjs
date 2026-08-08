---
title: SSE
description: Описывайте и декодируйте Server-Sent Events, обрабатывайте запуск, читайте общую очередь событий, настраивайте переподключение и закрывайте принадлежащие вам потоки.
---

# SSE

`defineEventStream(...)` создаёт фабрику команды SSE. Эндпоинт объявляет путь и Struct для каждого имени события.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

По умолчанию используется метод `GET`. Эндпоинт может задать другой метод, но высокоуровневый контекст `build` для SSE не поддерживает тело запроса.

## Декодирование событий

Парсер SSE сначала выбирает `events[eventName]`, затем `events.default`, если он задан. Если совпадения нет, событие отбрасывается, а необязательный наблюдатель невалидных событий получает причину `missing-struct`.

Поле SSE `data:` приходит как текст:

- `struct.string()`, `struct.text()`, `struct.any()` и `struct.unknown()` получают текст;
- `struct.number()` удаляет пробелы по краям и принимает конечное число;
- `struct.boolean()` удаляет пробелы по краям и принимает только `true` или `false`;
- `struct.json(inner)` разбирает JSON-текст, затем структурно декодирует его через `inner`.

Обычный `struct.object(...)` не разбирает текст события, похожий на JSON. Оберните его в `struct.json(...)`.

Struct `default` обрабатывает остальные имена:

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

Если Struct `default` отсутствует, тип `EventStreamData<TEvents>` представляет собой дискриминированное объединение объявленных имён событий. Ветвление по `event.event` сужает тип `event.data` до выходного типа соответствующего Struct. Когда `default` присутствует, его ветка сохраняет фактически переданное имя события в виде `event: string`; поэтому в потоках, где известные события сочетаются с `default`, остаётся эта широкая резервная ветка.

## Входные данные и построение запроса

Для секций пути, query и заголовков используйте `struct.request(...)`:

```typescript
const roomEvents = defineEventStream({
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

Пользовательский SSE `build` может задать параметры пути, query и заголовки. Он получает проекцию, привязанную к схеме. Через него нельзя задать тело или credentials. Настраивайте credentials на клиенте с помощью `withCredentials(...)`.

## Кортеж запуска

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE возвращает:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

При успехе третий элемент — проверенный снимок открытия при запуске. Его ответ прошёл проверку HTTP-статуса и Content-Type `text/event-stream`.

`stream.open` — геттер с актуальным значением. Он хранит последний ответ логического потока, в том числе ответ более позднего переподключения, который затем не прошёл проверку статуса или Content-Type. Если важен первый снимок, храните `startupOpen` отдельно.

По умолчанию не записывайте в журнал `startupOpen.url`, `stream.open.url` и URL ответа. В пути и query могут находиться чувствительные данные.

## Чтение событий

Владелец должен запустить итерацию и организовать закрытие в том же жизненном цикле:

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

Успешный `execute` означает, что запуск завершён. Ошибки после запуска проявляются как отклонение итератора и через `stream.closed`; исходный элемент `error` в кортеже не меняется.

## Невалидные события

Настройте `onInvalidEvent` через `withSSEOnInvalidEvent(...)` или `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Наблюдатель получает:

- `reason: 'missing-struct' | 'validation-failed'`;
- исходные `id`, имя и текст data события, а также необязательное значение retry;
- `cause` при ошибке декодирования.

Событие отбрасывается, но более позднее корректное событие всё ещё может быть доставлено. Выброшенные наблюдателем ошибки и отклонённые Promise перехватываются, однако асинхронного наблюдателя ждут до обработки следующих сообщений. Делайте его быстрым. Перед записью проверяйте и маскируйте исходные `id`, `data` и `cause`.

## Переподключение

SSE автоматически повторяет попытки после сетевых ошибок и ошибок чтения потока. Обычный EOF закрывает поток с `code: 'eof'` и не запускает переподключение.

По умолчанию повторы начинаются с одной секунды и не ограничены по числу. Ограничьте их через `attempts`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` — число повторов после первой попытки. `attempts: 0` отключает повторы. Параметр `attempt` для `shouldReconnect` начинается с 1 на первом повторе и накапливается в пределах логического потока; успешное физическое подключение его не сбрасывает.

Задержка начинается с текущего интервала повтора. Сервер может изменить его через поле SSE `retry:`. `factor` задаёт экспоненциальный рост, а `maxDelayMs` ограничивает базовое значение. Затем `jitter` добавляет случайное число миллисекунд от нуля до указанного значения. Поскольку jitter добавляется после ограничения, итоговая задержка может превысить `maxDelayMs`, но менее чем на `jitter` миллисекунд.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

В последующих попытках транспорт отправляет последний ID события в `Last-Event-ID`. `shouldReconnect` не должен выбрасывать или отклонять ошибку. Сейчас сбой предиката не гарантирует завершение каждого ожидающего итератора или всех веток `stream.closed`.

Ошибки проверки HTTP/открытия, фатальные ошибки обработки сообщений и нормальный EOF отличаются от повторяемой сетевой ошибки или ошибки чтения. Не рассчитывайте, что любая окончательная ветка приведёт к переподключению.

## Общая рабочая очередь

Асинхронно итерируемый объект представляет одну общую рабочую очередь логического потока. Это не подписка, не рассылка каждому потребителю и не механизм обратного давления.

По умолчанию очередь не ограничена. Задайте предел через `withSSEQueue(...)` или `withSSEOptions({ queue })`:

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Режим переполнения | Поведение при достижении предела                              |
| ------------------ | ------------------------------------------------------------- |
| `drop-newest`      | Отбросить поступившее событие.                                |
| `drop-oldest`      | Удалить самое старое буферизованное событие и добавить новое. |
| `error`            | Выбросить ошибку переполнения и завершить обработку.          |

Несколько итераторов конкурируют за значения, а не получают собственные копии. Выход через `break` из одного цикла `for await` не закрывает транспорт: у итератора нет реализации `return()` с учётом жизненного цикла. Явно вызывайте `stream.close(...)`.

Закрытие помечает очередь завершённой, но не удаляет уже буферизованные значения. Потребитель может прочитать их до того, как следующая итерация вернёт `done: true`.

### Ограничение буфера парсера

Очередь событий и буфер парсера — разные вещи. Через `withSSEOptions(...)` задайте положительный `maxBufferSize`, чтобы ограничить число байтов незавершённой строки SSE:

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

Превышение предела после запуска отклоняет итератор и закрывает поток с `code: 'error'`. Если значение не задано, буфер парсера не ограничен.

## Окончательное закрытие

`stream.closed` разрешается значением:

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` означает нормальное завершение тела ответа.
- `aborted` включает явный вызов `stream.close(...)` и отмену.
- `error` означает, что повторы закончились или возникла окончательная ошибка потока.

`stream.close(reason)` идемпотентен. Он отменяет активную работу транспорта, запрещает новые добавления в очередь и разрешает `stream.closed`. Один `break` ничего из этого не делает.

Граница приложения, которая открыла поток, отвечает за его закрытие. Клиент или провайдер фреймворка не закрывает поток автоматически.

## Что дальше

- [WebSocket](/ru-RU/core/web-socket) — двунаправленные сеансы и явно включаемое переподключение.
- [Перехватчики](/ru-RU/core/interceptors) — изменение заголовков SSE и наблюдение за жизненным циклом.
- [Ошибки](/ru-RU/core/errors) — доступность ответа при ошибке запуска.
