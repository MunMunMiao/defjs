---
title: SSE
description: Définissez et décodez des Server-Sent Events bornés, configurez la reconnexion et fermez les flux ouverts.
---

# SSE

`defineEventStream(...)` crée un constructeur de commande SSE. L'endpoint déclare son `path` et la Struct associée à chaque nom d'événement.

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

La méthode par défaut est `GET`. Un endpoint peut en choisir une autre, mais le contexte `build` SSE haut niveau ne prend aucun corps de requête en charge.

## Décodage des événements

L'analyseur SSE sélectionne `events[eventName]`, puis `events.default` s'il existe. Sans correspondance, il écarte l'événement et transmet `missing-struct` à l'observateur facultatif des événements invalides.

Le champ SSE `data:` arrive sous forme de texte :

- `struct.string()`, `struct.text()`, `struct.any()` et `struct.unknown()` reçoivent du texte ;
- `struct.number()` retire les espaces autour du texte et accepte un nombre fini ;
- `struct.boolean()` retire les espaces et n'accepte que `true` ou `false` ;
- `struct.json(inner)` analyse le texte JSON, puis applique le décodage structurel avec `inner`.

Un simple `struct.object(...)` n'analyse pas un texte d'événement qui ressemble à du JSON. Entourez-le de `struct.json(...)`.

Une Struct `default` gère les noms qui ne sont pas déclarés autrement :

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

Sans Struct `default`, `EventStreamData<TEvents>` est une union discriminée des noms d'événement déclarés. Un branchement sur `event.event` réduit `event.data` à la sortie de la Struct correspondante. Lorsque la Struct `default` est présente, sa branche conserve le nom réellement reçu sur le réseau sous la forme `event: string` ; les flux qui combinent des événements connus avec `default` conservent donc cette branche de repli générique.

## Entrée et construction de la requête

Utilisez `struct.request(...)` pour les sections `path`, `query` et `headers` :

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

Un `build` SSE personnalisé peut définir les paramètres de chemin, la query et les en-têtes. Il reçoit une projection liée au schéma. Il ne peut définir ni corps ni mode `credentials`. Configurez ce dernier avec `withCredentials(...)` sur le client.

## Tuple de démarrage

```typescript
const [error, stream, startupOpen] = await client.execute(
  roomEvents({
    path: { roomId: 'general' },
  }),
)
```

Pour l'exécution HTTP, SSE et WebSocket, `timeout` doit être un entier sûr positif compris entre `1` et `2_147_483_647` ; `0`, les valeurs négatives ou fractionnaires, `NaN`, `Infinity` et les valeurs supérieures à cette limite renvoient `REQUEST_VALIDATION_FAILED` avant la création de toute ressource de requête, de flux ou de socket.

SSE renvoie :

```typescript
type StreamAwaitResult<TEvent> =
  | [error: null, stream: EventStreamHandle<TEvent>, open: StreamOpenInfo]
  | [error: RequestError<unknown>, stream: undefined, open: StreamOpenInfo | undefined]
```

En cas de succès, le troisième élément est l'instantané d'ouverture validé au démarrage. Sa réponse a passé les contrôles du statut HTTP et du `Content-Type` `text/event-stream`.

`stream.open` est un getter dynamique. Il reflète la dernière réponse vue par le flux logique, y compris celle d'une reconnexion ultérieure qui échoue ensuite à la validation du statut ou du type de contenu. Conservez `startupOpen` séparément si l'instantané initial vous importe.

Par défaut, ne journalisez ni `startupOpen.url`, ni `stream.open.url`, ni les URL de réponse. Elles peuvent contenir des données sensibles dans le chemin ou la query.

## Consommer les événements

Le propriétaire doit démarrer l'itération et organiser la fermeture dans le même cycle de vie :

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

Un `execute` réussi signifie que le démarrage est terminé. Les erreurs ultérieures rejettent l'itérateur et se retrouvent dans `stream.closed` ; elles ne modifient pas l'élément `error` du tuple initial.

Quitter prématurément une boucle `for await` par `break`, `return` ou une erreur lancée appelle `return()` sur l'itérateur. Le flux se ferme automatiquement avec `{ code: 'aborted', reason: 'iterator-return' }` ; attendre `stream.closed` permet d'observer cet état terminal. Appelez explicitement `stream.close(...)` uniquement lorsque le propriétaire doit fermer le flux depuis l'extérieur d'une itération active.

## Événements invalides

Configurez `onInvalidEvent` avec `withSSEOnInvalidEvent(...)` ou `withSSEOptions(...)` :

```typescript
const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, signal }) => {
    if (signal.aborted) return
    recordInvalidEvent({ eventName: message.event, reason })
  }),
)
```

L'observateur reçoit :

- `reason: 'missing-struct' | 'validation-failed'` ;
- l'`id`, le nom et le texte `data` de l'événement brut ;
- `cause` en cas d'échec de validation.
- le `signal` de la tentative active.

L'événement est écarté, mais un événement valide ultérieur peut toujours être transmis. Les erreurs de l'observateur sont isolées, tandis qu'un abort interrompt un observateur en attente via `signal`. Gardez-le rapide et masquez les valeurs brutes `id`, `data` et `cause`.

## Reconnexion

