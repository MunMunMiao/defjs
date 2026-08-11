---
title: Commandes
description: Définissez des endpoints, créez leurs commandes, projetez les entrées Struct vers le format d'échange et inférez les sorties HTTP.
---

# Commandes

Defjs distingue trois étapes successives :

1. Une **définition d'endpoint** décrit un contrat HTTP, SSE ou WebSocket stable.
2. Un **constructeur de commande** est la fonction renvoyée par `defineRequest`, `defineEventStream` ou `defineWebSocket`.
3. Une **commande** est la valeur renvoyée lorsque vous appelez ce constructeur avec une entrée. Transmettez cette commande à `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

Ici, l'objet transmis à `defineRequest` est la définition d'endpoint, `getUser` est le constructeur de commande et `command` est la commande.

## Définitions d'endpoint HTTP

`defineRequest(...)` accepte les champs suivants :

| Champ          | Signification                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------- |
| `method`       | Méthode HTTP sous forme de chaîne.                                                                          |
| `operation`    | Identité statique explicite facultative et de faible cardinalité pour la télémétrie et le diagnostic.       |
| `path`         | Chemin relatif de l'endpoint, avec d'éventuels paramètres `:name`.                                          |
| `input`        | Struct qui assure le décodage structurel de l'entrée de commande.                                           |
| `build`        | Projection liée au schéma entre les champs d'entrée et les parties de la requête. Nécessite `input`.        |
| `output`       | Association entre statuts et Structs pour décoder la réponse et inférer le résultat.                        |
| `responseType` | Mode facultatif `json`, `text`, `blob` ou `arraybuffer`, uniquement avec `output` déclaré ; interdit sinon. |

`operation?: string` est également disponible dans les définitions SSE et WebSocket. Définissez-le explicitement à partir du contrat d'endpoint, par exemple `users.lookup` ; ne le dérivez pas d'un chemin rendu, d'une URL, de données utilisateur ou tenant, d'un ID de requête ou d'une autre valeur de forte cardinalité.

Utilisez `struct.request(...)` lorsque les champs de la commande correspondent directement aux sections du format d'échange :

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ],
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

L'appelant utilise les noms de champs logiques. Les alias déterminent les clés du format d'échange.

## Argument du constructeur

Un constructeur sans `input` ne reçoit aucun argument :

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Lorsqu'un `input` est déclaré, l'argument racine de la commande reste obligatoire. Dans `struct.request(...)`, une section `path`, `query` ou `headers` dont tous les champs sont optional ou nullish peut être omise entièrement ; le parsing normalise chaque section absente en `{}`. Une section contenant au moins un champ obligatoire reste requise. Une section body reste également requise, même si les champs de son objet interne sont optional.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search({ query: { q: 'docs' } })
// search() // TypeScript error: an argument is required.
// search({ query: {} }) // TypeScript and runtime error: q is required.
```

Les sections de requête dont tous les champs sont optional peuvent être omises, mais l'argument de commande reste présent :

```typescript
const OptionalSections = struct.request({
  path: struct.object({ locale: struct.string().optional() }),
  query: struct.object({ page: struct.number().optional() }),
  headers: struct.object({ traceId: struct.string().optional() }),
})
const list = defineRequest({ method: 'GET', path: '/items', input: OptionalSections })

list({})
list({ query: { page: 2 } })

const [optionalError, normalized] = struct.parse(OptionalSections, {})
if (optionalError) throw optionalError
// normalized vaut { path: {}, query: {}, headers: {} }.

const filtered = defineRequest({
  method: 'GET',
  path: '/items',
  input: struct.request({
    query: struct.object({ q: struct.string(), page: struct.number().optional() }),
  }),
})

filtered({ query: { q: 'docs' } })
// filtered({}) // Erreur TypeScript : query contient le champ obligatoire q.
```

Cette validation concerne la présence et le type structurels, pas les règles applicatives d'autorisation, de plage, de montant, de format ou de transition d'état.

## Construction automatique de la requête

Lorsque `input` est un `struct.request(...)` et que `build` est omis, Defjs associe automatiquement les sections déclarées :

- `path` remplace les paramètres du chemin ;
- `query` fournit les paramètres de requête ;
- `headers` fournit les en-têtes ;
- `body` utilise son wrapper d'encodage.

