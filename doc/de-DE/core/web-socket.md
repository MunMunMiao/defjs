---
title: WebSocket
description: Definiere Nachrichtenumschläge, starte und beobachte Live-Sessions, konsumiere eingehende Arbeit, konfiguriere optionalen Reconnect und Heartbeat und schließe eigene Ressourcen.
---

# WebSocket

`defineWebSocket(...)` erzeugt einen Command-Builder für einen WebSocket-Endpunkt mit JSON-Nachrichten.

```typescript
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('wss://api.example.com'))

const chat = defineWebSocket({
  path: '/chat',
  incoming: {
    message: struct.object({ userId: struct.number(), text: struct.string() }),
    pong: struct.object({}),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
    ping: struct.object({}),
  },
})
```

## Nachrichtenumschlag

Jede Nachricht ist ein JSON-Objekt mit einem nicht leeren String `type`. Der Typ wählt ein Struct aus `incoming` oder `outgoing`.

Bei einem Objekt-Payload können die Felder neben `type` stehen:

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Bei einem skalaren Wert oder Array liegt der Payload unter `data`:

```json
{ "type": "count", "data": 3 }
```

`type` und `data` sind reservierte Schlüssel des Umschlags. Enthält ein Objekt-Payload selbst ein Feld `data`, umschließe den gesamten Payload, damit die Laufzeit dieses Feld nicht für den Payload des Umschlags hält:

```typescript
const audit = defineWebSocket({
  path: '/audit',
  incoming: {
    entry: struct.object({ data: struct.string(), source: struct.string() }),
  },
  outgoing: {
    write: struct.object({ data: struct.string(), source: struct.string() }),
  },
})

const [auditError, auditSession] = await client.execute(audit())
if (!auditError) {
  auditSession.send({
    type: 'write',
    data: { data: 'reviewed-value', source: 'settings' },
  })
}
```

Die entsprechende Wire-Form ist `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`.

Deklariere `type` nicht als gewöhnliches Payload-Feld. Die Normalisierung des Umschlags besitzt diesen Schlüssel.

Ein optionales Struct `incoming.default` verarbeitet ansonsten nicht deklarierte Nachrichtentypen. Ohne dieses Struct werden unbekannte Typen verworfen.

## Starttupel

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

WebSocket liefert:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

Bei Erfolg ist das dritte Element der Verbindungs-Snapshot vom Start. Er kann `url`, `protocol` und `extensions` enthalten, die beim Öffnen des ersten physischen Sockets erfasst wurden.

`session.connection` ist ein Live-Getter. Ein Reconnect ersetzt den darunterliegenden physischen Socket und kann diesen Wert aktualisieren. Bewahre das dritte Tupel-Element auf, wenn der Start-Snapshot wichtig ist.

Logge keine Verbindungs-URLs. Sie können Pfadbezeichner, Query-Daten der Anwendung und Felder zur Telemetriepropagierung enthalten.

## Live-Session

Eine `WebSocketSession` ist eine logische Session, die mehrere physische Verbindungsversuche umfassen kann.

| Member                     | Verhalten                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `connection`               | Aktuelle Live-Verbindungsinformationen.                                                   |
| `state`                    | Aktueller Zustand der logischen Session.                                                  |
| `receive`                  | Gemeinsame asynchrone Arbeitswarteschlange validierter eingehender Nachrichten.           |
| `send(message)`            | Validiert, serialisiert und sendet eine ausgehende Nachricht oder reiht sie ein.          |
| `close(code?, reason?)`    | Fordert das endgültige Schließen an.                                                      |
| `closed`                   | Promise mit den beobachteten Informationen zum endgültigen Schließen.                     |
| `onStateChange(listener)`  | Fügt einen Zustandsbeobachter hinzu und gibt eine Unsubscribe-Funktion zurück.            |
| `onRuntimeError(listener)` | Fügt einen Beobachter für Laufzeitfehler hinzu und gibt eine Unsubscribe-Funktion zurück. |

Der Client verfolgt die Session nach der Rückgabe nicht. Der Aufrufer ist für Konsum, Beobachter, Abbruch und Schließen verantwortlich.

## Nachrichten empfangen

Text-, ArrayBuffer-, Typed-Array- und Blob-Nachrichten werden als UTF-8-JSON dekodiert. Folgende Eingaben werden still verworfen:

- ungültiges JSON;
- ein Umschlag, der kein Objekt ist;
- ein fehlender oder leerer String `type`;
- ein unbekannter Typ ohne Struct `incoming.default`.

Sobald ein Struct ausgewählt ist, wird ein Dekodierungsfehler an `onRuntimeError` gemeldet und die Nachricht verworfen.

