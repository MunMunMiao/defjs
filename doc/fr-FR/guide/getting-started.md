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

Utilisez la commande npm, Yarn ou Bun équivalente si votre projet emploie un autre gestionnaire de packages. `@defjs/core` est en ESM. Pour une exécution sous Node.js, les métadonnées actuelles du package exigent Node 22 ou une version plus récente.

Des consommateurs HTTP ESM packagés ont été exécutés avec Node.js 22, 24 et 26, Bun 1.3.14 et Deno 2.9.5. Après compilation de votre application, les commandes correspondantes sont :

```sh
node dist/index.js
bun run dist/index.js
deno run --node-modules-dir=manual --allow-net=api.example.com dist/index.js
```

La commande Deno utilise les packages déjà installés dans `node_modules` ; remplacez l'autorisation réseau par les hôtes API exacts requis par votre application. Les vérifications Bun et Deno couvrent la partie HTTP documentée, pas toutes les API de plateforme ni tous les transports. Les builds navigateur utilisent leur bundler habituel et les capacités Fetch et WebSocket requises par la plateforme.

Les tests multi-runtime doivent vérifier les champs Defjs stables tels que `error.kind` et `error.code`. Ne dépendez pas des messages `Error` natifs propres au moteur ni du texte des erreurs d'analyse JSON ; Node.js, Bun et Deno peuvent formater ces détails différemment.

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
  ],
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

En cas de succès, `error` vaut `null`, `result` contient la sortie décodée et `response` est un wrapper Defjs `HttpResponse`. En cas d'échec, `result` vaut `undefined`. Le wrapper de réponse vaut également `undefined` si aucune réponse n'est arrivée.

### Les littéraux de statut sont conservés automatiquement

`defineRequest(...)` utilise un const generic pour `output`. Les entrées inline du tableau et les groupes de statuts conservent donc automatiquement leurs valeurs littérales. Aucun `as const` n'est nécessaire pour distinguer, dans les types inférés, les corps de succès 2xx des corps d'erreur non-2xx.

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
