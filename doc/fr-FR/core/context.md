---
title: Context
description: HttpContext passing, request builder capabilities, input parsing, and transport-specific configuration.
---

# Contexte

Flux d'exécution Defjs : la configuration du Client fournit les valeurs par défaut globales ; les définitions de commandes décrivent la structure du point de terminaison ; `build` mappe l'entrée parsée vers les parties de la requête HTTP ; et `HttpContext` agit comme un bagage invisible passé entre les intercepteurs pendant le cycle de vie d'une seule exécution.

## Passage de HttpContext

`HttpContext` est un conteneur clé-valeur basé sur Token pour les métadonnées au sein d'un cycle de vie unique de requête/connexion. Il ne participe pas à la sérialisation de l'URL, des en-têtes ou du corps. Il est lu et écrit par les intercepteurs.

### Création et utilisation

```typescript
import { makeHttpContext, makeHttpContextToken } from '@defjs/core'

// 1. Définir un Token (avec valeur par défaut)
const requestIdToken = makeHttpContextToken(() => 'unknown')
const authToken = makeHttpContextToken(() => ({ role: 'guest' }))

// 2. Créer le contexte et définir les valeurs
const ctx = makeHttpContext().set(requestIdToken, 'req-42').set(authToken, { role: 'admin' })

// 3. Passer au moment de l'exécution
const [error, data] = await client.execute(getUser(), { context: ctx })
```

### Lecture dans les intercepteurs

```typescript
import { createHttpInterceptor } from '@defjs/core'

const loggingInterceptor = createHttpInterceptor(async (req, next) => {
  const requestId = req.context?.get(requestIdToken) ?? 'unknown'
  console.log(`[${requestId}] → ${req.method} ${req.endpoint}`)
  return next(req)
})
```

### Fusion de contextes

```typescript
import { mergeHttpContexts } from '@defjs/core'

const baseCtx = makeHttpContext().set(requestIdToken, 'req-42')
const extraCtx = makeHttpContext().set(authToken, { role: 'admin' })

const merged = mergeHttpContexts(baseCtx, extraCtx)
// merged contient à la fois requestId et auth
```

### API clé

| Export                                           | Description                                                              |
| ------------------------------------------------ | ------------------------------------------------------------------------ |
| `makeHttpContextToken<T>(defaultValue: () => T)` | Créer un Token avec une valeur par défaut                                |
| `makeHttpContext()`                              | Créer un contexte vide                                                   |
| `makeHttpContext(entries)`                       | Créer depuis un tableau `[token, value]`                                 |
| `makeHttpContext(otherContext)`                  | Copier un autre contexte                                                 |
| `mergeHttpContexts(primary, secondary)`          | Fusionner deux contextes ; secondary remplace primary pour le même Token |
| `ctx.set(token, value)`                          | Écrire une valeur ; retourne self (chaînable)                            |
| `ctx.get(token)`                                 | Lire une valeur ; retourne la valeur par défaut du Token si non définie  |
| `ctx.has(token) / ctx.del(token)`                | Vérifier / supprimer                                                     |
| `ctx.keys() / ctx.length`                        | Itérer / compter                                                         |

---

## Request Builder et parsing de l'entrée

### Flux de parsing de l'entrée

Quand une commande est exécutée, le Client traite l'entrée dans cet ordre :

1. **Valider** : Valide et parse les données brutes de l'appelant avec le `input` Struct.
2. **Build** : Appelle `build(request, parsedInput)` pour mapper les données parsées vers les parties de la requête.
3. **Transport** : Distribue vers HTTP fetch, flux SSE ou connexion WebSocket selon `kind`.

```typescript
import { defineRequest, struct } from '@defjs/core'

const CreateUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.object({
    body: struct.object({
      name: struct.string(),
      email: struct.string(),
    }),
  }),
  build(request, input) {
    request.setJson(input.body)
  },
  output: {
    201: struct.object({ id: struct.number() }),
  },
})

const [error, user] = await client.execute(CreateUser({ body: { name: 'Alice', email: 'alice@example.com' } }))
```

### Matrice des capacités du build handler

Les différents transports supportent différentes opérations `build` :

