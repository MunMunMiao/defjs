---
title: WebSocket
description: Démarre une session JSON typée, reçois et envoie des enveloppes, puis ferme et attends closed.
---

# WebSocket

Démarre → reçois → envoie → ferme + `await session.closed`. Tu possèdes le désabonnement et le disposal. Clients, providers et intercepteurs ne ferment pas auto les sessions.

## Basic Setup

```typescript twoslash
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { message: struct.object({ text: struct.string() }) },
  outgoing: { send: struct.object({ text: struct.string() }) },
})

const [error, openedSession, startupConnection] = await client.execute(room())
if (error) {
  console.error(error.kind, error.code, startupConnection?.generation)
} else {
  await using session = openedSession
  const unsubscribe = session.onRuntimeError((cause) => console.error('runtime', cause))
  try {
    session.send({ type: 'send', text: 'Hello' })
    for await (const message of session.receive) {
      console.log(message.type, message.text)
      break
    }
  } finally {
    unsubscribe()
  }
}
```

## L’enveloppe JSON

`defineWebSocket(...)` décrit un endpoint à messages JSON. La map `incoming` requise sélectionne un Struct par type de message ; `outgoing` optionnelle fait pareil pour `session.send(...)`. Chaque message wire est un objet avec un `type` string non vide.

Les champs de payload objet siègent à côté de `type`. Les payloads scalaires et array utilisent le champ `data` de l’enveloppe :

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

```json
{ "type": "count", "data": 3 }
```

La map de messages contrôle le payload, pas le discriminateur d’enveloppe. `incoming.default` accepte les noms de type autrement non déclarés ; sans lui, les types inconnus sont droppés. Les frames texte, `ArrayBuffer`, typed-array et `Blob` entrantes se décodent en JSON UTF-8. JSON malformé et échecs Struct vont aux observateurs d’erreurs runtime — pas à `receive`.

Si un payload objet a un champ nommé `data`, il reste à côté de `type` après encodage (pas une enveloppe nested). Exemple : `write` avec `{ data: string, source: string }` wire en `{ type: 'write', data: string, source: string }`. La valeur côté appelant reste `{ type: 'write', data: { data, source } }` car `data` porte le payload objet avant sérialisation. Les alias s’appliquent aux champs de payload. Le discriminateur `type` appartient à l’enveloppe, pas au Struct.

`session.send(...)` valide et sérialise de façon synchrone. Envoie immédiatement quand open, met en queue pendant `reconnecting` quand une queue sortante est activée, throw `InvalidStateError` quand non writable. Throw aussi quand il n’y a pas de map outgoing, type non déclaré, échec de validation du payload, queue sortante désactivée/pleine, ou échec d’envoi natif.

`receive` est one-consumer. Un second itérateur est rejeté.

## Instantanés d’état

| Membre                     | Signification                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------ |
| `state`                    | `idle`, `connecting`, `open`, `reconnecting`, `closing`, `closed`, `aborted` ou `error`          |
| `connection`               | Dernière connexion physique : `generation`, URL, protocole négocié, extensions quand disponibles |
| `bufferedAmount`           | Compte d’octets natifs non envoyés, ou `0` sans socket physique                                  |
| `receive`                  | Iterable async one-consumer des messages entrants validés                                        |
| `onStateChange(listener)`  | S’abonne aux transitions d’état logique ; renvoie unsubscribe                                    |
| `onRuntimeError(listener)` | S’abonne aux erreurs runtime hors démarrage ; renvoie unsubscribe                                |
| `closed`                   | Promesse pour l’issue de close terminale logique                                                 |

`open` = socket physique ouvert. `reconnecting` inclut la préparation + le délai avant un remplacement. `connection.generation` incrémente à chaque socket physique qui atteint `open`. Le `startupConnection` du tuple reste le premier instantané réussi ; `session.connection` avance.

Échec de démarrage → `[error, undefined, connection?]`. Un échec de constructeur pré-open peut n’avoir pas de connexion ; timeout/close pendant le démarrage peut encore fournir un instantané. Après le retour de la session, les erreurs runtime passent par les observateurs, `receive` et `closed` — pas un second tuple d’execute.

```typescript twoslash
import type { RequestError, WebSocketConnectionInfo, WebSocketSession } from '@defjs/core'

type SocketResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const result: SocketResult<unknown, never> | undefined = undefined
void result
```

## Reconnect

Le reconnect est opt-in. Pas d’objet `reconnect` → une fermeture physique termine la session logique. Quand configuré, les défauts sont `attempts: 3`, `delayMs: 1000`, `factor: 2`, `maxDelayMs: 30000`, `jitter: 0`. `attempts` compte les retries après la tentative initiale ; `attempts: 0` désactive. Le prédicat par défaut accepte chaque issue de close.

