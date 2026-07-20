---
title: OpenTelemetry Server
description: Server-side outbound tracing without SDK initialization. Supports HTTP, SSE, and WebSocket with OpenTelemetry metrics and trace collection.
---

# @defjs/opentelemetry-server

Serverseitiges OpenTelemetry-Integrationspaket, das für HTTP-, SSE- und WebSocket-Clients von `@defjs/core` ausgehende Traces und Metriken erfasst.

**Kernausrichtung**:

- **Server-Umgebung** (Node.js, Bun, Deno), nicht von einer Browser-Umgebung abhängig.
- **Initialisiert kein SDK** — Du musst das OpenTelemetry SDK extern initialisieren und danach den erzeugten `Tracer` (optional auch `Meter`) übergeben.
- **Trennung nach Transporten** — HTTP, SSE und WebSocket haben jeweils unabhängige Interceptors, Span-Lebenszyklen und Metrikdimensionen.

## Einrichtung für Repository und Workspace

Diese Seite dokumentiert derzeit die Nutzung der Quellpakete im Workspace dieses Repositories. `@defjs/opentelemetry-server` liegt unter `packages/opentelemetry-server`, und seine Peer-Dependency erwartet die passende `@defjs/core`-Workspace-Version aus `packages/core`.

Die unten gezeigten Import-Specifier verwenden Paketnamen, werden in diesem Repository aber gegen die Quellpakete des Workspace aufgelöst und nicht gegen ein gemeinsam aus einer Registry installiertes Paketpaar. Die OpenTelemetry-SDK-Abhängigkeiten deiner Anwendung musst du weiterhin separat installieren und initialisieren.

In der öffentlichen npm-Registry ist `@defjs/opentelemetry-server` derzeit nicht verfügbar, und die dort zuletzt separat veröffentlichte `@defjs/core`-Version ist kein kompatibler Peer für dieses Workspace-Paket. Falls du später sowohl `@defjs/opentelemetry-server` als auch eine kompatible `@defjs/core`-Version in eine von dir kontrollierte Registry oder in eine andere Registry mit beiden Versionen veröffentlichst, installiere in dieser Umgebung diese beiden veröffentlichten Versionen gemeinsam, statt dieses Workspace-Paket mit einer inkompatiblen einzelnen `@defjs/core`-Version zu mischen.

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

| Option              | Typ                                   | Default                    | Beschreibung                                                           |
| ------------------- | ------------------------------------- | -------------------------- | ---------------------------------------------------------------------- |
| `tracer`            | `Tracer`                              | **Required**               | Externer OpenTelemetry-Tracer                                          |
| `meter`             | `Meter`                               | `undefined`                | Externer OpenTelemetry-Meter, Weglassen deaktiviert Metrics            |
| `propagator`        | `TextMapPropagator`                   | W3C TraceContext + Baggage | Eigener Context-Propagator                                             |
| `requireParentSpan` | `boolean`                             | `false`                    | Nur ausgehende Spans erstellen, wenn ein aktiver Parent-Span existiert |
| `http`              | `OpenTelemetryServerHttpOptions`      | `{}`                       | HTTP-Transport-Trace/Metric-Optionen                                   |
| `sse`               | `OpenTelemetryServerSSEOptions`       | `{}`                       | SSE-Transport-Trace/Metric-Optionen                                    |
| `webSocket`         | `OpenTelemetryServerWebSocketOptions` | `{}`                       | WebSocket-Transport-Trace/Metric-Optionen                              |

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