| Méthode de build                          | HTTP | SSE | WebSocket |
| ----------------------------------------- | ---- | --- | --------- |
| `setPathParams` / `setQueryParams`        | ✓    | ✓   | ✓         |
| `setHeaders` / `addHeaders`               | ✓    | ✓   | ✗         |
| `setJson` / `setText` / `setHtml`         | ✓    | ✗   | ✗         |
| `setFormData` / `addFormData`             | ✓    | ✗   | ✗         |
| `setFormUrlEncoded` / `addFormUrlEncoded` | ✓    | ✗   | ✗         |
| `setBlob` / `setArrayBuffer`              | ✓    | ✗   | ✗         |
| `withCredentials`                         | ✓    | ✗   | ✗         |

Utiliser une méthode non supportée par le transport dans `build` lève `REQUEST_VALIDATION_FAILED` à l'exécution.

### Build automatique

Si tu omet `build`, tu dois aussi omettre `input`. Cependant, tu peux utiliser la forme `request` de Struct pour laisser le framework inférer automatiquement la logique de build :

```typescript
import { defineRequest, struct } from '@defjs/core'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ include: struct.optional(struct.string()) }),
  }),
  // Pas de build nécessaire ; le framework mappe automatiquement path/query
})
```

Quand `build` est fourni, `input` doit aussi être fourni. C'est une règle stricte de conception.

---

## Configuration du client

Crée un client avec `createClient` et une ou plusieurs fonctions de configuration. Les fonctions ultérieures remplacent les précédentes pour la même clé.

```typescript
import { createClient, withEndpoint, withCredentials, withQueryParamsSerializer, withXSRF } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withCredentials(true),
  withXSRF({ cookieName: 'CSRF-TOKEN', headerName: 'X-CSRF-Token' }),
  withQueryParamsSerializer((params, raw) => {
    return params.toString()
  }),
)
```

### Options de base

#### `withEndpoint(url)`

Définit l'adresse de base de l'API. Toutes les valeurs de `path` de requête sont appendues après cette URL.

```typescript
withEndpoint('https://api.example.com/v1')
// Requêter /users produit https://api.example.com/v1/users
```

#### `withCredentials(boolean)`

Indique s'il faut inclure les credentials cross-origin (cookies, en-têtes d'auth HTTP, certificats client TLS). Correspond à l'option `credentials` de `fetch`.

```typescript
withCredentials(true) // Inclure les cookies dans les requêtes cross-origin
withCredentials(false) // Valeur par défaut
```

#### `withXSRF(options)`

