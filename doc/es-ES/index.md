---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: Define una vez. Seguro de tipos en todas partes. HTTP, SSE y WebSocket con validación en tiempo de ejecución y inferencia completa de TypeScript.
  actions:
    - theme: brand
      text: Empezar
      link: /guide/getting-started
    - theme: alt
      text: Ver en GitHub
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: Seguridad de tipos
    details: Define esquemas de petición con struct. Obtén inferencia de tipos end-to-end para entradas, salidas y ramas de error. La validación en tiempo de ejecución detecta discrepancias antes de que lleguen a producción.
  - icon: 🌐
    title: Multi-Transporte
    details: Un estilo de API unificado para peticiones HTTP, Server-Sent Events y conexiones WebSocket. Cambia de transporte sin reescribir la lógica de tu aplicación.
  - icon: 🧅
    title: Interceptores
    details: Interceptores por transporte con modelo de cebolla para registro, autenticación, reintento y preocupaciones transversales. HTTP, SSE y WebSocket tienen su propia cadena de interceptores.
  - icon: 📡
    title: Streaming
    details: Soporte nativo SSE y WebSocket con reconexión automática, latido, encolamiento de mensajes y control de contrapresión. Diseñado para aplicaciones en tiempo real.
  - icon: ⚡
    title: Runtime Universal
    details: Funciona en navegadores, Node.js, Bun y Deno. Sin polyfills necesarios. ESM puro con cero dependencias de runtime para el paquete core.
  - icon: 🧩
    title: Listo para Frameworks
    details: Integraciones de primera clase para Angular, Vue y React con patrones provideClient / injectClient / useClient. Plugin OpenTelemetry para observabilidad en el servidor.
---

## Inicio rápido

Instala `@defjs/core` con tu gestor de paquetes preferido:

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

Define una petición tipada y ejecútala en tres líneas:

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
  console.log(user.id, user.name) // totalmente tipado
}
```

## Integraciones con Frameworks

<div class="framework-grid">

### Angular

`@defjs/angular` proporciona `provideClient` e `injectClient` para el sistema de inyección de dependencias de Angular. Los interceptores pueden inyectar servicios Angular mediante funciones factory.

[Aprender más →](/plugins/angular)

### Vue

`@defjs/vue` proporciona `provideClient` como un plugin de Vue e `injectClient` para la Composition API. Diseño de API idéntico al paquete Angular para una transferencia de conocimiento fluida entre frameworks.

[Aprender más →](/plugins/vue)

### React

`@defjs/react` proporciona `ClientProvider`, `useClient` y option helpers para compartir un client `@defjs/core` tipado en todo el árbol de componentes React.

[Aprender más →](/plugins/react)

</div>

## Qué sigue

- [Empezar →](/guide/getting-started) — Instalación, uso con CDN y tu primera petición
- [Conceptos Core →](/core/client) — Cliente, comandos, contexto y manejo de errores
- [Ejemplos →](/guide/examples) — CRUD REST, notificaciones SSE, chat WebSocket, patrones de interceptores

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