```ts
import { createClient, defineWebSocket, struct, withEndpoint, withWebSocketReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://chat.example.com'),
  withWebSocketReconnect({
    attempts: 3,
    delayMs: 500,
    factor: 2,
    maxDelayMs: 10_000,
    jitter: 0.2,
    shouldReconnect({ attempt, code, wasClean }) {
      return attempt <= 3 && (wasClean !== true || code === 1006)
    },
  }),
)
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { ready: struct.object({ ok: struct.boolean() }) },
})
const [error, session] = await client.execute(room())
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`shouldReconnect` reçoit la prochaine tentative de retry, la cause de close, le code, la reason et `wasClean`. Un `session.close(...)` manuel n’entre pas dans le prédicat. Un throw de préparation/politique termine la session logique avec une erreur.

Le jitter de backoff WebSocket est **multiplicatif** (`jitter: 0.2` → délai entre `0.8x` et `1.2x`). Le jitter SSE est un facteur multiplicatif 0–1, comme WebSocket. Les valeurs delay/factor/jitter/attempt sont validées avant le constructeur ; les délais de timer ne peuvent pas dépasser `2_147_483_647` ms.

`beforeConnect({ attempt, signal })` tourne avant le constructeur initial et chaque reconnect. Passe son signal dans le refresh de token pour que l’annulation arrête à la fois la prep et le connect.

## Heartbeat

Opt-in à l’execute ou à la portée client. L’intervalle envoie `message()` via la map Struct outgoing. Un `isAck(message)` optionnel reconnaît un ack — ce message efface le timeout et n’est **pas** livré à `receive`.

```ts
import { createClient, defineWebSocket, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://chat.example.com'))
const room = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: { pong: struct.object({ ok: struct.boolean() }) },
  outgoing: { ping: struct.object({}) },
})

const [error, session] = await client.execute(room(), {
  heartbeat: {
    intervalMs: 30_000,
    timeoutMs: 10_000,
    message: () => ({ type: 'ping' }),
    isAck: (message) => message.type === 'pong',
  },
})
if (!error) {
  console.log(session.state)
  session.close(1000, 'done')
}
```

`intervalMs` et `timeoutMs` doivent être des timers finis positifs ≤ `2_147_483_647`. Le message heartbeat doit être valide pour la map outgoing. Les échecs de sérialisation, d’envoi natif, de classification d’ack et de timeout sont fatals pour la session logique — ils ne deviennent pas des reconnects ordinaires.

## Queues

| Réglage                | Valeur requise                                | Comportement                                                                                                                |
| ---------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `maxIncomingQueueSize` | Entier sûr positif                            | Borne les messages parsés en attente de `receive` et les frames brutes en attente de transform. Overflow → `state: 'error'` |
| `maxOutgoingQueueSize` | Entier sûr non négatif optionnel ; défaut `0` | FIFO seulement pendant `state === 'reconnecting'`. Pleine/désactivée → `send(...)` throw                                    |

Les frames sortantes en queue flush avant que le socket de remplacement publie `open`. Les frames déjà envoyées sur un socket antérieur ne sont jamais auto-replayées. Les queues de reconnect servent aux messages que tu envoies pendant le reconnect — pas à reconstruire l’état app.

Un overflow entrant efface la séquence en attente, fait échouer `receive`, arrête la session, résout `session.closed` avec `kind: 'error'`. Garde le consommateur assez rapide ou relève la borne depuis la taille/mémoire mesurée.

## Protocoles et authentification

`protocols` de définition, `withWebSocketProtocols(...)` client, et `protocols` d’execute posent la liste de sous-protocoles du constructeur. Précédence : exécution → client → définition. La première liste définie est copiée pour la session logique et réutilisée au reconnect.

Les constructeurs WebSocket navigateur n’acceptent pas d’en-têtes de handshake arbitraires. Defjs convertit `http:` → `ws:` et `https:` → `wss:`, encode les placeholders de path une fois, utilise le sérialiseur de query configuré. La construction de query WebSocket sérialise aussi les valeurs de query complexes en JSON (contrairement à la query HTTP scalaires-seulement par défaut).

`withCredentials(true)` est credentials Fetch pour HTTP/SSE — pas l’auth WebSocket. Utilise une politique cookie/session revue, un sous-protocole, ou un ticket de connexion de courte durée. Ne mets pas de credentials généraux ou de secrets longue durée dans la query string.

## Fermeture et propriété

`session.close(code?, reason?)` demande une fermeture terminale et arrête le heartbeat. Le code doit être `1000` ou `3000..4999` ; reason ≤ 123 octets UTF-8. Des args de close invalides throwent avant de changer l’état.

`await using` demande la fermeture puis attend le teardown possédé par Defjs. `close()` et `closed` restent disponibles quand tu veux une raison manuelle ou le résultat terminal logique.

`kind` terminal : `'closed'`, `'aborted'` ou `'error'`, avec `code` / `reason` / `wasClean` natifs optionnels et un `cause` pour aborted/error. `closed` décrit la fin logique et ne prouve pas la fermeture TCP physique. Le disposer borne le teardown à une seconde ; sans événement close, il termine le cleanup Defjs et peut rejeter avec une `DOMException` nommée `TimeoutError`, tandis que `closed` conserve le résultat manuel logique. Les champs de close natifs observés gagnent sur le fallback demandé par le propriétaire.

## Frontière GraphQL

Defjs fournit une enveloppe JSON typée et un cycle de vie de session logique. Il n’implémente **pas** un protocole applicatif WebSocket. Les features GraphQL-over-WebSocket — init de connexion, IDs d’opération, `next`/`error`/`complete`, disposal, replay de subscription — sont hors du contrat core.

Utilise un client de protocole comme `graphql-ws` quand le serveur exige ce protocole, ou modèle ta propre enveloppe avec `defineWebSocket(...)`. Une map de messages seule ne négocie pas la sémantique GraphQL.

## Recettes liées

- [Ouvrir une session WebSocket](../recipes/websocket-session.md)
- [Consommer un flux SSE](../recipes/consume-sse.md)
