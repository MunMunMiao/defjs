---
title: Server-Sent Events
description: Consomme un flux SSE typé, ferme-le, et attends la promesse terminale closed.
---

# Server-Sent Events

Ouvre un flux, itère une fois, puis `close` et `await stream.closed`. Tu possèdes ce cycle de vie — clients et plugins ne le disposent pas pour toi.

## Basic Setup

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
  },
})

const [error, openedStream] = await client.execute(notifications())
if (error) {
  console.error(error.code)
} else {
  await using stream = openedStream
  for await (const event of stream) {
    if (event.event === 'message') console.log(event.data.text)
  }
}
```

## Définir le flux

`defineEventStream(...)` a besoin de `events`, d’un `maxBufferSize` entier sûr positif, d’un `maxQueueSize` entier sûr positif, et d’un `path` relatif. La méthode par défaut est `GET`.

L’entrée de requête peut avoir `path`, `query` et `headers` — pas `body`. Un `build` custom n’obtient que les setters path/query/header. Defjs envoie `Accept: text/event-stream` quand tu n’as pas déjà posé `Accept`.

Un flux logique peut couvrir plusieurs tentatives Fetch physiques. SSE relance par défaut les échecs réseau et de lecture de flux transitoires même sans options de reconnect ; sans limite `attempts` ces retries sont non bornés. Tu obtiens quand même un handle et un itérateur async.

## Ouvrir et inspecter

`client.execute(...)` ne se résout qu’après que les checks de statut, content-type et body passent :

```typescript twoslash
import { createClient, defineEventStream, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: { message: struct.string() },
})

const [error, stream, startupOpen] = await client.execute(notifications())
if (error) {
  console.error(error.kind, error.code, startupOpen?.response.status)
} else {
  console.log(stream.open.response.status, startupOpen.response.status, stream.open.url)
  stream.close('example-finished')
  await stream.closed
}
```

La réponse doit être réussie, essence media type `text/event-stream`, et avoir un body. Démarrage non-2xx → `HTTP_STATUS`. Mauvais content type ou body manquant → `RESPONSE_VALIDATION_FAILED`. Un instantané de réponse peut encore siéger dans le troisième slot du tuple quand la validation échoue après l’arrivée de la réponse.

`startupOpen` est l’instantané initial. `stream.open` est live et change aux ouvertures physiques ultérieures. Garde la valeur du tuple quand la première réponse importe.

```typescript twoslash
import type { EventStreamHandle, EventStreamOpenInfo, RequestError } from '@defjs/core'

type StreamResult<T> =
  | [error: null, stream: EventStreamHandle<T>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]

const result: StreamResult<string> | undefined = undefined
void result
```

## Décoder les événements

Nom d’événement wire → `events[eventName]` ; sinon `events.default`. Pas de Struct correspondant → événement non livré. Champ SSE `event` manquant → nom logique `message`.

Les `data` SSE commencent en texte. Le Struct sélectionné décide de la conversion :

| Struct                                                                 | Conversion                                                                    |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `struct.string()`, `struct.text()`, `struct.any()`, `struct.unknown()` | Reste texte                                                                   |
| `struct.number()`                                                      | Texte trimé doit être un nombre fini ; vide invalide                          |
| `struct.boolean()`                                                     | Texte trimé exactement `true` ou `false`                                      |
| `struct.json(inner)`                                                   | Parse JSON, puis décode avec `inner`                                          |
| Object, array, union, autres Structs ordinaires                        | Décode le texte directement ; le texte d’allure JSON n’est **pas** auto-parsé |

Valeur émise : `event`, `data` décodé, `id` optionnel non vide. Avec `default`, les noms d’événements inconnus sont `string` dans l’union inférée.

## Observer les événements invalides

Les événements invalides/non déclarés sont droppés, pas mis en queue. `withSSEOnInvalidEvent(...)` peut observer l’ID brut, le nom, les data texte, plus `missing-struct` ou `validation-failed` et une cause optionnelle.

```ts
import { createClient, withEndpoint, withSSEOnInvalidEvent } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEOnInvalidEvent(({ reason, message, cause, signal }) => {
    if (signal.aborted) return
    console.info('Dropped SSE event', {
      reason,
      event: message.event,
      hasCause: cause !== undefined,
    })
  }),
)
```

L’observateur tourne à la frontière de transform. Son échec est isolé sauf si le signal de la tentative active est aborted. Garde-le court ; ne traite pas les data d’événements brutes comme de confiance.

## Reconnect

Les réglages de reconnect personnalisent le chemin de retry par défaut — ils ne sont pas requis pour activer les retries. Un EOF normal n’est pas relancé. Les échecs réseau et de lecture de flux peuvent retry. Validation statut/content-type, limites de parser, échecs de transform de message, overflow de queue et EOF normal sont terminaux pour le flux logique.

```ts
import { createClient, withEndpoint, withSSEReconnect } from '@defjs/core'

