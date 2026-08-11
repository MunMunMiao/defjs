---
title: Fehler
description: Behandle transportspezifische Ergebnistupel und verzweige über die einfache diskriminierte RequestError-Union.
---

# Fehler

Jeder unterstützte Transport liefert ein fehlerorientiertes Drei-Elemente-Tupel. Das dritte Element ist transportspezifisch.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP liefert dekodierte Daten und einen Defjs-`HttpResponse`-Wrapper.
- SSE liefert einen logischen Stream-Handle und den Snapshot der beim Start geöffneten Verbindung.
- WebSocket liefert eine logische Session und den Verbindungs-Snapshot vom Start.

Bei einem Fehler ist das zweite Element `undefined`. Das dritte kann ebenfalls `undefined` sein, wenn der Start scheitert, bevor der Transport den passenden Snapshot erzeugt hat.

## `RequestError`

`RequestError` ist ein einfaches diskriminiertes Objekt im Tupel. Es erweitert nicht die native Klasse `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

Die exportierte Union heißt `RequestError<TErrorData>`.

Verzweige zuerst über `kind` und bei Bedarf anschließend über `code`.

### HTTP-Statusfehler

Eine deklarierte Nicht-2xx-HTTP-Response erzeugt:

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

Die Generics stehen in der Reihenfolge Daten, dann Status. Das breite exportierte `RequestError<TErrorData>` bleibt für Anwendungsgrenzen praktisch; die Endpunktausführung liefert dagegen eine Union statusspezifischer `HttpStatusError<Data, Status>`-Zweige. Eine Prüfung von `error.status` engt `error.data` deshalb auf den für diesen Status deklarierten Body ein:

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // Für diesen Endpunkt teilen die übrigen Statuscodes 409 | 422 den Conflict-Body.
    console.error(error.data.conflict)
  }
}
```

`data` existiert nur auf `HttpStatusError`. Erhalte diese statuskorrelierte Union an der Endpunktgrenze, statt sie zu einer unverbundenen Daten-Union zu erweitern.

### Transportfehler

Ein fehlgeschlagener Netzwerkvorgang, Abbruch oder Timeout erzeugt:

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Transportfehler haben weder `data` noch `response`.

### Definitionsfehler

Fehler beim Dekodieren der Eingabe, beim Request-Aufbau, bei der Response-Dekodierung oder bei nicht deklarierten HTTP-Statuswerten können Folgendes erzeugen:

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Code                         | Aktueller Auslöser                                                                                                               |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Strukturelle Dekodierung der Eingabe fehlgeschlagen, Request-Aufbau fehlgeschlagen oder `build` hat ungültige Bindungen erzeugt. |
| `RESPONSE_VALIDATION_FAILED` | Eine deklarierte Response oder SSE-Start-Response hat die Struktur- oder Content-Prüfung nicht bestanden.                        |
| `UNDECLARED_STATUS`          | HTTP hat bei deklariertem `output` einen Status ohne passendes Output-Struct geliefert.                                          |

`UNDECLARED_STATUS` gilt sowohl für nicht zugeordnete 2xx- als auch Nicht-2xx-Statuswerte.

## Verzweigen

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

Logge `cause`, `data`, Response-Header, Bodies oder URLs nur mit einer ausdrücklich festgelegten Maskierungs- und Aufbewahrungsrichtlinie.

### Brücke zu nativem `Error`

Manche Integrationen benötigen einen geworfenen nativen `Error`. Erzeuge an dieser Grenze einen neuen Diagnosefehler und stelle standardmäßig nur die stabilen Klassifizierungen `kind`, `code` und den verfügbaren HTTP-`status` bereit:

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

Der neu erzeugte Fehler behält seinen eigenen Stack an dieser Grenze. Die Brücke hängt niemals den rohen `cause`, dessen Meldung oder Stack-Frames, `data`, Response-Header oder -Bodies sowie Request- oder Response-URLs an und kopiert sie auch nicht. Stack-Frame-Strings können selbst URLs und Geheimnisse enthalten; ausgewählte Ursache-Frames zu kopieren ist daher kein sicherer Standard. Das ausführbare Projekt `examples/observability-redacted-logging` prüft den erhaltenen Status 404 und stellt sicher, dass Response-Daten sowie ein absichtlich mit einem Geheimnis versehener Ursache-Stack nicht offengelegt werden.

## Verfügbarkeit der Response

`HttpResponse` ist ein Defjs-Wrapper, kein natives `Response`-Objekt. Er stellt Status, Statustext, Header, URL, Body, `error` und `ok` bereit. `ok` bedeutet nur, dass der Status im 2xx-Bereich liegt. `error` ist Transport- oder Body-Repräsentationsfehlern vorbehalten; eine normale Nicht-2xx-Response lässt es leer.

Ein gültiger deklarierter Nicht-2xx-Body wird per Struct dekodiert und typisiert in `HttpStatusError.data` erhalten. Eine ungültige Repräsentation erzeugt stattdessen `RESPONSE_VALIDATION_FAILED` mit der ursprünglichen Codec-Ausnahme als `cause`, einer Response, wenn sie empfangen wurde, und ohne `data`.

Für HTTP gilt:

- Ein deklarierter HTTP-Statusfehler hat `error.response`.
- Fehler bei der Output-Dekodierung und nicht deklarierte Statuswerte können `error.response` haben.
- Bei Request-Validierung, Abbruch vor einer Response, geworfenen Interceptor-Fehlern und Status-0-Transportfehlern kann die Tupel-Response fehlen.

Bei SSE kann ein fehlgeschlagener Start trotzdem im dritten Element einen Open-Snapshot liefern, wenn eine Response vor der Content- oder Statusprüfung eingetroffen ist. Bei WebSocket kann ein fehlgeschlagener Start nur dann einen Verbindungs-Snapshot liefern, wenn einer erfasst wurde.

## Fehler-Factorys und Konstanten

Der zentrale Paketeinstieg exportiert Factory-Funktionen für Integrationscode:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` normalisiert Abbruch-, Timeout- und sonstige Ursachen.
- `createDefinitionError(code, cause, response?)` erzeugt einen Definitionsfehler.
- `createHttpStatusError(status, message, response, data?)` erzeugt einen HTTP-Statusfehler.
- `ERR_ABORTED` und `ERR_TIMEOUT` sind gemeinsam verwendete `Error`-Werte, die der Normalisierer erkennt.

Diese Helper erzeugen einfache `RequestError`-Objekte. Sie werfen sie nicht.

Die eingebauten Command-Pfade wandeln erwartete Startfehler in Tupel um. Das gilt nicht automatisch für beliebigen Erweiterungscode: Eigene Interceptors und Anwendungscallbacks können werfen, und ein nicht unterstützter Command lässt die breit typisierte Runtime-Implementierung ablehnen.

## Weiter

- [HTTP](/de-DE/core/http) erklärt Statusauswahl und Response-Dekodierung.
- [SSE](/de-DE/core/sse) trennt Startfehler von Fehlern nach dem Öffnen.
- [WebSocket](/de-DE/core/web-socket) behandelt Laufzeitfehler und endgültiges Schließen.
