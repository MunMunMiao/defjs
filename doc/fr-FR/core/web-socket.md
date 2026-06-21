---
title: WebSocket
description: Typed WebSocket endpoints with struct-driven messages, automatic reconnect, heartbeat, and send queueing.
---

# WebSocket

`@defjs/core` fournit des points de terminaison WebSocket typés via `defineWebSocket`. Chaque point de terminaison déclare :

- Schémas `incoming` — messages que le serveur envoie au client.
- Schémas `outgoing` — messages que le client envoie au serveur.
- Schéma `input` + handler `build` — paramètres de requête et construction du chemin/query (optionnel).

Les messages sont encodés en JSON et validés au runtime contre les schémas déclarés.

## Définir un point de terminaison WebSocket

Utilise `defineWebSocket` pour créer un constructeur de commande typé. Le constructeur est ensuite exécuté avec `client.execute()`.

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useChatSocket = defineWebSocket({
  // Optionnel : construire l'URL de connexion depuis l'entrée
  input: struct.request({
    query: struct.object({ roomId: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ roomId: input.query.roomId })
  },

  // Messages du serveur → client
  incoming: {
    joined: struct.object({ roomId: struct.string(), userId: struct.number() }),
    message: struct.object({ text: struct.string(), userId: struct.number() }),
  },

  // Messages du client → serveur
  outgoing: {
    message: struct.object({ text: struct.string() }),
  },

  path: '/ws/chat',
  protocols: ['json'],
})
```

### Formes de schéma

**Les messages entrants** sont indexés par `type`. Quand un message arrive, son champ JSON `type` est matché contre les clés du schéma. Si le payload est un objet simple, ses champs sont fusionnés avec `type` :

```typescript
// Le serveur envoie : { "type": "message", "text": "hi", "userId": 1 }
// Le client reçoit : { type: 'message', text: 'hi', userId: 1 }
```

Si le payload est un scalaire ou un tableau, il est enveloppé sous `data` :

```typescript
// Le serveur envoie : { "type": "notification", "data": [1, 2, 3] }
// Le client reçoit : { type: 'notification', data: [1, 2, 3] }
```

**Les messages sortants** suivent la même convention. La méthode `send()` accepte un message avec un `type` correspondant à une des clés `outgoing` :

```typescript
socket.send({ type: 'message', text: 'hello' })
```

Une clé spéciale `default` peut être utilisée dans `incoming` pour attraper les types de messages non déclarés avec un schéma partagé.

## Exécuter et consommer les messages

`client.execute()` retourne un tuple `[error, socket, connection]` :

```typescript
const [error, socket, connection] = await client.execute(useChatSocket({ query: { roomId: 'room-1' } }))

if (error || !socket) {
  // gérer l'échec de démarrage (validation, transport, abort, etc.)
  return
}

// Itérer les messages entrants
for await (const message of socket.receive) {
  switch (message.type) {
    case 'joined':
      console.log('User joined:', message.userId)
      break
    case 'message':
      console.log('New message:', message.text)
      break
  }
}

// Ou utiliser l'async iterator directement
const iterator = socket.receive[Symbol.asyncIterator]()
const next = await iterator.next()
if (!next.done) {
  console.log(next.value)
}
```

## API `WebSocketSession`

| Membre                     | Type                                       | Description                                                                       |
| -------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| `connection`               | `WebSocketConnectionInfo`                  | `{ url?, protocol?, extensions? }` depuis le socket sous-jacent.                  |
| `state`                    | `WebSocketState`                           | État de cycle de vie actuel (voir ci-dessous).                                    |
| `receive`                  | `AsyncIterable<TIncoming>`                 | Async iterator des messages entrants validés.                                     |
| `closed`                   | `Promise<WebSocketCloseInfo>`              | Se résolve quand le socket se ferme avec `{ code?, reason?, wasClean?, cause? }`. |
| `send(message)`            | `(message: TOutgoing) => void`             | Envoie un message sortant. Mis en file si pas encore ouvert.                      |
| `close(code?, reason?)`    | `(code?: number, reason?: string) => void` | Ferme la connexion gracieusement.                                                 |
| `onStateChange(listener)`  | `(state: WebSocketState) => void`          | Retourne une fonction de désinscription.                                          |
| `onRuntimeError(listener)` | `(error: unknown) => void`                 | Retourne une fonction de désinscription.                                          |

```typescript
// Surveillance d'état
const unsubscribe = socket.onStateChange((state) => {
  console.log('Socket state:', state)
})

// Erreurs runtime (échecs de schéma, timeout heartbeat, etc.)
socket.onRuntimeError((error) => {
  console.error('Runtime error:', error)
})

// Fermeture gracieuse
socket.close(1000, 'done')
await socket.closed
```

## Machine à états du cycle de vie de connexion

```
idle → connecting → open → closing → closed
            ↓           ↓
         reconnecting   error
            ↓           ↓
         (retry)      aborted
```

| État           | Signification                                                                               |
| -------------- | ------------------------------------------------------------------------------------------- |
| `idle`         | Avant que `execute()` soit appelé.                                                          |
| `connecting`   | Ouverture de la première tentative de connexion.                                            |
| `open`         | Connexion établie, les messages peuvent circuler.                                           |
| `closing`      | `close()` ou `abort` a été déclenché, en attente de l'événement de fermeture.               |
| `closed`       | Fermeture propre (pas d'erreur, ou fermeture manuelle).                                     |
| `reconnecting` | Connexion interrompue, en attente avant réessai.                                            |
| `error`        | Échec terminal (erreur de validation, erreur de transport, fermeture non-abort avec cause). |
| `aborted`      | Annulation explicite via `AbortSignal` ou `close()`.                                        |

Les transitions d'état sont émises via `onStateChange`. L'async iterator `receive` se termine quand le socket atteint un état terminal (`closed`, `error` ou `aborted`).

## Heartbeat

Configure un ping/ack périodique pour maintenir la connexion en vie ou détecter des pairs morts.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  heartbeat: {
    intervalMs: 30_000, // envoyer toutes les 30s
    message: () => ({ type: 'ping' }),
    timeoutMs: 10_000, // attendre l'ack dans les 10s
    isAck: (message) => message.type === 'pong',
  },
})
```

| Option       | Description                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------- |
| `intervalMs` | Intervalle entre les envois de heartbeat (requis).                                           |
| `message`    | Factory retournant le message de heartbeat. Typé contre `TOutgoing`.                         |
| `timeoutMs`  | Si défini, le socket est fermé avec le code `4000` quand aucun ack n'arrive dans les délais. |
| `isAck`      | Prédicat pour reconnaître un message entrant comme un ack de heartbeat.                      |

Le heartbeat peut être configuré par client (via `createClient({ webSocket: { heartbeat: ... } })`) ou par requête (via `execute()` options). La configuration au niveau requête l'emporte.

## Reconnexion

La reconnexion automatique est déclenchée quand la connexion s'interrompt de manière inattendue.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  reconnect: {
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.2,
    shouldReconnect: ({ attempt, code, reason, wasClean }) => {
      return !wasClean && attempt < 3
    },
  },
})
```

| Option            | Défaut       | Description                                                               |
| ----------------- | ------------ | ------------------------------------------------------------------------- |
| `attempts`        | `3`          | Nombre max de tentatives. `<= 0` désactive la reconnexion.                |
| `delayMs`         | `1000`       | Délai de base avant le premier réessai.                                   |
| `factor`          | `2`          | Multiplicateur de backoff exponentiel.                                    |
| `maxDelayMs`      | `30000`      | Plafond du délai calculé.                                                 |
| `jitter`          | `0`          | Facteur de randomisation (`0`–`1`).                                       |
| `shouldReconnect` | `() => true` | Prédicat pour décider si une fermeture donnée doit déclencher un réessai. |

Formule de délai : `min(delayMs * factor^(attempt - 1), maxDelayMs)`, puis jittered.

La reconnexion est aussi configurable au niveau client via `createClient({ webSocket: { reconnect: ... } })`.

## File d'envoi

Les messages envoyés avant que le socket soit `open` (ou pendant une déconnexion transitoire) sont mis en file et flushés une fois la connexion prête.

```typescript
const [error, socket] = await client.execute(useSocket(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest', // 'drop-newest' | 'drop-oldest' | 'error'
  },
})
```

| Option     | Description                                          |
| ---------- | ---------------------------------------------------- |
| `maxSize`  | Nombre max de messages en file. Par défaut illimité. |
| `overflow` | Comportement quand `maxSize` est dépassé.            |

La file est vidée sur fermeture terminale (`error`, `aborted`, `closed`).

## Fermeture manuelle et comportement d'abort

### `socket.close(code?, reason?)`

Effectue une fermeture gracieuse :

1. Appelle le `WebSocket.close(code, reason)` natif.
2. Annule le `AbortController` interne avec une raison `manual-web-socket-close`.
3. Le socket transite par `closing` → `closed`.
4. `socket.closed` se résout avec le `code` et `reason` fournis.

### `AbortSignal` (externe)

Passe un `AbortSignal` externe via les options de `execute()` :

```typescript
const controller = new AbortController()
const promise = client.execute(useSocket(), { signal: controller.signal })

