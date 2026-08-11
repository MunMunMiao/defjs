---
title: HTTP
description: Baue HTTP-URLs und Bodies, ordne Response-Structs zu, brich Arbeit ab, konfiguriere Credentials und XSRF und verstehe die Fetch-Grenze.
---

# HTTP

`defineRequest(...)` erzeugt einen HTTP-Command-Builder. [Commands](/de-DE/core/commands) behandelt Definitionen und Eingabeprojektionen; diese Seite beschreibt Wire-Verhalten und Lebenszyklus von HTTP.

## HTTP-spezifischer Client-Einstieg

`@defjs/core/http` ist ein additiver, HTTP-spezifischer Einstieg. Er exportiert `createHttpClient(...)` zusammen mit HTTP-Commands und HTTP-kompatiblen Client-Optionen:

```typescript
import { createHttpClient, defineRequest, struct, withEndpoint } from '@defjs/core/http'

const httpClient = createHttpClient(withEndpoint('https://api.example.com'))
```

Verwende ihn, wenn ein Consumer bewusst nur HTTP unterstützt. Er ersetzt den Root-Einstieg nicht: `createClient(...)` aus `@defjs/core` bleibt der Client für HTTP-, SSE- und WebSocket-Commands.

## URL-Aufbau

`withEndpoint(...)` muss eine absolute Basis-URL erhalten. Ihr Pfad bleibt als Verzeichnis erhalten:

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Fehlt am Basispfad der abschließende Slash, wird er ergänzt. Query und Hash des Basisendpunkts werden verworfen.

`path`-Werte eines Endpunkts sind relative Vertragspfade. Ein führender Slash ist zulässig und wird vor der Auflösung entfernt, sodass er das Basisverzeichnis nicht ersetzt. Die Laufzeit weist Folgendes zurück:

- absolute und protokollrelative URLs;
- Pfade mit `?`;
- Pfade mit `#`.

Pfadplatzhalter verwenden `:name`:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Übergib rohe Platzhalterwerte. Defjs serialisiert jeden Skalar, weist leere Werte sowie die vollständigen Werte `.` und `..` zurück und wendet vor dem Einsetzen genau einmal `encodeURIComponent` an. `/`, `?`, `#`, `%`, Leerzeichen und Unicode bleiben dadurch in einem Pfadsegment. Kodiere Werte nicht vor; `%` gilt als Roheingabe und wird zu `%25` kodiert.

## Request-Kodierung

Verwende `struct.request(...)` für direkte Wire-Zuordnung:

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

Body-Structs legen Kodierung und Standard-Content-Type fest:

| Body-Struct                | Wire-Body             | Standard-`Content-Type`                            |
| -------------------------- | --------------------- | -------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                 |
| `struct.text()`            | String                | `text/plain;charset=UTF-8`                         |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8`  |
| `struct.formData(shape)`   | `FormData`            | Von der Plattform gesetzt, einschließlich Boundary |
| `struct.blob()`            | `Blob`                | Blob-Typ oder `application/octet-stream`           |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                         |

Ein eigenes `build` kann die entsprechenden Methoden des HTTP-Builders verwenden. Setter ersetzen den jeweiligen Request-Teil; `addHeaders`, `addFormData` und `addFormUrlEncoded` hängen an den aktuellen Teil an. Alle Werte müssen aus der schemagebundenen Projektion stammen.

### Query-Werte

Der Standardencoder akzeptiert flache skalare Werte und Arrays aus skalaren Werten. Verschachtelte Objekte scheitern beim Request-Aufbau.

`withQueryParamsSerializer((params, rawParams) => string)` kann ändern, wie bereits akzeptierte flache Werte ausgegeben werden. Die Funktion erhält eine `URLSearchParams`-Ansicht und den kodierten flachen Record. Sie macht verschachtelte Query-Objekte nicht gültig; diese werden vor der Serialisierung zurückgewiesen.

Aliasse werden zu ausgehenden Query-, Pfad- und Header-Schlüsseln. Der aufrufende Code verwendet weiterhin die logischen Struct-Feldnamen.

## Status und Output-Dekodierung

`output` ordnet Statuscodes Response-Structs zu:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
    { status: 409, body: struct.object({ conflict: struct.string() }) },
  ],
})
```

