---
title: Décisions de conception
description: Pourquoi Defjs garde explicites les contrats, commandes, résultats de transport, décodage et propriété.
---

# Décisions de conception

Defjs fait quelques compromis volontaires. Les API de confort masquent souvent qui possède une requête, un flux ou une session. Defjs garde cette frontière visible pour que tu réutilises le même contrat d’endpoint sans ramasser en silence un cache, un planificateur de retry ou un gestionnaire de ressources.

## Clients explicites

`createClient(...)` fait de la config d’endpoint une valeur explicite. Des environnements ou portées de requête différents obtiennent des endpoints, credentials, intercepteurs, sérialiseurs et handles de transport différents.

Le coût : pas de défaut process-wide. Ce coût aide sur un serveur — crée le client dans la frontière de la requête quand les options ou closures capturent auth, cookies, utilisateurs, tenants ou métadonnées de requête. Un client explicite n’isole pas pour autant l’état capturé par un intercepteur. L’identité du client n’est pas une frontière de sécurité à elle seule.

Un client dispatche des commandes. Il ne possède pas le travail actif. Qui démarre une requête HTTP, un flux SSE ou une session WebSocket doit l’annuler ou la fermer et attendre la promesse terminale.

## Définitions, builders et commandes

La définition est le contrat stable : méthode, chemin, Struct d’entrée, mapping de sortie, limites de transport. Le builder est la vue appelable. L’appeler crée une commande opaque pour une seule exécution.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

Un job d’arrière-plan et un propriétaire UI peuvent exécuter la même forme `getUser` avec des politiques d’annulation/retry différentes. Garder la commande opaque empêche le code app de dépendre des tags ou symboles de transport internes.

## Résultats propres à chaque transport

Les trois transports utilisent un tuple erreur en premier. Une seule « response » générique effacerait les faits de cycle de vie.

- HTTP → `[error, data, response]` — sortie décodée + `HttpResponse`
- SSE → `[error, stream, open]` — un flux logique + instantané de réponse au démarrage
- WebSocket → `[error, session, connection]` — session logique + instantané de connexion au démarrage

La troisième valeur est un instantané, pas une promesse que de futurs reconnects gardent la même connexion physique. Un échec de démarrage peut quand même inclure une réponse/instantané si le transport en a produit un d’abord. Après le démarrage, le contrôle du cycle de vie appartient au handle ou à la session renvoyés.

## Décodage à l’exécution

L’inférence TypeScript décrit ce que tu attends ; elle ne peut pas vérifier une réponse serveur à l’exécution. Le parsing Struct est la seconde moitié du contrat. Defjs valide l’entrée de la commande avant la construction de la requête, décode la représentation choisie, puis parse le Struct correspondant.

Cet ordre garde statut et body comme des faits séparés. La sélection exacte du statut déclaré a lieu **avant** le décodage du body. Non-2xx déclaré → `error.data` typé. Body déclaré malformé → `RESPONSE_VALIDATION_FAILED`. Statut non déclaré → `UNDECLARED_STATUS` (pas un succès/échec non typé). Plus strict que « n’importe quel JSON arrivé », mais tu peux décider en sécurité.

## Les limites de `build`

Le mapping automatique `struct.request(...)` est le défaut quand l’entrée a déjà path/query/headers/body. Un `build(request, input)` custom est une projection contrainte quand la forme appelant et la forme wire diffèrent :

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` est une vue liée au schéma, pas l’objet runtime de l’appelant. La projection peut sélectionner des champs déclarés, renommer des cibles et mapper un élément de tableau source vers un élément de sortie. Elle ne peut pas brancher sur des valeurs, injecter des littéraux ou changer la cardinalité. Normalise les données métier et fais la validation dépendante des valeurs avant de créer la commande.

## Placement des observateurs et des politiques

Les intercepteurs servent à la politique transversale au transport : auth, tracing, short-circuit, retry revu. Ils ne tournent que pour leur transport et se composent en ordre oignon. Les options d’exécution servent à la durée de vie du travail : `signal`, `timeout`, heartbeat WebSocket, reconnect opt-in.

Les observateurs rapportent ce qui s’est passé sans devenir un second propriétaire. `onInvalidEvent` SSE, les écouteurs d’état WebSocket et les écouteurs d’erreurs runtime servent aux diagnostics et métriques bornés. Le flux/session renvoyé possède toujours l’itération, la fermeture, le désabonnement et l’attente terminale. Cache, suppression de résultats périmés, idempotence et mapping d’erreurs de domaine appartiennent autour de `client.execute(...)`, où ton app voit sa propre politique et son état.

## OpenAPI, sourcemaps et télémétrie

Defjs ne génère ni ne synchronise un second contrat OpenAPI. Si OpenAPI est déjà autoritatif, garde-le et ajoute la validation runtime à la frontière de l’app. Pour un nouveau service, les définitions d’endpoint et les Structs peuvent être le contrat wire direct — pas de seconde source de vérité.

`withOpenTelemetryServer(...)` ajoute de l’instrumentation Defjs **sortante** à un client. Il n’initialise pas un SDK OpenTelemetry. `tracer` est requis, `meter` est optionnel, les trois transports sont activés par défaut, et la propagation query WebSocket est désactivée par défaut. Garde les noms d’opération statiques et à faible cardinalité. Passe en revue propagation, hooks, URL, en-têtes, payloads, causes et rétention comme potentiellement sensibles.

Les sourcemaps sont une décision de déploiement, pas un comportement Defjs. Une map publique avec `sourcesContent` expose le source ; une map cachée contient encore le source et les chemins ; désactiver les maps retire la symbolication au niveau source. Traite les maps privées comme des artefacts de debug déployables avec accès et règles de rétention explicites.

## Recettes liées

- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
- [Tester avec un handle Fetch local](../recipes/test-with-handle.md)
