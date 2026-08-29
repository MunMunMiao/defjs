---
title: Struct
description: Modélise les formes de requête et de réponse, parse les unknowns, et encode les corps wire.
---

# Struct

Modélise une requête (et ses réponses) en Structs. Tu obtiens des types TypeScript via `Infer`, et des checks runtime via `struct.parse(...)` — pas de throw, tuple erreur en premier.

## Basic Setup

```typescript twoslash
import { defineRequest, struct, type Infer } from '@defjs/core'

const User = struct.object({
  id: struct.number(),
  name: struct.string(),
  active: struct.boolean(),
})

type User = Infer<typeof User>

const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: struct.request({
    body: struct.json(
      struct.object({
        name: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  output: { 201: User },
})

const [parseError, user] = struct.parse(User, { id: 7, name: 'Ada', active: true })
if (!parseError) console.log(user.name)
void createUser
```

La sortie parsée ne garde que les champs déclarés. Champs requis manquants, primitives fausses, mauvaises valeurs nested, mauvaise longueur de tuple, ou `null` interdit → `StructError`, pas de valeur partielle. Les Structs sont immutables ; `.optional()` et amis renvoient un nouveau Struct.

## Requis, optionnel, null

Présence et nullabilité sont séparées :

| Déclaration                  | Manquant / `undefined`                 | `null`  | Valeur valide              |
| ---------------------------- | -------------------------------------- | ------- | -------------------------- |
| `struct.string()`            | Rejette                                | Rejette | Accepte string             |
| `struct.string().optional()` | Accepte ; omet le champ d’objet absent | Rejette | Accepte string             |
| `struct.string().null()`     | Rejette                                | Accepte | Accepte string             |
| `struct.string().nullish()`  | Accepte ; omet le champ d’objet absent | Accepte | Accepte string             |
| `struct.null()`              | Rejette                                | Accepte | Rejette les autres valeurs |

```typescript twoslash
import { struct } from '@defjs/core'

const Profile = struct.object({
  name: struct.string(),
  nickname: struct.string().optional(),
  biography: struct.string().null(),
  note: struct.string().nullish(),
})

const [error, profile] = struct.parse(Profile, {
  name: 'Ada',
  biography: null,
  note: undefined,
})
if (error) throw error
console.log(profile.name, profile.nickname, profile.biography, profile.note)
```

À la racine, optionnel peut être `undefined`. Dans un objet, les champs optional/nullish omis restent absents. Dans `struct.request(...)`, une section entièrement optionnelle peut être omise (normalisée en `{}`) ; une section avec un champ requis reste requise. Un wrapper body présent → body requis, même si les champs internes sont optionnels.

## Wrappers de body de requête

`struct.request(...)` sépare `path`, `query`, `headers` et `body`. Les bodies ont besoin d’un codec explicite :

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
void command
```

| Wrapper                    | Valeur parsée     | Frontière wire                                                       |
| -------------------------- | ----------------- | -------------------------------------------------------------------- |
| `struct.json(inner)`       | Valeur de `inner` | Texte JSON, `application/json`                                       |
| `struct.text()`            | `string`          | Texte, `text/plain;charset=UTF-8`                                    |
| `struct.urlencoded(shape)` | Objet de la shape | `URLSearchParams`, `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | Objet de la shape | `FormData` ; la plateforme pose le boundary multipart                |
| `struct.blob()`            | `Blob`            | Type du Blob ou `application/octet-stream`                           |
| `struct.file()`            | `File`            | `File` natif (name + type)                                           |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | Buffer, `application/octet-stream`                                   |

`struct.file()` est un Struct de valeur pour les champs de formulaire — pas un `request.body` autonome. Les bodies binaires sont `struct.blob()` et `struct.arrayBuffer()`. Les Structs object/array/primitive nus ne sont pas valides comme `request.body`. SSE rejette `body`. L’entrée de requête WebSocket rejette `body` et `headers`.

## Alias

`.alias(...)` sépare les noms logiques des noms wire. `struct.parse(...)` utilise les clés logiques. Les codecs JSON et de requête plats encodent les alias ; le décodage de réponse JSON mappe les clés wire vers les champs logiques.

```typescript twoslash
import { struct } from '@defjs/core'

const User = struct.object({
  displayName: struct.string().alias('display_name'),
})

const [parseError, user] = struct.parse(User, { displayName: 'Ada' })
if (parseError) throw parseError
console.log(user.displayName)

const [wireError] = struct.parse(User, { display_name: 'Ada' })
console.log(wireError?.issues[0]?.path)
```

| Frontière                                      | Champ                        |
| ---------------------------------------------- | ---------------------------- |
| `struct.parse(User, ...)`                      | Logique `displayName`        |
| Encodage de requête JSON                       | Wire `display_name`          |
| Décodage de réponse JSON                       | Wire → logique `displayName` |
| Encodage query, header, URL-encoded, multipart | Alias wire comme clé         |

Les alias marchent sur les champs nested, arrays, objects, unions et discriminators. Garde les noms logiques dans le code app ; mets le naming externe dans le Struct.

## Échecs de parse

