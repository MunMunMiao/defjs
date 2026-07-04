---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Package d'intégration OpenTelemetry côté serveur, fournissant la collecte de traces et de métriques sortantes pour les clients HTTP, SSE et WebSocket de `@defjs/core`.

**Positionnement principal** :

- **Environnement serveur** (Node.js, Bun, Deno), indépendant de l'environnement navigateur.
- **N'initialise pas le SDK** — Tu dois initialiser le SDK OpenTelemetry de manière externe, puis passer le `Tracer` créé (et optionnellement `Meter`).
- **Séparation par transport** — HTTP, SSE et WebSocket ont chacun leurs intercepteurs, cycles de vie de span et dimensions de métriques indépendants.

## Configuration du workspace du dépôt

Cette page documente actuellement l’usage source/workspace dans ce dépôt. `@defjs/opentelemetry-server` se trouve dans `packages/opentelemetry-server`, et sa peer dependency attend la version workspace correspondante de `@defjs/core` dans `packages/core`.

Les import specifiers ci-dessous utilisent des noms de paquet, mais dans ce dépôt ils se résolvent vers des paquets source du workspace, et non vers une paire de paquets publiés sur une registry. Continue d’installer et d’initialiser séparément les dépendances SDK OpenTelemetry de ton application.

Le npm public ne fournit pas actuellement `@defjs/opentelemetry-server`, et la dernière version autonome de `@defjs/core` disponible là-bas n’est pas un peer compatible pour ce paquet du workspace. Si tu publies plus tard à la fois `@defjs/opentelemetry-server` et une version compatible de `@defjs/core` dans une registry que tu contrôles, ou dans une autre registry qui distribue les deux versions, installe ces deux versions publiées ensemble dans cet environnement au lieu de mélanger ce paquet du workspace avec une version autonome incompatible de `@defjs/core`.

## Usage de base

Passe un `Tracer` créé de manière externe et configure le client via `withOpenTelemetryServer` :

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. Initialiser le SDK OpenTelemetry de manière externe, puis récupérer le tracer
const tracer = trace.getTracer('my-service')

// 2. Injecter le tracer dans la configuration du client
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## Configuration complète

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // Requis
    meter, // Optionnel, les métriques ne sont collectées que si fourni
    propagator, // Optionnel, W3C TraceContext + Baggage par défaut
    requireParentSpan: false,
    http: {
      enabled: true,
      requestHook(span, req) {
        span.setAttribute('defjs.operation', req.endpoint)
      },
      responseHook(span, res) {
        span.setAttribute('defjs.response.status_text', res.statusText)
      },
    },
    sse: {
      enabled: true,
    },
    webSocket: {
      enabled: true,
      queryPropagation: false,
    },
  }),
)
```

### Options de configuration

| Option              | Type                                  | Défaut                     | Description                                                             |
| ------------------- | ------------------------------------- | -------------------------- | ----------------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **Requis**                 | Tracer OpenTelemetry externe                                            |
| `meter`             | `Meter`                               | `undefined`                | Meter OpenTelemetry externe, omettre désactive les métriques            |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Propagateur de contexte personnalisé                                    |
| `requireParentSpan` | `boolean`                             | `false`                    | Créer des spans sortantes seulement quand une span parent active existe |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | Options de trace/métrique pour le transport HTTP                        |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | Options de trace/métrique pour le transport SSE                         |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | Options de trace/métrique pour le transport WebSocket                   |

### Options HTTP

| Option         | Type                  | Défaut      | Description                                                                    |
| -------------- | --------------------- | ----------- | ------------------------------------------------------------------------------ |
| `enabled`      | `boolean`             | `true`      | Activer le tracing HTTP                                                        |
| `requestHook`  | `(span, req) => void` | `undefined` | Personnaliser la span HTTP avant la requête, `req` est `HttpRequest`           |
| `responseHook` | `(span, res) => void` | `undefined` | Personnaliser la span HTTP après la réponse, `res` est `HttpResponse<unknown>` |

### Options SSE

| Option         | Type                     | Défaut      | Description                                                                                            |
| -------------- | ------------------------ | ----------- | ------------------------------------------------------------------------------------------------------ |
| `enabled`      | `boolean`                | `true`      | Activer le tracing SSE                                                                                 |
| `requestHook`  | `(span, req) => void`    | `undefined` | Personnaliser la span SSE avant la requête de flux                                                     |
| `responseHook` | `(span, stream) => void` | `undefined` | Personnaliser la span SSE après le retour du handle de flux, `stream` est `EventStreamHandle<unknown>` |

### Options WebSocket

| Option             | Type                      | Défaut      | Description                                                                                         |
| ------------------ | ------------------------- | ----------- | --------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | Activer le tracing WebSocket                                                                        |
| `queryPropagation` | `boolean`                 | `true`      | Injecter le contexte de trace dans la chaîne de requête de l'URL WebSocket pour la compatibilité navigateur. Pour un trafic de production sensible à la sécurité, la baseline recommandée est de le définir explicitement sur `false`. |
| `requestHook`      | `(span, req) => void`     | `undefined` | Personnaliser la span WebSocket avant la requête de connexion                                       |
| `responseHook`     | `(span, session) => void` | `undefined` | Personnaliser la span WebSocket après le retour de la session, `session` est `WebSocketSessionLike` |

> **Gestion des exceptions de hooks** : Si `requestHook` ou `responseHook` lève une exception, l'erreur est enregistrée sur l'événement `defjs.otel.hook.error` de la span, mais la requête/flux/session client **continue normalement**.
>
> **Hygiène des attributs** : Dans `requestHook` / `responseHook`, privilégie des allowlists explicites, la redaction et des attributs stables à faible cardinalité. N’attache pas de chaînes de requête brutes, de corps de requête ou de réponse, d’en-têtes complets, de valeurs de baggage ou de payloads de message tant que ton application n’a pas déjà validé les exigences de confidentialité, cardinalité, rétention et redaction.

## Migration depuis l'ancienne API

| Ancienne configuration    | Nouvelle configuration                                          |
| ------------------------- | --------------------------------------------------------------- |
| `http: false`             | `http: { enabled: false }`                                      |
| `sse: false`              | `sse: { enabled: false }`                                       |
| `webSocket: false`        | `webSocket: { enabled: false }`                                 |
| `requestHook`             | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook` |
| `responseHook`            | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                  |

