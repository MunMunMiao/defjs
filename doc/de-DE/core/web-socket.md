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
  maxIncomingQueueSize: 100,
  maxOutgoingQueueSize: 20,
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
  maxIncomingQueueSize: 100,
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

Für die Ausführung von HTTP, SSE und WebSocket muss `timeout` eine positive sichere Ganzzahl im Bereich `1..2_147_483_647` sein; `0`, negative oder gebrochene Werte, `NaN`, `Infinity` und Werte oberhalb der Grenze liefern `REQUEST_VALIDATION_FAILED`, bevor eine Request-, Stream- oder Socket-Ressource erzeugt wird.

WebSocket liefert:

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

Bei Erfolg ist das dritte Element der Start-Snapshot mit `generation: 1`. Er kann `url`, `protocol` und `extensions` des ersten physischen Sockets enthalten.

`session.connection` ist ein Live-Getter; jedes erfolgreiche physische Öffnen erhöht `generation`. Bewahre das dritte Tupel-Element auf, wenn der Start-Snapshot wichtig ist.

Logge keine Verbindungs-URLs. Sie können Pfadbezeichner, Query-Daten der Anwendung und Felder zur Telemetriepropagierung enthalten.

## Live-Session

Eine `WebSocketSession` ist eine logische Session, die mehrere physische Verbindungsversuche umfassen kann.

| Member                     | Verhalten                                                                                 |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| `connection`               | Aktuelle Live-Verbindungsinformationen.                                                   |
| `bufferedAmount`           | Nicht gesendete Bytes des nativen Sockets, sonst `0`.                                     |
| `state`                    | Aktueller Zustand der logischen Session.                                                  |
| `receive`                  | Gemeinsame asynchrone Arbeitswarteschlange validierter eingehender Nachrichten.           |
| `send(message)`            | Prüft Schreibbarkeit, validiert und serialisiert, dann sendet oder reiht es ein.          |
| `close(code?, reason?)`    | Fordert das endgültige Schließen an.                                                      |
| `closed`                   | Promise mit den beobachteten Informationen zum endgültigen Schließen.                     |
| `onStateChange(listener)`  | Fügt einen Zustandsbeobachter hinzu und gibt eine Unsubscribe-Funktion zurück.            |
| `onRuntimeError(listener)` | Fügt einen Beobachter für Laufzeitfehler hinzu und gibt eine Unsubscribe-Funktion zurück. |

Der Client verfolgt die Session nach der Rückgabe nicht. Der Aufrufer ist für Konsum, Beobachter, Abbruch und Schließen verantwortlich.

## Nachrichten empfangen

Text-, ArrayBuffer-, Typed-Array- und Blob-Nachrichten werden in Ankunftsreihenfolge als UTF-8-JSON dekodiert. Folgende Eingaben werden still verworfen:

- ein Umschlag, der kein Objekt ist;
- ein fehlender oder leerer String `type`;
- ein unbekannter Typ ohne Struct `incoming.default`.

Ungültiges JSON und Validierungsfehler des ausgewählten Struct werden an `onRuntimeError` gemeldet; der Frame wird verworfen und die Session läuft weiter.

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

`receive` erlaubt genau einen Iterator. `maxIncomingQueueSize` ist eine erforderliche positive Elementgrenze; Overflow leert den Puffer, lässt den Iterator fehlschlagen und beendet die Session als `error`.

## Nachrichten senden

`send(...)` ist synchron. Die Methode kann synchron werfen, wenn:

- der Endpunkt keine `outgoing`-Zuordnung hat;
- die Nachricht keinen gültigen `type` hat;
- der Typ nicht deklariert ist;
- strukturelle Dekodierung oder Kodierung des Payloads fehlschlägt;
- die endpunkteigene ausgehende Warteschlange während `reconnecting` deaktiviert oder voll ist;
- der native Socket beim sofortigen Senden wirft.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Die logische Schreibbarkeit wird vor Payload-Validierung und Serialisierung geprüft. Direkter Versand erfolgt nur, wenn logischer Zustand und aktueller physischer Socket `open` sind. Nur bei `reconnecting` und positivem `maxOutgoingQueueSize` des Endpunkts wird eingereiht. Die FIFO wird geleert, bevor der Ersatzsocket `open` veröffentlicht.

Während manuellem Schließen, nach einem terminalen Zustand und solange das Reconnect-Prädikat nach einem Remote-Close noch offen ist, wirft `send` einen `InvalidStateError`. Der Transport wiederholt keine Frames, die bereits an einen früheren physischen Socket gesendet wurden.

## Zustand

`session.state` kann folgende Werte haben:

| Zustand        | Bedeutung                                                        |
| -------------- | ---------------------------------------------------------------- |
| `idle`         | Interner Anfangszustand, bevor die Ausführung startet.           |
| `connecting`   | Der erste physische Verbindungsversuch beginnt.                  |
| `open`         | Der aktuelle physische Socket ist geöffnet.                      |
| `reconnecting` | Ein späterer physischer Versuch wird vorbereitet oder verzögert. |
| `closing`      | Der Besitzer hat manuelles Schließen angefordert.                |
| `closed`       | Endgültig geschlossen, ohne normalisierten Fehler.               |
| `aborted`      | Ein externer Abbruch wurde endgültig zu `ABORTED` normalisiert.  |
| `error`        | Sonstiger endgültiger Fehler.                                    |