`struct.parse(...)` renvoie `[null, value]` ou `[StructError, undefined]`. `StructError` étend `Error` et expose `issues`, plus `format()`, `flatten()` et `prettify()`.

```typescript twoslash
import { struct, StructError } from '@defjs/core'

const User = struct.object({ id: struct.number(), name: struct.string() })
const [error, value] = struct.parse(User, { id: 'not-a-number' })

if (error) {
  console.log(error instanceof StructError)
  console.log(error.issues[0]?.code, error.issues[0]?.path)
  console.log(error.flatten().fieldErrors)
  console.log(error.format(), error.prettify())
}
void value
```

Un `StructIssue` a `code`, `expected`, `message`, `path` et `received`. Les issues peuvent contenir de l’entrée non fiable — masque avant de journaliser ou renvoyer. `struct.parse(..., { errorMap })` rewrites issue messages for that call only.

La validation Struct est structurelle seulement. Pas de règles publiques de range, format, refinement, auth ou transition d’état. Fais ces checks avant de construire une commande.

## Référence

Constructeurs publics sur `@defjs/core` (les internals ne sont pas des API facade) :

```typescript twoslash
import { struct } from '@defjs/core'

const Any = struct.any()
const ArrayOfStrings = struct.array(struct.string())
const Bytes = struct.arrayBuffer()
const BigIntValue = struct.bigint()
const BlobValue = struct.blob()
const BooleanValue = struct.boolean()
const DateValue = struct.date()
const Discriminated = struct.discriminatedUnion('kind', [
  struct.object({ kind: struct.literal('created'), id: struct.number() }),
  struct.object({ kind: struct.literal('deleted'), id: struct.number() }),
])
const Status = struct.enum(['draft', 'published'])
const FileValue = struct.file()
const Form = struct.formData({ file: struct.file() })
const Combined = struct.intersection(struct.object({ id: struct.number() }), struct.object({ name: struct.string() }))
const JsonBody = struct.json(struct.object({ ok: struct.boolean() }))
const Literal = struct.literal('ready')
const NullValue = struct.null()
const NumberValue = struct.number()
const ObjectValue = struct.object({ id: struct.number() })
const Union = struct.or(struct.string(), struct.number())
const RecordValue = struct.record(struct.number())
const Request = struct.request({ path: struct.object({ id: struct.number() }) })
const StringValue = struct.string()
const TextBody = struct.text()
const Tuple = struct.tuple([struct.string(), struct.number()])
const Unknown = struct.unknown()
const FormUrlEncoded = struct.urlencoded({ name: struct.string() })

void [Any, ArrayOfStrings, Bytes, BigIntValue, BlobValue, BooleanValue, DateValue, Discriminated, Status, FileValue, Form, Combined]
void [
  JsonBody,
  Literal,
  NullValue,
  NumberValue,
  ObjectValue,
  Union,
  RecordValue,
  Request,
  StringValue,
  TextBody,
  Tuple,
  Unknown,
  FormUrlEncoded,
]
```

| Constructeur                     | Entrée                                                          | Sortie inférée                  |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------- |
| `struct.number()`                | Nombre autre que `NaN`                                          | `number`, y compris ±`Infinity` |
| `struct.date()`                  | `Date`, number, ou chaîne de date                               | `Date` valide                   |
| `struct.bigint()`                | `bigint` ou string acceptée par `BigInt(...)`                   | `bigint`                        |
| `struct.enum(...)`               | Membre string ou number déclaré                                 | Cette union de littéraux        |
| `struct.discriminatedUnion(...)` | Objet avec discriminateur littéral requis                       | Branche d’objet sélectionnée    |
| `struct.or(...)`                 | Première branche correspondante ; l’encodage checke l’ambiguïté | Union des sorties de branches   |
| `struct.intersection(...)`       | Valeurs acceptées par chaque membre                             | Intersection des sorties        |
| `struct.record(value)`           | Objet plain dont les valeurs matchent `value`                   | Record des valeurs parsées      |
| `struct.tuple(items)`            | Tableau de exactement la longueur déclarée                      | Tuple de longueur fixe          |

Chaque Struct supporte `.alias(name)`, `.optional()`, `.null()` et `.nullish()`. `struct.discriminatedUnion` a besoin d’options objet avec un discriminateur littéral requis et rejette les doublons.

Importe `struct`, `Infer`, `Struct`, `StructError` et les types publics liés depuis `@defjs/core`. Utilise `struct.parse(...)` comme parser. N’importe pas `createObjectStruct`, les symboles de définition, les internals de codec, ou `packages/core/src`.

Non-promesses de la facade :

- Les sorties object/record utilisent un prototype null — n’assume pas les méthodes `Object.prototype`.
- Les clés d’objet inconnues sont droppées.
- `struct.number()` rejette `NaN`, accepte les infinis.
- `struct.or(...)` essaie les branches dans l’ordre ; rejette les encodages ambigus quand les branches divergent.
- `struct.intersection(...)` parse les membres dans l’ordre de déclaration.
- Un Struct valide une frontière ; il ne met pas en cache, n’autorise pas, et ne possède pas une ressource de transport.

## Recettes liées

- [POST JSON](../recipes/post-json.md)
- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
