---
title: Commandes
description: Définis des endpoints, construis des commandes opaques, mappe les entrées et infère les résultats de transport.
---

# Commandes

Une définition → builder → commande opaque → `client.execute`. Même pipeline pour HTTP, SSE et WebSocket.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const health = defineRequest({ method: 'GET', path: '/health' })
const [error, data, response] = await client.execute(health())
if (!error) console.log(data, response.status)
```

## Choisir une définition

| Définition               | Contrat                                                                    | Valeur en succès                           |
| ------------------------ | -------------------------------------------------------------------------- | ------------------------------------------ |
| `defineRequest(...)`     | Méthode, chemin relatif, entrée optionnelle, sortie par statut optionnelle | Données décodées + `HttpResponse`          |
| `defineEventStream(...)` | Chemin, limites buffer/queue, map nom d’événement → Struct                 | `EventStreamHandle` + instantané open      |
| `defineWebSocket(...)`   | Chemin, map incoming, map outgoing optionnelle, limite de queue            | `WebSocketSession` + instantané connection |

Pas d’`input` → le builder ne prend pas d’argument. Avec `input` → passe la valeur Struct même si chaque champ imbriqué est optionnel. Les sections `path` / `query` / `headers` optionnelles peuvent être omises ; une section avec un champ requis non. Un wrapper body présent signifie que le body est requis.

Garde les commandes opaques. Ne fouille pas les tags ou symboles.

## Mapping automatique de requête

Utilise `struct.request(...)` quand l’entrée logique a déjà path / query / headers / body :

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(struct.object({ name: struct.string() })),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
})
void createUser
```

Les alias ne réécrivent que les clés wire sortantes. Les valeurs parsées et les entrées de commande gardent les noms logiques.

## `build` custom

Atteins `build(request, input)` quand la forme appelant et la forme wire diffèrent. C’est une projection contrainte — pas un endroit pour brancher sur une politique d’auth ou inventer des effets de bord.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.object({ q: struct.string(), page: struct.number().optional() }),
  build(request, input) {
    request.setQueryParams({ q: input.q, page: input.page })
  },
  output: struct.object({ items: struct.array(struct.string()) }),
})
void search
```

## Formes de `output` et `error`

`output` est un Struct pour le corps 2xx ; `error` est un Struct pour tout le reste. `ok` est le seul embranchement, et un seul côté décode. Omettre un côté veut dire que ce corps n’est jamais lu : le fault porte le statut et `data` reste `undefined`.

## Recettes liées

- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
