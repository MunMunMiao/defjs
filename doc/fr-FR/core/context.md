---
title: Contexte
description: Transmettez des métadonnées propres à une requête dans les chaînes d'intercepteurs HTTP et SSE avec HttpContext.
---

# Contexte

`HttpContext` contient des métadonnées indexées par des tokens. Il accompagne une exécution HTTP ou SSE et reste accessible depuis la `HttpRequest` reçue par les intercepteurs. Il ne se sérialise jamais de lui-même dans l'URL, les en-têtes ou le corps.

## Tokens et valeurs par défaut

Créez un token typé avec une fabrique de valeur par défaut :

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

`context.get(token)` appelle la fabrique du token lorsque le contexte ne contient aucune valeur. Cette valeur par défaut n'est pas enregistrée : une fabrique avec état peut donc produire un résultat différent à chaque lecture manquante. Préférez des valeurs par défaut déterministes.

## Créer et transmettre un contexte

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` modifie le contexte et renvoie le même objet pour permettre le chaînage. `get(...)` et `set(...)` lèvent une `TypeError` si la valeur fournie n'est pas un token créé par `makeHttpContextToken(...)`.

Un intercepteur lit le même objet :

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

Utilisez des noms d'opération fixes et un petit ensemble de métadonnées contrôlées. Par défaut, ne journalisez ni secrets, ni en-têtes bruts, ni corps, ni URL, ni chaînes de requête.

## Sémantique par référence

L'exécution transmet `HttpContext` par référence. Si un intercepteur le modifie, les intercepteurs suivants et l'appelant qui détient cet objet peuvent observer la modification.

Créez un nouveau contexte pour chaque requête dès qu'il contient des données liées à la requête, à l'utilisateur, au tenant, à la trace, aux cookies ou à l'autorisation. Réutiliser le même contexte mutable entre des traitements concurrents peut divulguer ou écraser des métadonnées.

Les options d'exécution HTTP et SSE acceptent actuellement `context`. Les options WebSocket ne l'acceptent pas. Un handle logique SSE conserve le contexte associé à ses tentatives de connexion ; l'application doit néanmoins rattacher ce contexte à la portée de requête du flux.

## Copie et fusion

`makeHttpContext(existing)` crée une copie superficielle de la table de tokens :

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

Les tables sont distinctes, mais les objets qu'elles contiennent ne sont pas clonés en profondeur.

`makeHttpContext(entries)` accepte des paires token/valeur :

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` renvoie un nouveau contexte. Pour un même token, les valeurs de `secondary` remplacent celles de `primary`.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

Passer un seul contexte renvoie tout de même une copie. N'en passer aucun renvoie un contexte vide.

## API de contexte

| Membre              | Comportement                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `set(token, value)` | Enregistre une valeur et renvoie le même contexte.                        |
| `get(token)`        | Renvoie la valeur enregistrée ou appelle la fabrique par défaut du token. |
| `has(token)`        | Indique si une valeur est enregistrée.                                    |
| `del(token)`        | Supprime une valeur et renvoie le même contexte.                          |
| `keys()`            | Itère sur les tokens enregistrés.                                         |
| `length`            | Nombre de tokens enregistrés.                                             |

`isHttpContext(...)` et `isHttpContextToken(...)` servent de gardes à l'exécution lorsque nécessaire.

La construction de la requête est un sujet distinct. Consultez [Commandes](/fr-FR/core/commands) pour les sections automatiques et les projections liées au schéma, et [Intercepteurs](/fr-FR/core/interceptors) pour le comportement des chaînes.
