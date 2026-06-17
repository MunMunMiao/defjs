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

## Installation

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

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
| `queryPropagation` | `boolean`                 | `true`      | Injecter le contexte de trace dans la chaîne de requête de l'URL WebSocket                          |
| `requestHook`      | `(span, req) => void`     | `undefined` | Personnaliser la span WebSocket avant la requête de connexion                                       |
| `responseHook`     | `(span, session) => void` | `undefined` | Personnaliser la span WebSocket après le retour de la session, `session` est `WebSocketSessionLike` |

> **Gestion des exceptions de hooks** : Si `requestHook` ou `responseHook` lève une exception, l'erreur est enregistrée sur l'événement `defjs.otel.hook.error` de la span, mais la requête/flux/session client **continue normalement**.

## Conventions sémantiques HTTP et métriques

Le tracing HTTP suit les conventions sémantiques stables des clients HTTP OpenTelemetry. Par défaut, il enregistre des spans `SpanKind.CLIENT` avec les attributs de faible cardinalité suivants :

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Quand `meter` est fourni, les métriques stables suivantes sont collectées :

| Métrique                       | Unité | Attributs                                                                                                                                 |
| ------------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`   | `http.request.method`, `http.response.status_code` optionnel, `server.address` optionnel, `server.port` optionnel, `error.type` optionnel |

Par défaut, **les corps de requête/réponse, tous les en-têtes, les chaînes de requête brutes, les tailles de payload et les détails d'événements réseau ne sont pas collectés**. Ce sont généralement des données de haute cardinalité ou sensibles. Ajoute-les explicitement via `requestHook` / `responseHook` si nécessaire.

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

Les clients WebSocket navigateur ne peuvent généralement pas définir des en-têtes HTTP arbitraires, donc ce package injecte par défaut le contexte de trace dans la chaîne de requête de l'URL WebSocket pour la compatibilité navigateur.

Ce choix a un compromis de sécurité : les chaînes de requête peuvent apparaître dans les logs d'accès, les logs de proxy, les outils de débogage navigateur/réseau, et les champs d'URL d'APM. Si le propagateur inclut `baggage`, les valeurs de baggage sont aussi écrites dans l'URL, potentiellement portant des données sensibles.

Pour du trafic WebSocket sensible à la sécurité, désactive explicitement la propagation de requête :

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Après désactivation, le contexte de trace ne se propage plus via l'URL. Le serveur doit s'appuyer sur d'autres mécanismes pour la corrélation de traces (ex. champs d'ID de trace dans le protocole de messages de niveau applicatif).

## Prochaines étapes

- [Client](/core/client) — `createClient` et configuration complète des transports
- [SSE](/core/sse) — `defineEventStream` et consommation d'événements en flux
- [WebSocket](/core/web-socket) — `defineWebSocket` et communication en temps réel
