---
title: SSE
description: Use defineEventStream to define typed Server-Sent Events endpoints and consume streaming events through the client.
---

# SSE

Defjs utilise `defineEventStream` pour définir des points de terminaison SSE (Server-Sent Events) typés. Après exécution, un triplet `[error, stream, openInfo]` est retourné, où `stream` est un async iterable pour consommer les événements poussés par le serveur un par un.

## Définir un flux d'événements

Quand tu définis un point de terminaison SSE, déclare le champ `events` mappant les noms d'événements à des structs. Le transport SSE livre chaque payload `data:` sous forme de texte brut ; Defjs sélectionne le struct correspondant et décode le texte selon le type de contenu de ce struct.

```typescript
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const useNotifications = defineEventStream({
  path: '/v1/notifications',
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

### Schéma d'événement par défaut (secours)

Si le serveur peut envoyer des types d'événements non explicitement déclarés dans `events`, fournis un struct `default` comme secours. Sans `default`, les événements inconnus sont silencieusement ignorés.

```typescript
const useMixedStream = defineEventStream({
  path: '/v1/events',
  events: {
    userconnect: struct.json(struct.object({ uid: struct.number() })),
    default: struct.json(struct.object({ note: struct.string() })),
  },
})
```

### Décodage du contenu des données d'événement

Le transport SSE livre chaque payload `data:` sous forme de texte. Defjs sélectionne d'abord le struct d'événement dans `events[eventName] ?? events.default`, puis décode le texte selon le struct sélectionné.

Utilise `struct.json(inner)` lorsque le serveur envoie du texte JSON pour un événement. `struct.json(inner)` exécute d'abord `JSON.parse` sur le texte SSE brut, puis analyse la valeur résultante avec `inner` :

```typescript
const useProfileStream = defineEventStream({
  path: '/v1/profile-events',
  events: {
    profile: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  },
})
```

Pour les payloads texte primitifs :

- `struct.string()` et `struct.text()` lisent le texte de l'événement brut.
- `struct.number()` supprime les espaces et n'accepte que les valeurs numériques finies.
- `struct.boolean()` supprime les espaces et n'accepte que les valeurs exactes `true` ou `false`.

Les `struct.object(...)`, `struct.array(...)` et `struct.record(...)` bruts ne parsent pas eux-mêmes le texte ressemblant à du JSON. Enveloppe-les dans `struct.json(...)` pour des données d'événement JSON.

### Flux d'événements avec entrée

Quand un flux a besoin de paramètres de chemin, de paramètres de requête ou de corps de requête, fournis un struct `input` et une fonction `build`. La signature `build` est la même que pour `defineRequest`, supportant params, query et headers.

```typescript
const useRoomStream = defineEventStream({
  path: '/v1/room/:roomId',
  input: struct.request({
    path: struct.object({ roomId: struct.string() }),
  }),
  build(ctx, input) {
    ctx.setPathParams(input.path)
  },
  events: {
    chat: struct.json(struct.object({ user: struct.string(), text: struct.string() })),
  },
})

const [error, stream, open] = await client.execute(useRoomStream({ path: { roomId: '42' } }))
```

## Résultat d'exécution

`client.execute()` retourne un triplet pour les commandes SSE :

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

- **`error`** — Non-null en cas d'échec de connexion ou de validation ; `null` en cas de succès.
- **`stream`** — En cas de succès, un `EventStreamHandle` consommable via `for await...of` ; `undefined` en cas d'échec.
- **`open`** — Contient les infos de réponse de la première connexion (`response` et `url`). Peut être `undefined` en cas d'échec de connexion.

```typescript
const [error, stream, open] = await client.execute(useNotifications())

if (error) {
  console.error('Connection failed:', error)
  return
}

console.log('Connected', open?.url)

