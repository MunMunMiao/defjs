---
title: Bien démarrer
description: Installez Defjs, définissez un endpoint HTTP typé, créez un client et utilisez-le dans votre application.
---

# Bien démarrer

Defjs permet à votre application de décrire une fois le contrat d'une API, puis de le réutiliser avec des entrées typées, un décodage à l'exécution et des résultats de transport explicites.

## Installation

Ajoutez le package Core à votre application :

```sh
pnpm add @defjs/core
```

Utilisez la commande npm, Yarn ou Bun équivalente si votre projet emploie un autre gestionnaire de packages. `@defjs/core` est en ESM. Pour une exécution sous Node.js, les métadonnées actuelles du package exigent Node 26 ou une version plus récente.

Ajoutez un adaptateur uniquement si votre application en a besoin :

| Configuration              | Packages                                                                                  |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| React 18+                  | `@defjs/core`, `@defjs/react`, `react`                                                    |
| Vue 3+                     | `@defjs/core`, `@defjs/vue`, `vue`                                                        |
| OpenTelemetry côté serveur | `@defjs/core`, `@defjs/opentelemetry-server`, `@opentelemetry/api`, `@opentelemetry/core` |

::: tip Utilisez la documentation de la version installée
Ces pages décrivent l'API de cette version de la documentation. Vérifiez la version installée dans votre application. Si un export ou une option diffère, consultez la documentation et les notes de cette version plutôt que de mélanger des exemples de versions différentes.
:::

## Définir votre première requête

Supposons que votre API expose `GET /users/:id`. Remplacez l'URL de base et les Structs de réponse par le contrat réel de votre service.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})

async function loadUser(id: number) {
  const [error, user, response] = await client.execute(getUser({ path: { id } }))

  if (error) {
    console.error(error.kind, error.code)
    return
  }

  console.log(user.name, response.status)
}

void loadUser(7)
```

`defineRequest(...)` renvoie un **constructeur de commande**. Appeler `getUser(...)` crée une **commande** qui contient la définition d'endpoint et les données de l'appel. `client.execute(...)` renvoie ensuite un tuple HTTP à trois éléments, avec l'erreur en premier :

```typescript
;[error, result, response]
```

En cas de succès, `error` vaut `null`, `result` contient la sortie décodée et `response` est un wrapper Defjs `SettledResponse`. En cas d'échec, `result` vaut `undefined`. Le wrapper de réponse vaut également `undefined` si aucune réponse n'est arrivée.

### Pourquoi `as const` est nécessaire

La forme tableau de `output` s'appuie sur les statuts littéraux pour distinguer les corps de succès 2xx des corps d'erreur non-2xx. `as const` conserve ces statuts, ainsi que leurs éventuels groupes, sous forme de littéraux `readonly`. Sans lui, TypeScript peut les élargir en `number` ou `number[]` et perdre en précision dans l'inférence des branches de succès et d'erreur.

La forme objet est également prise en charge :

```typescript
const output = {
  '200': struct.object({ id: struct.number() }),
  '404': struct.object({ message: struct.string() }),
}
```

## L'intégrer à votre application

Placez les définitions d'endpoints dans des modules qui décrivent l'API de votre service. Réutilisez leurs constructeurs de commande depuis vos composants, route handlers, jobs ou stores. Créez le client à la frontière qui possède son endpoint, ses identifiants, ses intercepteurs et son cycle de vie :

- Une application navigateur peut généralement partager un client.
- En rendu serveur, créez un client par requête lorsque les en-têtes, cookies, utilisateurs ou tenants varient.
- Le code qui ouvre une ressource SSE ou WebSocket doit aussi la consommer et la fermer.

## Étapes suivantes

- [Commandes](/fr-FR/core/commands) explique la construction automatique des requêtes et les projections personnalisées liées au schéma.
- [Erreurs](/fr-FR/core/errors) décrit les tuples des trois transports et l'union `RequestError`.
- [HTTP](/fr-FR/core/http) couvre la résolution des URL, les corps de requête, le décodage des sorties, l'annulation et le comportement XSRF.
- [Exemples](/fr-FR/guide/examples) assemble ces contrats en recettes dont l'application gère le cycle de vie.
