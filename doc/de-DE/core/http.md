---
title: HTTP
description: Baue HTTP-URLs und Bodies, ordne Response-Structs zu, brich Arbeit ab, konfiguriere Credentials und XSRF und verstehe die Fetch-Grenze.
---

# HTTP

`defineRequest(...)` erzeugt einen HTTP-Command-Builder. [Commands](/de-DE/core/commands) behandelt Definitionen und Eingabeprojektionen; diese Seite beschreibt Wire-Verhalten und Lebenszyklus von HTTP.

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

Werte für Platzhalter werden ohne Kodierung als Pfadsegment eingesetzt. Begrenze erlaubte Bezeichner oder rufe für ein nicht vertrauenswürdiges Segment `encodeURIComponent` auf, bevor du den Command erzeugst. Ein nicht kodierter Slash oder ein Punktsegment kann den aufgelösten Pfad verändern; ein eingesetztes `?` oder `#` führt dazu, dass die Endpunktpfadprüfung den Request zurückweist.

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
  ] as const,
})
```

Die Laufzeit wählt das Struct über den exakten Status. Sobald `output` deklariert ist, erzeugt jeder nicht zugeordnete Status `UNDECLARED_STATUS`. Deklarierte 2xx-Bodies bilden die Union der Erfolgsdaten; deklarierte Nicht-2xx-Bodies bilden `error.data`.

`response.ok` bedeutet nur `status >= 200 && status < 300`. Es sagt nichts darüber aus, ob Output-Dekodierung, fachliche Validierung oder Autorisierung erfolgreich waren.

Wenn `output` deklariert und `responseType` nicht angegeben ist, wird standardmäßig als `json` geparst. Explizite Modi sind `json`, `text`, `blob` und `arraybuffer`. Anschließend führt das gewählte Struct die strukturelle Dekodierung aus. Ohne `output` sind die Ergebnisdaten `undefined`, und der zurückgegebene Response-Wrapper hat `body: null`.

### Aktueller Fehler bei ungültigem JSON

::: danger Ungültiges JSON kann als Erfolg erscheinen
Die aktuelle Fetch-Grenze speichert einen JSON-Parsefehler in `HttpResponse.error` und lässt den Body auf `null`. Die HTTP-Command-Ausführung prüft diesen Parsefehler nicht, bevor sie das Output-Struct anwendet. Da ein nicht-nullable `null` zu einem Struct-Zero-Value dekodiert werden kann, kann ein ungültiger 2xx-JSON-Body derzeit `[null, zeroValue, response]` erzeugen.

Betrachte einen mit Zero Values gefüllten Erfolg nicht als Beleg dafür, dass der Server gültiges JSON gesendet hat. Dafür sind eine Implementierungskorrektur und ein Regressionstest nötig; die Dokumentation kann nur warnen.
:::

## Das HTTP-Ergebnis

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

Bei Erfolg ist `response` ein Defjs-`SettledResponse`-Wrapper, dessen Body zu `data` passt. Bei einem Fehler hängt seine Verfügbarkeit davon ab, wie weit die Ausführung fortgeschritten ist. Die genaue Einteilung steht unter [Fehler](/de-DE/core/errors).

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

Die Injektion wird nur für `POST`, `PUT`, `PATCH` und `DELETE` versucht. Ein bereits gesetzter konfigurierter Header bleibt erhalten. Im Browser ist die Cookie-Suche auf Requests derselben Origin beschränkt. Außerhalb eines Browsers musst du einen synchronen `tokenProvider` angeben; er hat Vorrang vor der Cookie-Suche.

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
- [Struct](/de-DE/core/struct) erklärt strukturelle Dekodierung mit Zero Values.