Die Laufzeit wählt das Struct über den exakten Status. Sobald `output` deklariert ist, erzeugt jeder nicht zugeordnete Status `UNDECLARED_STATUS`. Deklarierte 2xx-Bodies bilden die Union der Erfolgsdaten. `defineRequest(...)` verwendet einen const-Generic, sodass Inline-Statuswerte ihre Literale ohne `as const` behalten; die HTTP-Fehlerunion hält jeden Nicht-2xx-Status mit seinem `error.data`-Body verknüpft.

```typescript
const [statusError] = await client.execute(getUser({ path: { id: 42 } }))

if (statusError?.kind === 'http') {
  if (statusError.status === 404) {
    console.error(statusError.data.message)
  } else {
    // status ist 409 und data ist der deklarierte Konflikt-Body.
    console.error(statusError.data.conflict)
  }
}
```

`response.ok` bedeutet nur `status >= 200 && status < 300`. Es sagt nichts darüber aus, ob Output-Dekodierung, fachliche Validierung oder Autorisierung erfolgreich waren.

Wenn `output` deklariert und `responseType` nicht angegeben ist, wird standardmäßig als `json` geparst. Explizite Modi sind `json`, `text`, `blob` und `arraybuffer`. Anschließend führt das gewählte Struct die strukturelle Dekodierung aus. Ohne `output` ist `responseType` nicht zulässig, die Ergebnisdaten sind `undefined`, und der zurückgegebene Response-Wrapper hat `body: null`. Die Laufzeit versucht den Response-Body bestmöglich abzubrechen, statt ihn zu lesen oder zu dekodieren.

Die Klassifikation des Command-Ergebnisses hat eine feste Priorität: Transportfehler bei Status 0 → kein `output` → exakte Statuszuordnung oder `UNDECLARED_STATUS` → `response.error` → Struct-Dekodierung. Body-Repräsentationsfehler können daher nur bei deklariertem `output` auftreten; ein nicht deklarierter Status hat weiterhin Vorrang, falls Fetch einen solchen Fehler aufgezeichnet hat.

### Repräsentationsfehler

Wenn bei einem exakt zugeordneten deklarierten Output JSON oder ein anderer Body-Codec fehlschlägt, behält Fetch die ursprüngliche Ausnahme in `HttpResponse.error`. Die Command-Ausführung stoppt vor dem Output-Struct und gibt `[RESPONSE_VALIDATION_FAILED, undefined, response]` zurück; die Ausnahme bleibt als `cause` erhalten und es gibt keine typisierten `error.data`.

Eine normale Nicht-2xx-Response setzt `response.error` nicht. Ihr Status wird durch `status` und `ok` dargestellt. Sind Nicht-2xx-Status und Body deklariert und der Body gültig, wird das Struct dekodiert und der resultierende `HTTP_STATUS`-Fehler behält den typisierten Body in `error.data`.

## Das HTTP-Ergebnis

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

Bei Erfolg ist `response` ein Defjs-`HttpResponse`-Wrapper, dessen Body zu `data` passt. Bei einem Fehler hängt seine Verfügbarkeit davon ab, wie weit die Ausführung fortgeschritten ist. Die genaue Einteilung steht unter [Fehler](/de-DE/core/errors).

## Abbruch und Timeout

