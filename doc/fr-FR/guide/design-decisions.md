---
title: Décisions de conception
description: Décisions de conception d'API qui peuvent différer des patterns courants dans d'autres bibliothèques HTTP.
---

# Décisions de conception

Defjs s'écarte intentionnellement de certains patterns courants trouvés dans d'autres bibliothèques HTTP. Ce document explique la rationale de conception derrière chaque décision.

## Conception du client explicite

Defjs exige que chaque client soit créé explicitement. Tu crées un `Client` avec `createClient` et le passes là où il est nécessaire.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const [error, data] = await client.execute(getUser())
```

Pourquoi ce design :

- **Test-friendly** : Passe directement différentes instances `Client` aux tests sans avoir besoin de réinitialiser ou de mocker quelque état que ce soit.
- **Coexistence multi-environnement** : Plusieurs clients peuvent fonctionner en parallèle dans le même processus (ex. API interne + API publique) sans interférence.
- **Transparence des dépendances** : Les appelants doivent explicitement détenir un `Client`, rendant les dépendances visibles pour l'analyse statique et la revue de code.

Si tu as besoin d'un client partagé dans ton application, exporte-le depuis un module :

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

## Intégration au framework

`@defjs/angular`, `@defjs/vue` et `@defjs/react` intègrent des clients explicites au modèle de dépendances de chaque framework. Angular et Vue utilisent `provideClient` / `injectClient` ; React utilise `ClientProvider` / `useClient`. Cela permet d'enregistrer et de récupérer les clients au sein de l'arbre des composants ou des services.

### Angular

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/angular'

export const appConfig = {
  providers: [provideClient(withEndpoint('https://api.example.com'))],
}

export class UserComponent {
  private client = injectClient()

  async loadUser() {
    const [error, user] = await this.client.execute(this.getUser())
  }
}
```

### Vue

```typescript
import { provideClient, withEndpoint, injectClient } from '@defjs/vue'

app.use(provideClient(withEndpoint('https://api.example.com')))

const client = injectClient()
const [error, user] = await client.execute(getUser())
```

### React

```tsx
import { ClientProvider, useClient, withEndpoint } from '@defjs/react'

export function App() {
  return (
    <ClientProvider options={[withEndpoint('https://api.example.com')]}>
      <UserProfile />
    </ClientProvider>
  )
}

function UserProfile() {
  const client = useClient()
  // utilise client.execute(...) dans la logique du composant
}
```

## Options au niveau de la requête dans `execute`, pas dans le builder

Les options au niveau de la requête (`abort`, `timeout`, `heartbeat`, `reconnect`, etc.) sont passées via le deuxième argument de `client.execute`, pas via le constructeur de commande.

```typescript
// Correct : les options au niveau de la requête vont dans execute
const [error, user] = await client.execute(getUser(), { timeout: 5000 })
```

## `execute` surchargé par type de commande

`client.execute` est surchargé pour retourner automatiquement le bon type de résultat selon le type de `Command`.

```typescript
// Requête HTTP — retourne HttpAwaitResult
const [error, user, response] = await client.execute(httpCommand())

// Flux SSE — retourne StreamAwaitResult
const [error, stream, open] = await client.execute(sseCommand())

// WebSocket — retourne SocketAwaitResult
const [error, socket, connection] = await client.execute(wsCommand())
```

## `onInvalidEvent` est un observer

`onInvalidEvent` de SSE est un observer. Les exceptions levées à l'intérieur sont silencieusement ignorées et n'interrompent pas le flux.

```typescript
const client = createClient({
  endpoint: 'https://api.example.com',
  sse: {
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
      // Même si cela lève une exception, le flux continue
    },
  },
})
```

## Consolidation du sous-module d'erreurs

Tous les symboles d'erreur sont exportés depuis le point d'entrée principal `@defjs/core`.

| Export                  | Description                     | Usage typique                                               |
| ----------------------- | ------------------------------- | ----------------------------------------------------------- |
| `RequestError`          | Type union d'erreur             | `switch (error.kind)` branching                             |
| `ERR_ABORTED`           | Identifiant d'annulation        | `controller.abort(ERR_ABORTED)`                             |
| `ERR_TIMEOUT`           | Identifiant de délai d'attente  | `createTransportError(ERR_TIMEOUT)`                         |
| `createTransportError`  | Créer une erreur de transport   | `createTransportError(new Error('offline'))`                |
| `createDefinitionError` | Créer une erreur de définition  | `createDefinitionError('REQUEST_VALIDATION_FAILED', cause)` |
| `createHttpStatusError` | Créer une erreur de statut HTTP | `createHttpStatusError(404, 'Not Found', response, data)`   |

Import depuis le point d'entrée principal :

```typescript
import { RequestError, ERR_ABORTED, ERR_TIMEOUT, createTransportError, createDefinitionError, createHttpStatusError } from '@defjs/core'
```

## Branchement des erreurs par `kind` et `code`

Defjs recommande de brancher par `kind` et `code` plutôt que par comparaison de chaînes.

```typescript
const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      switch (error.code) {
        case 'ABORTED':
          console.error('Request aborted')
          break
        case 'TIMEOUT':
          console.error('Request timed out')
          break
        case 'NETWORK_ERROR':
          console.error('Network error:', error.cause)
          break
      }
      break
    }
    case 'definition': {
      switch (error.code) {
        case 'REQUEST_VALIDATION_FAILED':
          console.error('Request validation failed:', error.cause)
          break
        case 'RESPONSE_VALIDATION_FAILED':
          console.error('Response validation failed:', error.cause)
          break
        case 'UNDECLARED_STATUS':
          console.error('Undeclared status:', error.response?.status)
          break
      }
      break
    }
  }
}
```

## Règles de définition de point de terminaison plus strictes

Defjs applique une règle stricte : **quand `build` est fourni, `input` doit aussi être fourni.**

```typescript
// Correct : a input et build
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.object({
    path: struct.object({ id: struct.number() }),
  }),
  build(request, input) {
    request.setPathParams({ id: input.path.id })
  },
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

// Correct : pas de input ni de build
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: { 200: struct.object({ items: struct.array(struct.object({ id: struct.number() })) }) },
})

// Erreur : a build mais pas de input
const badRequest = defineRequest({
  method: 'GET',
  path: '/users/:id',
  build(request, input) {
    request.setPathParams({ id: input.id }) // Erreur TypeScript : schéma input manquant
  },
  output: { 200: struct.object({ id: struct.number() }) },
})
```

Cette règle s'applique aussi à `defineEventStream` et `defineWebSocket`.

## Dépendances

| Package          | Version requise |
| ---------------- | --------------- |
| `@defjs/core`    | `^0.4.0`        |
| `@defjs/angular` | `19.x`          |
| `@defjs/vue`     | `^0.4.0`        |
| `@defjs/react`   | `^0.4.0`        |

Intervalle de peer dependency Angular : `>=18.0.0 <=22.0.0`. Intervalle de peer dependency React : `>=18.0.0`. Runtime Node : `>=26`.

## Prochaines étapes

- [Client →](/core/client) — Conception du client explicite et configuration
- [Commandes →](/core/commands) — Définitions de commandes et règles d'entrée
- [Erreurs →](/core/errors) — Structure de `RequestError` et branchement