// Plus tard :
controller.abort() // ferme immédiatement le socket et transite vers 'aborted'
```

Quand aborté **avant** l'ouverture du socket, `execute()` se résout avec une erreur de transport et `socket` est `undefined`. Quand aborté **après** l'ouverture, le socket transite vers `aborted` et `receive` se termine.

### `timeout`

Le délai d'attente au niveau requête est supporté, mais il ne peut pas être combiné avec `abort` sur la même requête (une erreur de définition est retournée) :

```typescript
// OK
client.execute(useSocket(), { timeout: 10_000 })

// Erreur — impossible de mélanger abort et timeout
client.execute(useSocket(), { abort: signal, timeout: 10_000 })
```

## Exemple complet

```typescript
import { createClient, defineWebSocket, struct } from '@defjs/core'

const client = createClient({ endpoint: 'https://api.example.com' })

const useSocket = defineWebSocket({
  input: struct.request({
    query: struct.object({ token: struct.string() }),
  }),
  build: (request, input) => {
    request.setQueryParams({ token: input.query.token })
  },
  incoming: {
    status: struct.object({ online: struct.boolean() }),
    alert: struct.object({ level: struct.string(), message: struct.string() }),
  },
  outgoing: {
    subscribe: struct.object({ channel: struct.string() }),
    ping: struct.object({}),
  },
  path: '/ws/live',
})

async function run(token: string) {
  const [error, socket] = await client.execute(useSocket({ query: { token } }), {
    heartbeat: {
      intervalMs: 30_000,
      message: () => ({ type: 'ping' }),
    },
    reconnect: {
      attempts: 5,
      delayMs: 1_000,
      factor: 2,
    },
  })

  if (error || !socket) {
    console.error('Failed to connect:', error)
    return
  }

  socket.onStateChange((state) => console.log('State:', state))
  socket.onRuntimeError((err) => console.error('Error:', err))

  socket.send({ type: 'subscribe', channel: 'news' })

  for await (const msg of socket.receive) {
    if (msg.type === 'status') {
      console.log('Online:', msg.online)
    } else if (msg.type === 'alert') {
      console.warn('Alert:', msg.level, msg.message)
    }
  }

  await socket.closed
  console.log('Socket closed')
}
```

## Prochaines étapes

- [SSE →](/core/sse) — Server-Sent Events avec schémas typés et reconnexion.
- [Client →](/core/client) — Création de client et configuration WebSocket.
- [Commandes →](/core/commands) — Règles d'entrée et de build pour `defineWebSocket`.
