---
title: OpenTelemetry Server
description: Instrumentiere ausgehende Defjs-Clients für HTTP, SSE und WebSocket mit einem von der Anwendung bereitgestellten OpenTelemetry-Tracer und optionalem Meter.
---

# `@defjs/opentelemetry-server`

Trotz seines Paketnamens instrumentiert dieser Adapter ausgehende Arbeit von Defjs-Clients. Er ist keine Instrumentierung eingehender Serverrequests und initialisiert kein OpenTelemetry SDK.

Die Anwendung ist verantwortlich für:

- Einrichtung von SDK und Providern;
- Konfiguration von Exportern und Prozessoren;
- Context Manager und Einrichtung des aktiven Contexts;
- Sampling, Attributrichtlinie und Maskierung sensibler Daten;
- Force-Flush und Shutdown.

Übergib einen von der Anwendung bereitgestellten `Tracer` und optionalen `Meter` an `withOpenTelemetryServer(...)`.

## Client konfigurieren

```typescript
import { createClient, withEndpoint } from '@defjs/core'
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

Der Adapter fügt für jeden aktivierten Transport einen Interceptor hinzu. Optionen laufen in der normalen Client-Reihenfolge. Die Position relativ zu anderen Interceptors bestimmt daher, welche Arbeit die Spans umschließen.

## Optionen

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

Jede Transportoption akzeptiert `enabled?: boolean`, `requestHook` und `responseHook`. WebSocket akzeptiert zusätzlich `queryPropagation?: boolean`.

Alle drei Transports sind standardmäßig aktiviert. Deaktiviere einen Transport mit einem Optionsobjekt:

```typescript
withOpenTelemetryServer({
  tracer,
  http: { enabled: false },
  sse: { enabled: true },
  webSocket: { enabled: false },
})
```

Alte boolesche Transportfelder, Hooks auf oberster Ebene und `webSocketQueryPropagation` werden zur Laufzeit mit Migrationsfehlern zurückgewiesen. Die aktuellen Formen sind transportspezifische Optionsobjekte, transportspezifische Hooks und `webSocket.queryPropagation`.

## Propagierung

Wenn `propagator` fehlt, erzeugt das Paket einen eigenen `CompositePropagator` aus W3C Trace Context und W3C Baggage. Es liest nicht die globale Propagator-Konfiguration.

HTTP und SSE injizieren jedes Feld dieses Propagators in die Request-Header. Ist `req.headers` bereits eine `Headers`-Instanz, verwendet und verändert die aktuelle Implementierung dieselbe Instanz. Andernfalls legt sie ein neues `Headers`-Objekt an. Für WebSocket ist Query-Propagierung standardmäßig `false`. Nur `queryPropagation: true` aktiviert sie; weil Browser-Sockets keine beliebigen Handshake-Header setzen können, wird dann jedes vom Propagator erzeugte Feld an den Query-String der Verbindung angehängt.

Vor der Span-Erzeugung ruft jeder Interceptor außerdem `propagator.extract(...)` für die Request-Header auf. Behandle diesen Carrier als vertrauenswürdige Eingabe unter Kontrolle der Anwendung. Lass nicht zu, dass nicht vertrauenswürdige Aufrufer `traceparent`, `tracestate` oder `baggage` liefern: Diese Felder können den aktiven Parent-Kontext ersetzen. Entferne oder normalisiere nicht vertrauenswürdige Propagierungsfelder, bevor der Request diesen Interceptor erreicht.

```typescript
withOpenTelemetryServer({
  tracer,
  webSocket: {
    queryPropagation: true,
  },
})
```

Prüfe die URL-Propagierung, bevor du sie aktivierst. Trace Context und Baggage können in Browsern, Proxys, Zugriffslogs und Telemetriesystemen aufgezeichnet werden. Ein eigener Propagator kann mehr Felder als `traceparent` hinzufügen. Bevorzuge ein im Protokoll geprüftes erstes Frame oder ein kurzlebiges, einmal verwendbares Verbindungsticket, wenn der Server dies unterstützt.

`requireParentSpan: true` prüft auf einen aktiven Parent-Span, bevor der Interceptor irgendeine Instrumentierung ausführt. Ohne aktiven Span überspringt er Span-Erzeugung, Propagierung, Hooks und Metriken und ruft den nächsten Handler unverändert auf.

## Verhalten von Hooks

Hooks erhalten den transportspezifischen Span und Request beziehungsweise das Ergebnis:

```typescript
withOpenTelemetryServer({
  tracer,
  http: {
    requestHook(span, request) {
      span.setAttribute('app.operation', 'list-orders')
    },
    responseHook(span, response) {
      span.setAttribute('app.result_class', response.status < 500 ? 'accepted' : 'server-error')
    },
  },
})
```

Hooks dürfen `void` oder `Promise<void>` zurückgeben und bleiben nicht blockierend. Synchrone Fehler und asynchrone Ablehnungen werden abgefangen und als `defjs.otel.hook.error` aufgezeichnet, ohne die Client-Operation zu stoppen; auch Fehler beim Aufzeichnen dieser Telemetrie werden isoliert.

Verwende erlaubte Attribute mit niedriger Kardinalität. Hänge keine rohen Header, Query-Strings, Bodies, Baggage-Werte, Event-IDs, Nachrichten-Payloads oder Credentials an.

## HTTP-Semantik

Der HTTP-Interceptor erzeugt einen Span mit `SpanKind.CLIENT` und zeichnet auf:

- `http.request.method`;
- `url.full`;
- `server.address` und optional `server.port`;
- nach einer Response `http.response.status_code`.

Das ist keine Zusage vollständiger Konformität mit den HTTP-Semantikkonventionen.

Das aktuelle Statusverhalten ist enger, als viele Anwendungen erwarten:

- Status `500` und höher markiert den Span als `ERROR`.
- Status `400` bis `499` markiert ihn als `OK`.
- Eine Defjs-Transportresponse mit Status 0 markiert ihn als `OK`.
- Ein durch den Interceptor geworfener Fehler markiert ihn als `ERROR` und zeichnet eine Exception auf.

Der HTTP-Span endet, wenn der HTTP-Interceptor den Defjs-`HttpResponse` erhält. High-Level-Statusauswahl und Struct-Dekodierung erfolgen erst nach der Rückgabe des Interceptors. Ein späteres `RESPONSE_VALIDATION_FAILED` oder `UNDECLARED_STATUS` kann den bereits beendeten Span daher nicht aktualisieren.

Bei einem bereitgestellten Meter zeichnet HTTP `http.client.request.duration` in Sekunden auf. Zu den Attributen gehören Methode, Serveradresse und -port, optionaler Response-Status und bei geworfenen Fehlern optional `error.type`.

## SSE-Semantik

Nach einem erfolgreichen SSE-Start bleibt der Span offen, bis `stream.closed` erfüllt ist. Er zeichnet `sse.connected` und anschließend auf den abgedeckten Close-Pfaden `sse.closed`, `sse.aborted` oder `sse.error` auf.

Mit einem Meter instrumentiert SSE:

| Metrik                                 | Bedeutung                                                                |
| -------------------------------------- | ------------------------------------------------------------------------ |
| `defjs.client.sse.connect.duration`    | Zeit, bis der logische Stream-Handle zurückgegeben wird.                 |
| `defjs.client.sse.connection.duration` | Zeit von der Handle-Rückgabe bis zum endgültigen Schließen.              |
| `defjs.client.sse.active_streams`      | Anzahl logischer Handles, deren `closed`-Promise noch nicht erfüllt ist. |

Das sind Defjs-eigene Metriken. Der aktive Zähler schließt Zeiten zwischen physischen Reconnect-Versuchen ein. Er zählt nicht die aktuell geöffneten HTTP-Verbindungen.

## WebSocket-Semantik

Nach einem erfolgreichen Start bleibt der WebSocket-Span offen, bis `session.closed` erfüllt ist. Er zeichnet `websocket.connected` und auf abgedeckten Pfaden anschließend `websocket.closed` oder `websocket.error` auf.

Die WebSocket-Instrumentierung mit Meter verwendet:

| Metrik                                       | Bedeutung                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `defjs.client.websocket.connect.duration`    | Zeit, bis die logische Session zurückgegeben wird.                        |
| `defjs.client.websocket.connection.duration` | Zeit von der Session-Rückgabe bis zum endgültigen Schließen.              |
| `defjs.client.websocket.active_connections`  | Anzahl logischer Sessions, deren `closed`-Promise noch nicht erfüllt ist. |

Der Metrikname spricht von Verbindungen, die Implementierung zählt jedoch logische Sessions einschließlich Verzögerungen zwischen Reconnect-Versuchen. Sie zählt keine physischen Sockets.

Allgemeine WebSocket-Semantikkonventionen sind hier nicht stabil. Das Paket erzeugt standardmäßig weder einen Span pro Nachricht noch zeichnet es Payloads oder Warteschlangenlängen auf.

## Sensible Daten und Grenzen der Abdeckung

Das standardmäßige `url.full` wird aus Request-Endpunkt und Basisendpunkt statt aus dem serialisierten Query-String aufgelöst. Aufgelöste Pfade können trotzdem sensible Bezeichner enthalten. Die WebSocket-Propagierung hängt Felder separat an den tatsächlichen Query-String an.

`recordException(...)` erhält geworfene Fehler und ausgewählte Close-Ursachen. Fehlermeldungen und Stacks können sensible Daten offenlegen. Konfiguriere die Maskierung sensibler Daten in SDK-Prozessoren und Exportern entsprechend; dieser Adapter bereinigt Exceptions nicht für die Anwendung.

Validiere den Adapter vor dem Deployment mit SDK, Exportern, Prozessoren, Context Manager und automatischer Instrumentierung deines Dienstes. Prüfe durchgängiges Baggage, Maskierung sensibler Daten, Shutdown/Flush und doppelte Spans unter realem Traffic.

## Weiter

- [Interceptors](/de-DE/core/interceptors) erklärt die Reihenfolge relativ zu anderen Client-Interceptors.
- [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären die Lebenszeiten der hier gezählten logischen Handles und Sessions.
