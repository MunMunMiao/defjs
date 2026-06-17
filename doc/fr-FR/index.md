---
layout: home

hero:
  name: Defjs
  text: Typed APIs Across Transports
  tagline: Définissez une fois. Typsé partout. HTTP, SSE et WebSocket avec validation à l'exécution et inférence TypeScript complète.
  actions:
    - theme: brand
      text: Démarrer
      link: /guide/getting-started
    - theme: alt
      text: Voir sur GitHub
      link: https://github.com/defjs/defjs

features:
  - icon: 🔒
    title: Sécurité des types
    details: Définissez des schémas de requête avec struct. Obtenez une inférence de types end-to-end pour les entrées, les sorties et les branches d'erreur. La validation à l'exécution détecte les incompatibilités avant qu'elles n'atteignent la production.
  - icon: 🌐
    title: Multi-transport
    details: Un style d'API unifié pour les requêtes HTTP, les Server-Sent Events et les connexions WebSocket. Changez de transport sans réécrire la logique de votre application.
  - icon: 🧅
    title: Intercepteurs
    details: Des intercepteurs en modèle oignon par transport pour la journalisation, l'authentification, la réessai et les préoccupations transversales. HTTP, SSE et WebSocket ont chacun leur propre chaîne d'intercepteurs.
  - icon: 📡
    title: Streaming
    details: Support natif SSE et WebSocket avec reconnexion automatique, heartbeat, mise en file d'attente de messages et contrôle de contre-pression. Conçu pour les applications en temps réel.
  - icon: ⚡
    title: Runtime universel
    details: Fonctionne dans les navigateurs, Node.js, Bun et Deno. Pas de polyfills nécessaires. ESM pur avec zéro dépendance runtime pour le package core.
  - icon: 🧩
    title: Prêt pour les frameworks
    details: Intégrations de première classe pour Angular, Vue et React avec les patterns provideClient / injectClient / useClient. Plugin OpenTelemetry pour l'observabilité côté serveur.
---

## Démarrage rapide

Installe `@defjs/core` avec ton gestionnaire de paquets préféré :

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

Définis une requête typée et exécute-la en trois lignes :

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
  console.log(user.id, user.name) // entièrement typé
}
```

## Intégrations framework

<div class="framework-grid">

### Angular

`@defjs/angular` fournit `provideClient` et `injectClient` pour le système d'injection de dépendances d'Angular. Les intercepteurs peuvent injecter des services Angular via des fonctions factory.

[En savoir plus →](/plugins/angular)

### Vue

`@defjs/vue` fournit `provideClient` en tant que plugin Vue et `injectClient` pour la Composition API. La conception de l'API est identique au package Angular pour un transfert de connaissances transparent entre frameworks.

[En savoir plus →](/plugins/vue)

### React

`@defjs/react` fournit `ClientProvider`, `useClient` et des option helpers pour partager un client `@defjs/core` typé dans tout l’arbre de composants React.

[En savoir plus →](/plugins/react)

</div>

## Prochaines étapes

- [Démarrage →](/guide/getting-started) — Installation, utilisation CDN et ta première requête
- [Concepts de base →](/core/client) — Client, commandes, contexte et gestion des erreurs
- [Exemples →](/guide/examples) — CRUD REST, notifications SSE, chat WebSocket, patterns d'intercepteurs

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
