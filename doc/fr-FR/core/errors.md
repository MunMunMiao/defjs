---
title: Errors
description: RequestError structure, error classification, built-in constants, and recommended branching patterns.
---

# Erreurs

Tous les résultats d'exécution dans `@defjs/core` sont retournés comme des triplets `[error, result, response]`. `error` est un `RequestError` : une union discriminée avec `kind` et `code`. Le branchement par `kind` et `code` est le pattern recommandé plutôt que la comparaison de chaînes.

## Structure de RequestError

`RequestError` est une union de trois types d'erreur :

```typescript
import type { RequestError } from '@defjs/core'

type RequestError<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

Toutes les erreurs partagent ces champs communs :

| Champ      | Type                                    | Description                                                                |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------- |
| `kind`     | `'http' \| 'transport' \| 'definition'` | Catégorie d'erreur pour le branchement de premier niveau                   |
| `code`     | `string`                                | Code d'erreur précis pour le branchement de second niveau                  |
| `message`  | `string`                                | Description d'erreur lisible par un humain                                 |
| `data`     | `unknown`                               | Données additionnelles (seulement pour les erreurs `http` et `definition`) |
| `response` | `SettledResponseLike`                   | Objet de réponse brute (seulement pour les erreurs `http` et `definition`) |

### HttpStatusError

Produite quand le serveur retourne un code de statut non-2xx qui est défini dans `output`.

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

Le type `data` est déduit du schéma `output` pour le code de statut correspondant. Par exemple, `output: { 404: notFoundStruct }` rétrécit `error.data` au type inféré de `notFoundStruct`.

### TransportError

Produite lors d'échecs réseau ou de la couche transport, incluant l'annulation, le délai d'attente et les erreurs réseau génériques.

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'TIMEOUT' | 'NETWORK_ERROR'
  message: string
  cause?: unknown
}
```

### DefinitionError

Produite lors d'échecs de définition ou de validation de la requête.

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Code                         | Scénario de déclenchement                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Les paramètres d'entrée ont échoué la validation du `input` struct, ou `build` a levé une exception |
| `RESPONSE_VALIDATION_FAILED` | Le corps de réponse a échoué la validation du `output` struct pour le code de statut retourné       |
| `UNDECLARED_STATUS`          | Le serveur a retourné un code de statut 2xx non déclaré dans `output`                               |

## Classification et branchement des erreurs

**N'utilise pas** la comparaison de chaînes pour juger les types d'erreur :

```typescript
// Non recommandé : fragile et sans rétrécissement de type
if (error.message.includes('timeout')) { ... }
```

**Recommandé** : Branche par `kind` et `code` pour un rétrécissement de type précis :

```typescript
import { createClient, defineRequest, struct } from '@defjs/core'

const client = createClient(/* ... */)

const getUser = defineRequest({
  method: 'GET',
  path: '/v1/user',
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ code: struct.string(), message: struct.string() }),
  },
})

const [error, user] = await client.execute(getUser())

if (error) {
  switch (error.kind) {
    case 'http': {
      // error est rétréci à HttpStatusError
      console.error('HTTP', error.status, error.message)
      if (error.status === 404) {
        // error.data est rétréci à { code: string; message: string }
        console.error('Not found:', error.data.code)
      }
      break
    }
    case 'transport': {
      // error est rétréci à TransportError
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
      // error est rétréci à DefinitionError
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

## Constantes intégrées

`@defjs/core` exporte deux constantes pour identifier des erreurs de transport spécifiques :

```typescript
import { ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

// ERR_ABORTED : La requête a été activement annulée
// ERR_TIMEOUT : La requête a expiré
```

### Déclencher une annulation dans les intercepteurs

```typescript
import { createHttpInterceptor, ERR_ABORTED } from '@defjs/core'

const authInterceptor = createHttpInterceptor(async (req, next) => {
  const token = await getToken()
  if (!token) {
    throw ERR_ABORTED
  }
  req.setHeader('Authorization', `Bearer ${token}`)
  return next(req)
})
```

### Utilisation avec AbortController

```typescript
import { ERR_ABORTED } from '@defjs/core'

const controller = new AbortController()
controller.abort(ERR_ABORTED)

const [error] = await client.execute(getUser(), { signal: controller.signal })
// error.code === 'ABORTED'
```

### Créer des erreurs de transport manuellement

```typescript
import { createTransportError, ERR_TIMEOUT } from '@defjs/core'

const error = createTransportError(ERR_TIMEOUT)
// { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }
```

## Fonctions utilitaires

### `createTransportError`

Normalise une exception brute en `TransportError`.

```typescript
import { createTransportError, ERR_ABORTED, ERR_TIMEOUT } from '@defjs/core'

createTransportError(ERR_ABORTED)
// => { kind: 'transport', code: 'ABORTED', message: 'Request was aborted' }

createTransportError(ERR_TIMEOUT)
// => { kind: 'transport', code: 'TIMEOUT', message: 'Request timed out' }

createTransportError(new Error('offline'))
// => { kind: 'transport', code: 'NETWORK_ERROR', message: 'offline' }
```

### `createDefinitionError`

Normalise une exception brute en `DefinitionError`.

```typescript
import { createDefinitionError } from '@defjs/core'

createDefinitionError('REQUEST_VALIDATION_FAILED', new Error('invalid id'))
// => { kind: 'definition', code: 'REQUEST_VALIDATION_FAILED', message: 'invalid id' }
```

### `createHttpStatusError`

Normalise une réponse non-2xx en `HttpStatusError`.

```typescript
import { createHttpStatusError } from '@defjs/core'

const response = {
  body: { code: 'NOT_FOUND' },
  headers: new Headers(),
  ok: false,
  status: 404,
  statusText: 'Not Found',
  url: 'https://api.example.com/v1/user',
}

createHttpStatusError(404, 'Not Found', response, { code: 'NOT_FOUND' })
// => { kind: 'http', code: 'HTTP_STATUS', status: 404, message: 'Not Found', data: { code: 'NOT_FOUND' }, response }
```

## Prochaines étapes

- [Client →](/core/client) — Créer des clients et exécuter des commandes
- [Requêtes HTTP →](/core/http) — `defineRequest` et patterns de sortie
- [SSE →](/core/sse) — Erreurs SSE et stratégies de reconnexion
- [WebSocket →](/core/web-socket) — Gestion des erreurs de connexion WebSocket
