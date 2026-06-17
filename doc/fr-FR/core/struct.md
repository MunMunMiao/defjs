---
title: Struct
description: Declarative schema definition, type inference, error mapping, and the field tag system.
---

# Struct

`@defjs/core` fournit une façade struct légère pour déclarer des schémas, valider les entrées et inférer les types. L'intention de conception est modelée d'après le `encoding/json` de Go : secours vers la valeur zéro, acceptation de l'entrée partielle, et comportement runtime stable et prévisible.

## Types primitifs

Tous les schémas sont créés via l'espace de noms `struct`, supportant les appels chaînés `.optional()`, `.null()`, `.nullish()`, et `.tag(...)`.

### Scalaires

```typescript
import { struct } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
  role: struct.literal('admin'),
})

type User = struct.Infer<typeof User>
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
    'X-Api-Key': struct.string().tag(tag.header('X-Api-Key')),
  }),
  body: struct.json(
    struct.object({
      name: struct.string().tag(tag.json('user_name')),
    }),
  ),
})
```

Les wrappers de corps déterminent l'encodage transport :

| Wrapper                    | Encodage            |
| -------------------------- | ------------------- |
| `struct.json(schema)`      | `JSON.stringify`    |
| `struct.urlencoded(shape)` | `URLSearchParams`   |
| `struct.formData(shape)`   | `FormData`          |
| `struct.text()`            | Texte brut          |
| `struct.blob()`            | Blob binaire        |
| `struct.arrayBuffer()`     | ArrayBuffer binaire |

## Inférence de type `Infer<T>`

`struct.Infer<T>` extrait le type de sortie d'un schéma. C'est le seul helper de niveau type que tu dois maîtriser.

```typescript
const Person = struct.object({
  name: struct.string(),
  age: struct.number().optional(),
})

type Person = struct.Infer<typeof Person>
// { name: string; age?: number }
```

`Infer` fonctionne aussi pour `struct.array(...)`, `struct.union(...)`, `struct.request(...)` :

```typescript
type Tags = struct.Infer<typeof Tags> // string[]
type Id = struct.Infer<typeof Id> // string | number
type Req = struct.Infer<typeof CreateUser> // { path: { orgId: number }; query?: { dryRun?: boolean }; ... }
```

## StructError et mapping d'erreurs

Quand la validation échoue, le runtime retourne `StructError` contenant un `SchemaIssue[]` complet.

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

## Système de tags

Les tags sont des métadonnées attachées aux champs, lues par les codecs, les request builders ou les adaptateurs externes. Le core fournit 6 espaces de noms intégrés :

| Espace de noms          | Objectif                       | Comportement sans argument            |
| ----------------------- | ------------------------------ | ------------------------------------- |
| `tag.json()`            | Clé de fil JSON                | Retombe sur le nom du champ           |
| `tag.urlencoded()`      | Clé de champ URL-encodée       | Retombe sur le nom du champ           |
| `tag.multipart()`       | Clé de champ multipart         | Retombe sur le nom du champ           |
| `tag.query(fieldName)`  | Clé de paramètre de requête    | **Doit explicitement fournir le nom** |
| `tag.uri(fieldName)`    | Clé de paramètre de chemin URI | **Doit explicitement fournir le nom** |
| `tag.header(fieldName)` | Clé d'en-tête HTTP             | **Doit explicitement fournir le nom** |

### Exemple d'utilisation

```typescript
import { struct, tag } from '@defjs/core'

const UserBody = struct.object({
  id: struct.number().tag(tag.json('user_id')),
  name: struct.string().tag(tag.json('user_name')),
  email: struct.string().tag(tag.header('X-User-Email')),
})
```

### Tag de config personnalisé

`tag.defineConfig` permet aux bibliothèques tierces de définir leur propre espace de noms et clé de config :

```typescript
import { tag } from '@defjs/core'

const GormTag = tag.createTagNamespace('gorm')
const gorm = tag.defineConfig(GormTag)

const Model = struct.object({
  id: struct.number().tag(gorm('column', 'id'), gorm('primaryKey')),
})
```

Règles :

- Dans le même espace de noms, une `value` ultérieure remplace une antérieure.
- Dans le même espace de noms et même clé `config`, une valeur ultérieure remplace une antérieure.
- La valeur de config ne peut être que `string | number | boolean`.

### Lecture des tags

```typescript
import { getFieldTag, getFieldTags, tag } from '@defjs/core'

const field = UserBody.shape.name
const jsonTag = getFieldTag(field, tag.kind.json, 'name')
// { namespace: JsonTag, value: 'user_name', config: Map() }
```

## Introspection des champs

`getStructFields` développe un schéma d'objet en une liste de champs lisible, contenant la clé de champ, le sous-schéma et les tags matérialisés.

```typescript
import { getStructFields } from '@defjs/core'

const fields = getStructFields(UserBody)
// [
//   { key: 'id', struct: NumberSchema, tags: Map<symbol, FieldTag> },
//   { key: 'name', struct: StringSchema, tags: Map<symbol, FieldTag> },
// ]
```

Combiné avec `isObjectStruct` pour une vérification de type sûre avant introspection :

```typescript
import { isObjectStruct, getStructFields } from '@defjs/core'

if (isObjectStruct(schema)) {
  for (const field of getStructFields(schema)) {
    console.log(field.key, field.tags.get(tag.kind.json)?.value)
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
