---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: Einmal definieren. Überall typsicher. HTTP, SSE und WebSocket mit Laufzeitvalidierung und voller TypeScript-Inferenz.
  actions:
    - theme: brand
      text: Loslegen
      link: /guide/getting-started
    - theme: alt
      text: Auf GitHub ansehen
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: Type Safety
    details: Definiere Anfrageschemata mit struct. Erhalte End-to-End-Typinferenz für Inputs, Outputs und Fehlerzweige. Die Laufzeitvalidierung fängt Inkonsistenzen ab, bevor sie die Produktion erreichen.
  - icon: 🌐
    title: Multi-Transport
    details: Ein einheitlicher API-Stil für HTTP-Anfragen, Server-Sent Events und WebSocket-Verbindungen. Wechsle den Transport, ohne deine Anwendungslogik neu zu schreiben.
  - icon: 🧅
    title: Interceptors
    details: Transport-spezifische Interceptors im Zwiebelmodell für Logging, Authentifizierung, Retry und Cross-Cutting-Concerns. HTTP, SSE und WebSocket haben jeweils ihre eigene Interceptor-Kette.
  - icon: 📡
    title: Streaming
    details: Native SSE- und WebSocket-Unterstützung mit automatischer Wiederverbindung, Heartbeat, Nachrichtenwarteschlange und Backpressure-Kontrolle. Gebaut für Echtzeitanwendungen.
  - icon: ⚡
    title: Universal Runtime
    details: Funktioniert in Browsern, Node.js, Bun und Deno. Keine Polyfills nötig. Reines ESM mit null Laufzeitabhängigkeiten für das Core-Paket.
  - icon: 🧩
    title: Framework Ready
    details: First-Class-Integrationen für Angular, Vue und React mit provideClient / injectClient / useClient Patterns. OpenTelemetry-Plugin für serverseitige Observability.
---

## Schnellstart

Installiere `@defjs/core` mit deinem bevorzugten Paketmanager:

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

Definiere eine typisierte Anfrage und führe sie in drei Zeilen aus:

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
  console.log(user.id, user.name) // fully typed
}
```

## Framework-Integrationen

<div class="framework-grid">

### Angular

`@defjs/angular` stellt `provideClient` und `injectClient` für Angulars Dependency-Injection-System bereit. Interceptors können Angular-Services über Factory-Funktionen injizieren.

[Mehr erfahren →](/plugins/angular)

### Vue

`@defjs/vue` stellt `provideClient` als Vue-Plugin und `injectClient` für die Composition API bereit. Identisches API-Design zum Angular-Paket für nahtlosen Cross-Framework-Knowledgetransfer.

[Mehr erfahren →](/plugins/vue)

### React

`@defjs/react` stellt `ClientProvider`, `useClient` und Option-Helper bereit, um einen typisierten `@defjs/core` Client im React-Komponentenbaum zu teilen.

[Mehr erfahren →](/plugins/react)

</div>

## Wie geht es weiter

- [Loslegen →](/guide/getting-started) — Installation, CDN-Nutzung und deine erste Anfrage
- [Core-Konzepte →](/core/client) — Client, Commands, Context und Fehlerbehandlung
- [Beispiele →](/guide/examples) — REST CRUD, SSE-Benachrichtigungen, WebSocket-Chat, Interceptor-Patterns

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
