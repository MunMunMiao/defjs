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

WebSocket renvoie :

```typescript
type SocketAwaitResult<TIncoming, TOutgoing> =
  | [error: null, session: WebSocketSession<TIncoming, TOutgoing>, connection: WebSocketConnectionInfo]
  | [error: RequestError<unknown>, session: undefined, connection: WebSocketConnectionInfo | undefined]
```

En cas de succès, le troisième élément est l'instantané de connexion au démarrage. Il peut contenir `url`, `protocol` et `extensions`, capturés à l'ouverture du premier socket physique.

`session.connection` est un getter dynamique. Une reconnexion remplace le socket physique sous-jacent et peut mettre cette valeur à jour. Conservez le troisième élément du tuple si l'instantané initial vous importe.

Ne journalisez pas les URL de connexion. Elles peuvent contenir des identifiants de chemin, des données applicatives de query et des champs de propagation de télémétrie.

## Session active

Une `WebSocketSession` représente une session logique qui peut couvrir plusieurs tentatives de connexion physique.

| Membre                     | Comportement                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------- |
| `connection`               | Informations dynamiques sur la dernière connexion.                                    |
| `state`                    | État dynamique de la session logique.                                                 |
| `receive`                  | File de travail asynchrone partagée des messages entrants validés.                    |
| `send(message)`            | Valide, sérialise, puis envoie ou met en file un message sortant.                     |
| `close(code?, reason?)`    | Demande la fermeture définitive.                                                      |
| `closed`                   | Promesse des informations de fermeture définitive observées.                          |
| `onStateChange(listener)`  | Ajoute un observateur d'état et renvoie une fonction de désinscription.               |
| `onRuntimeError(listener)` | Ajoute un observateur d'erreur d'exécution et renvoie une fonction de désinscription. |

Une fois la session renvoyée, le client ne la suit plus. L'appelant prend en charge sa consommation, ses observateurs, son annulation et sa fermeture.

## Recevoir des messages

Les messages texte, ArrayBuffer, tableaux typés et Blob sont décodés comme du JSON UTF-8. Les entrées suivantes sont écartées silencieusement :

- JSON invalide ;
- enveloppe qui n'est pas un objet ;
- `type` absent, vide ou non textuel ;
- type inconnu sans Struct `incoming.default`.

Une fois la Struct sélectionnée, un échec de décodage est envoyé à `onRuntimeError` et le message est écarté.

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

L'itérable entrant forme une unique file de travail partagée non bornée. Plusieurs itérateurs se disputent les messages ; ils ne constituent pas des souscriptions indépendantes. Le transport ne ralentit pas le serveur lorsque la file grossit. Consommez toujours les messages entrants ou fermez rapidement la session.

## Envoyer des messages

La méthode `send(...)` est synchrone. Elle peut lever immédiatement une exception lorsque :

- l'endpoint ne déclare aucun objet `outgoing` ;
- le message n'a pas de `type` valide ;
- le type n'est pas déclaré ;
- le décodage structurel ou l'encodage du payload échoue ;
- une file d'envoi bornée utilise `overflow: 'error'` ;
- le socket natif lève une exception lors d'un envoi immédiat.

```typescript
try {
  session.send({ type: 'send', text: 'Hello' })
} catch (error) {
  handleSendFailure(error)
}
```

Les messages envoyés avant l'ouverture ou entre deux tentatives de reconnexion rejoignent la file sortante. Son contenu est envoyé lorsqu'un socket physique s'ouvre.

N'appelez pas `send` après un état définitif. L'implémentation actuelle ne fournit pas de contrat stable de rejet après fermeture, et les données mises en file après la fermeture définitive peuvent ne jamais être envoyées.

## État

`session.state` peut prendre les valeurs suivantes :

| État           | Signification                                                                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `idle`         | État interne initial avant le début de l'exécution.                                                                                                                 |
| `connecting`   | La première tentative physique démarre.                                                                                                                             |
| `open`         | Dernier état logique émis après l'ouverture d'un socket physique. Pendant le délai de reconnexion, il peut rester à `open` alors qu'aucun socket physique n'existe. |
| `reconnecting` | Une nouvelle tentative physique démarre après son délai.                                                                                                            |
| `closing`      | Un socket actif en connexion ou ouvert est fermé par une annulation.                                                                                                |
| `closed`       | Fermeture définitive sans erreur normalisée.                                                                                                                        |
| `aborted`      | Annulation externe définitive normalisée en `ABORTED`.                                                                                                              |
| `error`        | Autre échec définitif.                                                                                                                                              |

