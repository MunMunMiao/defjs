---
title: SSE
description: Definiere und dekodiere Server-Sent Events, behandle den Start, konsumiere die gemeinsame Eventwarteschlange, konfiguriere Reconnect und schließe eigene Streams.
---

# SSE

`defineEventStream(...)` erzeugt einen SSE-Command-Builder. Ein Endpunkt deklariert seinen Pfad und das Struct für jeden Eventnamen.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: struct.json(
      struct.object({
        id: struct.number(),
        text: struct.string(),
      }),
    ),
    heartbeat: struct.string(),
  },
})
```

Die Methode ist standardmäßig `GET`. Ein Endpunkt kann eine andere Methode setzen, der High-Level-SSE-Build-Context unterstützt jedoch keinen Request-Body.

## Event-Dekodierung

Der SSE-Parser wählt zuerst `events[eventName]` und anschließend, falls vorhanden, `events.default`. Gibt es keinen Treffer, verwirft er das Event und meldet dem optionalen Invalid-Event-Beobachter den Grund `missing-struct`.

SSE-`data:` trifft als Text ein:

- `struct.string()`, `struct.text()`, `struct.any()` und `struct.unknown()` erhalten Text.
- `struct.number()` entfernt umgebenden Whitespace und akzeptiert eine endliche Zahl.
- `struct.boolean()` entfernt umgebenden Whitespace und akzeptiert nur `true` oder `false`.
- `struct.json(inner)` parst JSON-Text und dekodiert das Ergebnis anschließend strukturell mit `inner`.

Ein einfaches `struct.object(...)` parst keinen JSON-artigen Eventtext. Umschließe es mit `struct.json(...)`.

Ein `default`-Struct behandelt ansonsten nicht deklarierte Namen:

```typescript
const events = defineEventStream({
  path: '/events',
  events: {
    update: struct.json(struct.object({ version: struct.number() })),
    default: struct.string(),
  },
})
```

Ohne ein `default`-Struct ist `EventStreamData<TEvents>` eine diskriminierte Union der deklarierten Eventnamen. Eine Verzweigung anhand von `event.event` engt `event.data` auf die Ausgabe des passenden Structs ein. Ist `default` vorhanden, behält dessen Zweig den tatsächlichen Wire-Namen als `event: string` bei; Streams, die bekannte Eventnamen mit `default` kombinieren, behalten daher diesen breiten Fallback-Zweig.

## Eingabe und Request-Mapping

Verwende `struct.request(...)` für Pfad-, Query- und Header-Abschnitte:

```typescript
const roomEvents = defineEventStream({
  path: '/rooms/:roomId/events',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
    query: struct.object({ after: struct.string().optional() }),
  }),
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})
```

Ein eigenes SSE-`build` kann Pfadparameter, Query-Parameter und Header setzen. Es erhält eine schemagebundene Projektion. Es kann weder einen Body noch Credentials setzen. Konfiguriere Credentials am Client mit `withCredentials(...)`.

## Starttupel

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

SSE liefert:

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

Bei Erfolg ist das dritte Element `startupOpen`, der validierte Snapshot der beim Start geöffneten Verbindung. Seine Response hat die Prüfung von HTTP-Status und Content-Type `text/event-stream` bestanden.

`stream.open` ist ein Live-Getter. Er enthält die neueste Response, die der logische Stream gesehen hat. Dazu kann auch eine Response eines späteren Reconnects gehören, die anschließend an der Status- oder Content-Type-Prüfung scheitert. Bewahre `startupOpen` getrennt auf, wenn der erste Snapshot wichtig ist.

Logge `startupOpen.url`, `stream.open.url` oder Response-URLs standardmäßig nicht. Sie können sensible Pfad- oder Query-Daten enthalten.

## Events konsumieren

Der Besitzer sollte Iteration und Schließen im selben Lebenszyklus einrichten:

```typescript
import type { Client } from '@defjs/core'

declare const client: Client
declare const showNotification: (message: { id: number; text: string }) => void

