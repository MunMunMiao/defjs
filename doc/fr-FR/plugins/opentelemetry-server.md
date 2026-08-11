---
title: OpenTelemetry Server
description: Instrumentez les appels Defjs HTTP, SSE et WebSocket sortants avec un Tracer OpenTelemetry fourni par l'application et un Meter facultatif.
---

# `@defjs/opentelemetry-server`

Malgré son nom, ce package instrumente les appels sortants des clients Defjs. Il n'instrumente pas les requêtes entrantes d'un serveur et n'initialise aucun SDK OpenTelemetry.

L'application reste responsable :

- de la configuration du SDK et des providers ;
- de la configuration des exporters et processors ;
- du gestionnaire de contexte et du contexte actif ;
- du sampling, de la politique d'attributs et du masquage ;
- du flush forcé et de l'arrêt.

Transmettez un `Tracer` fourni par l'application et, facultativement, un `Meter` à `withOpenTelemetryServer(...)`.

## Configurer le client

```typescript
import { createClient, defineRequest, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { metrics, trace } from '@opentelemetry/api'

// Initialize and register the application's SDK/providers before this point.
const tracer = trace.getTracer('orders-service')
const meter = metrics.getMeter('orders-service')

const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer,
    meter,
    webSocket: {
      queryPropagation: false,
    },
  }),
)
```

L'adaptateur ajoute un intercepteur par transport activé. Les options suivent l'ordre normal du client : la position de l'adaptateur par rapport aux autres intercepteurs détermine donc le travail couvert par les spans.

### Identité d’opération

Définissez `operation` statiquement dans chaque endpoint. C’est l’identité à faible cardinalité utilisée par les spans et métriques :

```typescript
const readOrder = defineRequest({
  method: 'GET',
  operation: 'orders.read',
  path: '/orders/:id',
  // input and output omitted
})
```

Avec une operation, les spans se nomment `GET orders.read`, `SSE orders.watch` ou `WebSocket orders.connect`, et `defjs.operation` est enregistré. Sans elle, le fallback précédent reste inchangé : méthode HTTP, `SSE` ou `WebSocket`, sans attribut d’opération. Ne déduisez jamais l’identité d’une URL résolue ou d’un chemin avec identifiants et ne copiez pas les URLs résolues dans la télémétrie ou les logs.

## Options

```typescript
interface OpenTelemetryServerOptions {
  tracer: Tracer
  meter?: Meter
  propagator?: TextMapPropagator
  requireParentSpan?: boolean
  http?: OpenTelemetryServerHttpOptions
  sse?: OpenTelemetryServerSSEOptions
  webSocket?: OpenTelemetryServerWebSocketOptions
}
```

Chaque option de transport accepte `enabled?: boolean`, `requestHook` et `responseHook`. WebSocket accepte aussi `queryPropagation?: boolean`.

Les trois transports sont activés par défaut. Utilisez un objet d'option pour en désactiver un :

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

Les anciens booléens de transport, les hooks de premier niveau et `webSocketQueryPropagation` sont refusés à l'exécution avec une erreur de migration. Utilisez désormais des objets d'option par transport, des hooks propres à chaque transport et `webSocket.queryPropagation`.

## Propagation

Lorsque `propagator` est omis, le package crée son propre `CompositePropagator` avec W3C Trace Context et W3C Baggage. Il ne consulte pas le propagator global.

HTTP et SSE injectent tous les champs produits dans les en-têtes de requête. Si `req.headers` est déjà une instance de `Headers`, l'implémentation actuelle réutilise et modifie cette même instance. Sinon, elle crée un nouvel objet `Headers`. Pour WebSocket, la propagation dans la query vaut `false` par défaut. Seul `queryPropagation: true` l'active ; comme les WebSocket du navigateur ne peuvent pas ajouter d'en-têtes arbitraires au handshake, chaque champ produit par le propagator est alors ajouté à la query de connexion.

Avant de créer un span, chaque intercepteur appelle aussi `propagator.extract(...)` sur les en-têtes de requête. Considérez ce carrier comme une entrée de confiance contrôlée par l'application. N'autorisez pas une source non fiable à fournir `traceparent`, `tracestate` ou `baggage` : ces champs peuvent remplacer le contexte parent actif. Supprimez ou normalisez les champs de propagation non fiables avant que la requête n'atteigne cet intercepteur.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

Validez la propagation par URL avant de l'activer. Les navigateurs, proxies, journaux d'accès et systèmes de télémétrie peuvent enregistrer le contexte de trace et le baggage. Un propagator personnalisé peut ajouter d'autres champs que `traceparent`. Si le serveur le permet, préférez un premier message validé dans le protocole ou un ticket de connexion à courte durée de vie et à usage unique.

`requireParentSpan: true` vérifie l'existence d'un span parent actif avant toute instrumentation. Sans span actif, l'intercepteur ignore la création du span, la propagation, les hooks et les métriques, puis appelle le handler suivant sans modification.

## Comportement des hooks

