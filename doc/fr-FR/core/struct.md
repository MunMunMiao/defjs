---
title: Struct
description: Décodez strictement les données structurées et gérez les entrées obligatoires, facultatives, les alias et StructError.
---

# Struct

Les Structs décrivent le décodage structurel strict et l'encodage du format d'échange. Une valeur obligatoire absente ou invalide échoue au lieu de produire une valeur par défaut.

Utilisez la façade `struct` et `Infer<T>` depuis l'entrée racine :

```typescript
import { struct, type Infer } from '@defjs/core'

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

// Caller input uses { id, displayName }.
// JSON wire data uses { user_id, display_name }.
```

Les alias décodent et encodent les clés JSON. La construction automatique les applique aussi aux clés sortantes de `path`, `query`, `headers`, ainsi qu'aux données URL-encoded et multipart. L'appelant continue d'utiliser les clés logiques. Une projection `build` personnalisée conserve ses clés cibles explicites.

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
