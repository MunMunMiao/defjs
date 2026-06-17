---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Serverseitiges OpenTelemetry-Integrationspaket, das Outbound-Trace- und Metrics-Collection für `@defjs/core`-HTTP-, SSE- und WebSocket-Clients bereitstellt.

**Core-Positionierung**:

- **Server-Umgebung** (Node.js, Bun, Deno), nicht abhängig von Browser-Umgebung.
- **Initialisiert kein SDK** — Du musst das OpenTelemetry SDK extern initialisieren, dann den erstellten `Tracer` (und optional `Meter`) übergeben.
- **Per-Transport-Separation** — HTTP, SSE und WebSocket haben jeweils unabhängige Interceptors, Span-Lifecycles und Metric-Dimensions.

## Installation

```bash
bun add @defjs/opentelemetry-server @opentelemetry/api @opentelemetry/core
```

## Grundlegende Nutzung

Übergib einen extern erstellten `Tracer` und konfiguriere den Client über `withOpenTelemetryServer`:

```typescript
import { createClient, withEndpoint } from '@defjs/core'
import { withOpenTelemetryServer } from '@defjs/opentelemetry-server'
import { trace } from '@opentelemetry/api'

// 1. OpenTelemetry SDK extern initialisieren, dann Tracer holen
const tracer = trace.getTracer('my-service')

// 2. Tracer in Client-Konfiguration injizieren
const client = createClient(withEndpoint('https://api.example.com'), withOpenTelemetryServer({ tracer }))
```

