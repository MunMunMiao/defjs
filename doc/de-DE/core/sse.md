---
title: SSE
description: Definiere und dekodiere begrenzte Server-Sent Events, konfiguriere Reconnect und schließe eigene Streams.
---

# SSE

`defineEventStream(...)` erzeugt einen SSE-Command-Builder. Ein Endpunkt deklariert seinen Pfad und das Struct für jeden Eventnamen.

```typescript
import { defineEventStream, struct } from '@defjs/core'

const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
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

Für die Ausführung von HTTP, SSE und WebSocket muss `timeout` eine positive sichere Ganzzahl im Bereich `1..2_147_483_647` sein; `0`, negative oder gebrochene Werte, `NaN`, `Infinity` und Werte oberhalb der Grenze liefern `REQUEST_VALIDATION_FAILED`, bevor eine Request-, Stream- oder Socket-Ressource erzeugt wird.

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
    await stream.closed
  }
}
```

Ein erfolgreiches `execute` bedeutet, dass der Start abgeschlossen ist. Fehler nach dem Start erscheinen als Ablehnung des Iterators und über `stream.closed`; sie ändern nicht nachträglich das `error`-Element des ursprünglichen Tupels.

Ein vorzeitiges Verlassen einer `for await`-Schleife durch `break`, `return` oder einen geworfenen Fehler ruft `return()` des Iterators auf. Der Stream schließt automatisch mit `{ code: 'aborted', reason: 'iterator-return' }`; durch Warten auf `stream.closed` beobachtest du diesen Endzustand. Rufe `stream.close(...)` nur dann ausdrücklich auf, wenn der Besitzer den Stream außerhalb einer aktiven Iteration schließen muss.

## Ungültige Events

Konfiguriere `onInvalidEvent` mit `withSSEOnInvalidEvent(...)` oder `withSSEOptions(...)`:

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

Der Beobachter erhält:

- `reason: 'missing-struct' | 'validation-failed'`;
- rohe Werte für Event-`id`, Name und Datentext;
- bei Validierungsfehlern `cause`.
- das `signal` des aktiven Versuchs.

Das Event wird verworfen; ein späteres gültiges Event kann weiterhin zugestellt werden. Fehler und abgelehnte Promises des Beobachters sind isoliert, während Abort einen wartenden Beobachter über `signal` unterbricht. Halte ihn schnell und maskiere rohe `id`-, `data`- und `cause`-Werte.

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

Der Transport sendet die letzte Event-ID bei späteren Versuchen als `Last-Event-ID`. Wirft `shouldReconnect` oder lehnt es ab, endet Retry und der wartende Start oder Stream wird mit diesem Policy-Fehler beendet. Abort unterbricht ein wartendes Prädikat über das Signal des aktiven Versuchs.

HTTP- oder Open-Validierungsfehler, schwerwiegende Fehler bei der Nachrichtenverarbeitung und normales EOF sind nicht dasselbe wie wiederholbare Netzwerk- oder Lesefehler. Gehe nicht davon aus, dass jeder endgültige Pfad einen Reconnect auslöst.

## Endpunkteigene Limits

Ein Stream erlaubt genau einen Async-Iterator-Consumer. Ein zweiter Iterator löst einen Fehler aus. Die Rückgabe des Iterators, einschließlich eines frühen `break` aus `for await`, schließt den Stream automatisch mit dem Grund `iterator-return`.

Jede Definition benötigt positive sichere Ganzzahlen für `maxBufferSize` und `maxQueueSize`. Das Buffer-Limit gilt je SSE-Zeile und für die Daten des aktuellen Events; das Queue-Limit begrenzt geparste, wartende Events. Ein Queue-Overflow ist fatal und verwirft niemals still ein Event.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

Bei normalem EOF können gepufferte Events geleert werden. Ein fataler Parser-, Transform- oder Overflow-Fehler leert den Buffer, bricht den aktiven Body ab, lehnt die Iteration ab und beendet `stream.closed` mit `code: 'error'`.

## Endgültiges Schließen

`stream.closed` wird mit einer diskriminierten Union erfüllt:

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` bedeutet, dass der Response-Body normal geendet hat.
- `aborted` umfasst einen ausdrücklichen Aufruf von `stream.close(...)` oder einen Abbruchpfad.
- `error` bedeutet, dass Retries beendet wurden oder ein endgültiger Streamfehler eingetreten ist. Dieser Zweig enthält immer einen öffentlichen `errorCode`.

`EventStreamErrorCode` hat sechs stabile Werte:

| Error code                  | Bedeutung                                                                          |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `INVALID_RESPONSE`          | Status, Content-Type, Response-Fehler oder Response-Body war ungültig.             |
| `MESSAGE_PROCESSING_FAILED` | Event-Transformation oder Lifecycle-Callback ist fehlgeschlagen.                   |
| `PARSER_LIMIT_EXCEEDED`     | Ein endpunkteigenes Parser-Buffer-Limit wurde überschritten.                       |
| `QUEUE_OVERFLOW`            | Geparste Events überschritten das endpunkteigene Queue-Limit.                      |
| `TIMEOUT`                   | Der Transportversuch erreichte seinen konfigurierten Timeout.                      |
| `TRANSPORT_ERROR`           | Ein anderer endgültiger Netzwerk-, Stream-Lese- oder Retry-Policy-Fehler trat auf. |

`stream.close(reason)` ist idempotent. Die Methode bricht aktive Transportarbeit ab, schließt die Warteschlange für neue Einträge und erfüllt `stream.closed`. `return()` des Iterators verwendet denselben Schließpfad mit dem Grund `iterator-return`.

Routine-Logs sollten nur `close.code` und im `error`-Zweig `close.errorCode` aufzeichnen. Logge `reason`, `cause`, rohe Events oder Stream-URLs nur mit einer ausdrücklichen Maskierungs- und Aufbewahrungsrichtlinie.

Die Anwendungsgrenze, die den Stream öffnet, ist für sein Schließen verantwortlich. Ein Client oder Framework-Provider schließt ihn nicht automatisch.

## Weiter

- [WebSocket](/de-DE/core/web-socket) behandelt bidirektionale Sessions und optionalen Reconnect.
- [Interceptors](/de-DE/core/interceptors) erklärt Änderungen an SSE-Headern und Lebenszyklusbeobachtung.
- [Fehler](/de-DE/core/errors) beschreibt die Verfügbarkeit der Start-Response.