| Option             | Typ                       | Default     | Beschreibung                                                                                                                                                            |
| ------------------ | ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enabled`          | `boolean`                 | `true`      | WebSocket-Tracing aktivieren                                                                                                                                            |
| `queryPropagation` | `boolean`                 | `true`      | Zur Browser-Kompatibilität Trace-Context in den Query-String der WebSocket-URL injizieren. Für sicherheitssensible Produktionslast ist `false` die empfohlene Baseline. |
| `requestHook`      | `(span, req) => void`     | `undefined` | WebSocket-Span vor Verbindungs-Request anpassen                                                                                                                         |
| `responseHook`     | `(span, session) => void` | `undefined` | WebSocket-Span nach Session-Return anpassen, `session` ist `WebSocketSessionLike`                                                                                       |

> **Ausnahmen in Hooks**: Wenn `requestHook` oder `responseHook` einen Fehler wirft, wird er als Span-Ereignis `defjs.otel.hook.error` aufgezeichnet, aber die Client-Anfrage, der Stream oder die Session **läuft normal weiter**.
>
> **Attribut-Hygiene**: Bevorzuge in `requestHook` / `responseHook` explizite Positivlisten, Maskierung und stabile Attribute mit geringer Kardinalität. Hänge keine rohen Query-Strings, Request-/Response-Bodies, vollständigen Header, `baggage`-Werte oder Message-Payloads an, sofern deine Anwendung Datenschutz-, Kardinalitäts-, Aufbewahrungs- und Maskierungsanforderungen nicht bereits geprüft hat.

## Migration von der alten API

| Alte Konfiguration          | Neue Konfiguration                                                  |
| --------------------------- | ------------------------------------------------------------------- |
| `http: false`               | `http: { enabled: false }`                                          |
| `sse: false`                | `sse: { enabled: false }`                                           |
| `webSocket: false`          | `webSocket: { enabled: false }`                                     |
| `requestHook`               | `http.requestHook` / `sse.requestHook` / `webSocket.requestHook`    |
| `responseHook`              | `http.responseHook` / `sse.responseHook` / `webSocket.responseHook` |
| `webSocketQueryPropagation` | `webSocket.queryPropagation`                                        |

Die alten Top-Level-Hooks und die booleschen Transport-Toggles wurden absichtlich entfernt, damit jeder Transport die korrekten Request-/Response-Typen exponiert. Wenn diese entfernten alten JavaScript-Optionen jetzt noch übergeben werden, wird ein Migrationsfehler ausgelöst, statt sie stillschweigend als aktivierte Instrumentierung zu interpretieren.

## HTTP-Semantikkonventionen und Metriken

HTTP-Tracing folgt den stabilen OpenTelemetry-Semantikkonventionen für HTTP-Clients. Standardmäßig werden `SpanKind.CLIENT`-Spans mit folgenden Kernattributen aufgezeichnet:

- `http.request.method`
- `url.full`
- `server.address`
- `server.port`
- `http.response.status_code`

Falls `meter` angegeben ist, werden folgende stabilen Metriken erfasst:

| Metrik                         | Einheit | Attribute                                                                                                                             |
| ------------------------------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `http.client.request.duration` | `s`     | `http.request.method`, optional `http.response.status_code`, optional `server.address`, optional `server.port`, optional `error.type` |

Standardmäßig werden **Request-/Response-Bodies, vollständige Header, Baggage-Werte, Payload-Größen und Message-Payloads nicht als benutzerdefinierte Telemetrie-Felder erfasst**. Dieses Paket **legt außerdem keine separaten Span-Attribute oder Metriken für rohe Query-Strings an**. `url.full` spiegelt jedoch die Request-URL wider, die deine Anwendung tatsächlich konstruiert; enthält diese URL bereits Query-Strings, können sie dort weiterhin erscheinen. Vermeide nach Möglichkeit Tokens, Benutzer-IDs oder andere sensitive bzw. hoch-kardinale Eingaben in URLs.

Füge rohe Query-Strings, Request-/Response-Bodies, vollständige Header, Baggage-Werte oder Message-Payloads nicht zu Spans oder Metriken hinzu, sofern deine Anwendung Datenschutz-, Kardinalitäts-, Aufbewahrungs- und Redaktionsanforderungen nicht bereits geprüft hat. Bevorzuge beim Erweitern der Telemetrie über Hooks explizite Allowlists, Redaction und stabile Low-Cardinality-Attribute.

## SSE-Telemetrie auf Verbindungsebene und benutzerdefinierte Metriken

SSE ist eine langlebige HTTP-Antwort. Die übliche Dauer einer HTTP-Anfrage endet mit dem Aufbau des Streams und zeigt daher nicht, ob der Stream weiterläuft, unterbrochen wurde oder mit einem Fehler endete. Deshalb behandelt dieses Paket SSE als Telemetrie **auf Verbindungsebene**.

### Span-Lebenszyklus

Der SSE-Span bleibt offen, bis `stream.closed` aufgelöst wird, und zeichnet folgende Lebenszyklusereignisse auf:

- `sse.connected` — Stream erfolgreich aufgebaut
- `sse.closed` — Stream regulär beendet (Server-EOF)
- `sse.aborted` — Aktives Schließen über `stream.close()`
- `sse.error` — Verbindungsfehler oder ausgeschöpfte Wiederverbindungsversuche

### Benutzerdefinierte Metriken

Falls `meter` angegeben ist, werden folgende defjs-spezifischen Metriken erfasst (keine offiziellen stabilen OpenTelemetry-Semantikkonventionen):

| Metrik                                 | Einheit    | Bedeutung                                           |
| -------------------------------------- | ---------- | --------------------------------------------------- |
| `defjs.client.sse.connect.duration`    | `s`        | Zeit bis Stream-Verbindung etabliert                |
| `defjs.client.sse.connection.duration` | `s`        | Gesamtdauer von Stream-Etablierung bis Close/Fehler |
| `defjs.client.sse.active_streams`      | `{stream}` | Aktuelle aktive SSE-Stream-Anzahl                   |

Standardmäßig werden **keine Spans pro Ereignis erstellt**, und **Event-Payloads, Event-IDs, `Last-Event-ID`, Zustelllatenz, verlorene Events oder Wiederverbindungswarteschlangen werden nicht erfasst**. Diese Informationen gehören zur Semantik auf Anwendungsebene und können hochkardinale oder sensible Telemetrie erzeugen. Implementiere sie bei Bedarf in der Anwendung.

## WebSocket-Telemetrie auf Verbindungsebene und benutzerdefinierte Metriken

WebSocket beginnt mit einem HTTP-Upgrade-Handshake, doch in Produktionsumgebungen ist meist der Lebenszyklus der Verbindung nach dem Handshake entscheidend: aktive Verbindungen, Verbindungsdauer, Verhalten bei Schließen oder Fehlern sowie die Häufigkeit von Verbindungsfehlern. Da die OpenTelemetry-Semantikkonventionen für WebSocket noch nicht stabil sind, verwendet dieses Paket benutzerdefinierte Metriken auf Verbindungsebene.

### Span-Lebenszyklus

Der WebSocket-Span bleibt offen, bis `session.closed` aufgelöst wird, und zeichnet folgende Lebenszyklusereignisse auf:

- `websocket.connected` — Session erfolgreich aufgebaut
- `websocket.closed` — Verbindung regulär geschlossen
- `websocket.error` — Verbindungsfehler

### Benutzerdefinierte Metriken

Falls `meter` angegeben ist, werden folgende defjs-spezifischen Metriken erfasst:

| Metrik                                       | Einheit        | Bedeutung                                            |
| -------------------------------------------- | -------------- | ---------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | `s`            | Zeit bis WebSocket-Session etabliert                 |
| `defjs.client.websocket.connection.duration` | `s`            | Gesamtdauer von Session-Etablierung bis Close/Fehler |
| `defjs.client.websocket.active_connections`  | `{connection}` | Aktuelle aktive WebSocket-Verbindungsanzahl          |

Standardmäßig werden **keine Spans pro Nachricht erstellt**, und **Message-Payloads, Nachrichtengrößen, Backpressure, gepufferte Datenmengen, Subprotokolle oder Wiederverbindungswarteschlangen werden nicht erfasst**. Telemetrie auf Nachrichtenebene sollte auf Anwendungsebene mit Sampling-Strategien implementiert werden.

## Sicherheitsrisiko durch Query-Propagation bei WebSocket

Browser-WebSocket-Clients können typischerweise keine beliebigen HTTP-Header setzen. Daher ist `webSocket.queryPropagation` zur Laufzeit aus Kompatibilitätsgründen standardmäßig auf `true` gesetzt. In dieser Standardeinstellung wird der Trace-Kontext in den Query-String der WebSocket-URL injiziert.

Query-Strings können von Proxys, Browsern, APM-Tools, Zugriffslogs und Netzwerk-Debugging-Werkzeugen aufgezeichnet werden. Sie können außerdem Tokens, Benutzer-IDs oder andere hochkardinale Eingaben enthalten. Falls der Propagator `baggage` einschließt, können auch `baggage`-Werte in die URL geschrieben werden und sensible Daten mitführen.

Für sicherheitssensiblen WebSocket-Produktionsverkehr solltest du Query-Propagation explizit deaktivieren; das ist die empfohlene sichere Ausgangseinstellung:

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: { queryPropagation: false },
})
```

Nach dem Deaktivieren wird der Trace-Kontext nicht mehr über die WebSocket-URL übertragen. Wenn dein Server die Verbindung weiterhin einem Trace zuordnen muss, nutze dafür auf Anwendungsebene einen anderen, bereits geprüften Korrelationsmechanismus.

## Wie geht es weiter

- [Client](/core/client) — `createClient` und vollständige Transport-Konfiguration
- [SSE](/core/sse) — `defineEventStream` und Streaming-Event-Konsumierung
- [WebSocket](/core/web-socket) — `defineWebSocket` und Echtzeitkommunikation
