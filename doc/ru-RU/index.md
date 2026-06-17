---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: Определите один раз. Типобезопасность везде. HTTP, SSE и WebSocket с проверкой во время выполнения и полным выводом типов TypeScript.
  actions:
    - theme: brand
      text: Начать
      link: /guide/getting-started
    - theme: alt
      text: GitHub
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: Типовая безопасность
    details: Определяйте схемы запросов через struct. Получайте сквозной вывод типов для входных данных, выходных данных и веток ошибок. Валидация во время выполнения отлавливает несоответствия ещё до попадания в продакшн.
  - icon: 🌐
    title: Мультитранспорт
    details: Единый стиль API для HTTP-запросов, Server-Sent Events и WebSocket-соединений. Меняйте транспорт без переписывания логики приложения.
  - icon: 🧅
    title: Перехватчики
    details: Луковичные перехватчики для каждого транспорта — логирование, аутентификация, повторные попытки и сквозная логика. HTTP, SSE и WebSocket имеют собственные цепочки перехватчиков.
  - icon: 📡
    title: Потоковая передача
    details: Нативная поддержка SSE и WebSocket с автоматическим переподключением, heartbeat, очередью сообщений и контролем обратного давления. Разработано для приложений реального времени.
  - icon: ⚡
    title: Универсальный рантайм
    details: Работает в браузерах, Node.js, Bun и Deno. Полифиллы не нужны. Чистый ESM с нулевым количеством зависимостей рантайма для основного пакета.
  - icon: 🧩
    title: Готовность к фреймворкам
    details: Первоклассные интеграции для Angular, Vue и React через паттерны provideClient / injectClient / useClient. Плагин OpenTelemetry для серверной наблюдаемости.
---

## Быстрый старт

Установите `@defjs/core` с помощью вашего пакетного менеджера:

::: code-group

```bash [npm]
npm install @defjs/core
```

```bash [yarn]
yarn add @defjs/core
```

```bash [pnpm]
pnpm add @defjs/core
```

```bash [bun]
bun add @defjs/core
```

:::

Определите типизированный запрос и выполните его в три строки:

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())
if (!error) {
  console.log(user.id, user.name) // полностью типизировано
}
```

## Интеграции с фреймворками

<div class="framework-grid">

### Angular

`@defjs/angular` предоставляет `provideClient` и `injectClient` для системы внедрения зависимостей Angular. Перехватчики могут внедрять Angular-сервисы через фабричные функции.

[Подробнее →](/plugins/angular)

### Vue

`@defjs/vue` предоставляет `provideClient` как Vue-плагин и `injectClient` для Composition API. Идентичный дизайн API с Angular-пакетом для безшовного переноса знаний между фреймворками.

[Подробнее →](/plugins/vue)

### React

`@defjs/react` предоставляет `ClientProvider`, `useClient` и option helpers для совместного использования одного типизированного client `@defjs/core` в дереве React-компонентов.

[Подробнее →](/plugins/react)

</div>

## Что дальше

- [Начало работы →](/guide/getting-started) — Установка, использование через CDN и ваш первый запрос
- [Основные концепции →](/core/client) — Клиент, команды, контекст и обработка ошибок
- [Примеры →](/guide/examples) — REST CRUD, SSE-уведомления, WebSocket-чат, паттерны перехватчиков

<style>
.framework-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.5rem;
  margin-top: 1.5rem;
}
.framework-grid > div,
.framework-grid > h3 {
  margin: 0;
}
.framework-grid h3 {
  font-size: 1.1rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}
.framework-grid p {
  margin: 0 0 0.5rem;
  color: var(--vp-c-text-2);
}
.framework-grid a {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
</style>