## Vollständige Konfiguration

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withOpenTelemetryServer({
    tracer, // Required
    meter, // Optional, Metrics nur gesammelt, wenn angegeben
    propagator, // Optional, Default W3C TraceContext + Baggage
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

### Konfigurationsoptionen

| Option              | Typ                                   | Default                    | Beschreibung                                                         |
| ------------------- | ------------------------------------- | -------------------------- | -------------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **Required**               | Externer OpenTelemetry-Tracer                                        |
| `meter`             | `Meter`                               | `undefined`                | Externer OpenTelemetry-Meter, Weglassen deaktiviert Metrics          |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Eigener Context-Propagator                                           |
| `requireParentSpan` | `boolean`                             | `false`                    | Nur Outbound-Spans erstellen, wenn ein aktiver Parent-Span existiert |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP-Transport-Trace/Metric-Optionen                                 |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE-Transport-Trace/Metric-Optionen                                  |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket-Transport-Trace/Metric-Optionen                            |

### HTTP-Optionen

| Option         | Typ                   | Default     | Beschreibung                                                        |
| -------------- | --------------------- | ----------- | ------------------------------------------------------------------- |
| `enabled`      | `boolean`             | `true`      | HTTP-Tracing aktivieren                                             |
| `requestHook`  | `(span, req) => void` | `undefined` | HTTP-Span vor Request anpassen, `req` ist `HttpRequest`             |
| `responseHook` | `(span, res) => void` | `undefined` | HTTP-Span nach Response anpassen, `res` ist `HttpResponse<unknown>` |

### SSE-Optionen

| Option         | Typ                      | Default     | Beschreibung                                                                           |
| -------------- | ------------------------ | ----------- | -------------------------------------------------------------------------------------- |
| `enabled`      | `boolean`                | `true`      | SSE-Tracing aktivieren                                                                 |
| `requestHook`  | `(span, req) => void`    | `undefined` | SSE-Span vor Stream-Request anpassen                                                   |
| `responseHook` | `(span, stream) => void` | `undefined` | SSE-Span nach Stream-Handle-Return anpassen, `stream` ist `EventStreamHandle<unknown>` |

### WebSocket-Optionen

| Option             | Typ                       | Default     | Beschreibung                                                                      |
| ------------------ | ------------------------- | ----------- | --------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | WebSocket-Tracing aktivieren                                                      |
| `queryPropagation` | `boolean`                 | `true`      | Trace-Context in WebSocket-URL-Query-String injizieren                            |
| `requestHook`      | `(span, req) => void`     | `undefined` | WebSocket-Span vor Verbindungs-Request anpassen                                   |
| `responseHook`     | `(span, session) => void` | `undefined` | WebSocket-Span nach Session-Return anpassen, `session` ist `WebSocketSessionLike` |

> **Hook-Exception-Handling**: Falls `requestHook` oder `responseHook` wirft, wird der Fehler auf dem Span als `defjs.otel.hook.error`-Event aufgezeichnet, aber der Client-Request/Stream/Session **läuft normal weiter**.

## HTTP-Semantic-Conventions und Metrics

HTTP-Tracing folgt stabilen OpenTelemetry HTTP-Client-Semantic-Conventions. Standardmäßig werden `SpanKind.CLIENT`-Spans mit folgenden Low-Cardinality-Attributen aufgezeichnet:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Falls `meter` angegeben ist, werden folgende stabile Metrics gesammelt:

| Metric                         | Unit | Attributes                                                                                                                            |
| ------------------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`  | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

Standardmäßig werden **Request/Response-Bodies, alle Headers, Raw-Query-Strings, Payload-Größen und Netzwerk-Event-Details nicht gesammelt**. Diese sind typischerweise high-cardinality oder sensitiv. Füge sie explizit via `requestHook` / `responseHook` hinzu, falls nötig.

## SSE-Connection-Level-Tracing und Custom-Metrics

SSE ist eine langlebige HTTP-Response. Normale HTTP-Request-Dauer endet bei Stream-Etablierung, was nicht widerspiegelt, ob der Stream noch läuft, unterbrochen oder gefehlt ist. Daher behandelt dieses Paket SSE als **Connection-Level**-Telemetrie.

### Span-Lifecycle

Der SSE-Span bleibt offen, bis `stream.closed` resolved, und zeichnet folgende Lifecycle-Events auf:

- `sse.connected` — Stream erfolgreich etabliert
- `sse.closed` — Stream normales Ende (Server-EOF)
- `sse.aborted` — Aktives Schließen via `stream.close()`
- `sse.error` — Verbindungsfehler oder Wiederverbindungserschöpfung

### Custom-Metrics

Falls `meter` angegeben ist, werden folgende defjs-Custom-Metrics gesammelt (nicht-offizielle OpenTelemetry-stabile Semantic-Conventions):

| Metric                                 | Unit       | Bedeutung                                           |
| -------------------------------------- | ---------- | --------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Zeit bis Stream-Verbindung etabliert                |
| `defjs.client.sse.connection.duration` | `s`        | Gesamtdauer von Stream-Etablierung bis Close/Fehler |
| `defjs.client.sse.active_streams`      | `{stream}` | Aktuelle aktive SSE-Stream-Anzahl                   |

Standardmäßig werden **per-Event-Spans nicht erstellt**, und **Event-Payloads, Event-IDs, `Last-Event-ID`, Delivery-Latency, verlorene Events oder Wiederverbindungswarteschlangen nicht gesammelt**. Diese sind Anwendungs-Level-Semantiken, die high-cardinality oder sensitive Telemetrie erzeugen können. Implementiere sie bei Bedarf auf Anwendungsebene.

## WebSocket-Connection-Level-Tracing und Custom-Metrics

WebSocket beginnt mit einem HTTP-Upgrade-Handshake, aber Produktionsumgebungen kümmern sich mehr um den Post-Handshake-Connection-Lifecycle: aktive Verbindungen, Verbindungsdauer, Close-/Fehler-Verhalten und Verbindungsfehlerrate. Da OpenTelemetry-WebSocket-Semantic-Conventions noch nicht stabil sind, verwendet dieses Paket Connection-Level-Custom-Metrics.

### Span-Lifecycle

Der WebSocket-Span bleibt offen, bis `session.closed` resolved, und zeichnet folgende Lifecycle-Events auf:

- `websocket.connected` — Session erfolgreich etabliert
- `websocket.closed` — Verbindung normales Schließen
- `websocket.error` — Verbindungsfehler

### Custom-Metrics

Falls `meter` angegeben ist, werden folgende defjs-Custom-Metrics gesammelt:

| Metric                                       | Unit           | Bedeutung                                            |
| -------------------------------------------- | -------------- | ---------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Zeit bis WebSocket-Session etabliert                 |
| `defjs.client.websocket.connection.duration` | `s`            | Gesamtdauer von Session-Etablierung bis Close/Fehler |
| `defjs.client.websocket.active_connections`  | `{connection}` | Aktuelle aktive WebSocket-Verbindungsanzahl          |

Standardmäßig werden **per-Message-Spans nicht erstellt**, und **Message-Payloads, Message-Größen, Backpressure, Buffered-Amount, Subprotokolle oder Wiederverbindungswarteschlangen nicht gesammelt**. Message-Level-Telemetrie sollte auf Anwendungsebene mit Sampling-Strategien implementiert werden.

## WebSocket-Query-Propagation-Sicherheitsrisiko

Browser-WebSocket-Clients können typischerweise keine beliebigen HTTP-Headers setzen, daher injiziert dieses Paket standardmäßig Trace-Context in den WebSocket-URL-Query-String für Browser-Kompatibilität.

Diese Wahl hat ein Sicherheits-Abschluss: Query-Strings können in Access-Logs, Proxy-Logs, Browser-/Netzwerk-Debugging-Tools und APM-URL-Feldern erscheinen. Falls der Propagator `baggage` enthält, werden Baggage-Values ebenfalls in die URL geschrieben und können potenziell sensitive Daten tragen.

Für sicherheitskritischen WebSocket-Traffic deaktiviere die Query-Propagation explizit:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Nach Deaktivierung wird Trace-Context nicht mehr via URL propagiert. Der Server muss auf andere Mechanismen für Trace-Correlation zurückgreifen (z. B. Trace-ID-Felder im Application-Layer-Message-Protokoll).

## Wie geht es weiter

- [Client](/core/client) — `createClient` und vollständige Transport-Konfiguration
- [SSE](/core/sse) — `defineEventStream` und Streaming-Event-Konsumierung
- [WebSocket](/core/web-socket) — `defineWebSocket` und Echtzeitkommunikation
