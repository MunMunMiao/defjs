---
title: WebSocket
description: Définissez les enveloppes de message, consommez les messages entrants, activez la reconnexion et le heartbeat, puis fermez vos sessions.
---

# WebSocket

`defineWebSocket(...)` crée le constructeur de commande d'un endpoint WebSocket qui échange des messages JSON.

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

## Enveloppe de message

Chaque message utilise un objet JSON avec un `type` qui est une chaîne non vide. Ce type sélectionne une Struct dans `incoming` ou `outgoing`.

Pour un payload objet, les champs peuvent apparaître à côté de `type` :

```json
{ "type": "message", "userId": 7, "text": "Hello" }
```

Pour un payload scalaire ou tableau, placez-le dans `data` :

```json
{ "type": "count", "data": 3 }
```

`type` et `data` sont des clés réservées de l'enveloppe. Si un payload objet possède lui-même un champ `data`, placez le payload entier dans `data` pour éviter toute ambiguïté lors de l'exécution :

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

La forme correspondante dans le format d'échange est `{ "type": "write", "data": { "data": "reviewed-value", "source": "settings" } }`.

Ne déclarez pas `type` comme un champ ordinaire du payload : la normalisation de l'enveloppe le réserve.

Une Struct facultative `incoming.default` gère les types de message non déclarés autrement. Sans elle, les types inconnus sont écartés.

## Tuple de démarrage

```typescript
const [error, session, startupConnection] = await client.execute(chat())
```

Pour l'exécution HTTP, SSE et WebSocket, `timeout` doit être un entier sûr positif compris entre `1` et `2_147_483_647` ; `0`, les valeurs négatives ou fractionnaires, `NaN`, `Infinity` et les valeurs supérieures à cette limite renvoient `REQUEST_VALIDATION_FAILED` avant la création de toute ressource de requête, de flux ou de socket.

WebSocket renvoie :

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

En cas de succès, le troisième élément est l'instantané initial avec `generation: 1`. Il peut contenir `url`, `protocol` et `extensions` du premier socket physique.

`session.connection` est un getter dynamique ; chaque ouverture physique réussie incrémente `generation`. Conservez le troisième élément du tuple si l'instantané initial vous importe.

Ne journalisez pas les URL de connexion. Elles peuvent contenir des identifiants de chemin, des données applicatives de query et des champs de propagation de télémétrie.

## Session active

Une `WebSocketSession` représente une session logique qui peut couvrir plusieurs tentatives de connexion physique.

| Membre                     | Comportement                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `connection`               | Informations dynamiques sur la dernière connexion.                                    |
| `bufferedAmount`           | Octets non envoyés du socket natif, ou `0` sans socket.                               |
| `state`                    | État dynamique de la session logique.                                                 |
| `receive`                  | File de travail asynchrone partagée des messages entrants validés.                    |
| `send(message)`            | Vérifie l'écriture, valide, sérialise, puis envoie ou met en file.                    |
| `close(code?, reason?)`    | Demande la fermeture définitive.                                                      |
| `closed`                   | Promesse des informations de fermeture définitive observées.                          |
| `onStateChange(listener)`  | Ajoute un observateur d'état et renvoie une fonction de désinscription.               |
| `onRuntimeError(listener)` | Ajoute un observateur d'erreur d'exécution et renvoie une fonction de désinscription. |

Une fois la session renvoyée, le client ne la suit plus. L'appelant prend en charge sa consommation, ses observateurs, son annulation et sa fermeture.

## Recevoir des messages

Les messages texte, ArrayBuffer, tableaux typés et Blob sont décodés dans leur ordre d'arrivée comme du JSON UTF-8. Les entrées suivantes sont écartées silencieusement :

- enveloppe qui n'est pas un objet ;
- `type` absent, vide ou non textuel ;
- type inconnu sans Struct `incoming.default`.

Le JSON mal formé et les échecs de validation de la Struct sélectionnée sont envoyés à `onRuntimeError` ; la frame est écartée et la session continue.

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

`receive` n'autorise qu'un seul itérateur. `maxIncomingQueueSize` est une limite positive obligatoire ; un débordement vide le tampon, fait échouer l'itérateur et termine la session en `error`.

## Envoyer des messages