`reconnecting` n'est pas émis pendant le délai. Il est émis lorsque la tentative suivante démarre après ce délai. Considérez `session.state` comme le dernier état de cycle de vie émis, pas comme la preuve qu'un socket natif existe encore. Les messages envoyés pendant cet intervalle entrent dans la file de sortie.

Les listeners d'état sont appelés directement. Ils ne doivent pas lever d'exception ; désinscrivez-les lorsque leur propriétaire disparaît.

### Avant chaque tentative

`beforeConnect` peut se configurer sur le client ou pour une seule exécution. Il s'exécute avant le constructeur natif, lors de la tentative initiale comme de chaque reconnexion :

```typescript
declare const refreshConnectionState: () => Promise<void>

const [error, session] = await client.execute(chat(), {
  beforeConnect: refreshConnectionState,
})
```

L'entrée de commande et la projection de requête sont déjà construites. Le hook ne relance pas `build` et ne modifie pas les valeurs liées de la query. Utilisez-le pour une préparation applicative, par exemple pour actualiser un état utilisé pendant le handshake. Une exception ou un rejet constitue un échec définitif du transport ; il n'est pas transmis au prédicat de reconnexion fondé sur la fermeture.

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

Gardez `shouldReconnect` synchrone et sans exception. La reconnexion crée un nouveau socket physique dans la même session logique. Les files entrante et sortante appartiennent à cette session logique.

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

Lorsqu'un `timeoutMs` positif expire, l'exécution transmet `Error('WebSocket heartbeat timeout')` aux listeners d'erreur et demande au socket natif une fermeture de code `4000`, avec la raison `heartbeat timeout`. Une politique de reconnexion distincte doit encore autoriser la reconnexion après cette fermeture.

Gardez `timeoutMs < intervalMs`. L'implémentation actuelle ne valide pas cette relation ; un timeout supérieur ou égal à l'intervalle peut se superposer aux timers de heartbeat suivants.

## Files

L'option `queue` ne configure que les messages sortants :

```typescript
const [error, session] = await client.execute(chat(), {
  queue: {
    maxSize: 100,
    overflow: 'drop-oldest',
  },
})
```

La file sortante n'est pas bornée par défaut. Lorsqu'elle est bornée, son mode de débordement par défaut est `drop-oldest` ; les alternatives sont `drop-newest` et `error`. La fermeture définitive vide cette file d'envoi.

La file entrante ne possède aucune option publique de limite ou de débordement. C'est une file de travail partagée non bornée, sans backpressure. Le propriétaire de la ressource doit la consommer en continu ou fermer la session.

## Responsabilité de la fermeture

`session.close(code, reason)` appelle la méthode `close` du socket natif courant et annule la session logique avec un marqueur de fermeture manuelle. Cet appel demande la fermeture ; il ne garantit ni un handshake gracieux, ni un état `closing` visible, ni une valeur finale de `closed` qui répète exactement le code et la raison demandés.

`session.closed` se résout avec les informations de fermeture observées à l'exécution :

```typescript
interface WebSocketCloseInfo {
  cause?: unknown
  code?: number
  reason?: string
  wasClean?: boolean
}
```

Une implémentation native qui n'émet jamais son événement de fermeture peut retarder la résolution. Une annulation externe peut se terminer en `aborted` ou `error` selon la raison normalisée et peut ne pas passer par `closing` si la session se trouve entre deux tentatives.

Désinscrivez les listeners et fermez la session à la limite du composant, de la route, du traitement ou du service qui l'a ouverte. Le démontage d'un provider ne suffit pas.

## Sécurité de l'URL et de l'authentification

Les URL de base HTTP sont converties vers les schémas WebSocket : `http:` devient `ws:` et `https:` devient `wss:`. Les paramètres de `path` ne sont pas encodés par segment. Les valeurs de `query` utilisent le sérialiseur configuré.

L'ordre de priorité des sous-protocoles est : option d'exécution, puis option du client, puis définition d'endpoint. Un tableau de sous-protocoles explicitement vide masque les valeurs de priorité inférieure.

Les API WebSocket des navigateurs ne peuvent pas définir d'en-têtes arbitraires pendant le handshake. N'utilisez pas les paramètres de query comme canal générique pour les identifiants : les outils du navigateur, les proxies, les journaux d'accès et la télémétrie peuvent enregistrer les URL. Utilisez TLS (`wss:`) et un mécanisme d'authentification validé pour votre déploiement, par exemple un flux de cookie same-site adapté ou un ticket de connexion de courte durée.

## Étapes suivantes

- [SSE](/fr-FR/core/sse) compare la reconnexion et le comportement des files de flux.
- [Intercepteurs](/fr-FR/core/interceptors) montre comment préserver les getters dynamiques d'une session.
- [Erreurs](/fr-FR/core/errors) couvre les échecs du tuple de démarrage.