Les anciens hooks de niveau supérieur et les bascules booléennes de transport ont été supprimés intentionnellement afin que chaque transport expose les bons types de requête/réponse. Passer maintenant ces anciennes options JavaScript supprimées déclenche une erreur de migration au lieu de les interpréter silencieusement comme une instrumentation activée.

## Conventions sémantiques HTTP et métriques

Le tracing HTTP suit les conventions sémantiques stables des clients HTTP OpenTelemetry. Par défaut, il enregistre des spans `SpanKind.CLIENT` avec les attributs de base suivants :

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Quand `meter` est fourni, les métriques stables suivantes sont collectées :

| Métrique                       | Unité | Attributs                                                                                                                                 |
| ------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`   | `http.request.method`, `http.response.status_code` optionnel, `server.address` optionnel, `server.port` optionnel, `error.type` optionnel |

Par défaut, **ce package n’ajoute pas les corps de requête/réponse, les en-têtes complets, les valeurs de baggage, les tailles de payload ni les payloads de message comme champs de télémétrie personnalisés**. Il **ne crée pas non plus d’attributs de span ni de métriques séparés pour les chaînes de requête brutes**. En revanche, `url.full` reflète l’URL réellement construite par ton application ; si cette URL contient déjà une chaîne de requête, elle peut donc toujours y apparaître. Évite autant que possible de placer des tokens, des user ids ou d’autres entrées sensibles ou à forte cardinalité dans les URL.

N’ajoute pas de chaînes de requête brutes, de corps de requête/réponse, d’en-têtes complets, de valeurs de baggage ou de payloads de message aux spans ou aux métriques tant que l’application n’a pas déjà validé les exigences de confidentialité, cardinalité, rétention et redaction. Quand tu étends la télémétrie via des hooks, privilégie des allowlists explicites, la redaction et des attributs stables à faible cardinalité.

## Tracing au niveau connexion SSE et métriques personnalisées

SSE est une réponse HTTP longue durée. La durée normale de la requête HTTP se termine à l'établissement du flux, ce qui ne reflète pas si le flux est toujours en cours, interrompu ou en erreur. Par conséquent, ce package traite SSE comme une télémétrie **au niveau connexion**.

### Cycle de vie des spans

La span SSE reste ouverte jusqu'à ce que `stream.closed` se résolve, enregistrant les événements de cycle de vie suivants :

- `sse.connected` — Flux établi avec succès
- `sse.closed` — Fin normale du flux (EOF serveur)
- `sse.aborted` — Fermeture active via `stream.close()`
- `sse.error` — Erreur de connexion ou épuisement des reconnexions

### Métriques personnalisées

Quand `meter` est fourni, les métriques personnalisées defjs suivantes sont collectées (conventions sémantiques stables OpenTelemetry non officielles) :

| Métrique                               | Unité      | Signification                                                           |
| -------------------------------------- | ---------- | ----------------------------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Temps pour établir la connexion de flux                                 |
| `defjs.client.sse.connection.duration` | `s`        | Durée totale depuis l'établissement du flux jusqu'à la fermeture/erreur |
| `defjs.client.sse.active_streams`      | `{stream}` | Nombre actuel de flux SSE actifs                                        |

Par défaut, **les spans par événement ne sont pas créées**, et **les payloads d'événements, les IDs d'événements, le `Last-Event-ID`, la latence de livraison, les événements perdus ou les files de reconnexion ne sont pas collectés**. Ce sont des sémantiques de niveau applicatif qui peuvent produire une télémétrie de haute cardinalité ou sensible. Implémente-les au niveau applicatif si nécessaire.

## Tracing au niveau connexion WebSocket et métriques personnalisées

WebSocket commence par un handshake HTTP Upgrade, mais les environnements de production se soucient davantage du cycle de vie de connexion post-handshake : connexions actives, durée de connexion, comportement de fermeture/erreur, et taux d'échec de connexion. Comme les conventions sémantiques WebSocket OpenTelemetry ne sont pas encore stables, ce package utilise des métriques personnalisées au niveau connexion.

### Cycle de vie des spans

La span WebSocket reste ouverte jusqu'à ce que `session.closed` se résolve, enregistrant les événements de cycle de vie suivants :

- `websocket.connected` — Session établie avec succès
- `websocket.closed` — Fermeture normale de connexion
- `websocket.error` — Erreur de connexion

### Métriques personnalisées

Quand `meter` est fourni, les métriques personnalisées defjs suivantes sont collectées :

| Métrique                                     | Unité          | Signification                                                                 |
| -------------------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Temps pour établir la session WebSocket                                       |
| `defjs.client.websocket.connection.duration` | `s`            | Durée totale depuis l'établissement de la session jusqu'à la fermeture/erreur |
| `defjs.client.websocket.active_connections`  | `{connection}` | Nombre actuel de connexions WebSocket actives                                 |

Par défaut, **les spans par message ne sont pas créées**, et **les payloads de messages, les tailles de messages, la contre-pression, la quantité tamponnée, les sous-protocoles ou les files de reconnexion ne sont pas collectés**. La télémétrie de niveau message doit être implémentée au niveau applicatif avec des stratégies d'échantillonnage.

## Risque de sécurité de la propagation de requête WebSocket

Les clients WebSocket côté navigateur ne peuvent généralement pas définir des en-têtes HTTP arbitraires, donc `webSocket.queryPropagation` vaut par défaut `true` pour la compatibilité. Cette valeur par défaut injecte le contexte de trace dans la chaîne de requête de l’URL WebSocket.

Les chaînes de requête peuvent être enregistrées par des proxies, des navigateurs, des outils APM, des logs d’accès et des outils de débogage réseau. Elles peuvent aussi contenir des tokens, des user ids ou d’autres entrées à forte cardinalité. Si le propagateur inclut `baggage`, les valeurs de baggage peuvent aussi être écrites dans l’URL et contenir des données sensibles.

Pour un trafic WebSocket de production sensible à la sécurité, désactive explicitement la propagation par query en tant que baseline recommandée :

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Après désactivation, le contexte de trace ne circule plus dans l’URL WebSocket. Si ton serveur doit encore rattacher la connexion à une trace, utilise au niveau applicatif un autre mécanisme de corrélation déjà revu.

## Prochaines étapes

- [Client](/core/client) — `createClient` et configuration complète des transports
- [SSE](/core/sse) — `defineEventStream` et consommation d'événements en flux
- [WebSocket](/core/web-socket) — `defineWebSocket` et communication en temps réel
