---
title: Entwurfsentscheidungen
description: Warum Defjs explizite Clients, transportspezifische Tupel, Lebenszyklusoptionen bei der Ausführung, projektionsbasierten Request-Aufbau und Beobachter verwendet.
---

# Entwurfsentscheidungen

Diese Seite erklärt die Gründe hinter der aktuellen API. Die Referenzseiten beschreiben Felder und Standardwerte.

## Explizite Clients

Defjs hat keinen prozessweiten Standard-Client. `createClient(...)` macht die Zuständigkeit an der Aufrufstelle sichtbar und erlaubt getrennte Clients für verschiedene Endpunkte, Zugangsdaten, Tests oder Request-Scopes.

Diese Trennung hat Grenzen. Interceptors und Optionscallbacks können gemeinsamen Anwendungszustand per Closure verwenden. Zwei Client-Objekte sind deshalb nicht automatisch von allem in ihrer Umgebung isoliert. Auch `setErrorMap(...)` gilt prozessweit. Servercode sollte einen Client pro Request erzeugen, sobald Optionen oder Closures Request-, Benutzer-, Mandanten-, Cookie- oder Autorisierungsdaten enthalten.

Ein expliziter Client macht die Zuständigkeit für Ressourcen leichter nachvollziehbar, ist aber kein Ressourcenmanager. Er verfolgt oder beendet keine aktiven HTTP-Requests, SSE-Handles oder WebSocket-Sessions.

## Transportspezifische Tupel

Alle unterstützten Commands liefern ein fehlerorientiertes Drei-Elemente-Tupel. Das dritte Element behält jedoch seine transportspezifische Bedeutung:

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

Dadurch werden ein HTTP-Response-Wrapper, der SSE-Start-Snapshot und der WebSocket-Start-Snapshot nicht in eine unscharfe Abstraktion gepresst. Dasselbe gilt für das zweite Element: HTTP liefert dekodierte Daten, SSE einen logischen Stream-Handle und WebSocket eine logische Session.

Das Tupel macht erwartete Startfehler explizit, ohne den Kontrollfluss über Exceptions zu erzwingen. Es verspricht nicht, dass beliebige Interceptors, Callbacks, Listener oder nicht unterstützte Werte niemals eine Promise ablehnen oder synchron werfen.

## Lebenszyklusoptionen gehören zur Ausführung

Endpunktdefinitionen beschreiben stabile Wire-Verträge und besitzen die begrenzten Transportwarteschlangen. Abbruch, Timeout, Heartbeat und Reconnect gehören zu der Ausführung, die diese Arbeit besitzt.

HTTP und SSE akzeptieren Abbruchoptionen bei der Ausführung. WebSocket akzeptiert außerdem `beforeConnect`-, Heartbeat-, Reconnect- und Protokolloptionen pro Ausführung. Clientoptionen stellen wiederverwendbare Standardwerte bereit, soweit der Transport sie unterstützt; die eingehende und ausgehende WebSocket-Kapazität bleibt am Endpunkt definiert.

Diese Trennung hält einen Command wiederverwendbar. Ein Hintergrundjob und eine interaktive Ansicht können denselben Command mit verschiedenen Lebenszeiten ausführen, ohne Pfad oder Nachrichtenschema neu zu definieren.

## `build` verwendet Projektionen

Ein eigenes `build(request, input)` erhält eine deklarative Bindungsansicht, die aus dem Eingabe-Struct abgeleitet wird. Es hat keinen Zugriff auf die Laufzeitwerte des Aufrufers.

Die Ansicht hält fest, wie Quellfelder auf Pfad, Query, Header und Body-Ziele abgebildet werden. Dieses Modell unterstützt Feldprojektion, explizite Wire-Schlüssel und eine Eins-zu-eins-Projektion von Arrays. Wertabhängige Verzweigungen, beliebige Transformationen und eingeschleuste Literalwerte sind absichtlich ausgeschlossen.

So bleibt der Request-Aufbau an deklarierte Struct-Felder gebunden. Normalisierung und fachliche Validierung gehören in den Anwendungscode, bevor der Command erzeugt wird. Die unterstützten Projektionsformen stehen unter [Commands](/de-DE/core/commands).

## Beobachter steuern nicht den Kontrollfluss

SSE-`onInvalidEvent` beobachtet verworfene Events. Geworfene Fehler und abgelehnte Promises werden vom Kontrollfluss des Streams isoliert, sodass die Verarbeitung weiterläuft. Ein asynchroner Beobachter wird weiterhin abgewartet und kann spätere Nachrichten verzögern.

WebSocket-Listener für Status und Laufzeitfehler sind ebenfalls Beobachter. Geworfene Fehler und abgelehnte Promises werden isoliert: Fehler eines Status-Listeners gehen an die Laufzeitfehler-Listener, Fehler eines Laufzeitfehler-Listeners an das globale `reportError`, sofern vorhanden; die übrigen Listener und die Lebenszyklusarbeit laufen weiter.

Nutze den zurückgegebenen Handle oder die Session für Entscheidungen zum Lebenszyklus. Beobachter eignen sich für begrenztes Logging, Metriken oder Zustandsupdates. Entferne sie, sobald ihr Besitzer endet.

## Zugehörige Referenz

- [Client](/de-DE/core/client) dokumentiert Optionskomposition und Client-Scope.
- [Fehler](/de-DE/core/errors) dokumentiert Tupelfehler und die Verfügbarkeit von Responses.
- [SSE](/de-DE/core/sse) und [WebSocket](/de-DE/core/web-socket) erklären logische Handles, physische Versuche und endgültiges Schließen.
