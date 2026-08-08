---
title: Intercepteurs
description: Filtrez les intercepteurs par transport, composez-les en ordre « oignon » et appliquez des politiques bornées d'authentification et de relance.
---

# Intercepteurs

Les intercepteurs encadrent la frontière du transport. HTTP, SSE et WebSocket possèdent chacun un type d'intercepteur et un type de résultat distincts.

| Fabrique                     | Requête       | Résultat de `next`                    |
| ---------------------------- | ------------- | ------------------------------------- |
| `createHttpInterceptor`      | `HttpRequest` | `Promise<HttpResponse<unknown>>`      |
| `createSSEInterceptor`       | `HttpRequest` | `Promise<EventStreamHandle<unknown>>` |
| `createWebSocketInterceptor` | `HttpRequest` | `Promise<WebSocketSessionLike>`       |

Enregistrez des intercepteurs de transports différents avec `withInterceptors(...)`. Le client les filtre selon `kind` et conserve leur ordre d'enregistrement au sein de chaque transport.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(httpLogger, sseAuth, socketObserver))
```

## Ordre « oignon »

À l'aller, la requête suit l'ordre d'enregistrement. Au retour, la chaîne se déroule en sens inverse :

```typescript
const first = createHttpInterceptor(async (request, next) => {
  order.push('first:before')
  const response = await next(request)
  order.push('first:after')
  return response
})

const second = createHttpInterceptor(async (request, next) => {
  order.push('second:before')
  const response = await next(request)
  order.push('second:after')
  return response
})

// first:before -> second:before -> transport
//               <- second:after <- first:after
```

Plusieurs appels à `withInterceptors(...)` ajoutent les intercepteurs à la suite :

```typescript
createClient(withInterceptors(first), withInterceptors(second, third))
```

## Cloner les requêtes correctement

Considérez la requête reçue comme appartenant à la chaîne. Créez un nouvel objet `Headers` avant de modifier les en-têtes :

```typescript
const auth = createHttpInterceptor((request, next) => {
  const token = getAccessToken()
  if (!token) {
    return next(request)
  }

  const headers = new Headers(request.headers)
  headers.set('Authorization', `Bearer ${token}`)
  return next({ ...request, headers })
})
```

Appliquez le même principe aux en-têtes SSE. Les constructeurs WebSocket des navigateurs ne peuvent pas envoyer d'en-têtes de handshake arbitraires ; modifier `request.headers` dans un intercepteur WebSocket n'authentifie donc pas une connexion navigateur.

Pour remplacer un corps HTTP, copiez la requête avec le spread puis remplacez `body`. La frontière Fetch détecte que les anciennes métadonnées de type de contenu ne correspondent plus au nouveau corps. Ne réutilisez pas un `ReadableStream` déjà consommé.

## Court-circuiter la chaîne

Un intercepteur peut ignorer `next`, mais il doit renvoyer le type de résultat attendu par son transport. Pour HTTP, `makeResponse(...)` crée un wrapper Defjs :

```typescript
import { createHttpInterceptor, makeResponse } from '@defjs/core'

declare const isMaintenanceWindow: () => boolean

const maintenanceGate = createHttpInterceptor(async (request, next) => {
  if (isMaintenanceWindow()) {
    return makeResponse({
      status: 503,
      statusText: 'Service Unavailable',
      body: { message: 'Temporarily unavailable' },
    })
  }

  return next(request)
})
```

La couche de commande traite toujours cette réponse selon son statut et sa Struct de sortie. Déclarez ce statut s'il appartient au contrat de l'endpoint.

Court-circuiter SSE ou WebSocket nécessite un handle ou une session entièrement compatible, y compris pour la sémantique de fermeture. C'est généralement plus complexe que de renvoyer une réponse HTTP synthétique.

## Conserver les getters dynamiques

N'enveloppez pas une session WebSocket avec `{ ...session }`. Le spread lit `state` et `connection` une seule fois et transforme leurs getters dynamiques en valeurs figées. Déléguez explicitement chaque membre :

```typescript
import { createWebSocketInterceptor } from '@defjs/core'

