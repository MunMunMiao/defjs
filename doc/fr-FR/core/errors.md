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

- HTTP renvoie les données décodées et un wrapper Defjs `HttpResponse`.
- SSE renvoie un handle logique de flux et un instantané d'ouverture au démarrage.
- WebSocket renvoie une session logique et un instantané de connexion au démarrage.

En cas d'échec, le deuxième élément vaut `undefined`. Le troisième peut lui aussi valoir `undefined` si le démarrage a échoué avant que le transport ne produise l'instantané correspondant.

## `RequestError`

`RequestError` est un objet discriminé ordinaire renvoyé dans le tuple. Il n'étend pas la classe native `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

L'union exportée s'appelle `RequestError<TErrorData>`.

Testez d'abord `kind`, puis `code` lorsque la branche l'exige.

### Erreurs de statut HTTP

Une réponse HTTP non-2xx déclarée produit :

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

Les génériques sont ordonnés avec les données en premier, puis le statut. Le type exporté général `RequestError<TErrorData>` reste pratique aux frontières de l'application, tandis que l'exécution d'un endpoint renvoie une union de branches `HttpStatusError<Data, Status>` propres à chaque statut. Tester `error.status` réduit donc `error.data` au corps déclaré pour ce statut :

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // Pour cet endpoint, les statuts restants 409 | 422 partagent le corps de conflit.
    console.error(error.data.conflict)
  }
}
```

`data` n'existe que sur `HttpStatusError`. Préservez cette union corrélée au statut à la frontière de l'endpoint au lieu de l'élargir en une union de données sans relation.

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
  response?: HttpResponse<unknown>
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

### Pont vers un `Error` natif

Certaines intégrations exigent de lancer un `Error` natif. Créez une nouvelle erreur de diagnostic à cette frontière et n'exposez par défaut que les classifications stables `kind`, `code` et le `status` HTTP disponible :

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

La nouvelle erreur conserve sa propre stack créée à la frontière. Le pont n'attache ni ne copie jamais le `cause` brut, son message ou ses frames de stack, `data`, les en-têtes ou corps de réponse, ni les URL de requête ou de réponse. Les chaînes des frames peuvent elles-mêmes contenir des URL et des secrets ; copier certaines frames de la cause n'est donc pas un comportement sûr par défaut. Le projet exécutable `examples/observability-redacted-logging` vérifie la conservation du statut 404 tout en s'assurant que les données de réponse et une stack de cause contenant volontairement un secret ne fuient pas.

## Disponibilité de la réponse

`HttpResponse` est un wrapper Defjs, pas un objet `Response` natif. Il expose le statut, son libellé, les en-têtes, l'URL, le corps, `error` et `ok`. `ok` signifie seulement que le statut appartient à la plage 2xx. `error` est réservé aux échecs de transport ou de représentation du corps ; une réponse non-2xx ordinaire le laisse vide.

Un corps non-2xx valide et déclaré est décodé par sa Struct et conservé avec son type dans `HttpStatusError.data`. Une représentation malformée produit plutôt `RESPONSE_VALIDATION_FAILED`, avec l'exception du codec dans `cause`, une réponse si elle a été reçue et sans `data`.

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
