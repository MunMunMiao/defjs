---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Commandes

Defjs est construit autour de « commandes » : des objets exécutables typés créés par `defineRequest`, `defineEventStream` et `defineWebSocket`. Chaque commande porte un `kind` (type de transport), une `definition` (schéma de point de terminaison) et un `input` (données d'appel). Le Client distribue vers la bonne logique transport selon `kind`.

## defineRequest : Définition de point de terminaison HTTP

`defineRequest` définit un point de terminaison HTTP RESTful. Il accepte un objet de définition et retourne un constructeur de commande.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### Champs de l'objet de définition

| Champ          | Type                              | Description                                                             |
| -------------- | --------------------------------- | ----------------------------------------------------------------------- |
| `method`       | `string`                          | Méthode HTTP, ex. `GET`, `POST`                                         |
| `path`         | `string`                          | Chemin URL, supporte les placeholders `:param`                          |
| `input`        | `AnyStruct \| undefined`          | Validateur Struct des données d'entrée                                  |
| `build`        | `RequestBuildHandler`             | Mappe l'entrée parsée vers les parties de la requête HTTP               |
| `output`       | `RequestOutputShape \| undefined` | Mappe les codes de statut vers des Structs de réponse                   |
| `responseType` | `HttpResponseType`                | Optionnel, force le mode de parsing de réponse (`json`, `text`, `blob`) |

### Relation input / output / build

1. **input** : Décrit les données que l'appelant doit fournir. À l'exécution, le Client valide et parse les données brutes avec le `input` Struct.
2. **build** : Reçoit un `RequestBuilder` et une entrée parsée (`RequestBuildInput`), mappant les données vers les paramètres de chemin, de requête, les en-têtes et le corps.
3. **output** : Décrit les réponses possibles du serveur. Le Client sélectionne le Struct correspondant par code de statut HTTP et déduit les types de succès (2xx) et d'erreur (non-2xx).

Si `build` est omis, `input` doit aussi être omis. La commande n'accepte alors aucune entrée et envoie directement vers `path`.

Si `build` est fourni, `input` doit aussi être fourni. C'est une règle stricte de conception.

### Raccourci sans entrée

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // Aucun argument requis
```

### Inférence des types de sortie

`output` supporte les formes tableau et objet, avec un comportement équivalent :

```typescript
// Forme tableau (recommandée)
output: [
  { status: 200, body: UserSchema },
  { status: [401, 403], body: AuthErrorSchema },
]

// Forme objet
output: {
  200: UserSchema,
  '401': AuthErrorSchema,
  '403': AuthErrorSchema,
}
```

Les résultats d'exécution sont typés automatiquement : les données 2xx entrent dans la branche de succès, tout le reste dans la branche d'erreur.

---

## defineEventStream : Définition de flux SSE

`defineEventStream` définit un point de terminaison Server-Sent Events (SSE). Il mappe les noms d'événements à des Structs pour une type safety au niveau de l'événement.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### Mapping des events

Chaque clé dans `events` correspond au champ `event` SSE. Le Client recherche le Struct correspondant par nom `event` quand un message arrive.

### Fallback default

Si le serveur envoie un nom d'événement non déclaré, tu peux fournir un schéma `default` comme secours :

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // Événements non matchés parsés comme string
  },
})
```

Sans `default`, les événements non matchés sont ignorés. Si un intercepteur `onInvalidEvent` est configuré, il reçoit une notification.

### SSE avec entrée

SSE utilise `GET` par défaut. Si tu as besoin de paramètres de requête, fournis `input` et `build` comme avec `defineRequest` :

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

Le `build` SSE ne supporte pas le corps de requête ni `withCredentials`.

---

## defineWebSocket : Définition WebSocket

`defineWebSocket` définit un point de terminaison WebSocket, distinguant les schémas **incoming** (serveur → client) et **outgoing** (client → serveur).

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### Schéma des messages entrants

`incoming` définit les types de messages poussés par le serveur. Chaque message doit contenir un champ `type` correspondant à une clé `incoming`. Si le payload est un objet, ses champs sont fusionnés avec `type` :

```typescript
// Le serveur envoie : { type: 'message', user: 'Alice', text: 'Hi' }
// Parsé comme :    { type: 'message', user: 'Alice', text: 'Hi' }
```

Si le payload est un scalaire (string, number, etc.), il est enveloppé comme `{ type: 'xxx', data: <valeur> }`.

### Schéma des messages sortants

`outgoing` définit les types de messages envoyés par le client. Le `type` est rempli automatiquement depuis le nom de la clé. Tu ne fournis que le payload :

```typescript
// Envoi : { type: 'sendMessage', text: 'Hello' }
// Ou :   { type: 'sendMessage', data: { text: 'Hello' } }
```

Si le payload d'un message sortant est un objet, les deux formes sont supportées. Si c'est un scalaire, tu dois utiliser `{ type: 'xxx', data: <valeur> }`.

### WebSocket incoming-only

Si tu n'as pas besoin d'envoyer de messages au serveur, omet `outgoing` :

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### Restrictions du build WebSocket

Le `build` WebSocket ne supporte que `setPathParams` et `setQueryParams`. Les opérations spécifiques à HTTP (en-têtes, corps) ne sont pas supportées.

---

## Structure de l'objet Commande

Quel que soit le type de définition, la commande construite suit une structure unifiée :

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// Commande HTTP
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// Commande SSE
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// Commande WebSocket
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` est le tag de type de transport. `Client.execute` distribue vers l'exécuteur approprié (HTTP fetch, flux SSE, connexion WebSocket) selon sa valeur.

---

## Règles d'optionnalité de l'entrée (IsInputOptional)

Le caractère optionnel de l'argument du constructeur de commande est automatiquement déduit par `IsInputOptional` :

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

Règles :

1. **Pas de `input` défini** : `TInput` est `undefined`, le paramètre est totalement optionnel.
2. **A un `input` mais tous les champs sont optionnels** : `{} extends EndpointInput<...>` est vrai, le paramètre reste optionnel.
3. **A un `input` avec des champs requis** : Le paramètre est requis.

```typescript
// Pas d'entrée — optionnel
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Entrée avec tous les champs optionnels — optionnel
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// Champs requis — requis
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // Erreur TypeScript : argument manquant
C({ body: { name: 'defjs' } }) // OK
```

## Prochaines étapes

- [SSE →](/core/sse) — Exécution SSE, reconnexion et gestion des événements
- [WebSocket →](/core/web-socket) — Connexion WebSocket, heartbeat et gestion d'état
- [Client →](/core/client) — Création de client et usage de `execute`
