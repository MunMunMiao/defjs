---
title: Interceptors
description: Per-transport HTTP, SSE, and WebSocket interceptors, onion-chain execution model, and common interceptor examples.
---

# Intercepteurs

Les intercepteurs de `@defjs/core` sont divisés par couche transport : HTTP, SSE et WebSocket. Ils partagent le même modèle d'exécution en chaîne d'oignon mais manipulent différentes formes de requête/réponse : HTTP retourne `Promise<HttpResponse>`, SSE retourne `Promise<EventStreamHandle>`, et WebSocket retourne `Promise<WebSocketSessionLike>`.

Les intercepteurs sont enregistrés au niveau `Client` via `withInterceptors(...)`. Le client filtre et distribue automatiquement vers la bonne chaîne d'intercepteurs selon le type de commande.

## Trois types d'intercepteurs

### Intercepteurs HTTP

Les intercepteurs HTTP opèrent sur `HttpRequest` et retournent `Promise<HttpResponse>`. Usage typique : injecter des en-têtes d'authentification, journaliser, réessayer, transformer les erreurs.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse, HttpInterceptorNext } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  console.log(`[HTTP] ${req.method} ${req.endpoint}`)
  const response = await next(req)
  console.log(`[HTTP] ${req.method} ${req.endpoint} -> ${response.status}`)
  return response
})
```

### Intercepteurs SSE

Les intercepteurs SSE opèrent sur `HttpRequest` (la requête HTTP avant connexion) et retournent `Promise<EventStreamHandle>`. Usage typique : injecter des en-têtes d'authentification avant la connexion SSE, surveiller l'état de connexion.

```typescript
import { createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, SSEHandler } from '@defjs/core'

const sseAuthInterceptor = createSSEInterceptor(async (req: HttpRequest, next: SSEHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  const stream = await next({ ...req, headers })
  return stream
})
```

### Intercepteurs WebSocket

Les intercepteurs WebSocket opèrent sur `HttpRequest` (la requête HTTP avant handshake) et retournent `Promise<WebSocketSessionLike>`. Usage typique : modifier l'URL ou injecter des en-têtes de sous-protocole avant le handshake WebSocket.

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { HttpRequest, WebSocketHandler } from '@defjs/core'

const wsProtocolInterceptor = createWebSocketInterceptor(async (req: HttpRequest, next: WebSocketHandler) => {
  const headers = new Headers(req.headers)
  headers.set('Sec-WebSocket-Protocol', 'v1')
  const session = await next({ ...req, headers })
  return session
})
```

## Modèle d'exécution en chaîne d'oignon

Les trois chaînes d'intercepteurs utilisent le **modèle d'oignon** : la phase requête entre dans l'ordre d'enregistrement, la phase réponse retourne dans l'ordre inverse.

```typescript
import { createHttpInterceptor, makeInterceptorChain } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

const order: number[] = []

const a = createHttpInterceptor(async (req, next) => {
  order.push(1) // Phase requête : premier entrant
  const res = await next(req)
  order.push(1.1) // Phase réponse : dernier sortant
  return res
})

const b = createHttpInterceptor(async (req, next) => {
  order.push(2)
  const res = await next(req)
  order.push(2.1)
  return res
})

const c = createHttpInterceptor(async (req, next) => {
  order.push(3) // Phase requête : dernier entrant
  const res = await next(req)
  order.push(3.1) // Phase réponse : premier sortant
  return res
})

// Ordre d'enregistrement : a -> b -> c
// Ordre d'exécution : 1 -> 2 -> 3 -> 3.1 -> 2.1 -> 1.1
```

### Modifier les requêtes et réponses

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const addHeaderInterceptor = createHttpInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('X-Request-Id', crypto.randomUUID())
  return next({ ...req, headers })
})

