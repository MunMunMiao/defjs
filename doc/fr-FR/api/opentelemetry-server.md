---
title: '@defjs/opentelemetry-server'
description: 'Instrumentation sortante : `withOpenTelemetryServer`.'
---

# OpenTelemetry server {#page}

Allume l’instrumentation sortante à la création du client. Ajoute des interceptors HTTP, SSE et WebSocket. Ce n’est **pas** de l’instrumentation serveur entrante, et ça n’initialise **pas** un SDK OpenTelemetry.

Voir le [guide OpenTelemetry server](../plugins/opentelemetry-server.md).

## withOpenTelemetryServer() {#withOpenTelemetryServer}

```ts
function withOpenTelemetryServer(options: OpenTelemetryServerOptions): ClientOption
```

Ajoute un interceptor par transport activé. Applique-le au `createClient`.

```ts
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'

const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

`tracer` est obligatoire. `meter` est optionnel — sans lui, pas de metrics du paquet. Pas de `propagator` → W3C Trace Context + Baggage.

HTTP, SSE et WebSocket sont on par défaut. `{ enabled: false }` saute un transport.

## OpenTelemetryServerOptions {#OpenTelemetryServerOptions}

```ts
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

## OpenTelemetryServerTransportOptions {#OpenTelemetryServerTransportOptions}

```ts
interface OpenTelemetryServerTransportOptions<TResponse> {
  enabled?: boolean
  startSpanHook?: (request: HttpRequest) => Attributes
  requestHook?: (span: Span, req: HttpRequest) => Promise<void> | void
  responseHook?: (span: Span, res: TResponse, req: HttpRequest) => Promise<void> | void
}

type OpenTelemetryServerHttpOptions = OpenTelemetryServerTransportOptions<HttpResponse<unknown>>
type OpenTelemetryServerSSEOptions = OpenTelemetryServerTransportOptions<EventStreamHandle<unknown>>
interface OpenTelemetryServerWebSocketOptions extends OpenTelemetryServerTransportOptions<WebSocketSessionLike> {
  queryPropagation?: boolean
}
```

`startSpanHook` s’exécute synchroniquement avant la création du span de son transport HTTP, SSE ou WebSocket. Les attributs applicatifs sont appliqués en dernier et peuvent donc remplacer `url.full`. S’il throw, Defjs enregistre `defjs.otel.hook.error` et continue la requête avec les attributs intégrés ; `requestHook` et `responseHook` restent postérieurs à la création du span.

Par défaut, `url.full` résout seulement `request.endpoint` contre l’éventuel `request.baseEndpoint` et n’ajoute pas un `request.queryString` indépendant. Cette frontière n’est pas une redaction et aucune politique redactor n’est intégrée. Construis explicitement une URL complète ou masquée dans `startSpanHook`.

`queryPropagation` vaut `false` par défaut. Active-le seulement si le trace context dans l’URL WebSocket te va.