`session.state` beschreibt den logischen Lebenszyklus und beweist nicht, dass aktuell ein nativer Socket existiert. Während `reconnecting` nutzt `send` die endpunkteigene ausgehende Kapazität.

Fehler von Beobachtern werden isoliert: Ein Fehler des Zustandslisteners wird an Laufzeitfehlerlistener gemeldet; deren Fehler geht an ein verfügbares `globalThis.reportError`. Die terminale Erfüllung gibt alle Beobachter frei; endet der Besitzer früher, entferne sie weiterhin selbst.

### Vor jedem Versuch

`beforeConnect` kann am Client oder für eine einzelne Ausführung konfiguriert werden. Der Hook läuft vor dem nativen Konstruktor beim ersten Versuch und vor jedem Reconnect:

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

Der Hook erhält `{ attempt, signal }`; `attempt` ist zunächst `0` und steigt bei Reconnects. Übergib `signal` an eigene asynchrone Arbeit. Abbruch und Timeout konkurrieren mit dem Hook, konsumieren späte Rejections und verhindern, dass ein spätes Ergebnis noch einen Socket erzeugt. Throw oder Rejection sind terminale Transportfehler.

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

`shouldReconnect` ist synchron. Eine Exception beendet die Session als `error`, ein explizites `false` als `closed`. Reconnect erzeugt nur einen neuen physischen Socket und wiederholt keine früheren Sends. Stelle bei steigender `session.connection.generation` nur weiterhin aktive, sicher wiederholbare Abonnements wieder her, niemals Mutationen.

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

Fehler bei Heartbeat-Serialisierung, Send, Ack-Prädikat oder Timeout sind fatal. Sie melden Laufzeitfehler, lassen `receive` fehlschlagen und beenden die Session ohne Reconnect-Entscheidung als `error`.

`intervalMs` und ein definiertes `timeoutMs` müssen positiv, endlich und höchstens `2_147_483_647` sein. Solange eine Ack-Deadline aktiv ist, senden spätere Intervalle keinen weiteren Ping und setzen die Deadline nicht zurück; ein Ack oder das Beenden der Session löscht sie.

## Warteschlangen

Queue-Grenzen gehören zur Endpunktdefinition. `maxIncomingQueueSize` ist eine erforderliche positive sichere Ganzzahl; Overflow ist fatal und verwirft gepufferte Werte. `maxOutgoingQueueSize` ist eine optionale nichtnegative sichere Ganzzahl mit Standardwert `0`; ein positiver Wert hält Frames zwischen Versuchen in FIFO-Reihenfolge und lehnt Overflow ab, ohne ältere Frames zu löschen.

Beide Grenzen zählen Elemente, nicht Bytes. `session.bufferedAmount` zeigt separat den Byte-Rückstand des nativen Sockets. `receive` erlaubt genau einen Iterator.

## Verantwortung für das Schließen

`session.close(code, reason)` validiert zuerst Code `1000` oder `3000..4999` sowie maximal 123 UTF-8-Bytes für den Grund. Gültige Eingaben wechseln zu `closing`, fordern natives Schließen an und warten auf das echte `CloseEvent`; beobachteter Code und Grund haben Vorrang vor den angeforderten Werten.

`session.closed` wird mit den von der Laufzeit beobachteten Close-Informationen erfüllt:

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

Manuelles Schließen, ein ursachenloser Remote-Close und ein explizit abgelehnter Reconnect ergeben `closed`. Externer Abbruch ergibt `aborted`, Timeout und Laufzeitfehler ergeben `error`. Wirft natives Close, erfolgt genau ein parameterloser Fallback; werfen beide Aufrufe, wird ohne dritten Close als `error` erfüllt.

Entferne Listener und schließe die Session an derselben Komponenten-, Routen-, Job- oder Servicegrenze, die sie geöffnet hat. Das Unmounten eines Providers erledigt diese Arbeit nicht.

## Sicherheit von URL und Authentifizierung

HTTP-Basis-URLs werden in WebSocket-Schemas umgewandelt: Aus `http:` wird `ws:`, aus `https:` wird `wss:`. Übergib rohe Pfadplatzhalterwerte; Core kodiert jedes Segment genau einmal, wandelt `%` in `%25` um und lehnt leere Werte, `.` und `..` ab. Query-Werte verwenden den konfigurierten Serializer.

Für Protokolle gilt die Priorität Ausführungsoption, Clientoption, dann Endpunktdefinition. Ein ausdrücklich leeres Protokollarray unterdrückt Werte niedrigerer Priorität.

Browser-WebSocket-APIs können keine beliebigen Handshake-Header setzen. Behandle Query-Parameter nicht als allgemeinen Kanal für Credentials; URLs können in Browserwerkzeugen, Proxys, Zugriffslogs und Telemetrie landen. Verwende TLS (`wss:`) und ein für das Deployment geprüftes Authentifizierungsdesign, etwa einen geeigneten Same-Site-Cookie-Flow oder ein kurzlebiges Verbindungsticket.

## Weiter

- [SSE](/de-DE/core/sse) stellt Stream-Retry und Queue-Verhalten gegenüber.
- [Interceptors](/de-DE/core/interceptors) zeigt, wie Live-Getter einer Session erhalten bleiben.
- [Fehler](/de-DE/core/errors) behandelt Fehler des Starttupels.
