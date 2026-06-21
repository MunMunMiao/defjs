---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-struct mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Utilise `defineRequest` pour définir un point de terminaison HTTP, puis exécute-le avec `Client.execute()`. Le package core gère automatiquement la validation des schémas, la distribution par code de statut, la fusion des signaux et le parsing du corps de réponse.

## Définir un point de terminaison

`defineRequest` accepte un objet de définition avec `method`, `path`, `input` (optionnel), `output` (optionnel) et `build` (optionnel).

Quand `input` est fourni, `build` doit aussi être fourni pour décrire comment les champs d'entrée mappent vers les parties de la requête (paramètres de chemin, paramètres de requête, en-têtes, corps).

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

Si aucune entrée n'est nécessaire, omet à la fois `input` et `build` :

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## Mapping de sortie par code de statut

`output` mappe les codes de statut HTTP vers des schémas. Le runtime sélectionne le schéma correspondant par code de statut de réponse.

Les formes objet et tableau sont toutes deux supportées :

```typescript
import { defineRequest, object, string } from '@defjs/core'

// Forme objet : les clés sont les codes de statut, les valeurs sont les schémas
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// Forme tableau : supporte le mappage de plusieurs codes de statut vers le même schéma
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

Si le serveur retourne un code de statut non déclaré dans `output`, la requête échoue avec une `DefinitionError` dont le `code` est `UNDECLARED_STATUS`.

## Inférence des types de données de succès/erreur

`output` pilote l'inférence de types TypeScript. `Client.execute()` retourne `HttpAwaitResult` qui distingue automatiquement les données de succès 2xx des données d'erreur non-2xx.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result est typé comme { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data est typé comme { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### Helpers de types

- `RequestSuccessData<TOutput>` : Extrait tous les types de sortie des schémas 2xx depuis `output`. Si aucun mapping 2xx n'existe, infère comme `unknown`.
- `RequestErrorData<TOutput>` : Extrait tous les types de sortie des schémas non-2xx depuis `output`. Si aucun mapping non-2xx n'existe, infère comme `unknown`.

## Exécuter une requête

Appelle `Client.execute()` avec une commande. Le deuxième argument est `HttpExecuteOptions` optionnel :

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* contexte personnalisé lisible par les intercepteurs */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // alias, équivalent à abort
})
```

Le `HttpAwaitResult` retourné est un triplet :

| Position | Type                                     | Signification                                                   |
| -------- | ---------------------------------------- | --------------------------------------------------------------- |
| 0        | `RequestError<TErrorData> \| null`       | Objet d'erreur ; `null` en cas de succès                        |
| 1        | `TSuccess \| undefined`                  | Données de succès ; `undefined` en cas d'échec                  |
| 2        | `SettledResponse<TSuccess> \| undefined` | Wrapper de réponse brute avec `status`, `headers`, `body`, etc. |

## Annulation et délai d'attente

`abort`, `timeout` et `signal` contrôlent le cycle de vie de la requête. **`abort` et `timeout` ne peuvent pas être utilisés ensemble** — cela produit une erreur de validation avant que la requête ne soit envoyée.

### Utilisation d'AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// Annuler plus tard
controller.abort()

// Après annulation, error.kind est 'transport', code est 'ABORTED'
```

### Utilisation du délai d'attente

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // Délai d'attente de 5 secondes
})

// Après expiration, error.kind est 'transport', code est 'TIMEOUT'
```

### Fusion des signaux externes

Si `abort` et `signal` sont tous deux passés, le framework les fusionne en un seul `AbortSignal`. `timeout` participe aussi comme `AbortSignal.timeout()`. Tout signal déclenchant annule la requête.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // fusionné avec abort
})
```

### Distinction des erreurs

L'annulation et le délai d'attente sont tous deux des `TransportError`, distinguables par `error.code` :

| Scénario            | `error.code`    | Description                                            |
| ------------------- | --------------- | ------------------------------------------------------ |
| Annulation manuelle | `ABORTED`       | `controller.abort()` ou signal externe déclenché       |
| Délai d'attente     | `TIMEOUT`       | `timeout` expiré, ou `AbortSignal.timeout()` déclenché |
| Échec réseau        | `NETWORK_ERROR` | Autres exceptions de fetch                             |

## Progression du téléchargement / envoi

Suis la progression via `onDownloadProgress` et `onUploadProgress`.

### Progression du téléchargement

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` contient trois champs :

- `lengthComputable` : Si le serveur a retourné `Content-Length`
- `loaded` : Octets reçus jusqu'à présent
- `total` : Total d'octets (valide seulement quand `lengthComputable` est `true`)

### Progression de l'envoi

La progression de l'envoi ne fonctionne que quand le corps de la requête est `ReadableStream<Uint8Array>`. Le framework enveloppe le flux et appelle les callbacks après chaque chunk.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## Types de réponse

Par défaut, si `output` est déclaré, le framework parse automatiquement la réponse comme `json`. Tu peux surcharger cela avec `responseType`, ou le spécifier quand `output` est `undefined`.

```typescript
import { defineRequest } from '@defjs/core'

// Type de réponse explicite
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// Pas de output, on ne s'intéresse qu'à la réponse brute
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

Valeurs `responseType` supportées :

| Valeur        | Description                                                    |
| ------------- | -------------------------------------------------------------- |
| `json`        | Lire le texte puis `JSON.parse()` ; corps vide retourne `null` |
| `text`        | Retourner la chaîne de texte directement                       |
| `blob`        | Retourner `Blob`                                               |
| `arraybuffer` | Retourner `ArrayBuffer`                                        |

Quand `responseType` est `json` et `output` définit un schéma pour le code de statut retourné, le framework valide le JSON parsé contre le schéma. Si la validation échoue, une `DefinitionError` avec `code: 'RESPONSE_VALIDATION_FAILED'` est retournée.

## Prochaines étapes

- [Client →](/core/client) — Créer un `Client`, intercepteurs, XSRF, options globales
- [SSE →](/core/sse) — Événements envoyés par le serveur et réponses en flux
- [WebSocket →](/core/web-socket) — Communication en temps réel bidirectionnelle
