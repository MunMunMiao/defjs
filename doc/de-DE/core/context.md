---
title: Context
description: Reiche Request-bezogene Metadaten mit HttpContext durch HTTP- und SSE-Interceptor-Ketten.
---

# Context

`HttpContext` ist ein Metadatencontainer mit Tokens als Schlüssel. Er begleitet eine HTTP- oder SSE-Ausführung und steht auf dem `HttpRequest` zur Verfügung, den Interceptors sehen. Er serialisiert sich nicht selbst in URL, Header oder Body.

## Tokens und Standardwerte

Erzeuge ein typisiertes Token mit einer Factory für den Standardwert:

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

`context.get(token)` ruft die Token-Factory auf, wenn im Context kein Wert gespeichert ist. Der Standardwert wird nicht in den Context geschrieben. Eine zustandsbehaftete Factory kann bei jedem fehlenden Lesezugriff daher einen neuen Wert liefern. Bevorzuge deterministische Standardwerte.

## Context erzeugen und übergeben

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` verändert den Context und gibt für Verkettung dasselbe Objekt zurück. `get(...)` und `set(...)` werfen einen `TypeError` für Werte, die keine mit `makeHttpContextToken(...)` erzeugten Tokens sind.

Ein Interceptor liest dasselbe Objekt:

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

Verwende feste Operationsnamen und geprüfte Metadaten. Schreibe standardmäßig keine Secrets, rohen Header, Bodies, URLs oder Query-Strings in Logs.

## Referenzsemantik

Die Ausführung reicht `HttpContext` als Referenz weiter. Verändert ein Interceptor den Context, sehen spätere Interceptors und der Aufrufer mit derselben Referenz diese Änderung.

Erzeuge für jeden Request einen neuen Context, sobald er Request-, Benutzer-, Mandanten-, Trace-, Cookie- oder Autorisierungsdaten enthält. Ein wiederverwendeter veränderbarer Context kann bei paralleler Arbeit Metadaten überschreiben oder zwischen Requests preisgeben.

Die Execute-Optionen von HTTP und SSE akzeptieren derzeit `context`. Die WebSocket-Execute-Optionen tun das nicht. Ein logischer SSE-Handle behält den Request-Context für seine Verbindungsversuche. Die Anwendung sollte den Context trotzdem als Teil des Request-Scopes dieses Streams behandeln.

## Kopieren und Zusammenführen

`makeHttpContext(existing)` erstellt eine flache Kopie der Token-Map:

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

Die Maps sind getrennt, gespeicherte Objektwerte werden jedoch nicht tief kopiert.

`makeHttpContext(entries)` akzeptiert Token-Wert-Paare:

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` gibt einen neuen Context zurück. Werte aus `secondary` ersetzen bei demselben Token Werte aus `primary`.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

Auch mit nur einem Context entsteht eine Kopie. Ohne Argumente entsteht ein leerer Context.

## Context-API

| Member              | Verhalten                                                                             |
| ------------------- | ------------------------------------------------------------------------------------- |
| `set(token, value)` | Speichert einen Wert und gibt denselben Context zurück.                               |
| `get(token)`        | Gibt den gespeicherten Wert zurück oder ruft die Standardwert-Factory des Tokens auf. |
| `has(token)`        | Prüft, ob ein Wert gespeichert ist.                                                   |
| `del(token)`        | Löscht einen Wert und gibt denselben Context zurück.                                  |
| `keys()`            | Iteriert über gespeicherte Tokens.                                                    |
| `length`            | Anzahl der gespeicherten Tokens.                                                      |

`isHttpContext(...)` und `isHttpContextToken(...)` stehen als Runtime-Guards zur Verfügung.

Request-Mapping ist ein eigener Bereich. [Commands](/de-DE/core/commands) erklärt automatische Request-Abschnitte und schemagebundene Projektionen, [Interceptors](/de-DE/core/interceptors) das Verhalten der Kette.