for await (const event of stream) {
  if (event.event === 'message' && typeof event.data === 'object' && event.data !== null) {
    console.log('Message:', event.data.text)
  }
  if (event.event === 'heartbeat') {
    console.log('Heartbeat:', event.data)
  }
}
```

## EventStreamHandle et stream.closed

`EventStreamHandle` implémente `AsyncIterable`, donc il peut être directement utilisé avec `for await...of`. Il fournit aussi ces propriétés :

| Propriété / Méthode        | Description                                                                      |
| -------------------------- | -------------------------------------------------------------------------------- |
| `open`                     | Infos de première connexion `EventStreamOpenInfo` (contient `response` et `url`) |
| `closed`                   | `Promise<EventStreamCloseInfo>`, se résout quand le flux est complètement fermé  |
| `close(reason?)`           | Fermer activement le flux, en passant optionnellement une raison                 |
| `[Symbol.asyncIterator]()` | Retourne un async iterator consommant la file d'événements                       |

`closed` se résout quand :

- Fin normale du serveur (`code: 'eof'`)
- Fermeture active via `stream.close()` (`code: 'aborted'`)
- Erreur de connexion ou épuisement des reconnexions (`code: 'error'`)

```typescript
// Fermeture active
stream.close('user-navigated-away')
await stream.closed // { code: 'aborted', reason: 'user-navigated-away' }
```

## Gestion des événements invalides : onInvalidEvent

Quand le serveur envoie un événement qui ne correspond à aucun struct dans `events` (ou `default`), ou que la validation du struct échoue, l'observer `onInvalidEvent` est déclenché. C'est une configuration au niveau client passée via `sse.onInvalidEvent` au moment de `createClient`.

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    onInvalidEvent: async (context) => {
      console.warn('Invalid event:', context.reason, context.message)
      // context.reason: 'missing-struct' | 'validation-failed'
      // context.message: { id, event, data, retry? }
      // context.cause: Erreur originale quand la validation échoue
    },
  }),
)
```

`onInvalidEvent` est un **observer** :

Un échec de validation courant consiste à déclarer `struct.object(...)` pour un événement dont le champ `data:` est du texte JSON. Déclare plutôt `struct.json(struct.object(...))`. Un JSON invalide sous `struct.json(...)` est signalé comme `validation-failed` et n'est pas réessayé en tant que texte brut.

- Même s'il lève une exception en interne, l'exception est silencieusement ignorée et le flux continue.
- Il ne bloque pas les événements suivants d'être consommés.

## Configuration de reconnexion et de file

Le transport SSE a une reconnexion automatique intégrée, configurable via `sse.reconnect` et `sse.queue` au niveau client.

### Configuration de reconnexion

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: {
      attempts: 5, // Nombre max de tentatives
      delayMs: 1000, // Intervalle de réessai initial
      factor: 2, // Multiplicateur de backoff exponentiel
      maxDelayMs: 30000, // Intervalle max de réessai
      jitter: 1000, // Plage de jitter aléatoire (ms)
      shouldReconnect: async ({ attempt, cause, lastEventId }) => {
        return attempt <= 3
      },
    },
  }),
)
```

Priorité de reconnexion :

1. Si `onerror` retourne `null`, arrêter de reconnecter.
2. Si `shouldReconnect` retourne `false`, arrêter de reconnecter.
3. Si la limite `attempts` est dépassée, arrêter de reconnecter.
4. Sinon, calculer le prochain intervalle de réessai avec `delayMs` + backoff exponentiel `factor` + `jitter`.

> La reconnexion transporte automatiquement l'en-tête `Last-Event-ID` pour que le serveur puisse reprendre depuis le point d'arrêt.

### Configuration de file

Les événements entrent dans une file async interne après arrivée, puis sont consommés par l'itérateur. Tu peux limiter la taille de la file et le comportement de débordement :

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    queue: {
      maxSize: 100,
      overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
    },
  }),
)
```

| `overflow`    | Comportement                                                                 |
| ------------- | ---------------------------------------------------------------------------- |
| `drop-newest` | Ignorer les événements arrivant récemment, garder les anciens dans la file   |
| `drop-oldest` | Ignorer les événements les plus anciens, faire de la place pour les nouveaux |
| `error`       | File pleine lève une erreur, causant la fermeture du flux                    |

## Exemple complet

```typescript
import { createClient, defineEventStream, struct, withEndpoint, withSSEOptions } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOptions({
    reconnect: { attempts: 5, delayMs: 1000, factor: 2, maxDelayMs: 30000 },
    queue: { maxSize: 100, overflow: 'drop-oldest' },
    onInvalidEvent: async ({ reason, message }) => {
      console.warn(`Skipped invalid event [${reason}]: ${message.event}`)
    },
  }),
)

const useLogStream = defineEventStream({
  path: '/v1/logs',
  events: {
    log: struct.json(struct.object({ level: struct.string(), msg: struct.string() })),
  },
})

async function tailLogs() {
  const [error, stream, open] = await client.execute(useLogStream())

  if (error) {
    console.error('Connection failed:', error)
    return
  }

  console.log('Connected', open.url)

  for await (const event of stream) {
    if (typeof event.data === 'object' && event.data !== null) {
      console.log(`[${event.data.level}] ${event.data.msg}`)
    }
  }

  const closeInfo = await stream.closed
  console.log('Stream closed:', closeInfo.code)
}

tailLogs()
```

## Prochaines étapes

- [Client →](/core/client) — `createClient` et options `sse`
- [Commandes →](/core/commands) — Définitions de commandes et règles d'entrée
- [WebSocket →](/core/web-socket) — Connexion WebSocket et gestion d'état
