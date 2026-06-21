---
title: Struct
description: Declarative struct definition, type inference, error mapping, and the field alias support.
---

# Struct

`@defjs/core` fournit une façade struct légère pour déclarer des schémas, valider les entrées et inférer les types. L'intention de conception est modelée d'après le `encoding/json` de Go : secours vers la valeur zéro, acceptation de l'entrée partielle, et comportement runtime stable et prévisible.

## Types primitifs

Tous les schémas sont créés via l'espace de noms `struct`, supportant les appels chaînés `.optional()`, `.null()`, `.nullish()`, et `.alias(name)`.

### Scalaires

```typescript
import { struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = Infer<typeof User>
// { id: number; name: string; active: boolean; role: 'admin' }
```

Scalaires disponibles :

| Constructeur           | Type d'entrée                           | Type de sortie | Valeur zéro          |
| ---------------------- | --------------------------------------- | -------------- | -------------------- |
| `struct.string()`      | `string \| undefined`                   | `string`       | `''`                 |
| `struct.number()`      | `number \| undefined`                   | `number`       | `0`                  |
| `struct.boolean()`     | `boolean \| undefined`                  | `boolean`      | `false`              |
| `struct.bigint()`      | `bigint \| string \| undefined`         | `bigint`       | `0n`                 |
| `struct.date()`        | `Date \| number \| string \| undefined` | `Date`         | `new Date(0)`        |
| `struct.null()`        | `null`                                  | `null`         | `null`               |
| `struct.any()`         | `unknown`                               | `any`          | `undefined`          |
| `struct.unknown()`     | `unknown`                               | `unknown`      | `undefined`          |
| `struct.blob()`        | `Blob \| undefined`                     | `Blob`         | `new Blob()`         |
| `struct.file()`        | `File \| undefined`                     | `File`         | `new File([], '')`   |
| `struct.arrayBuffer()` | `ArrayBuffer \| undefined`              | `ArrayBuffer`  | `new ArrayBuffer(0)` |

### Optionnel et nullable

```typescript
const Profile = struct.object({
  bio: struct.string().optional(), // Type de sortie : string | undefined
  age: struct.number().null(), // Type de sortie : number | null
  nick: struct.string().nullish(), // Type de sortie : string | null | undefined
})
```

### Énumérations et littéraux

```typescript
const Status = struct.enum(['pending', 'done', 'cancelled'])
const Priority = struct.objectEnum({ Low: 1, Medium: 2, High: 3 })

const Flag = struct.literal(true)
```

### Tableaux, tuples, enregistrements

```typescript
const Tags = struct.array(struct.string())
const Pair = struct.tuple([struct.string(), struct.number()])
const Dict = struct.record(struct.number())
```

### Unions et intersections

```typescript
const Id = struct.union([struct.string(), struct.number()])
const Named = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
```

### Unions discriminées

```typescript
const Event = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('click'), x: struct.number(), y: struct.number() }),
  struct.object({ kind: struct.literal('key'), key: struct.string() }),
])
```

## Schémas de requête

`struct.request(...)` organise `path`, `query`, `headers` et `body` en une structure d'entrée unique pour la construction automatique de requête HTTP par le point de terminaison.

```typescript
const CreateUser = struct.request({
  path: struct.object({ orgId: struct.number() }),
  query: struct.object({ dryRun: struct.boolean().optional() }),
  headers: struct.object({
    'X-Api-Key': struct.string().alias('X-Api-Key'),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().alias('user_name'),
    }),
  ),
})
```

Les wrappers de corps déterminent l'encodage transport :

| Wrapper                    | Encodage            |
| -------------------------- | ------------------- |
| `struct.json(struct)`      | `JSON.stringify`    |
| `struct.urlencoded(shape)` | `URLSearchParams`   |
| `struct.formData(shape)`   | `FormData`          |
| `struct.text()`            | Texte brut          |
| `struct.blob()`            | Blob binaire        |
| `struct.arrayBuffer()`     | ArrayBuffer binaire |

## Inférence de type `Infer<T>`

`Infer<T>` extrait le type de sortie d'un schéma. C'est le seul helper de niveau type que tu dois maîtriser.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` fonctionne aussi pour `struct.array(...)`, `struct.union(...)`, `struct.request(...)` :

```typescript
type Tags = Infer<typeof Tags> // string[]
type Id = Infer<typeof Id> // string | number
type Req = Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError et mapping d'erreurs

