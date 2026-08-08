---
title: Erreurs
description: Gérez les tuples propres à chaque transport et branchez sur l'union discriminée RequestError.
---

# Erreurs

Chaque transport pris en charge renvoie un tuple à trois éléments, avec l'erreur en premier. Le troisième dépend du transport.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP renvoie les données décodées et un wrapper Defjs `SettledResponse`.
- SSE renvoie un handle logique de flux et un instantané d'ouverture au démarrage.
- WebSocket renvoie une session logique et un instantané de connexion au démarrage.

En cas d'échec, le deuxième élément vaut `undefined`. Le troisième peut lui aussi valoir `undefined` si le démarrage a échoué avant que le transport ne produise l'instantané correspondant.

## `RequestError`

`RequestError` est un objet discriminé ordinaire renvoyé dans le tuple. Il n'étend pas la classe native `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData> | TransportError | DefinitionError
```

L'union exportée s'appelle `RequestError<TErrorData>`.

Testez d'abord `kind`, puis `code` lorsque la branche l'exige.

### Erreurs de statut HTTP

Une réponse HTTP non-2xx déclarée produit :

```typescript
interface HttpStatusError<TErrorData = unknown> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: number
  message: string
  data: TErrorData
  response: SettledResponseLike<unknown>
}
```

`data` n'existe que sur `HttpStatusError`. Son type est l'union de tous les corps de sortie non-2xx déclarés pour cet endpoint. Vérifier `error.status` ne réduit pas actuellement cette union. Utilisez un test structurel ou un discriminant défini par l'application lorsque la forme du corps varie selon le statut.

### Erreurs de transport

Un échec réseau, une annulation ou un timeout produisent :

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Les erreurs de transport n'ont pas de champs `data` ou `response`.

### Erreurs de définition

Le décodage de l'entrée, la construction de la requête, le décodage de la réponse ou la gestion d'un statut HTTP non déclaré peut produire :

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: SettledResponseLike<unknown>
}
```

| Code                         | Déclencheur actuel                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Le décodage structurel de l'entrée, la construction de la requête ou les liaisons produites par `build` ont échoué. |
| `RESPONSE_VALIDATION_FAILED` | Une réponse déclarée ou une réponse de démarrage SSE a échoué à la validation structurelle ou de contenu.           |
| `UNDECLARED_STATUS`          | HTTP a renvoyé un statut sans Struct de sortie correspondante alors que `output` était déclaré.                     |

`UNDECLARED_STATUS` s'applique aux statuts 2xx et non-2xx sans correspondance.

## Traiter les différents types d'erreur

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

Ne journalisez pas `cause`, `data`, les en-têtes ou corps de réponse, ni les URL sans politique explicite de masquage et de rétention.

## Disponibilité de la réponse

`SettledResponseLike` et `SettledResponse` sont des wrappers Defjs, pas des objets `Response` natifs. Ils exposent le statut, son libellé, les en-têtes, l'URL, le corps, d'éventuelles informations d'erreur et, pour les wrappers finalisés, l'indicateur `ok`. Celui-ci signifie seulement que le statut appartient à la plage 2xx.

Pour HTTP :

- une erreur de statut HTTP déclarée possède `error.response` ;
- les erreurs de validation de sortie et les statuts non déclarés peuvent posséder `error.response` ;
- la validation de requête, l'annulation avant réponse, une exception d'intercepteur et un échec de transport de statut 0 peuvent ne fournir aucune réponse dans le tuple.

Pour SSE, un démarrage échoué peut tout de même renvoyer un instantané d'ouverture en troisième position si une réponse est arrivée avant l'échec de validation du contenu ou du statut. Pour WebSocket, un démarrage échoué ne peut renvoyer un instantané de connexion que si celui-ci a été capturé.

## Fabriques et constantes d'erreur

L'entrée racine exporte des fonctions de fabrique destinées au code d'intégration :

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` normalise les causes d'annulation, de timeout et les autres causes.
- `createDefinitionError(code, cause, response?)` crée une erreur de définition.
- `createHttpStatusError(status, message, response, data?)` crée une erreur de statut HTTP.
- `ERR_ABORTED` et `ERR_TIMEOUT` sont des valeurs `Error` partagées reconnues par le normaliseur.

Ces helpers créent des objets `RequestError` ordinaires. Ils ne les lèvent pas.

Les parcours de commande intégrés convertissent leurs échecs de démarrage attendus en tuples. Cette gestion ne couvre pas tout code d'extension : les intercepteurs et callbacks applicatifs peuvent lever une exception, et transmettre une commande non prise en charge à l'implémentation générale rejette la promesse.

## Étapes suivantes

- [HTTP](/fr-FR/core/http) explique la sélection par statut et le décodage des réponses.
- [SSE](/fr-FR/core/sse) distingue les échecs au démarrage des erreurs après ouverture.
- [WebSocket](/fr-FR/core/web-socket) couvre les erreurs d'exécution et la fermeture définitive.