SSE sait réessayer après un échec réseau ou de lecture du flux. Une fin de fichier normale ferme le flux avec `code: 'eof'` et ne déclenche aucune reconnexion.

Par défaut, les nouvelles tentatives commencent après 1 seconde et leur nombre n'est pas limité. Définissez `attempts` pour les borner :

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

`attempts` désigne le nombre de nouvelles tentatives après la tentative initiale. `attempts: 0` les désactive. La valeur `attempt` transmise à `shouldReconnect` commence à 1 et reste cumulative pendant toute la vie du flux logique ; une connexion physique réussie ne la remet pas à zéro.

Le délai part de l'intervalle courant. Le serveur peut le modifier avec un champ SSE `retry:`. `factor` applique une croissance exponentielle, puis `maxDelayMs` borne cette base. `jitter` ajoute ensuite un nombre aléatoire de millisecondes compris entre zéro et la valeur configurée. Comme cet ajout intervient après la borne, le délai final peut dépasser `maxDelayMs` de moins de `jitter`.

```typescript
withSSEReconnect({
  attempts: 5,
  shouldReconnect({ attempt, lastEventId, cause, open }) {
    return shouldRetryStream({ attempt, lastEventId, cause, status: open?.response.status })
  },
})
```

Le transport envoie le dernier ID d'événement dans `Last-Event-ID` lors des tentatives suivantes. Si `shouldReconnect` lève ou rejette, les nouvelles tentatives cessent et le démarrage ou flux en attente se termine avec cette erreur de politique. Abort interrompt un prédicat en attente via le signal de la tentative active.

Les échecs de validation HTTP ou d'ouverture, les erreurs fatales de traitement des messages et une fin de fichier normale ne sont pas des échecs réseau ou de lecture éligibles à une nouvelle tentative. Ne supposez pas que chaque fin de parcours entraîne une reconnexion.

## Limites propres à l'endpoint

Un flux n'accepte qu'un seul consommateur d'itérateur asynchrone. Créer un second itérateur lève une erreur. Retourner l'itérateur, notamment par un `break` anticipé dans `for await`, ferme automatiquement le flux avec le motif `iterator-return`.

Chaque définition exige des entiers sûrs positifs `maxBufferSize` et `maxQueueSize`. Le premier limite chaque ligne SSE et les données de l'événement courant ; le second limite les événements analysés en attente. Un débordement est fatal et ne supprime jamais silencieusement un événement.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.json(notificationStruct) },
})
```

Une fin de fichier normale permet de vider les événements en attente. Une erreur fatale de parsing, de transformation ou de débordement efface le tampon, annule le body actif, rejette l'itération et résout `stream.closed` avec `code: 'error'`.

## Fermeture définitive

`stream.closed` se résout avec une union discriminée :

```typescript
type EventStreamCloseInfo =
  | { code: 'eof'; reason?: string; cause?: unknown }
  | { code: 'aborted'; reason?: string; cause?: unknown }
  | { code: 'error'; errorCode: EventStreamErrorCode; reason?: string; cause?: unknown }
```

- `eof` signifie que le corps de la réponse s'est terminé normalement.
- `aborted` comprend un appel explicite à `stream.close(...)` ou un parcours d'annulation.
- `error` signifie que les nouvelles tentatives ont cessé ou qu'une erreur définitive du flux s'est produite. Cette branche contient toujours un `errorCode` public.

`EventStreamErrorCode` possède six valeurs stables :

| Error code                  | Signification                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------ |
| `INVALID_RESPONSE`          | Le statut, le content type, l'erreur ou le corps de réponse était invalide.                |
| `MESSAGE_PROCESSING_FAILED` | La transformation d'un événement ou un callback de cycle de vie a échoué.                  |
| `PARSER_LIMIT_EXCEEDED`     | Une limite de buffer du parser appartenant à l'endpoint a été dépassée.                    |
| `QUEUE_OVERFLOW`            | Les événements analysés ont dépassé la limite de file de l'endpoint.                       |
| `TIMEOUT`                   | La tentative de transport a atteint son timeout configuré.                                 |
| `TRANSPORT_ERROR`           | Un autre échec définitif de réseau, de lecture du flux ou de politique de retry a eu lieu. |

`stream.close(reason)` est idempotente. Elle annule le travail de transport actif, interdit les nouveaux ajouts dans la file et résout `stream.closed`. Le `return()` de l'itérateur utilise le même chemin de fermeture avec le motif `iterator-return`.

Les logs ordinaires ne doivent enregistrer que `close.code` et, dans la branche `error`, `close.errorCode`. Ne journalisez pas `reason`, `cause`, les événements bruts ou les URL du flux sans politique explicite de masquage et de rétention.

La couche applicative qui ouvre le flux est responsable de sa fermeture. Un client ou un provider de framework ne le ferme pas automatiquement.

## Étapes suivantes

- [WebSocket](/fr-FR/core/web-socket) couvre les sessions bidirectionnelles et la reconnexion explicite.
- [Intercepteurs](/fr-FR/core/interceptors) couvre la modification des en-têtes SSE et l'observation du cycle de vie.
- [Erreurs](/fr-FR/core/errors) explique la disponibilité de la réponse au démarrage.
