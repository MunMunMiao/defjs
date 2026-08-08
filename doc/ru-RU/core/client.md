---
title: Клиент
description: Создавайте явные клиенты, комбинируйте опции, выполняйте команды разных транспортов и проверяйте актуальную конфигурацию.
---

# Клиент

Создайте `Client` явно и передайте его коду, который выполняет команды.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Клиент хранит конфигурацию и распределяет команды между HTTP, SSE и WebSocket. У него нет глобального реестра или фонового менеджера жизненного цикла.

## Композиция опций

Опции выполняются слева направо.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

Итоговый эндпоинт — `https://api.example.com`. Порядок перехватчиков: `operationLogger`, `authInterceptor`, затем `retryInterceptor`.

Композиция подчиняется трём правилам:

1. Опции-сеттеры заменяют значение. Это относится к `withEndpoint`, реализациям транспортов, сериализатору query, учётным данным, конфигурации XSRF и отдельным настройкам SSE или WebSocket.
2. `withInterceptors(...items)` добавляет элементы в конец. Несколько вызовов сохраняют порядок регистрации перехватчиков.
3. `withSSEOptions(...)` и `withWebSocketOptions(...)` поверхностно заменяют каждое заданное поле верхнего уровня. Вложенные объекты переподключения, heartbeat и очереди глубоко не объединяются.

Например, второй объект `reconnect` ниже полностью заменяет первый и не сохраняет `attempts: 5`.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

Групповые опции игнорируют свойства со значением `undefined`. Любое другое переданное поле верхнего уровня целиком заменяет текущее значение.

### Основные опции

| Опция                            | Эффект                                                               |
| -------------------------------- | -------------------------------------------------------------------- |
| `withEndpoint(url)`              | Задаёт абсолютный базовый эндпоинт для всех транспортов.             |
| `withHTTPHandle(fetch)`          | Заменяет реализацию Fetch для HTTP.                                  |
| `withSSEHandle(fetch)`           | Заменяет реализацию Fetch для SSE.                                   |
| `withWebSocketHandle(WebSocket)` | Заменяет конструктор WebSocket.                                      |
| `withInterceptors(...items)`     | Добавляет в конец перехватчики разных транспортов.                   |
| `withQueryParamsSerializer(fn)`  | Заменяет сериализацию query для HTTP, SSE и WebSocket.               |
| `withCredentials(boolean)`       | При `true` использует Fetch `credentials: 'include'` для HTTP и SSE. |
| `withXSRF(options?)`             | Настраивает добавление XSRF-токена в HTTP.                           |
| `withSSEOptions(options)`        | Поверхностно заменяет заданные поля SSE.                             |
| `withWebSocketOptions(options)`  | Поверхностно заменяет заданные поля WebSocket.                       |

Отдельные вспомогательные функции SSE и WebSocket задают одно соответствующее поле верхнего уровня. Значения по умолчанию и последствия для жизненного цикла описаны на страницах транспортов.

## Выполнение команд

У `Client.execute` три перегрузки. Каждая возвращает трёхэлементный кортеж с ошибкой на первом месте.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

Третий элемент — обёртка Defjs `SettledResponse`, если ответ доступен. Опции HTTP включают `abort` или `timeout`, дополнительный псевдоним `signal`, `context` и наблюдателей прогресса загрузки в обе стороны.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

Третий элемент — проверенный снимок открытия при запуске. `stream.open` — отдельный геттер с актуальным значением, которое может измениться после попыток переподключения. SSE принимает отмену и `HttpContext` при выполнении; переподключение и очередь событий настраиваются на клиенте.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

Третий элемент — снимок подключения при запуске. `session.connection` — геттер с актуальным значением; он может описывать более позднюю физическую попытку. При выполнении WebSocket принимает отмену, а также отдельные опции `beforeConnect`, `heartbeat`, `protocols`, `queue` и `reconnect`. `HttpContext` не поддерживается.

Точные ветки ошибок описаны в разделе [«Ошибки»](/ru-RU/core/errors), а жизненный цикл транспортов — в разделах [HTTP](/ru-RU/core/http), [SSE](/ru-RU/core/sse) и [WebSocket](/ru-RU/core/web-socket).

## Область клиента

Браузерное приложение может хранить клиент на уровне модуля, если его эндпоинт и замыкания содержат только безопасное для браузера состояние, не зависящее от запроса.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Не переиспользуйте серверный клиент между запросами, если его опции или перехватчики захватывают данные авторизации, cookie, арендатора, пользователя или контекста запроса. Создавайте такой клиент внутри границы серверного запроса.

У `Client` нет метода `dispose()`. Он не отслеживает активные запросы, потоки и сеансы. Код, который запускает работу, должен отменить HTTP-запрос, закрыть хендл SSE или сеанс WebSocket на соответствующей границе жизненного цикла.

## Расширенная проверка

`isClient(value)` проверяет маркер клиента во время выполнения.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` возвращает актуальный изменяемый объект конфигурации, который хранит клиент. Это не снимок и не readonly-представление.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

Изменение этого объекта влияет на последующие выполнения и обходит обычную композицию опций. Используйте его для диагностики или тщательно проверенного интеграционного кода. Если аргумент не является корректным клиентом, `getClientConfig` выбрасывает `TypeError`.

## Что дальше

- [Команды](/ru-RU/core/commands) — значения, которые передаются в `execute`.
- [Перехватчики](/ru-RU/core/interceptors) — фильтрация и луковичный порядок.
- [Контекст](/ru-RU/core/context) — метаданные HTTP и SSE в области запроса.