const wrappedSession = createWebSocketInterceptor(async (request, next) => {
  const session = await next(request)

  return {
    get connection() {
      return session.connection
    },
    get state() {
      return session.state
    },
    closed: session.closed,
    receive: session.receive,
    close(code, reason) {
      session.close(code, reason)
    },
    onRuntimeError(listener) {
      return session.onRuntimeError(listener)
    },
    onStateChange(listener) {
      return session.onStateChange(listener)
    },
    send(message) {
      session.send(message)
    },
  }
})
```

Le wrapper doit aussi préserver la responsabilité de la ressource. Il ne doit ni remplacer `closed`, ni masquer `close`, ni détacher l'itérable entrant, sauf comportement volontaire et documenté par l'application.

## Journalisation bornée

Préférez un nom d'opération fixe et un petit ensemble de champs contrôlés :

```typescript
function timingInterceptor(operation: string) {
  return createHttpInterceptor(async (request, next) => {
    const startedAt = performance.now()
    const response = await next(request)

    console.info('outbound request completed', {
      durationMs: Math.round(performance.now() - startedAt),
      operation,
      status: response.status,
    })

    return response
  })
}
```

Par défaut, ne journalisez ni URL d'endpoint, ni chaînes de requête, ni en-têtes, ni corps, ni causes brutes, ni ID d'événement SSE, ni payloads WebSocket.

## Retenter les requêtes HTTP avec prudence

Toute nouvelle tentative modifie le comportement de l'application. L'exemple suivant se limite à `GET`, `HEAD` et `OPTIONS`. Il ne retente que les statuts `0`, `502`, `503` et `504`, respecte `Retry-After`, s'arrête rapidement lors d'une annulation et refuse un corps sous forme de flux.

```typescript
import { createHttpInterceptor } from '@defjs/core'
import type { HttpRequest, HttpResponse } from '@defjs/core'

const RETRYABLE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const RETRYABLE_STATUSES = new Set([0, 502, 503, 504])

function isReplayable(request: HttpRequest): boolean {
  return !(typeof ReadableStream !== 'undefined' && request.body instanceof ReadableStream)
}

function retryAfterMs(response: HttpResponse<unknown>): number | undefined {
  const value = response.headers.get('retry-after')
  if (!value) {
    return undefined
  }

  const seconds = Number(value)
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000
  }

  const at = Date.parse(value)
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now())
}

async function abortableWait(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw signal.reason
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(finish, ms)

    function finish() {
      signal?.removeEventListener('abort', abort)
      resolve()
    }

    function abort() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      reject(signal?.reason)
    }

    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      abort()
    }
  })
}

function retrySafeHttp(maxRetries = 2) {
  return createHttpInterceptor(async (request, next) => {
    if (!RETRYABLE_METHODS.has(request.method.toUpperCase()) || !isReplayable(request)) {
      return next(request)
    }

    for (let retry = 0; ; retry += 1) {
      const response = await next(request)
      if (!RETRYABLE_STATUSES.has(response.status) || retry >= maxRetries) {
        return response
      }

      const fallback = Math.min(250 * 2 ** retry, 5_000)
      const delay = Math.min(retryAfterMs(response) ?? fallback, 30_000)
      await abortableWait(delay, request.abort)
    }
  })
}
```

Cet intercepteur ne retente pas les exceptions levées par d'autres intercepteurs, faute de pouvoir les classer de façon fiable. Le statut `0` est le wrapper d'échec de transport produit par la frontière Fetch Defjs.

N'ajoutez pas automatiquement les méthodes d'écriture. Retenter `POST`, `PUT`, `PATCH` ou `DELETE` exige un contrat d'idempotence applicatif, des corps rejouables, une prise en charge côté serveur et une politique de statuts contrôlée.

## Authentification Basic

L'entrée racine exporte `basicAuthHttpInterceptor(...)` et `basicAuthSSEInterceptor(...)`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withInterceptors(
    basicAuthHttpInterceptor(() => credentials),
    basicAuthSSEInterceptor(() => credentials),
  ),
)
```

Les identifiants Basic sont seulement encodés en base64, pas chiffrés. Utilisez TLS. L'encodeur par défaut utilise `globalThis.btoa`, qui peut être indisponible et n'accepte qu'un jeu de caractères limité. Fournissez `options.encode` si l'environnement ne possède pas `btoa` ou si les identifiants nécessitent une implémentation UTF-8/base64 validée.

Les fournisseurs d'identifiants s'exécutent lorsqu'une requête traverse l'intercepteur. Gardez les identifiants serveur dans la portée de la requête et ne journalisez pas l'en-tête produit.

## Sécurité des observateurs et callbacks

Les intercepteurs SSE et WebSocket peuvent attacher des observateurs de cycle de vie aux handles renvoyés. Désinscrivez les listeners WebSocket lorsque leur propriétaire disparaît. Gardez les listeners et les prédicats sans exception : les implémentations temps réel actuelles n'isolent pas tous leurs échecs.

Un intercepteur peut lever une exception ou rejeter une promesse. Le transport haut niveau peut normaliser certains échecs en `RequestError`, mais le code d'un intercepteur ne doit pas supposer que l'exécution ne rejettera jamais.

## Étapes suivantes

- [Client](/fr-FR/core/client) explique l'enregistrement et la composition des options.
- [HTTP](/fr-FR/core/http) décrit le wrapper Fetch et le comportement du statut 0.
- [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) détaillent le cycle de vie de chaque transport.
