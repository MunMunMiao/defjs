---
title: Erste Schritte
description: Installiere Defjs, definiere einen typisierten HTTP-Endpunkt, erstelle einen Client und nutze ihn in deiner Anwendung.
---

# Erste Schritte

Mit Defjs beschreibst du einen API-Vertrag einmal und verwendest ihn anschließend mit typisierten Eingaben, Laufzeitdekodierung und klaren Transportergebnissen in deiner Anwendung.

## Installation

Füge das Core-Paket zu deiner Anwendung hinzu:

```sh
pnpm add @defjs/core
```

Verwende den entsprechenden npm-, Yarn- oder Bun-Befehl, wenn dein Projekt einen anderen Paketmanager nutzt. `@defjs/core` ist ESM. Für die Ausführung unter Node.js verlangt die aktuelle Paketmetadaten Node 22 oder neuer.

Gepackte ESM-HTTP-Consumer wurden mit Node.js 22, 24 und 26, Bun 1.3.14 sowie Deno 2.9.5 ausgeführt. Nach dem Kompilieren deiner Anwendung sehen die zugehörigen Befehle so aus:

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

Der Deno-Befehl verwendet bereits in `node_modules` installierte Pakete; ersetze die Netzwerkfreigabe durch die genauen API-Hosts deiner Anwendung. Die Bun- und Deno-Prüfungen decken den dokumentierten HTTP-Ausschnitt ab, nicht jede Plattform-API oder jeden Transport. Browser-Builds verwenden ihren normalen Bundler und die erforderlichen Fetch- und WebSocket-Funktionen der Plattform.

Laufzeitübergreifende Tests sollten stabile Defjs-Felder wie `error.kind` und `error.code` prüfen. Verlasse dich nicht auf enginespezifische native `Error`-Meldungen oder JSON-Parse-Texte; Node.js, Bun und Deno können diese Details unterschiedlich formatieren.

Installiere einen Adapter nur, wenn deine Anwendung ihn braucht:

| Anwendungssetup              | Pakete                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                    | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                       | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| Serverseitiges OpenTelemetry | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Dokumentation und installierte Version müssen zusammenpassen
Diese Seiten beschreiben die API dieser Dokumentationsversion. Prüfe, welche Version deine Anwendung installiert hat. Weicht ein Export oder eine Option ab, verwende die Dokumentation und Release Notes dieser Version, statt Beispiele verschiedener Versionen zu mischen.
:::

## Erste Anfrage definieren

Angenommen, deine API stellt `GET /users/:id` bereit. Ersetze Basis-URL und Response-Structs durch den tatsächlichen Vertrag deines Dienstes.

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
  ],
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` gibt einen **Command-Builder** zurück. Der Aufruf `getUser(...)` erzeugt einen **Command**, der die Endpunktdefinition und die Eingabe dieses Aufrufs hält. `client.execute(...)` liefert anschließend ein HTTP-Drei-Elemente-Tupel:

```typescript
;[error, result, response]
```

Bei Erfolg ist `error` gleich `null`, `result` enthält die dekodierten Ausgabedaten und `response` ist ein Defjs-`HttpResponse`-Wrapper. Bei einem Fehler ist `result` gleich `undefined`; auch der Response-Wrapper ist `undefined`, wenn keine Response eingetroffen ist.

### Statusliterale bleiben automatisch erhalten

`defineRequest(...)` verwendet für `output` ein Const-Generic. Inline-Arrayeinträge und gruppierte Statusarrays behalten deshalb ihre Literalwerte automatisch. Du brauchst kein `as const`, um abgeleitete 2xx-Erfolgs-Bodies von Nicht-2xx-Fehler-Bodies zu trennen.

Auch die Objektform von `output` wird unterstützt:

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## In deiner Anwendung einsetzen

Lege Endpunktdefinitionen in Modulen ab, die deine Service-API beschreiben. Verwende die Command-Builder aus Komponenten, Route-Handlern, Jobs oder Stores. Erstelle den Client an der Grenze, die Endpunkt, Credentials, Interceptors und Lebenszyklus besitzt:

- Eine Browseranwendung kann meist einen Client gemeinsam verwenden.
- Beim Server-Rendering braucht jede Anfrage einen eigenen Client, wenn Header, Cookies, Benutzer oder Mandanten variieren.
- Code, der SSE- oder WebSocket-Ressourcen öffnet, muss sie auch konsumieren und schließen.

## Nächste Schritte

- [Commands](/de-DE/core/commands) erklärt automatisches Request-Mapping und eigene schemagebundene Projektionen.
- [Fehler](/de-DE/core/errors) dokumentiert alle drei Transporttupel und die Union `RequestError`.
- [HTTP](/de-DE/core/http) behandelt URL-Auflösung, Request-Bodies, Output-Dekodierung, Abbruch und XSRF-Verhalten.
- [Beispiele](/de-DE/guide/examples) verbindet diese Verträge zu Rezepten, deren Lebenszyklus die Anwendung verwaltet.