La méthode `send(...)` est synchrone. Elle peut lever immédiatement une exception lorsque :

- l'endpoint ne déclare aucun objet `outgoing` ;
- le message n'a pas de `type` valide ;
- le type n'est pas déclaré ;
- le décodage structurel ou l'encodage du payload échoue ;
- la file sortante appartenant à l'endpoint est désactivée ou pleine pendant `reconnecting` ;
- le socket natif lève une exception lors d'un envoi immédiat.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

L'écriture logique est vérifiée avant validation ou sérialisation du payload. L'envoi direct n'a lieu que si l'état logique et le socket physique courant sont `open`. La mise en file n'a lieu que pendant `reconnecting` avec un `maxOutgoingQueueSize` positif sur l'endpoint. La FIFO est vidée avant que le socket de remplacement publie `open`.

Pendant une fermeture manuelle, après un état terminal et tant que le prédicat de reconnexion n'a pas tranché un remote close, `send` lève `InvalidStateError`. Le transport ne rejoue aucun frame déjà envoyé à un précédent socket physique.

## État

`session.state` peut prendre les valeurs suivantes :

| État           | Signification                                             |
| -------------- | --------------------------------------------------------- |
| `idle`         | État interne initial avant le début de l'exécution.       |
| `connecting`   | La première tentative physique démarre.                   |
| `open`         | Le socket physique courant est ouvert.                    |
| `reconnecting` | Une nouvelle tentative physique est préparée ou retardée. |
| `closing`      | Le propriétaire a demandé une fermeture manuelle.         |
| `closed`       | Fermeture définitive sans erreur normalisée.              |
| `aborted`      | Annulation externe définitive normalisée en `ABORTED`.    |
| `error`        | Autre échec définitif.                                    |

`session.state` décrit le cycle de vie logique, sans prouver qu'un socket natif existe. Pendant `reconnecting`, `send` utilise la capacité sortante appartenant à l'endpoint.

Les échecs d'observateurs sont isolés : l'échec d'un listener d'état est transmis aux listeners d'erreur, et l'échec de ces derniers à `globalThis.reportError` lorsqu'il existe. Le règlement terminal libère les observateurs ; désinscrivez-les si leur propriétaire se termine avant.

### Avant chaque tentative

`beforeConnect` peut se configurer sur le client ou pour une seule exécution. Il s'exécute avant le constructeur natif, lors de la tentative initiale comme de chaque reconnexion :

```typescript
declare const refreshConnectionState: (signal: AbortSignal) => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: ({ signal }) => refreshConnectionState(signal),
})
```

Le hook reçoit `{ attempt, signal }` ; `attempt` vaut d'abord `0` puis augmente aux reconnexions. Transmettez `signal` aux travaux asynchrones possédés. Annulation et timeout rivalisent avec le hook, consomment les rejets tardifs et empêchent un résultat tardif de créer un socket. Une exception ou un rejet est un échec terminal du transport.

## Reconnexion explicite

Sans objet de reconnexion, aucune reconnexion n'a lieu. Configurez-la sur le client ou pour une exécution :

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

`attempts` désigne le nombre de nouvelles tentatives après la tentative initiale. Un objet vide en active trois avec les valeurs par défaut suivantes :

| Champ             | Valeur par défaut                                 |
| ----------------- | ------------------------------------------------- |
| `attempts`        | `3`                                               |
| `delayMs`         | `1000`                                            |
| `factor`          | `2`                                               |
| `maxDelayMs`      | `30000`                                           |
| `jitter`          | `0`                                               |
| `shouldReconnect` | Renvoie `true` pour chaque résultat de fermeture. |

Le prédicat par défaut retente les fermetures distantes propres comme non propres. Définissez votre propre prédicat lorsqu'une fermeture propre doit être définitive. `attempt` commence à 1 pour la première nouvelle tentative.

Le délai de base vaut `min(delayMs * factor ** (attempt - 1), maxDelayMs)`. Le jitter WebSocket est multiplicatif : une valeur comme `0.2` choisit un facteur aléatoire compris entre `0.8` et `1.2`. Il diffère du jitter SSE, qui ajoute des millisecondes.