Configure la lecture et l'injection du jeton XSRF. Par défaut, lit `XSRF-TOKEN` depuis `document.cookie` et l'injecte dans l'en-tête `X-XSRF-TOKEN`.

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
  tokenProvider: ({ request }) => {
    // Logique de lecture personnalisée, ex. depuis localStorage
    return localStorage.getItem('xsrf-token')
  },
})
```

| Champ           | Type                                   | Défaut                       |
| --------------- | -------------------------------------- | ---------------------------- |
| `cookieName`    | `string`                               | `'XSRF-TOKEN'`               |
| `headerName`    | `string`                               | `'X-XSRF-TOKEN'`             |
| `tokenProvider` | `(ctx) => string \| null \| undefined` | Lit depuis `document.cookie` |

#### `withQueryParamsSerializer(fn)`

Sérialisation personnalisée des paramètres de requête. Par défaut `URLSearchParams.toString()`.

```typescript
withQueryParamsSerializer((params, raw) => {
  return qs.stringify(raw ?? Object.fromEntries(params))
})
```

Quand un sérialiseur personnalisé est fourni, les requêtes HTTP et SSE autorisent des paramètres de requête complexes.

---

## Configuration spécifique au transport

### Options SSE

Configure via `withSSEOptions` ou des fonctions de configuration individuelles.

```typescript
import { withSSEOptions, withSSEHandle, withSSEReconnect, withSSEQueue, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEHandle(customFetch),
  withSSEOptions({
    reconnect: {
      attempts: 5,
      delayMs: 1000,
      factor: 2,
      jitter: 0.5,
      maxDelayMs: 30000,
      shouldReconnect: ({ attempt, cause, lastEventId, open }) => {
        return attempt < 3
      },
    },
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest',
    },
    onInvalidEvent: ({ reason, message, cause }) => {
      console.warn('Invalid SSE event:', reason, message.event)
    },
    maxBufferSize: 1024 * 1024,
  }),
)
```

| Option               | Description                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `sse.fetch`          | Implémentation `fetch` spécifique à SSE                                                                                 |
| `sse.reconnect`      | Stratégie de reconnexion : tentatives, délai, facteur de backoff, jitter, délai max, fonction de décision personnalisée |
| `sse.queue`          | File d'événements : capacité max, stratégie de débordement                                                              |
| `sse.onInvalidEvent` | Observer d'événements invalides (schéma manquant ou échec de validation)                                                |
| `sse.maxBufferSize`  | Limite de taille du buffer sous-jacent (octets)                                                                         |

### Options WebSocket

Configure via `withWebSocketOptions` ou des fonctions de configuration individuelles.

```typescript
import {
  withWebSocketOptions,
  withWebSocketHandle,
  withWebSocketHeartbeat,
  withWebSocketReconnect,
  withWebSocketQueue,
  withWebSocketBeforeConnect,
  withWebSocketProtocols,
} from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withWebSocketHandle(WebSocket),
  withWebSocketProtocols(['json', 'v1']),
  withWebSocketBeforeConnect(async () => {
    await refreshToken()
  }),
  withWebSocketHeartbeat({
    intervalMs: 30000,
    timeoutMs: 10000,
    message: () => ({ type: 'ping' }),
    isAck: (msg) => msg.type === 'pong',
  }),
  withWebSocketReconnect({
    attempts: 10,
    delayMs: 1000,
    factor: 2,
    jitter: 0.3,
    maxDelayMs: 30000,
    shouldReconnect: ({ attempt, cause, code, reason, wasClean }) => {
      return !wasClean && attempt < 5
    },
  }),
  withWebSocketQueue({
    maxSize: 50,
    overflow: 'drop-newest',
  }),
)
```

| Option                    | Description                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `webSocket.WebSocket`     | Constructeur `WebSocket` personnalisé                                                                                   |
| `webSocket.protocols`     | Tableau de sous-protocoles RFC 6455                                                                                     |
| `webSocket.beforeConnect` | Hook pré-connexion (ex. récupérer un jeton dynamique)                                                                   |
| `webSocket.heartbeat`     | Heartbeat : intervalle, délai d'attente, factory de message, prédicat ACK                                               |
| `webSocket.reconnect`     | Stratégie de reconnexion : tentatives, délai, facteur de backoff, jitter, délai max, fonction de décision personnalisée |
| `webSocket.queue`         | File d'envoi : capacité max, stratégie de débordement                                                                   |

### Détails du heartbeat

Le heartbeat WebSocket détecte la vivacité de la connexion. Si configuré, le framework envoie des messages de heartbeat à `intervalMs` et attend un ACK dans `timeoutMs`. Si l'ACK expire, une reconnexion est déclenchée.

```typescript
withWebSocketHeartbeat({
  intervalMs: 30000, // Envoyer heartbeat toutes les 30s
  timeoutMs: 10000, // Doit recevoir ACK dans les 10s
  message: () => ({ type: 'ping', timestamp: Date.now() }),
  isAck: (msg) => msg.type === 'pong',
})
```

- Le type du message de heartbeat doit être compatible avec les définitions `outgoing`.
- `isAck` détermine si un message entrant est une réponse de heartbeat. Quand il retourne `true`, le message n'entre pas dans l'itérateur `receive`.

---

## Composition et priorité de la configuration

Les fonctions de configuration s'appliquent dans l'ordre ; les ultérieures remplacent les précédentes. Les options d'exécution (`client.execute(cmd, { timeout: 5000 })`) ont la plus haute priorité, suivies de la configuration au niveau client.

```typescript
const client = createClient(withEndpoint('https://api.example.com'), withCredentials(true), withSSEOptions({ reconnect: { attempts: 3 } }))

// Surcharger la reconnexion SSE au moment de l'exécution
const [error, stream] = await client.execute(watchLogs(), { reconnect: { attempts: 10 } })
```

## Prochaines étapes

- [Client →](/core/client) — Création de client et usage de `execute`
- [Commandes →](/core/commands) — Définitions de commandes et règles d'optionnalité des entrées
- [SSE →](/core/sse) — Exécution SSE, reconnexion et gestion des événements
- [WebSocket →](/core/web-socket) — Connexion WebSocket, heartbeat et gestion d'état
- [Intercepteurs →](/core/interceptors) — Types d'intercepteurs et mécanique de la chaîne en oignon