```typescript
const unsubscribeError = session.onRuntimeError(() => {
  recordSocketFailure({ operation: 'chat-receive' })
})

try {
  for await (const message of session.receive) {
    if (message.type === 'message') {
      renderMessage(message.userId, message.text)
    }
  }
} finally {
  unsubscribeError()
  session.close(1000, 'consumer-finished')
  await session.closed
}
```

Das eingehende Iterable ist eine unbegrenzte gemeinsame Arbeitswarteschlange. Mehrere Iteratoren konkurrieren um Nachrichten; sie sind keine unabhängigen Subscriptions. Der Transport bremst den Server nicht, wenn die Warteschlange wächst. Konsumiere eingehende Nachrichten immer oder schließe die Session zügig.

## Nachrichten senden

`send(...)` ist synchron. Die Methode kann synchron werfen, wenn:

- der Endpunkt keine `outgoing`-Zuordnung hat;
- die Nachricht keinen gültigen `type` hat;
- der Typ nicht deklariert ist;
- strukturelle Dekodierung oder Kodierung des Payloads fehlschlägt;
- eine begrenzte Sendewarteschlange `overflow: 'error'` verwendet;
- der native Socket beim sofortigen Senden wirft.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Nachrichten, die vor dem Öffnen oder zwischen Reconnect-Versuchen gesendet werden, landen in der ausgehenden Warteschlange. Sie wird geleert, sobald sich ein physischer Socket öffnet.

Rufe `send` nach einem terminalen Zustand nicht mehr auf. Die aktuelle Implementierung hat keinen stabilen Fehlervertrag für Sends nach dem Schließen; eingereihte Daten könnten anschließend nie gesendet werden.

## Zustand

`session.state` kann folgende Werte haben:

| Zustand        | Bedeutung                                                                                                                                                                                |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | Interner Anfangszustand, bevor die Ausführung startet.                                                                                                                                   |
| `connecting`   | Der erste physische Verbindungsversuch beginnt.                                                                                                                                          |
| `open`         | Zuletzt ausgegebener logischer Zustand, nachdem ein physischer Socket geöffnet wurde. Während der Reconnect-Verzögerung kann er `open` bleiben, obwohl kein physischer Socket existiert. |
| `reconnecting` | Ein späterer physischer Versuch beginnt nach seiner Verzögerung.                                                                                                                         |
| `closing`      | Ein Socket, der gerade verbindet oder offen ist, wird wegen eines Abbruchs geschlossen.                                                                                                  |
| `closed`       | Endgültig geschlossen, ohne normalisierten Fehler.                                                                                                                                       |
| `aborted`      | Ein externer Abbruch wurde endgültig zu `ABORTED` normalisiert.                                                                                                                          |
| `error`        | Sonstiger endgültiger Fehler.                                                                                                                                                            |

`reconnecting` wird nicht während der Verzögerung ausgegeben. Der Zustand erscheint erst, wenn der nächste Versuch nach dieser Verzögerung beginnt. Behandle `session.state` als zuletzt ausgegebenen Lifecycle-Zustand, nicht als Beweis für einen aktuell vorhandenen nativen Socket. Nachrichten aus dieser Lücke landen in der ausgehenden Warteschlange.

Zustandslistener werden direkt aufgerufen. Halte sie frei von Exceptions und entferne sie, sobald ihr Besitzer endet.

### Vor jedem Versuch

`beforeConnect` kann am Client oder für eine einzelne Ausführung konfiguriert werden. Der Hook läuft vor dem nativen Konstruktor beim ersten Versuch und vor jedem Reconnect:

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

Command-Eingabe und Request-Projektion sind zu diesem Zeitpunkt bereits aufgebaut. Der Hook führt `build` nicht erneut aus und ändert keine gebundenen Query-Werte. Verwende ihn für anwendungseigene Vorbereitung, etwa um Zustand für den Handshake-Mechanismus der Umgebung zu aktualisieren. Ein geworfener Fehler oder eine abgelehnte Promise ist ein endgültiger Transportfehler und wird nicht an das Reconnect-Prädikat für Close-Ergebnisse übergeben.

## Reconnect ist optional

Ohne Reconnect-Objekt findet kein Reconnect statt. Konfiguriere ihn pro Client oder pro Ausführung:

```typescript
const [error, session] = await client.execute(chat(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return !wasClean && code !== 1008 && attempt <= 5
    },
  },
})
```

`attempts` bezeichnet Retries nach dem ersten Versuch. Ein leeres Objekt aktiviert drei Retries mit diesen Standardwerten:

| Feld              | Standardwert                                 |
| ----------------- | -------------------------------------------- |
| `attempts`        | `3`                                          |
| `delayMs`         | `1000`                                       |
| `factor`          | `2`                                          |
| `maxDelayMs`      | `30000`                                      |
| `jitter`          | `0`                                          |
| `shouldReconnect` | Gibt für jedes Close-Ergebnis `true` zurück. |

