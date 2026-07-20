---
title: Getting Started
description: Install @defjs/core, use it via CDN, and create your first typed request in three steps.
---

# Démarrage

Defjs est une bibliothèque TypeScript pour définir des API de requête typées et les exécuter à travers plusieurs transports et runtimes JavaScript.

## Installation

Utilise ton gestionnaire de paquets préféré :

::: code-group

```sh [npm]
npm install @defjs/core
```

```sh [yarn]
yarn add @defjs/core
```

```sh [pnpm]
pnpm add @defjs/core
```

```sh [bun]
bun add @defjs/core
```

:::

## Utilisation CDN

Importe directement comme un module ES sans outil de build :

```typescript
import { createClient, defineRequest, struct } from 'https://unpkg.com/@defjs/core/index.min.js'
```

## Trois étapes pour ta première requête

### Étape 1 : Créer un client

Le Client est le point d'entrée pour toute exécution de requête. Crée une instance avec `createClient` et configure le point de terminaison de base :

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

### Étape 2 : Définir une requête

Utilise `defineRequest` pour définir un point de terminaison HTTP typé. Utilise `struct` pour décrire la forme des entrées et des réponses :

```typescript
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user/:id',
  input: struct.object({
    id: struct.number(),
  }),
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
    404: struct.object({
      message: struct.string(),
    }),
  },
})
```

::: tip
Les clés dans `output` sont des codes de statut HTTP. Defjs sélectionne automatiquement le schéma correspondant à l'exécution et déduit les types TypeScript en conséquence : les réponses 2xx sont typées comme des données de succès, les non-2xx comme des données d'erreur.
:::

### Étape 3 : Exécuter

Appelle `client.execute` avec ta commande de requête et une configuration optionnelle :

```typescript
const [error, user, response] = await client.execute(getUser({ id: 1 }))

if (error) {
  // error est typé en fonction des schémas non-2xx dans output
  console.error(error.code, error.message)
  return
}

// user est typé comme { id: number; name: string }
console.log(user.name)
```

## Exemple complet

Voici un exemple end-to-end avec validation d'entrée, validation de sortie, gestion des erreurs et un intercepteur :

```typescript
import { createClient, defineRequest, struct, withEndpoint, withInterceptors } from '@defjs/core'

// 1. Créer le Client
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors([
    async (request, next) => {
      request.headers.set('Authorization', 'Bearer token')
      return next(request)
    },
  ]),
)

// 2. Définir la requête
const createPost = defineRequest({
  method: 'POST',
  path: '/v1/posts',
  input: struct.object({
    title: struct.string(),
    body: struct.string(),
    'X-Request-ID': struct.string(),
  }),
  build: (input) => ({
    body: { title: input.title, body: input.body },
    headers: { 'X-Request-ID': input['X-Request-ID'] },
  }),
  output: {
    201: struct.object({
      id: struct.number(),
      title: struct.string(),
    }),
    400: struct.object({
      field: struct.string(),
      reason: struct.string(),
    }),
  },
})

// 3. Exécuter
async function createPost() {
  const [error, post, response] = await client.execute(
    createPost({
      title: 'Hello',
      body: 'World',
      'X-Request-ID': 'uuid-123',
    }),
  )

  if (error) {
    switch (error.code) {
      case 'HTTP_STATUS':
        console.error('Validation failed:', error.data)
        break
      case 'REQUEST_VALIDATION_FAILED':
        console.error('Request validation failed:', error.message)
        break
      case 'RESPONSE_VALIDATION_FAILED':
        console.error('Response validation failed:', error.message)
        break
      case 'TRANSPORT_ERROR':
        console.error('Network error:', error.message)
        break
      default:
        console.error('Unknown error:', error)
    }
    return
  }

  console.log('Created post:', post.id, post.title)
}
```

## Référence rapide de l'API Core

| API                    | Description                               | Usage typique                                                                                           |
| ---------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `createClient`         | Créer un client de requête                | `createClient(withEndpoint('https://api.example.com'))`                                                 |
| `defineRequest`        | Définir un point de terminaison HTTP      | `defineRequest({ method: 'GET', path: '/user', output: [{ status: 200, body: UserStruct }] as const })` |
| `defineEventStream`    | Définir un point de terminaison SSE       | `defineEventStream({ path: '/events', events: { message: struct.string() } })`                          |
| `defineWebSocket`      | Définir un point de terminaison WebSocket | `defineWebSocket({ path: '/ws', incoming, outgoing })`                                                  |
| `struct`               | Constructeur de schéma                    | `struct.object({ id: struct.number() })`                                                                |
| `.alias(name)`         | Alias de clé wire pour les champs         | `struct.string().alias('user_name')`                                                                    |
| `withEndpoint`         | Définir l'URL de base                     | `withEndpoint('https://api.example.com')`                                                               |
| `withInterceptors`     | Enregistrer des intercepteurs             | `withInterceptors([...interceptors])`                                                                   |
| `withCredentials`      | Activer les credentials cross-origin      | `withCredentials(true)`                                                                                 |
| `withSSEOptions`       | Configurer les options SSE                | `withSSEOptions({ method: 'POST' })`                                                                    |
| `withWebSocketOptions` | Configurer les options WebSocket          | `withWebSocketOptions({ protocols: ['v1'] })`                                                           |

## Prochaines étapes

- [Client →](/core/client) — Création de clients, exécution de commandes et configuration
- [Commandes →](/core/commands) — `defineRequest`, `defineEventStream`, `defineWebSocket`
- [Erreurs →](/core/errors) — Structure de `RequestError` et patterns de branchement