async function consumeNotifications(signal: AbortSignal) {
  const [error, stream, startupOpen] = await client.execute(notifications(), { signal })

  if (error) {
    console.error('notification stream startup failed', { kind: error.kind, code: error.code })
    return
  }

  console.info('notification stream connected', {
    status: startupOpen.response?.status,
  })

  try {
    for await (const event of stream) {
      switch (event.event) {
        case 'message':
          showNotification(event.data)
          break
        case 'heartbeat':
          break
        default: {
          const exhaustive: never = event
          void exhaustive
        }
      }
    }
  } finally {
    stream.close('consumer-finished')
    await stream.closed
  }
}
```

Ein erfolgreiches `execute` bedeutet, dass der Start abgeschlossen ist. Fehler nach dem Start erscheinen als Ablehnung des Iterators und über `stream.closed`; sie ändern nicht nachträglich das `error`-Element des ursprünglichen Tupels.

## Ungültige Events

Konfiguriere `onInvalidEvent` mit `withSSEOnInvalidEvent(...)` oder `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message }) => {
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Der Beobachter erhält:

- `reason: 'missing-struct' | 'validation-failed'`;
- rohe Werte für Event-`id`, Name, Datentext und optionalen Retry-Wert;
- bei Validierungsfehlern `cause`.

Das Event wird verworfen; ein späteres gültiges Event kann weiterhin zugestellt werden. Geworfene Fehler und abgelehnte Promises des Beobachters werden abgefangen. Ein asynchroner Beobachter wird jedoch vor der Verarbeitung späterer Nachrichten abgewartet. Halte ihn schnell. Prüfe und maskiere rohe `id`-, `data`- und `cause`-Werte, bevor du sie aufzeichnest.

## Reconnect

SSE hat eingebautes Retry-Verhalten für Netzwerkfehler und Fehler beim Lesen des Streams. Ein normales EOF schließt den Stream mit `code: 'eof'`; es löst keinen Reconnect aus.

Standardmäßig beginnen Retries nach einer Sekunde und haben kein Limit. Begrenze sie mit `attempts`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 250,
  }),
)
```

`attempts` bezeichnet Retries nach dem ersten Versuch. `attempts: 0` deaktiviert Retries. Der an `shouldReconnect` übergebene Wert `attempt` beginnt beim ersten Retry mit 1 und bleibt über die Lebenszeit des logischen Streams kumulativ. Eine erfolgreiche physische Verbindung setzt ihn nicht zurück.

Die Verzögerung beginnt mit dem aktuellen Retry-Intervall. Der Server kann dieses Intervall über ein SSE-Feld `retry:` aktualisieren. `factor` sorgt für exponentielles Wachstum, `maxDelayMs` begrenzt den Basiswert. `jitter` addiert danach eine zufällige Anzahl Millisekunden zwischen null und dem konfigurierten Wert. Da der Jitter nach der Begrenzung addiert wird, kann die endgültige Verzögerung `maxDelayMs` um weniger als `jitter` überschreiten.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

Der Transport sendet die letzte Event-ID bei späteren Versuchen als `Last-Event-ID`. Halte `shouldReconnect` frei von Exceptions. Für ein geworfenes Prädikat oder eine abgelehnte Promise ist derzeit nicht garantiert, dass jeder wartende Iterator und jeder Pfad von `stream.closed` beendet wird.

HTTP- oder Open-Validierungsfehler, schwerwiegende Fehler bei der Nachrichtenverarbeitung und normales EOF sind nicht dasselbe wie wiederholbare Netzwerk- oder Lesefehler. Gehe nicht davon aus, dass jeder endgültige Pfad einen Reconnect auslöst.

## Die gemeinsame Arbeitswarteschlange

Das asynchrone Iterable ist eine gemeinsam genutzte Arbeitswarteschlange für den logischen Stream. Es ist weder Subscription noch Broadcast oder Backpressure-Mechanismus.

Standardmäßig ist die Warteschlange unbegrenzt. Begrenze sie mit `withSSEQueue(...)` oder `withSSEOptions({ queue })`:

```typescript
withSSEQueue({
  maxSize: 100,
  overflow: 'drop-oldest',
})
```

| Overflow      | Verhalten am Limit                                              |
| ------------- | --------------------------------------------------------------- |
| `drop-newest` | Verwirft das neu eintreffende Event.                            |
| `drop-oldest` | Entfernt das älteste gepufferte Event und reiht das neue ein.   |
| `error`       | Wirft einen Queue-Overflow-Fehler und beendet die Verarbeitung. |

Mehrere Iteratoren konkurrieren um Werte; sie erhalten nicht jeweils eine Kopie. Das Verlassen einer `for await`-Schleife schließt den Transport nicht, weil der Iterator keine lebenszyklusbewusste `return()`-Implementierung hat. Rufe `stream.close(...)` ausdrücklich auf.

Beim Schließen wird die Warteschlange als beendet markiert, bereits gepufferte Werte werden aber nicht verworfen. Ein Consumer kann diese Werte noch leeren, bevor die nächste Iteration `done: true` meldet.

### Limit des Parser-Puffers

Eventwarteschlange und Parser-Puffer sind getrennt. Setze über `withSSEOptions(...)` einen positiven Wert für `maxBufferSize`, um die Bytes einer unvollständigen SSE-Zeile zu begrenzen:

```typescript
withSSEOptions({
  maxBufferSize: 64 * 1024,
})
```

Wird dieses Limit nach dem Start überschritten, lehnt der Iterator ab und der Stream schließt mit `code: 'error'`. Ohne Angabe bleibt dieser Parser-Puffer unbegrenzt.

## Endgültiges Schließen

`stream.closed` wird mit Folgendem erfüllt:

```typescript
interface EventStreamCloseInfo {
  code: 'eof' | 'aborted' | 'error'
  reason?: string
  cause?: unknown
}
```

- `eof` bedeutet, dass der Response-Body normal geendet hat.
- `aborted` umfasst einen ausdrücklichen Aufruf von `stream.close(...)` oder einen Abbruchpfad.
- `error` bedeutet, dass Retries beendet wurden oder ein endgültiger Streamfehler eingetreten ist.

`stream.close(reason)` ist idempotent. Die Methode bricht aktive Transportarbeit ab, schließt die Warteschlange für neue Einträge und erfüllt `stream.closed`. Ein `break` tut nichts davon.

Die Anwendungsgrenze, die den Stream öffnet, ist für sein Schließen verantwortlich. Ein Client oder Framework-Provider schließt ihn nicht automatisch.

## Weiter

- [WebSocket](/de-DE/core/web-socket) behandelt bidirektionale Sessions und optionalen Reconnect.
- [Interceptors](/de-DE/core/interceptors) erklärt Änderungen an SSE-Headern und Lebenszyklusbeobachtung.
- [Fehler](/de-DE/core/errors) beschreibt die Verfügbarkeit der Start-Response.