Les hooks reçoivent le span et la requête ou le résultat propres au transport :

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response, request) {
      span.setAttribute('app.operation', request.operation ?? 'unclassified')
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

Le troisième argument est le `HttpRequest` de transport d’origine. Utilisez son `operation` explicite ; ne reconstruisez pas l’identité depuis `request.endpoint`, une URL résolue ou un chemin.

Les hooks peuvent renvoyer `void` ou `Promise<void>` et restent non bloquants. Les exceptions synchrones et les rejets asynchrones sont interceptés et enregistrés dans `defjs.otel.hook.error` sans interrompre l'opération du client ; les erreurs produites par cet enregistrement de télémétrie sont également isolées.

Limitez les attributs à une liste autorisée de faible cardinalité. N'attachez ni en-têtes bruts, ni chaînes de requête, ni corps, ni baggage, ni ID d'événement, ni payloads de message, ni identifiants.

## Sémantique HTTP

L'intercepteur HTTP crée un span `SpanKind.CLIENT` et enregistre :

- `${method} ${operation}` comme nom de span et `defjs.operation` lorsque l’endpoint déclare une opération statique ;
- la méthode de requête seule comme fallback historique inchangé en l’absence d’operation ;
- `http.request.method` ;
- `url.full` ;
- `server.address` et, facultativement, `server.port` ;
- `http.response.status_code` uniquement lorsqu'un statut de réponse réel a été reçu.

Cela ne constitue pas une promesse de conformité complète aux conventions sémantiques HTTP.

Le statut du span HTTP et `error.type` suivent ces règles :

- un statut de `100` à `399` laisse le statut du span non défini et ne définit pas `error.type` ;
- un statut `400` ou supérieur marque le span client `ERROR` et définit `error.type` avec le code de statut sous forme de chaîne ;
- un résultat de transport Defjs de statut 0 ne définit pas `http.response.status_code` ; une annulation par l'appelant laisse le statut non défini et ne définit pas `error.type`, un timeout utilise `ERROR` / `TIMEOUT` et les autres échecs de transport utilisent `ERROR` / `NETWORK_ERROR` ;
- une erreur levée dans l'intercepteur marque le span `ERROR`, enregistre l'exception et utilise son `Error.name` ou une autre valeur de repli à faible cardinalité comme `error.type`.

Le span HTTP se termine lorsque l'intercepteur reçoit la `HttpResponse` Defjs. La sélection haut niveau du statut de sortie et le décodage Struct ont lieu après le retour de cet intercepteur. Un `RESPONSE_VALIDATION_FAILED` ou `UNDECLARED_STATUS` ultérieur ne peut donc pas modifier le span déjà terminé.

Lorsqu'un Meter est fourni, HTTP enregistre `http.client.request.duration` en secondes. Les attributs comprennent la méthode, l'adresse et le port du serveur, l'éventuel statut de réponse et l'éventuel `error.type`. La métrique applique la même classification du statut de réponse et de `error.type` que le span HTTP.

## Sémantique SSE

Après un démarrage SSE réussi, le span reste ouvert jusqu'à la résolution de `stream.closed`. Il enregistre `sse.connected`, puis `sse.closed`, `sse.aborted` ou `sse.error` selon le parcours de fermeture observé.

Avec un Meter, SSE instrumente :

| Métrique                               | Signification                                                           |
| -------------------------------------- | ----------------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | Temps écoulé avant le renvoi du handle logique SSE.                     |
| `defjs.client.sse.connection.duration` | Temps entre le renvoi du handle et la fermeture définitive.             |
| `defjs.client.sse.active_streams`      | Nombre de handles logiques dont la promesse `closed` n'est pas résolue. |

Ce sont des métriques Defjs personnalisées. Le compteur actif inclut le temps passé entre les tentatives de reconnexion physique. Il ne compte pas les connexions HTTP actuellement ouvertes.

## Sémantique WebSocket

Après un démarrage WebSocket réussi, le span reste ouvert jusqu'à la résolution de `session.closed`. Il enregistre `websocket.connected`, puis `websocket.closed` ou `websocket.error` selon le parcours observé.

Avec un Meter, WebSocket utilise :

| Métrique                                     | Signification                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| `defjs.client.websocket.connect.duration`    | Temps écoulé avant le renvoi de la session logique.                      |
| `defjs.client.websocket.connection.duration` | Temps entre le renvoi de la session et la fermeture définitive.          |
| `defjs.client.websocket.active_connections`  | Nombre de sessions logiques dont la promesse `closed` n'est pas résolue. |

Le nom de la métrique parle de connexions, mais l'implémentation compte les sessions logiques, y compris pendant les délais de reconnexion. Elle ne compte pas les sockets physiques.

Les conventions sémantiques WebSocket génériques ne sont pas stables ici. Par défaut, le package ne crée aucun span par message et n'enregistre ni payload ni taille de file.

## Données sensibles et limites de couverture

Par défaut, `url.full` est résolue depuis l’endpoint et l’endpoint de base, pas depuis la query sérialisée, mais le chemin peut encore contenir des identifiants sensibles. C’est une métadonnée de transport, jamais une source d’identité d’opération. Gardez `operation` statique, ne copiez pas les URLs résolues dans la télémétrie ou les logs et configurez la redaction du SDK/exporter avant d’exporter les attributs URL. La propagation WebSocket ajoute séparément les champs à la query réelle.

`recordException(...)` reçoit les erreurs levées et certaines causes de fermeture. Leurs messages et leurs stacks peuvent exposer des données sensibles. Configurez le masquage dans les processors et exporters du SDK ; l'adaptateur ne nettoie pas les exceptions à la place de l'application.

Avant le déploiement, validez cet adaptateur avec le SDK, les exporters, processors, context manager et l'instrumentation automatique de votre service. Vérifiez le baggage de bout en bout, le masquage, le shutdown/flush et les spans en double sous trafic réel.

## Étapes suivantes

- [Intercepteurs](/fr-FR/core/interceptors) explique l'ordre par rapport aux autres intercepteurs du client.
- [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) expliquent les durées de vie des handles et sessions logiques comptées ici.