Die HTTP-Ausführung akzeptiert `abort`, `signal` und `timeout`:

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` wird mit dem internen Signal des Clients und einem positiven Timeout zusammengeführt. Das separate Feld `abort` ist eine weitere, von der aktuellen API beibehaltene Abbruchoption. `abort` und `timeout` dürfen nicht gemeinsam gesetzt werden; in diesem Fall wird `REQUEST_VALIDATION_FAILED` zurückgegeben. `signal` lässt sich mit jedem der beiden Felder kombinieren.

Für die Ausführung von HTTP, SSE und WebSocket muss `timeout` eine positive sichere Ganzzahl im Bereich `1..2_147_483_647` sein; `0`, negative oder gebrochene Werte, `NaN`, `Infinity` und Werte oberhalb der Grenze liefern `REQUEST_VALIDATION_FAILED`, bevor eine Request-, Stream- oder Socket-Ressource erzeugt wird.

Ein erkannter Abbruch erzeugt `ABORTED`. Die Ursache von `AbortSignal.timeout(...)` oder ein Ausführungs-Timeout erzeugt `TIMEOUT`. Andere Fetch-Fehler erzeugen `NETWORK_ERROR`.

## Credentials und XSRF

`withCredentials(true)` setzt für HTTP und SSE die Fetch-Option `credentials: 'include'`. Bei `false` bleibt die Fetch-Option ungesetzt; `omit` wird nicht erzwungen. Diese Einstellung fügt keinen `Authorization`-Header hinzu und konfiguriert keine WebSocket-Authentifizierung.

`withXSRF(...)` gilt nur für HTTP-Requests. Die Standardwerte sind:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

Die Injektion wird für die nach RFC sicheren Methoden `GET`, `HEAD`, `OPTIONS` und `TRACE` übersprungen. Bei jeder anderen Methode, einschließlich benutzerdefinierter unsicherer Methoden wie `PROPPATCH`, gelten vor der Injektion dieselben Prüfungen auf einen bereits vorhandenen Header, dieselbe Origin und ein Token. Ein bereits gesetzter konfigurierter Header bleibt erhalten. Im Browser ist die Cookie-Suche auf Requests derselben Origin beschränkt. Außerhalb eines Browsers musst du einen synchronen `tokenProvider` angeben; er hat Vorrang vor der Cookie-Suche.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

Halte Token-Provider auf dem Server Request-bezogen. `withCredentials(true)` macht Cross-Origin-Browsercookies nicht für JavaScript lesbar und löst keine Cross-Origin-XSRF-Header-Injektion aus.

## Fortschrittsbeobachter

`onDownloadProgress` meldet gelesene Bytes, während der Fetch-Response-Body verarbeitet wird. `lengthComputable` ist nur bei einem positiven `Content-Length` gleich `true`.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` beobachtet nur einen Request-Body vom Typ `ReadableStream<Uint8Array>`. Die aktuellen High-Level-Command-Builder bieten Projektionssetter für Blob und ArrayBuffer, aber keinen Setter für einen rohen Stream. Deshalb gibt es kein reguläres `defineRequest`-Beispiel, das den für diese Option nötigen Stream liefern kann. Stelle einen konstruierten Stream nicht als funktionierenden High-Level-Command-Body dar.

Fortschrittscallbacks laufen direkt im Lese- oder Schreibpfad des Transports. Halte sie klein und frei von Exceptions.

## Low-Level-Fetch-Grenze

`fetchHandler(httpRequest, fetchImpl?)` wird exportiert. Die Funktion wandelt den Defjs-`HttpRequest` in einen nativen `Request` um, ruft Fetch auf, parst die gewählte Response-Repräsentation und liefert einen Defjs-`HttpResponse`-Wrapper. Fetch-Fehler werden zu Wrappern mit Status 0.

Ein direkter Aufruf von `fetchHandler` umgeht:

- Dekodierung der Command-Eingabe und Request-Projektion;
- Statusauswahl des HTTP-Outputs und Struct-Dekodierung;
- Interceptor-Orchestrierung des Clients;
- Umwandlung in das High-Level-`RequestError`-Tupel.

Es handelt sich um eine exportierte Low-Level-Grenze, nicht um den empfohlenen Command-Ablauf. Eine langfristige Stabilitätszusage wird hier nicht gegeben.

## Weiter

- [Interceptors](/de-DE/core/interceptors) behandelt Request-Kopien, Short-Circuiting und Retry.
- [Fehler](/de-DE/core/errors) dokumentiert HTTP-Status-, Transport- und Definitionsfehler.
- [Struct](/de-DE/core/struct) erklärt strikte strukturelle Dekodierung.
