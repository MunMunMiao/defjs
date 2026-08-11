---
title: Struct
description: Décodez strictement les données structurées et gérez les entrées obligatoires, facultatives, les alias et StructError.
---

# Struct

Les Structs décrivent le décodage structurel strict et l'encodage du format d'échange. Une valeur obligatoire absente ou invalide échoue au lieu de produire une valeur par défaut.

Utilisez la façade `struct` et `Infer<T>` depuis l'entrée racine :

```typescript
import { struct, type Infer, type StructInput } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean }
```

## Constructeurs

Parmi les constructeurs courants :

```typescript
struct.string()
struct.number()
struct.boolean()
struct.bigint()
struct.date()
struct.null()
struct.literal('ready')
struct.enum(['pending', 'done'])
struct.array(struct.string())
struct.tuple([struct.string(), struct.number()])
struct.object({ id: struct.number() })
struct.record(struct.number())
struct.or(struct.string(), struct.number())
struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

`struct.any()` et `struct.unknown()` acceptent toute valeur sauf `null` et `undefined` ; les mêmes modificateurs permettent de les autoriser explicitement. Les constructeurs binaires sont `struct.blob()`, `struct.file()` et `struct.arrayBuffer()`.

Chaque Struct accepte ces modificateurs :

```typescript
struct.string().optional()
struct.string().null()
struct.string().nullish()
struct.string().alias('wire_name')
```

## Décodage strict

Utilisez `struct.parse(schema, input)` pour décoder hors d'une commande. Il renvoie un tuple error-first fixe :

```typescript
const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, input)

if (error) {
  // profile is undefined
  return
}
```

```typescript
type ParseResult<T> = [error: null, value: T] | [error: StructError, value: undefined]
```

Un seul contrat s'applique aux modificateurs : une valeur absente ou `undefined` n'est acceptée qu'avec `.optional()` ou `.nullish()` ; un `null` explicite qu'avec `.null()` ou `.nullish()`. `.null()` ne rend pas la valeur facultative.

Les champs optional et nullish absents sont omis de l'objet de sortie ; au niveau racine, ils deviennent `undefined`. Les clés inconnues sont supprimées. Les objets et records décodés ont un prototype nul.

L'égalité profonde stricte de Node compare les prototypes. Un objet analysé par Struct n'est donc pas profondément égal à un littéral possédant les mêmes champs. Vérifiez explicitement cette limite ou créez une copie superficielle uniquement dans l'assertion :

```typescript
import assert from 'node:assert/strict'

const [error, profile] = struct.parse(struct.object({ name: struct.string() }), { name: 'Ada' })
assert.equal(error, null)
assert.equal(Object.getPrototypeOf(profile), null)
assert.deepEqual({ ...profile }, { name: 'Ada' })
```

Le spread est une copie superficielle réservée à cette assertion. Les objets Struct imbriqués ont eux aussi un prototype nul. N'ajoutez pas une normalisation ou un clonage global au chemin de production uniquement pour satisfaire un matcher de test.

Avec `exactOptionalPropertyTypes`, les entrées d'objet inférées utilisent des propriétés facultatives exactes. Omettez une clé optional ou nullish au lieu de lui affecter `undefined` :

```typescript
const OptionalProfile = struct.object({
  nickname: struct.string().optional(),
})

type OptionalProfileInput = StructInput<typeof OptionalProfile>

const omitted: OptionalProfileInput = {}
// @ts-expect-error With exactOptionalPropertyTypes, omit optional keys instead.
const explicitUndefined: OptionalProfileInput = { nickname: undefined }
```

À l'exécution, `struct.parse` accepte par précaution un `undefined` explicite provenant d'une entrée inconnue et omet la clé. Cette normalisation n'élargit pas le type d'entrée inféré statiquement pour l'appelant.

## Entrées d'objet et de requête obligatoires

Les propriétés d'objet sont obligatoires en TypeScript et à l'exécution, sauf si leur Struct est optional ou nullish. Chaque section déclarée dans `struct.request(...)` est elle aussi obligatoire ; une section non déclarée n'appartient pas au type d'entrée.

```typescript
const Input = struct.request({
  path: struct.object({ id: struct.string() }),
  query: struct.object({ page: struct.number().optional() }),
})