const client = createClient(
  withEndpoint('https://api.example.com'),
  withSSEReconnect({
    attempts: 5,
    delayMs: 1_000,
    factor: 2,
    maxDelayMs: 30_000,
    jitter: 0.5,
    shouldReconnect({ attempt, open }) {
      return attempt <= 5 && (open?.response.status ?? 0) !== 401
    },
  }),
)
```

`attempts` compte les retries après la tentative initiale ; `attempts: 0` désactive le retry. Pas de limite de tentatives → retries built-in non bornés. `delayMs` est l’intervalle initial ; `factor` le fait croître ; `maxDelayMs` plafonne la base. Le `jitter` SSE est un **facteur multiplicatif 0–1**, comme WebSocket. Un champ de flux `retry:` met à jour l’intervalle courant. Un callback de politique qui renvoie false / throw / reject termine le flux logique.

Le dernier ID d’événement parsé devient `Last-Event-ID` sur une tentative ultérieure. Connais la sémantique de replay du serveur avant un reconnect non borné.

## Limites de buffer et de queue

Les deux doivent être des entiers sûrs positifs. Un overflow est fatal — pas de discard silencieux d’événements plus anciens.

| Limite          | Protège                                                       | Code terminal           |
| --------------- | ------------------------------------------------------------- | ----------------------- |
| `maxBufferSize` | Ligne/événement SSE incomplet/trop grand pendant le parsing   | `PARSER_LIMIT_EXCEEDED` |
| `maxQueueSize`  | Événements produits plus vite que le seul consommateur ne lit | `QUEUE_OVERFLOW`        |

Un flux fatal efface aussi les événements bufferisés, annule le body actif, rejette l’itérateur, et résout `stream.closed` avec `code: 'error'`.

## Fermer et attendre

`EventStreamHandle` : un instantané d’ouverture live, une promesse terminale, un `close`, un itérateur async.

```typescript twoslash
import type { EventStreamCloseInfo, EventStreamHandle, EventStreamOpenInfo } from '@defjs/core'

type StreamApi<T> = {
  readonly open: EventStreamOpenInfo
  readonly closed: Promise<EventStreamCloseInfo>
  close(reason?: unknown): void
  [Symbol.asyncDispose](): PromiseLike<void>
  [Symbol.asyncIterator](): AsyncIterator<T>
}

const handle = null as unknown as EventStreamHandle<string>
const api: StreamApi<string> = handle
void api
```

Codes terminaux : `eof`, `aborted` ou `error`. Un résultat `error` porte aussi un `EventStreamErrorCode` : `INVALID_RESPONSE`, `MESSAGE_PROCESSING_FAILED`, `PARSER_LIMIT_EXCEEDED`, `QUEUE_OVERFLOW`, `TIMEOUT` ou `TRANSPORT_ERROR`.

`close(reason)` abort la tentative active, ferme la queue, settle en `aborted`. Un `break` / `return` / throw de boucle invoque le return de l’itérateur et ferme avec `iterator-return`. Le code qui exécute la commande possède la fermeture.

`await using` invoque ce même lifecycle propriétaire. Il garantit l’arrêt de la lecture/reconnexion Defjs et la libération du reader lock ; pas la fin d’une Promise `ReadableStream.cancel()` bloquée chez le provider. `close()` et `closed` restent disponibles. Les implémentations structurelles personnalisées de `EventStreamHandle` doivent ajouter le même disposer ; le code qui reçoit seulement des handles Defjs n’a aucun appel runtime supplémentaire.

Le contrat minimal de libs pris en charge et vérifié dans le dépôt est `ES2022`, `ESNext.Disposable`, `DOM` et `DOM.Iterable`, avec TypeScript 7 fixé. Cette combinaison forme un seul baseline ; chaque déclaration n’impose pas séparément les quatre entrées, et aucun ancien compilateur non testé n’est promis. Un client HTTP ordinaire n’est pas `AsyncDisposable` ; gère ses requêtes avec un timeout ou un `AbortSignal`.

Garde credentials, data d’événements, IDs d’événements, causes et URL de flux hors des logs de routine. `withCredentials(true)` affecte les cookies Fetch pour SSE ; il ne configure pas l’auth WebSocket.

## Recettes liées

- [Consommer un flux SSE](../recipes/consume-sse.md)
- [Annuler un appel HTTP](../recipes/cancel-http.md)