`shouldReconnect` est synchrone. Une exception termine la session en `error` ; un `false` explicite la termine en `closed`. La reconnexion ne fait que créer un nouveau socket physique et ne rejoue aucun envoi antérieur. Quand `session.connection.generation` augmente, ne restaurez que les abonnements encore actifs et sûrs à rejouer, jamais les mutations.

## Heartbeat

Le heartbeat doit lui aussi être activé explicitement :

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

`message` doit produire une valeur valide pour l'objet `outgoing` de l'endpoint. Un message reconnu par `isAck` annule le timeout du heartbeat et n'est pas ajouté à `receive`.

Les échecs de sérialisation, d'envoi, de prédicat d'ack ou de timeout du heartbeat sont fatals. Ils notifient les listeners d'erreur, font échouer `receive` et terminent la session en `error` sans consulter la politique de reconnexion.

`intervalMs` et un `timeoutMs` défini doivent être positifs, finis et au plus égaux à `2_147_483_647`. Tant qu'une échéance d'ack est active, les intervalles suivants n'envoient pas d'autre ping et ne la réinitialisent pas ; un ack ou l'arrêt de la session l'efface.

## Files

Les limites de file appartiennent à la définition de l'endpoint. `maxIncomingQueueSize` est un entier sûr positif obligatoire ; un débordement est fatal et supprime les valeurs en attente. `maxOutgoingQueueSize` est un entier sûr non négatif facultatif, égal à `0` par défaut ; une valeur positive conserve les frames FIFO entre les tentatives et refuse le débordement sans supprimer les plus anciennes.

Ces limites comptent les éléments, pas les octets. `session.bufferedAmount` expose séparément les octets en attente du socket natif. `receive` n'autorise qu'un seul itérateur.

## Responsabilité de la fermeture

`session.close(code, reason)` valide d'abord un code `1000` ou `3000..4999` et une raison de 123 octets UTF-8 au maximum. Une entrée valide passe à `closing`, demande la fermeture native et attend le vrai `CloseEvent` ; le code et la raison observés prévalent sur la demande.

`session.closed` se résout avec les informations de fermeture observées à l'exécution :

```typescript
type WebSocketCloseInfo =
  | { kind: 'closed'; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'aborted'; cause?: unknown; code?: number; reason?: string; wasClean?: boolean }
  | { kind: 'error'; cause: unknown; code?: number; reason?: string; wasClean?: boolean }
```

La fermeture manuelle, un remote close sans cause et un refus explicite de reconnexion produisent `closed`. L'annulation externe produit `aborted` ; timeout et échecs d'exécution produisent `error`. Si le close natif lève, un seul fallback sans arguments est tenté ; si les deux lèvent, la session devient `error` sans troisième appel.

Désinscrivez les listeners et fermez la session à la limite du composant, de la route, du traitement ou du service qui l'a ouverte. Le démontage d'un provider ne suffit pas.

## Sécurité de l'URL et de l'authentification

Les URL de base HTTP sont converties vers les schémas WebSocket : `http:` devient `ws:` et `https:` devient `wss:`. Fournissez des paramètres de `path` bruts : Core encode chaque segment exactement une fois, transforme `%` en `%25` et refuse la valeur vide, `.` et `..`. Les valeurs de `query` utilisent le sérialiseur configuré.

L'ordre de priorité des sous-protocoles est : option d'exécution, puis option du client, puis définition d'endpoint. Un tableau de sous-protocoles explicitement vide masque les valeurs de priorité inférieure.

Les API WebSocket des navigateurs ne peuvent pas définir d'en-têtes arbitraires pendant le handshake. N'utilisez pas les paramètres de query comme canal générique pour les identifiants : les outils du navigateur, les proxies, les journaux d'accès et la télémétrie peuvent enregistrer les URL. Utilisez TLS (`wss:`) et un mécanisme d'authentification validé pour votre déploiement, par exemple un flux de cookie same-site adapté ou un ticket de connexion de courte durée.

## Étapes suivantes

- [SSE](/fr-FR/core/sse) compare la reconnexion et le comportement des files de flux.
- [Intercepteurs](/fr-FR/core/interceptors) montre comment préserver les getters dynamiques d'une session.
- [Erreurs](/fr-FR/core/errors) couvre les échecs du tuple de démarrage.
