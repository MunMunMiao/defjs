---
layout: home

hero:
  name: Defjs
  text: Typisierte Commands für HTTP, SSE und WebSocket
  tagline: Definiere Wire-Formen mit Structs, erstelle explizite Clients und behalte Ergebnisse und Lebenszyklen der einzelnen Transports im Blick.
  actions:
    - theme: brand
      text: Erste Schritte
      link: /de-DE/guide/getting-started
    - theme: alt
      text: Auf GitHub ansehen
      link: https://github.com/defjs/defjs

features:
  - title: Endpunktverträge
    details: Trenne Endpunktdefinitionen, Command-Builder und Commands. Structs dekodieren Eingaben der Aufrufer und Transportdaten zur Laufzeit.
  - title: Transportspezifische Ergebnisse
    details: HTTP, SSE und WebSocket liefern jeweils ein fehlerorientiertes Drei-Elemente-Tupel. An dritter Stelle steht je nach Transport ein Response-Wrapper, ein Snapshot der beim Start geöffneten SSE-Verbindung oder ein Snapshot der beim Start geöffneten WebSocket-Verbindung.
  - title: Interceptor-Ketten
    details: Registriere HTTP-, SSE- und WebSocket-Interceptors am Client. Jeder Transport filtert seine eigenen Interceptors und führt sie in Onion-Reihenfolge aus.
  - title: Expliziter Lebenszyklus
    details: SSE kann Netzwerk- und Lesefehler erneut versuchen. WebSocket-Reconnect ist optional. Die Anwendung bleibt für Iteration, Abbruch und endgültiges Schließen verantwortlich.
  - title: Dekodierung zur Laufzeit
    details: Dekodiere Eingaben, Responses, Stream-Events und WebSocket-Nachrichten mit denselben Struct-Verträgen, die auch die TypeScript-Inferenz steuern.
  - title: Anwendungsintegrationen
    details: Teile Clients über Vue oder React und ergänze serverseitige Dienste um ausgehende OpenTelemetry-Instrumentierung.
---

## Einen typisierten API-Client bauen

Beschreibe zuerst den HTTP-, SSE- oder WebSocket-Vertrag, den deine Anwendung aufruft. Defjs erzeugt daraus einen Command-Builder, prüft Daten zur Laufzeit und hält das Transportergebnis sichtbar.

Der zentrale HTTP-Ablauf ist klein: Erstelle einen Client für deine API, definiere einen Endpunkt, rufe seinen Command-Builder auf und führe den Command aus.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

Richte den Client auf den Dienst deiner Anwendung und passe die Structs an dessen tatsächlichen Response-Vertrag an. Credentials, UI-Zustand, Retries, Abbruch und Ressourcenbereinigung bleiben Aufgabe deiner Anwendung.

## Weiterlesen

- [Erste Schritte](/de-DE/guide/getting-started) installiert das Paket und führt deine Anwendung durch die erste typisierte Anfrage.
- [Client](/de-DE/core/client) beschreibt die Optionskomposition und die drei `execute`-Overloads.
- [Commands](/de-DE/core/commands) erklärt Endpunktdefinitionen, Command-Builder, Commands und schemagebundene Projektionen.
- [HTTP](/de-DE/core/http), [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) dokumentieren Transportverhalten und Lifecycle-Verantwortung.
- [Vue](/de-DE/plugins/vue), [React](/de-DE/plugins/react) und [OpenTelemetry Server](/de-DE/plugins/opentelemetry-server) zeigen die Einbindung in Framework und Telemetrie deiner Anwendung.
