---
title: Defjs
description: Commandes HTTP, SSE et WebSocket typées, avec un client explicite et des résultats erreur en premier.
---

# Defjs

Définis un endpoint, construis une commande opaque, puis exécute-la. Même forme pour HTTP, SSE et WebSocket.

```ts get-health.ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getHealth = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

const [error, result, response] = await client.execute(getHealth())
if (!error) console.log(result.ok, response.status)
```

Defjs ne met pas les résultats en cache, ne relance pas pour toi et ne ferme pas les flux si tu oublies. L’annulation et le nettoyage te regardent.

## Choisis un transport

| Ton besoin                        | Commence par                      | Résultat en succès                                 |
| --------------------------------- | --------------------------------- | -------------------------------------------------- |
| Requête + réponse selon le statut | [HTTP](./core/http.md)            | Données décodées + `HttpResponse`                  |
| Flux d’événements serveur durable | [SSE](./core/sse.md)              | Un flux + instantané `open` au démarrage           |
| Session bidirectionnelle          | [WebSocket](./core/web-socket.md) | Une session + instantané `connection` au démarrage |

Tu débutes ? Fais [Bien démarrer](./guide/getting-started.md), puis prends une [recette](./recipes/get-declared-404.md). Tu veux le « pourquoi » ? Lis [Décisions de conception](./guide/design-decisions.md) après avoir exécuté quelque chose.

## Choisis un package

| Package                       | Quand                                                                                     |
| ----------------------------- | ----------------------------------------------------------------------------------------- |
| `@defjs/core`                 | `createClient` (HTTP + SSE + WebSocket)                                                   |
| `@defjs/react`                | `ClientProvider` / `useClient` — voir [React](./plugins/react.md)                         |
| `@defjs/vue`                  | Plugin + `injectClient` — voir [Vue](./plugins/vue.md)                                    |
| `@defjs/opentelemetry-server` | Spans/métriques sortants — voir [OpenTelemetry Server](./plugins/opentelemetry-server.md) |

## Formes de résultat

Les trois transports renvoient un tuple de trois éléments, erreur en premier. Les positions correspondent ; les sens non :

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]`
- WebSocket → `[error, session, connection]`

En échec de démarrage, le deuxième élément vaut `undefined`. Le troisième n’existe que si ce transport a d’abord produit une réponse ou un instantané. Voir [Erreurs](./core/errors.md).

## Propriété en une phrase

Annule HTTP quand c’est périmé. Ferme SSE et `await stream.closed`. Ferme WebSocket et `await session.closed`. Sur un serveur, crée le client dans la frontière de la requête quand les options capturent cookies, auth ou données de tenant. Masque les URL, en-têtes et corps avant de les journaliser.

## Recettes liées

- [GET avec un 404 déclaré](./recipes/get-declared-404.md)
- [POST JSON](./recipes/post-json.md)
- [Annuler un appel HTTP](./recipes/cancel-http.md)
- [Consommer un flux SSE](./recipes/consume-sse.md)
- [Ouvrir une session WebSocket](./recipes/websocket-session.md)
- [Tester avec un handle Fetch local](./recipes/test-with-handle.md)