const wrapErrorInterceptor = createHttpInterceptor(async (req, next) => {
  try {
    return await next(req)
  } catch (error) {
    throw new Error(`Request failed: ${error}`)
  }
})
```

### Envelopper les résultats de retour

```typescript
import { createWebSocketInterceptor } from '@defjs/core'
import type { WebSocketInterceptorFn } from '@defjs/core'

const wrapSessionInterceptor: WebSocketInterceptorFn = async (req, next) => {
  const session = await next(req)
  return {
    ...session,
    send(message: unknown) {
      console.log('[WS] send:', message)
      session.send(message)
    },
  }
}
```

## Exemples d'intercepteurs courants

### Intercepteur d'authentification

Injecte le Bearer Token dans les en-têtes. HTTP et SSE partagent la même logique.

```typescript
import { createHttpInterceptor, createSSEInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

function getToken(): string {
  return localStorage.getItem('token') ?? ''
}

const authHttpInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})

const authSSEInterceptor = createSSEInterceptor(async (req, next) => {
  const headers = new Headers(req.headers)
  headers.set('Authorization', `Bearer ${getToken()}`)
  return next({ ...req, headers })
})
```

### Intercepteur de journalisation

Enregistre la durée de la requête et le code de statut.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext } from '@defjs/core'

const timingInterceptor = createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
  const start = performance.now()
  const response = await next(req)
  const duration = (performance.now() - start).toFixed(2)
  console.log(`[${duration}ms] ${req.method} ${req.endpoint} ${response.status}`)
  return response
})
```

### Intercepteur de réessai

Réessaye des codes de statut spécifiques. L'intercepteur de réessai devrait être enregistré près du bas de la chaîne, après la journalisation mais avant la requête réelle.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpInterceptorNext, HttpResponse } from '@defjs/core'

function retryInterceptor(maxRetries = 3, delayMs = 1000) {
  return createHttpInterceptor(async (req: HttpRequest, next: HttpInterceptorNext) => {
    let lastError: unknown

    for (let i = 0; i <= maxRetries; i++) {
      try {
        const response = await next(req)
        if (response.status >= 500) {
          lastError = new Error(`Server error: ${response.status}`)
          if (i < maxRetries) {
            await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
            continue
          }
        }
        return response
      } catch (error) {
        lastError = error
        if (i < maxRetries) {
          await new Promise((r) => setTimeout(r, delayMs * (i + 1)))
          continue
        }
      }
    }

    throw lastError
  })
}
```

### Intercepteur Basic Auth (intégré)

`@defjs/core` fournit des intercepteurs Basic Auth intégrés pour HTTP et SSE.

```typescript
import { basicAuthHttpInterceptor, basicAuthSSEInterceptor } from '@defjs/core'

const credential = () => ({ username: 'admin', password: 'secret' })

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(basicAuthHttpInterceptor(credential), basicAuthSSEInterceptor(credential)),
)
```

L'encodage par défaut utilise `globalThis.btoa`. Pour les environnements sans `btoa` (ex. Node), personnalise via `options.encode` :

```typescript
import { basicAuthHttpInterceptor } from '@defjs/core'