// { path: { id: string }; query: { page?: number } }
```

Omettre `query` est une erreur ; `query: {}` est valide. Un champ obligatoire absent, un `undefined` explicite, un `null` interdit ou un mauvais type d'exécution fait échouer tout le décodage sans valeur partielle.

Les Structs composées s'arrêtent au premier issue déterminé. La longueur d'un tuple doit correspondre exactement à sa déclaration. `struct.or(...)` continue d'essayer les alternatives dans l'ordre et `struct.discriminatedUnion(...)` de sélectionner une branche déclarée.

Lorsque les champs discriminateurs utilisent des alias, `struct.discriminatedUnion(...)` lit le premier discriminateur wire réellement présent, dans l'ordre de déclaration des options. Une fois une branche sélectionnée, il ne lit aucun alias d'une option ultérieure.

Les Structs imposent la structure déclarée, pas les règles applicatives d'autorisation, de plage, de montant, de format ou de transition d'état. Aucun DSL public de raffinement, de plage ou de format n'existe.

`struct.number()` accepte `Infinity` et `-Infinity` ; parmi les nombres JavaScript, seul `NaN` est exclu. Contrôlez la finitude, la plage et le domaine dans le code applicatif avant de créer une commande. Ne placez pas ces contrôles dans `build`, car celui-ci reçoit une projection liée au schéma et non les valeurs de l'appelant à l'exécution.

## Corps de requête

`struct.request(...)` regroupe les sections qui correspondent directement au format d'échange :

```typescript
const input = struct.request({
  path: struct.object({ organizationId: struct.string() }),
  query: struct.object({ includeDisabled: struct.boolean().optional() }),
  headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
  body: struct.json(
    struct.object({
      displayName: struct.string().alias('display_name'),
    }),
  ),
})
```

Les formats de `body` disponibles sont :

| Struct                     | Encodage          |
| -------------------------- | ----------------- |
| `struct.json(inner)`       | JSON              |
| `struct.text()`            | Texte brut        |
| `struct.urlencoded(shape)` | `URLSearchParams` |
| `struct.formData(shape)`   | `FormData`        |
| `struct.blob()`            | `Blob`            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     |

Consultez [Commandes](/fr-FR/core/commands) pour la construction automatique et les restrictions propres aux transports.

## Alias

`.alias(name)` modifie la clé du format d'échange sans changer la clé TypeScript logique.

```typescript
const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  displayName: struct.string().alias('display_name'),
})

const [logicalError, logicalUser] = struct.parse(UserBody, { id: 1, displayName: 'Ada' })
if (logicalError) throw logicalError

const [wireKeyError] = struct.parse(UserBody, { user_id: 1, display_name: 'Ada' })
if (!wireKeyError) throw new Error('struct.parse must read logical keys')
```

`logicalUser` utilise `{ id, displayName }` ; `wireKeyError` signale l'absence de la clé logique `id`. Le `struct.parse` public lit uniquement les valeurs logiques et ne traite pas les clés d'échange comme entrée d'un parse autonome.

Seuls l'encodage et le décodage JSON du transport appliquent les alias d'échange :

```typescript
import { createClient, defineRequest, withEndpoint, withHTTPHandle } from '@defjs/core'

let requestWireBody: unknown
const echoUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({ body: struct.json(UserBody) }),
  output: { 200: UserBody },
})
const client = createClient(
  withEndpoint('https://example.test'),
  withHTTPHandle(async (input, init) => {
    requestWireBody = await new Request(input, init).json()
    return Response.json({ user_id: 1, display_name: 'Ada' })
  }),
)

const [requestError, responseUser] = await client.execute(echoUser({ body: { id: 1, displayName: 'Ada' } }))
if (requestError) throw requestError
```

`requestWireBody` vaut `{ user_id, display_name }`, tandis que `responseUser` redevient `{ id, displayName }`. La construction automatique applique aussi les alias aux clés sortantes de path, query, headers, URL-encoded et multipart ; les clés cibles explicites d'une projection `build` personnalisée restent inchangées.

## `StructError`

Un échec de décodage structurel produit une `StructError`, souvent disponible dans `RequestError.cause`.

```typescript
import { StructError, type RequestError, type StructIssue } from '@defjs/core'

export function structIssues(error: RequestError): readonly StructIssue[] {
  if (error.kind === 'definition' && error.cause instanceof StructError) {
    return error.cause.issues
  }
  return []
}
```

Une `StructError` expose :

- `issues`, le tableau `StructIssue[]` d'origine ;
- `format()`, une arborescence de messages ;
- `flatten()`, les messages de formulaire et de champs au premier niveau ;
- `prettify()`, une chaîne multiligne lisible.

`StructIssue.received` peut contenir des données d'entrée ou de réponse. Les messages par défaut peuvent en inclure une représentation. Les chemins et les clés formatées peuvent aussi provenir de données non fiables, notamment pour les records. Masquez ou contrôlez `issues`, les messages, `format()`, `flatten()` et `prettify()` avant de les journaliser ou de les renvoyer.

## Messages d'erreur globaux

`setErrorMap(...)` remplace la génération des messages dans tout le processus :

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'invalid_type') {
    return `Invalid value at ${issue.path.join('.')}`
  }
  return undefined
})
```

Cette fonction agit globalement, pas au niveau d'un client. La modifier affecte les futurs `StructIssue` de tous les clients dans le même environnement JavaScript. Ne capturez aucun état propre à une requête dans ce callback et coordonnez son installation dans les applications qui partagent un processus.

## Étapes suivantes

- [Commandes](/fr-FR/core/commands) projette les champs Struct vers les requêtes et les messages.
- [Erreurs](/fr-FR/core/errors) explique comment les échecs Struct apparaissent dans les tuples d'exécution.
- [HTTP](/fr-FR/core/http) couvre le décodage des réponses et les erreurs de représentation.