Quand la validation échoue, le runtime retourne `StructError` contenant un `StructIssue[]` complet.

```typescript
import { struct, StructError } from '@defjs/core'

const [error, value] = struct.parseTuple(User, { id: 42 })
if (error) {
  console.log(error.issues)
  // [{ code: 'missing_key', path: ['name'], expected: 'string', received: undefined, message: '...' }]
}
```

### Formatage des erreurs

```typescript
error.format() // Arbre d'objets { _errors: [], name: { _errors: ['...'] } }
error.flatten() // Objet plat { formErrors: [], fieldErrors: { name: ['...'] } }
error.prettify() // Chaîne : "× name: Expected string, received undefined"
```

### Mapping global d'erreurs

Remplace les messages par défaut via `setErrorMap` :

```typescript
import { setErrorMap } from '@defjs/core'

setErrorMap((issue) => {
  if (issue.code === 'missing_key') {
    return `Field ${issue.path.join('.')} is required`
  }
  return undefined // Les issues non couvertes utilisent les messages par défaut
})
```

## Alias de champs

`.alias(name)` est le seul mécanisme intégré de wire-name de champ. Il change la clé externe utilisée par l'encodage/décodage JSON, query, headers, path, urlencoded et FormData ; il ne change pas le nom de propriété TypeScript, le type de sortie, la section de requête, le codec de body ni les clés écrites explicitement dans `build(ctx, input)`. Les champs sans alias utilisent leur clé d'objet.

```typescript
import { struct } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().alias('user_id'),
  name: struct.string().alias('user_name'),
})
```

Le même alias est utilisé par JSON, query, path params, headers, les corps urlencoded et les corps multipart. Si la même valeur logique nécessite des noms différents selon les targets, sépare le schéma ou écris des clés explicites dans `build(ctx, input)`. Les namespaces de tag personnalisés et la metadata de tags ne font pas partie de l'API publique.

## Introspection des champs

`getStructFields` développe un schéma d'objet en une liste de champs lisible contenant la clé du champ, l'alias et le sous-schéma.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', alias: 'user_id', struct: NumberStruct },
//   { key: 'name', alias: 'user_name', struct: StringStruct },
// ]
```

Combiné avec `isObjectStruct` pour une vérification de type sûre avant introspection :

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(struct)) {
  for (const field of getStructFields(struct)) {
    console.log(field.key, field.alias)
  }
}
```

## Secours vers la valeur zéro et entrée partielle

Le parser struct suit la sémantique de Go `encoding/json` :

1. **Champs manquants** → remplis avec la valeur zéro du type, sans lever `missing_key`.
2. **Entrée partielle** → permet de passer seulement certains champs ; les champs non définis sont auto-remplis avec des valeurs zéro.
3. **`undefined` et `null`** → les champs `optional` retournent `undefined` ; les champs `nullable` retournent `null` ; les autres retournent des valeurs zéro.

```typescript
const Point = struct.object({ x: struct.number(), y: struct.number() })

struct.parseValue(Point, {}) // { x: 0, y: 0 }
struct.parseValue(Point, { x: 1 }) // { x: 1, y: 0 }
```

C'est un choix de conception, pas un bug. Avantages :

- Les formulaires front-end peuvent envoyer seulement les champs modifiés ; le backend reçoit quand même une structure complète.
- Évite la propagation de `undefined` à travers les objets ; la sortie est toujours sûrement traversable.
- Modèle mental cohérent avec le unmarshaling json de Go, unifiant la collaboration cross-langage.

Si tu as besoin d'une validation stricte (les champs manquants doivent lever une erreur), vérifie explicitement dans la fonction `build` du point de terminaison, ou utilise `struct.parseTuple` pour gérer toi-même le résultat `[error, value]`.

## Prochaines étapes

- [Commandes →](/core/commands) — Utiliser struct avec `defineRequest`, `defineEventStream` et `defineWebSocket`
- [HTTP →](/core/http) — Encodage du corps de requête et validation de réponse
- [Contexte →](/core/context) — Build automatique et capacités du request builder