Das Standardprädikat versucht nach einem vom Gegenüber ausgelösten Close erneut, unabhängig davon, ob `wasClean` wahr oder falsch ist. Setze ein eigenes Prädikat, wenn ein sauberer Close endgültig sein soll. `attempt` beginnt beim ersten Retry mit 1.

Die Basisverzögerung lautet `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. WebSocket-Jitter ist multiplikativ: Ein Wert wie `0.2` wählt einen zufälligen Faktor zwischen `0.8` und `1.2`. Das unterscheidet sich vom additiven Millisekunden-Jitter bei SSE.

Halte `shouldReconnect` synchron und frei von Exceptions. Ein Reconnect erzeugt innerhalb derselben logischen Session einen neuen physischen Socket. Eingehende und ausgehende Warteschlange gehören zu dieser logischen Session.

## Heartbeat

Auch Heartbeat ist optional:

```typescript
const [error, session] = await client.execute(chat(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
  reconnect: { attempts: 3 },
})
```

`message` muss einen Wert erzeugen, der zur `outgoing`-Zuordnung des Endpunkts passt. Eine von `isAck` erkannte Nachricht löscht den Heartbeat-Timeout und wird nicht in `receive` eingereiht.

Wenn ein positiver Wert `timeoutMs` abläuft, meldet die Laufzeit `Error('WebSocket heartbeat timeout')` an Laufzeitfehler-Listener und fordert am nativen Socket Close-Code `4000` mit dem Grund `heartbeat timeout` an. Ein Reconnect braucht weiterhin eine eigene Reconnect-Richtlinie, die diesen Close zulässt.

Halte `timeoutMs < intervalMs`. Die aktuelle Implementierung prüft dieses Verhältnis nicht. Ein Timeout ab der Länge des Intervalls kann sich mit späteren Heartbeat-Timern überschneiden.

## Warteschlangen

Die Option `queue` konfiguriert nur ausgehende Nachrichten:

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

Die ausgehende Warteschlange ist standardmäßig unbegrenzt. Bei einer Begrenzung ist der Standard für Overflow `drop-oldest`; Alternativen sind `drop-newest` und `error`. Beim endgültigen Schließen wird die Sendewarteschlange geleert.

Für die eingehende Warteschlange gibt es keine öffentliche Begrenzungs- oder Overflow-Option. Sie ist eine unbegrenzte gemeinsame Arbeitswarteschlange ohne Backpressure. Ressourcenbesitzer müssen sie fortlaufend konsumieren oder die Session schließen.

## Verantwortung für das Schließen

`session.close(code, reason)` ruft die Methode `close` des aktuellen nativen Sockets auf und bricht die logische Session mit einem Marker für manuelles Schließen ab. Die Methode fordert das Schließen an; sie garantiert weder einen geordneten Close-Handshake noch einen sichtbaren Zustand `closing` oder dass der spätere Wert von `closed` exakt den angeforderten Code und Grund wiedergibt.

`session.closed` wird mit den von der Laufzeit beobachteten Close-Informationen erfüllt:

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

Eine native Implementierung, die nie ihr Close-Event ausgibt, kann die Erfüllung verzögern. Ein externer Abbruch kann abhängig von der normalisierten Ursache als `aborted` oder `error` enden und den Zustand `closing` überspringen, während die Session zwischen Versuchen steht.

Entferne Listener und schließe die Session an derselben Komponenten-, Routen-, Job- oder Servicegrenze, die sie geöffnet hat. Das Unmounten eines Providers erledigt diese Arbeit nicht.

## Sicherheit von URL und Authentifizierung

HTTP-Basis-URLs werden in WebSocket-Schemas umgewandelt: Aus `http:` wird `ws:`, aus `https:` wird `wss:`. Pfadplatzhalter werden nicht als Segmente kodiert. Query-Werte verwenden den konfigurierten Serializer.

Für Protokolle gilt die Priorität Ausführungsoption, Clientoption, dann Endpunktdefinition. Ein ausdrücklich leeres Protokollarray unterdrückt Werte niedrigerer Priorität.

Browser-WebSocket-APIs können keine beliebigen Handshake-Header setzen. Behandle Query-Parameter nicht als allgemeinen Kanal für Credentials; URLs können in Browserwerkzeugen, Proxys, Zugriffslogs und Telemetrie landen. Verwende TLS (`wss:`) und ein für das Deployment geprüftes Authentifizierungsdesign, etwa einen geeigneten Same-Site-Cookie-Flow oder ein kurzlebiges Verbindungsticket.

## Weiter

- [SSE](/de-DE/core/sse) stellt Stream-Retry und Queue-Verhalten gegenüber.
- [Interceptors](/de-DE/core/interceptors) zeigt, wie Live-Getter einer Session erhalten bleiben.
- [Fehler](/de-DE/core/errors) behandelt Fehler des Starttupels.
