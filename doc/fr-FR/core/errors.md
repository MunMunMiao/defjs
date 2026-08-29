---
title: Erreurs
description: Branche sur kind et code pour les 404, timeouts, statuts non déclarés et échecs de transport.
---

# Erreurs

Gère un 404 déclaré, un timeout ou un statut non déclaré en lisant le tuple erreur en premier — pas en attrapant des throws. `RequestError` reste une union `kind` / `code`, et chaque valeur est un `Error` natif (`instanceof Error` est vrai). Commence par `kind`, puis `code`.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## Codes stables

| `kind`       | Codes                                                                                                | Signification                                                                                                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Un non-2xx a atteint la frontière HTTP. Garde `status`, `response`, et tout `data` décodé propre au statut.                                           |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Annulation, timeout ou échec Fetch/transport a bloqué un résultat normal.                                                                             |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Échec d’entrée, de construction de requête, de représentation de réponse, de décodage Struct, de contrat de statut ou throw/reject d’un intercepteur. |

`cause` est optionnel sur les erreurs transport et definition. `response` est toujours sur les erreurs de statut HTTP ; il peut apparaître sur les erreurs definition quand une réponse existait déjà.

## Formes de tuple par transport

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

Échec de démarrage → deuxième élément `undefined`. Troisième élément seulement si ce transport a d’abord produit une réponse/instantané. Après qu’un handle SSE ou une session WebSocket revient, les échecs ultérieurs vivent sur le cycle de vie de ce handle — ils ne réécrivent pas le tuple de démarrage settled.

## Statut HTTP et data

Statut exact d’abord. Avec `output`, Defjs choisit le Struct correspondant avant de décoder le body, donc `error.status` et `error.data` restent corrélés.

| Situation                                           | Issue du tuple                        | Comportement du body                                       |
| --------------------------------------------------- | ------------------------------------- | ---------------------------------------------------------- |
| 2xx avec statut déclaré correspondant               | Succès                                | Struct sélectionné → `data`                                |
| Non-2xx avec statut déclaré correspondant           | `HTTP_STATUS`                         | Struct sélectionné → `error.data` typé                     |
| Tout statut sans déclaration correspondante         | `UNDECLARED_STATUS`                   | Le statut gagne **avant** le décodage du body              |
| Statut correspondant, représentation du body échoue | `RESPONSE_VALIDATION_FAILED`          | Pas de valeur typée partielle                              |
| `output` omis                                       | 2xx réussit ; non-2xx → `HTTP_STATUS` | Body non décodé ; `data` est `undefined`                   |
| Statut de réponse `0`                               | Erreur de transport                   | `response.error` → `NETWORK_ERROR`, `ABORTED` ou `TIMEOUT` |

`HttpResponse.ok` signifie seulement `200 <= status < 300`. Un non-2xx normal ne pose pas `HttpResponse.error` — cette propriété est pour l’échec de transport à la frontière Fetch ou l’échec de représentation du body.

## Démarrage vs post-open

SSE valide le statut, `text/event-stream` et le body avant de résoudre le handle. Statut échoué → `HTTP_STATUS`. Mauvais content type ou body manquant → `RESPONSE_VALIDATION_FAILED`. L’instantané d’ouverture peut quand même atterrir dans le troisième slot du tuple.

Le démarrage WebSocket couvre le handshake + la première ouverture physique. Échec du constructeur, fermeture pré-open, timeout ou annulation → tuple de démarrage. Un instantané de connexion peut exister même si le socket n’atteint jamais `open`.

| Transport | Après le démarrage                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE       | L’itérateur rejette sur erreur fatale ; `stream.closed` se résout avec `code: 'error'` et un `EventStreamErrorCode`                                                          |
| WebSocket | `onRuntimeError` pour les échecs message/queue/heartbeat/runtime ; `receive` échoue sur les erreurs terminales ; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP      | La promesse d’execute se settle une fois. Le code d’intercepteur/callback peut encore throw hors de la normalisation du tuple                                                |

`ABORTED` / `TIMEOUT` décrivent le résultat de démarrage vu par l’appelant. Tu fermes quand même un flux/session renvoyé et tu attends sa promesse terminale.

## Journalisation et cause Struct

Chaque `RequestError` est un `Error` natif. `String(error)` donne la chaîne stable `<name>: <message>` ; `kind`, `code`, `status`, `response` et `data` restent énumérables pour les logs structurés. `cause` est le lien natif non énumérable de la chaîne causale — ne copie pas ses helpers sur l’erreur externe.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.format(), error.cause.flatten(), error.cause.prettify())
  }
}
```

Appelle `format()`, `flatten()` et `prettify()` seulement après `error.cause instanceof StructError`. Le tuple unifié ne change pas ; une meilleure journalisation ne transforme pas les échecs déclarés en throws.

## Référence

| Branche                  | Contrôle de flux                             | Champs stables utiles                    | Habituellement absent / sensible      |
| ------------------------ | -------------------------------------------- | ---------------------------------------- | ------------------------------------- |
| Politique de statut HTTP | `error.kind === 'http'`                      | `error.status`, `error.data` revu        | Body, en-têtes, URL, `cause`          |
| Annulation appelant      | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code`                           | Raison d’abort et stack               |
| Timeout                  | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code`                           | URL de requête et cause sous-jacente  |
| Échec de contrat         | `error.kind === 'definition'`                | `kind`, `code`, `response?.status` revu  | Issues Struct, body, valeurs d’entrée |
| Runtime flux/session     | `stream.closed` / `session.closed`           | Code/kind terminal, statut de close revu | Payloads d’événements, frames, causes |

N’infère pas CORS depuis le statut `0` — branche sur `kind` et `code`.

Traite `cause`, `data`, en-têtes/corps de réponse, URL, issues Struct, valeurs d’entrée et stacks comme sensibles. Un résumé conservateur :

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`, `createDefinitionError` et `createHttpStatusError` construisent et renvoient des instances natives de `Error`. Les échecs de requête normaux restent dans le tuple unifié ; l’identité native `Error` ne les transforme pas à elle seule en throws. `ERR_ABORTED` et `ERR_TIMEOUT` sont des causes partagées que le normaliseur de transport reconnaît.

## Recettes liées

- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
- [Annuler un appel HTTP](../recipes/cancel-http.md)