Le corps de la requête doit déclarer un format pris en charge :

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

Ne placez pas un simple `struct.object(...)` dans `request.body` : `struct.request(...)` le refuse. HTTP accepte tous ces formats de `body`. SSE refuse une section `body`, tandis que WebSocket refuse les sections `headers` et `body`.

## `build` personnalisé

Utilisez `build(request, input)` lorsque les champs logiques doivent cibler d'autres emplacements ou d'autres clés dans le format d'échange. Le paramètre `input` est une **projection liée au schéma**, pas la valeur de l'appelant après décodage.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }],
})
```

Une projection peut :

- sélectionner des champs déclarés ;
- choisir les clés cibles du format d'échange ;
- projeter chaque élément d'un tableau vers exactement un élément avec `.map(...)` ;
- encoder un objet sélectionné avec ses alias de champs lorsqu'il est lié à du JSON.

Une projection ne peut pas inspecter les valeurs de l'appelant, créer des branches selon ces valeurs, calculer des transformations arbitraires, modifier le nombre d'éléments d'un tableau ou injecter des valeurs littérales. Par exemple, `request.setJson({ version: 'v1' })` n'est pas une projection valide, car `'v1'` ne provient pas de la vue de liaison de l'entrée.

Normalisez et validez les données applicatives avant de créer la commande. Réservez `build` à la projection déclarative vers le format d'échange.

### Capacités de `build`

| Cible                                                                | HTTP | SSE | WebSocket |
| -------------------------------------------------------------------- | ---- | --- | --------- |
| `setPathParams`, `setQueryParams`                                    | Oui  | Oui | Oui       |
| `setHeaders`, `addHeaders`                                           | Oui  | Oui | Non       |
| Méthodes de corps JSON, texte, HTML, formulaire, Blob et ArrayBuffer | Oui  | Non | Non       |

Le contexte TypeScript de `build` dépend du transport. Des contrôles à l'exécution refusent aussi les sorties non prises en charge si les vérifications de type ont été contournées.

## Inférence des sorties HTTP

`output` accepte un objet d'association ou un tableau de paires statut/corps :

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Conflict = struct.object({ conflict: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const getUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
    { status: [409, 422], body: Conflict },
  ],
})
```

Le type de succès HTTP est l'union des corps 2xx déclarés. `error.data` reste corrélé au statut non-2xx déclaré. `defineRequest(...)` utilise un const generic ; les entrées de statut inline et les groupes de statuts conservent donc leurs littéraux sans `as const`. Après `client.execute(getUsers())`, le test `error.status === 404` réduit les données à `NotFound`, tandis que la branche restante `409 | 422` les réduit à `Conflict`.

Lorsque `output` est déclaré, chaque statut renvoyé doit correspondre à une Struct. Un statut 2xx ou non-2xx sans correspondance produit `UNDECLARED_STATUS`. Lorsque `output` est omis, le corps n'est ni lu ni décodé et son annulation est tentée au mieux ; le résultat vaut `undefined`.

## Définitions SSE et WebSocket

`defineEventStream(...)` remplace le `output` HTTP par un objet `events`. Le nom de l'événement sélectionne une Struct ; une entrée facultative `default` prend en charge les noms non déclarés à l'exécution.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` déclare les messages `incoming` et, si nécessaire, `outgoing`. Leurs enveloppes utilisent le discriminant `type`.

```typescript
const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

Consultez [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) pour le décodage, les files, la reconnexion et la responsabilité de fermeture.

## Considérez les commandes comme opaques

Le code applicatif doit créer des commandes et les transmettre à `Client.execute(...)`. Ne dépendez pas des tags de transport ni d'une introspection structurelle.

L'entrée racine exporte actuellement les interfaces de commande des transports et les fonctions d'exécution bas niveau. Le parcours recommandé n'a pas besoin de ces exports, et cette documentation ne leur attribue aucun engagement de stabilité à long terme. Les symboles de tag et les fonctions de garde utilisés pour aiguiller les commandes à l'exécution ne sont pas exportés à la racine.

## Étapes suivantes

- [Client](/fr-FR/core/client) couvre les surcharges d'exécution et la composition des options.
- [HTTP](/fr-FR/core/http) décrit les URL, l'encodage, les réponses et l'annulation.
- [Struct](/fr-FR/core/struct) explique le décodage structurel strict.