const interceptor = basicAuthHttpInterceptor(() => ({ username: 'user', password: 'pass' }), {
  encode: (cred) => Buffer.from(`${cred.username}:${cred.password}`).toString('base64'),
})
```

## Enregistrement et filtrage

### Enregistrer via `withInterceptors`

Les intercepteurs sont enregistrés au moment de `createClient` via `withInterceptors(...)`. Le même tableau peut mélanger les trois types d'intercepteurs ; le client filtre par type de commande automatiquement.

```typescript
import { createClient, withEndpoint, withInterceptors } from '@defjs/core'
import { createHttpInterceptor, createSSEInterceptor, createWebSocketInterceptor } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    createHttpInterceptor(async (req, next) => {
      console.log('HTTP:', req.endpoint)
      return next(req)
    }),
    createSSEInterceptor(async (req, next) => {
      console.log('SSE:', req.endpoint)
      return next(req)
    }),
    createWebSocketInterceptor(async (req, next) => {
      console.log('WS:', req.endpoint)
      return next(req)
    }),
  ),
)
```

### Règles de filtrage

Le client filtre les intercepteurs par type de commande :

| Type de commande              | Condition de filtrage   | Fonction interne               |
| ----------------------------- | ----------------------- | ------------------------------ |
| HTTP (`defineRequest`)        | `kind === 'http'`       | `resolveHttpInterceptors`      |
| SSE (`defineEventStream`)     | `kind === 'sse'`        | `resolveSSEInterceptors`       |
| WebSocket (`defineWebSocket`) | `kind === 'web-socket'` | `resolveWebSocketInterceptors` |

Les intercepteurs filtrés maintiennent leur ordre d'enregistrement original, puis forment une chaîne d'oignon.

```typescript
// Logique d'exécution interne simplifiée
const httpInterceptors = resolveHttpInterceptors(clientConfig.interceptors)
const chain = makeInterceptorChain(httpInterceptors)
const response = await chain(request, (req) => fetchHandler(req, clientConfig.http.fetch))
```

### Ordre et composition des intercepteurs

Plusieurs appels `withInterceptors` appendent les intercepteurs dans l'ordre.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(loggingInterceptor), // Premier
  withInterceptors(authInterceptor, retryInterceptor), // Second
)
// Ordre final : logging -> auth -> retry
```

## Notes sur les métadonnées du corps

Quand un intercepteur remplace `body`, l'ancienne métadonnée `bodyContentType` est automatiquement invalidée pour éviter qu'un `Content-Type` incorrect soit envoyé au serveur.

```typescript
// Garder le corps original : les métadonnées Content-Type restent valides
const keepBody = createHttpInterceptor((req, next) => next({ ...req, headers: new Headers(req.headers) }))

// Remplacer le corps : l'ancien Content-Type est effacé, le nouveau type de corps le détermine
const replaceBody = createHttpInterceptor((req, next) => next({ ...req, body: new FormData() }))
```

## Référence API

### Fonctions de création

| Fonction                         | Description                     |
| -------------------------------- | ------------------------------- |
| `createHttpInterceptor(fn)`      | Créer un intercepteur HTTP      |
| `createSSEInterceptor(fn)`       | Créer un intercepteur SSE       |
| `createWebSocketInterceptor(fn)` | Créer un intercepteur WebSocket |

### Types

| Type                   | Description                                                                       |
| ---------------------- | --------------------------------------------------------------------------------- |
| `HttpInterceptor`      | Objet intercepteur HTTP `{ kind: 'http', fn: InterceptorFn }`                     |
| `SSEInterceptor`       | Objet intercepteur SSE `{ kind: 'sse', fn: SSEInterceptorFn }`                    |
| `WebSocketInterceptor` | Objet intercepteur WebSocket `{ kind: 'web-socket', fn: WebSocketInterceptorFn }` |
| `Interceptor`          | Union des trois types d'intercepteurs                                             |
| `HttpInterceptorNext`  | Handler HTTP next `(req: HttpRequest) => Promise<HttpResponse>`                   |
| `SSEHandler`           | Handler SSE next `(req: HttpRequest) => Promise<EventStreamHandle>`               |
| `WebSocketHandler`     | Handler WebSocket next `(req: HttpRequest) => Promise<WebSocketSessionLike>`      |

### Intercepteurs intégrés

| Fonction                                         | Description                  |
| ------------------------------------------------ | ---------------------------- |
| `basicAuthHttpInterceptor(credential, options?)` | Intercepteur HTTP Basic Auth |
| `basicAuthSSEInterceptor(credential, options?)`  | Intercepteur SSE Basic Auth  |

## Prochaines étapes

- [Client →](/core/client) — Créer des clients et configurer des intercepteurs
- [Requêtes HTTP →](/core/http) — `defineRequest` et patterns de sortie
- [SSE →](/core/sse) — Définition SSE et streaming
- [WebSocket →](/core/web-socket) — Définition WebSocket et cycle de vie
