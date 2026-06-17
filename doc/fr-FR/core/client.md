---
title: Client
description: Create explicit clients, configure transport options, and execute HTTP, SSE, and WebSocket commands.
---

# Client

`@defjs/core` utilise une conception de **client explicite**. Chaque requête est exécutée via une instance `Client` que tu crées explicitement. Cela rend les tests, la configuration multi-environnement et le suivi des dépendances simples et explicites.

## Créer un client

Utilise `createClient` avec une ou plusieurs fonctions de configuration.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Les fonctions de configuration se composent. Les fonctions ultérieures remplacent les précédentes pour la même clé.

```typescript
import { createClient, withEndpoint, withHTTPHandle, withInterceptors, withCredentials } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withHTTPHandle(myCustomFetch),
  withCredentials(true),
  withInterceptors(loggingInterceptor, authInterceptor),
)
```

### Options de configuration

| Fonction                            | Description                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `withEndpoint(url)`                 | Adresse de base de l'API.                                                      |
| `withHTTPHandle(fetch)`             | Implémentation `fetch` personnalisée pour HTTP.                                |
| `withSSEHandle(fetch)`              | Implémentation `fetch` personnalisée pour SSE.                                 |
| `withWebSocketHandle(WebSocket)`    | Constructeur `WebSocket` personnalisé (ex. pour Node).                         |
| `withInterceptors(...interceptors)` | Enregistrer des intercepteurs au niveau transport. Auto-distribués par `kind`. |
| `withQueryParamsSerializer(fn)`     | Sérialisation personnalisée des paramètres de requête.                         |
| `withCredentials(boolean)`          | Inclure les credentials cross-origin.                                          |
| `withXSRF(options)`                 | Lecture et injection du jeton XSRF.                                            |
| `withSSEOptions(options)`           | Reconnexion SSE, file, gestion des événements invalides, etc.                  |
| `withWebSocketOptions(options)`     | Heartbeat WebSocket, reconnexion, file, sous-protocoles, etc.                  |

Pour la configuration spécifique à SSE et WebSocket, voir [SSE](/core/sse) et [WebSocket](/core/web-socket).

## Exécuter des commandes

`Client.execute` est une méthode surchargée qui distribue vers la bonne couche transport selon le type de `Command`.

### Requêtes HTTP

Passe une commande construite avec `defineRequest`. Retourne un triplet :

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({
      id: struct.number(),
      name: struct.string(),
    }),
  },
})

const [error, user, response] = await client.execute(getUser())

if (error) {
  console.error(error.code, error.message)
} else {
  console.log(user.id, user.name)
}
```

Type de retour :

```typescript
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: SettledResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: SettledResponse<unknown> | undefined]
```

### Flux d'événements SSE

Passe une commande construite avec `defineEventStream`. Retourne un handle de flux et des infos d'ouverture.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const watchLogs = defineEventStream({
  path: '/v1/logs/stream',
  events: {
    log: struct.object({ level: struct.string(), message: struct.string() }),
  },
})

const [error, stream, open] = await client.execute(watchLogs())

if (error) {
  console.error('Stream failed:', error)
  return
}

for await (const event of stream) {
  console.log(event.event, event.data)
}
```

Type de retour :

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

### Connexions WebSocket

Passe une commande construite avec `defineWebSocket`. Retourne un objet session.

```typescript
import { defineWebSocket, struct } from '@defjs/core'

const chat = defineWebSocket({
  path: '/v1/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },
})

const [error, session, connection] = await client.execute(chat())

if (error) {
  console.error('WebSocket failed:', error)
  return
}

session.send({ type: 'message', data: { text: 'hello' } })

for await (const msg of session.receive) {
  console.log(msg.type, msg.data)
}
```

Type de retour :

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, socket: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, socket: undefined, connection: WebSocketConnectionInfo | undefined]
```

## Fonctions utilitaires

### `isClient`

Vérifie si une valeur est une instance `Client` valide.

```typescript
import { isClient } from '@defjs/core'

if (isClient(maybeClient)) {
  const result = await maybeClient.execute(someCommand())
}
```

### `getClientConfig`

Extraire l'objet de configuration interne pour le débogage ou la construction d'abstractions de plus haut niveau.

```typescript
import { getClientConfig } from '@defjs/core'

const config = getClientConfig(client)
console.log(config.endpoint, config.interceptors.length)
```

Si la valeur n'est pas une instance `Client`, `getClientConfig` lève une `TypeError`.

## Conception de client explicite

Chaque client dans Defjs est créé explicitement. Tu crées un `Client` avec `createClient` et le passes là où il est nécessaire.

Avantages de la création explicite :

- **Test-friendly** : Passe différentes instances `Client` directement aux tests sans avoir besoin de réinitialiser ou de mocker aucun état.
- **Coexistence multi-environnement** : Plusieurs clients peuvent fonctionner en parallèle dans le même processus (ex. API interne + API publique).
- **Transparence des dépendances** : Les appelants doivent explicitement détenir un `Client`, rendant les dépendances visibles pour l'analyse statique et la revue de code.

Si tu as besoin d'un client partagé dans ton application, exporte-le depuis un module :

```typescript
// api/client.ts
import { createClient, withEndpoint } from '@defjs/core'

export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Puis importe et utilise dans le code métier :

```typescript
import { apiClient } from './api/client'

const [error, data] = await apiClient.execute(getUser())
```

## Prochaines étapes

- [Requêtes HTTP →](/core/http) — `defineRequest` et patterns de sortie
- [SSE →](/core/sse) — Définition SSE, reconnexion et files d'événements
- [WebSocket →](/core/web-socket) — Définition WebSocket, heartbeat et stratégies de reconnexion
- [Intercepteurs →](/core/interceptors) — Types d'intercepteurs et mécanique de la chaîne en oignon
