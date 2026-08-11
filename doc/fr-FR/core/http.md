---
title: HTTP
description: Construisez les URL et corps HTTP, décodez les réponses, annulez les requêtes et configurez credentials et XSRF.
---

# HTTP

`defineRequest(...)` crée un constructeur de commande HTTP. [Commandes](/fr-FR/core/commands) décrit les définitions et les projections d'entrée ; cette page traite du format d'échange HTTP et de son cycle de vie.

## Entrée client réservée à HTTP

`@defjs/core/http` est un point d'entrée additif réservé à HTTP. Il exporte `createHttpClient(...)` avec les commandes HTTP et les options client compatibles HTTP :

```typescript
import { createHttpClient, defineRequest, struct, withEndpoint } from '@defjs/core/http'

const httpClient = createHttpClient(withEndpoint('https://api.example.com'))
```

Utilisez-le lorsqu'un consommateur ne prend volontairement en charge que HTTP. Il ne remplace pas l'entrée racine : `createClient(...)` depuis `@defjs/core` reste le client des commandes HTTP, SSE et WebSocket.

## Construction de l'URL

`withEndpoint(...)` doit recevoir une URL de base absolue. Son chemin est conservé comme un répertoire :

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Un slash final est ajouté au chemin de base s'il manque. La query et le fragment éventuels de l'endpoint de base sont supprimés.

La propriété `path` d'un endpoint contient un chemin de contrat relatif. Un slash initial est accepté puis retiré avant la résolution ; il ne remplace donc pas le répertoire de base. L'exécution refuse :

- les URL absolues et relatives au protocole ;
- les chemins contenant `?` ;
- les chemins contenant `#`.

Les paramètres de `path` utilisent la forme `:name` :

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Transmettez les valeurs brutes des paramètres. Defjs sérialise chaque scalaire, refuse une valeur vide ainsi que les valeurs complètes `.` et `..`, puis applique `encodeURIComponent` exactement une fois avant la substitution. `/`, `?`, `#`, `%`, les espaces et Unicode restent dans un seul segment. Ne préencodez pas les valeurs : `%` est traité comme une entrée brute et encodé en `%25`.

## Encodage de la requête

Utilisez `struct.request(...)` pour une correspondance directe avec le format d'échange :

```typescript
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
```

Les Structs de `body` choisissent l'encodage et le type de contenu par défaut :

| Struct de `body`           | Corps envoyé          | `Content-Type` par défaut                         |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | chaîne                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | défini par la plateforme, boundary comprise       |
| `struct.blob()`            | `Blob`                | type du Blob ou `application/octet-stream`        |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

Un `build` personnalisé peut utiliser les méthodes HTTP correspondantes du constructeur de requête. Les setters remplacent la partie concernée ; `addHeaders`, `addFormData` et `addFormUrlEncoded` complètent la partie en cours. Toutes les valeurs doivent provenir de la projection liée au schéma.

### Valeurs de `query`

L'encodeur de query par défaut accepte des valeurs scalaires plates et des tableaux de scalaires. Les objets imbriqués font échouer la construction de la requête.

`withQueryParamsSerializer((params, rawParams) => string)` peut modifier le rendu de valeurs plates déjà acceptées. Il reçoit une vue `URLSearchParams` et l'objet plat encodé. Il ne rend pas valides les objets `query` imbriqués : ceux-ci sont refusés avant la sérialisation.

Les alias deviennent les clés sortantes de `query`, `path` et `headers`. Le code appelant continue d'utiliser les noms logiques des champs Struct.

## Statuts et décodage des sorties

`output` associe les statuts aux Structs de réponse :

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
    { status: 409, body: struct.object({ conflict: struct.string() }) },
  ],
})
```

L'exécution choisit la Struct correspondant exactement au statut. Tout statut sans correspondance produit `UNDECLARED_STATUS` lorsque `output` est déclaré. Les corps 2xx déclarés forment l'union des données de succès. `defineRequest(...)` utilise un générique const : les statuts inline conservent donc leurs littéraux sans `as const`, et l'union des erreurs HTTP garde chaque statut non-2xx corrélé à son corps `error.data`.

```typescript
const [statusError] = await client.execute(getUser({ path: { id: 42 } }))

if (statusError?.kind === 'http') {
  if (statusError.status === 404) {
    console.error(statusError.data.message)
  } else {
    // status vaut 409 et data est le corps de conflit déclaré.
    console.error(statusError.data.conflict)
  }
}
```

`response.ok` signifie uniquement `status >= 200 && status < 300`. Il ne garantit ni le décodage de la sortie, ni la validation applicative, ni la réussite de l'autorisation.

Lorsque `output` est déclaré et que `responseType` est omis, la réponse est analysée en `json` par défaut. Les modes explicites sont `json`, `text`, `blob` et `arraybuffer`. La Struct choisie effectue ensuite le décodage structurel. Si `output` est omis, `responseType` n'est pas accepté, le résultat vaut `undefined` et le wrapper de réponse contient `body: null`. Le runtime tente d'annuler le corps de la réponse en mode best-effort au lieu de le lire ou de le décoder.

La classification du résultat de la commande suit une priorité fixe : échec de transport avec le statut 0 → absence d'`output` → correspondance exacte du statut ou `UNDECLARED_STATUS` → `response.error` → décodage par la Struct. Une erreur de représentation du corps ne peut donc survenir que si `output` est déclaré ; la branche de statut non déclaré reste prioritaire si Fetch en a enregistré une.

### Erreurs de représentation

Pour un output déclaré dont le statut correspond exactement, si JSON ou un autre codec du corps échoue, Fetch conserve l'exception d'origine dans `HttpResponse.error`. L'exécution s'arrête avant d'appliquer la Struct de sortie et renvoie `[RESPONSE_VALIDATION_FAILED, undefined, response]` ; l'exception reste dans `cause` et aucune `error.data` typée n'est produite.

Une réponse non-2xx ordinaire ne remplit pas `response.error` ; son état est représenté par `status` et `ok`. Si le statut non-2xx et le corps sont déclarés et que le corps est valide, la Struct est décodée et l'erreur `HTTP_STATUS` conserve le corps typé dans `error.data`.

## Résultat HTTP

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

En cas de succès, `response` est un wrapper Defjs `HttpResponse` dont le corps correspond à `data`. En cas d'échec, la présence de la réponse dépend du stade atteint par l'exécution. Consultez [Erreurs](/fr-FR/core/errors) pour la taxonomie exacte.

## Annulation et timeout

L'exécution HTTP accepte `abort`, `signal` et `timeout` :

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` est fusionné avec le signal interne du client et avec un timeout positif. Le champ distinct `abort` est une autre forme de signal d'annulation conservée par l'API actuelle. `abort` et `timeout` ne peuvent pas être fournis ensemble : cette combinaison renvoie `REQUEST_VALIDATION_FAILED`. `signal` peut être associé à l'un ou l'autre.

Pour l'exécution HTTP, SSE et WebSocket, `timeout` doit être un entier sûr positif compris entre `1` et `2_147_483_647` ; `0`, les valeurs négatives ou fractionnaires, `NaN`, `Infinity` et les valeurs supérieures à cette limite renvoient `REQUEST_VALIDATION_FAILED` avant la création de toute ressource de requête, de flux ou de socket.

Une annulation reconnue produit `ABORTED`. Le motif d'un `AbortSignal.timeout(...)` ou un timeout d'exécution produit `TIMEOUT`. Les autres échecs Fetch produisent `NETWORK_ERROR`.

## Credentials et XSRF

`withCredentials(true)` définit `credentials: 'include'` pour Fetch avec HTTP et SSE. La valeur `false` laisse cette option Fetch non définie ; elle n'impose pas `omit`. Ce réglage n'ajoute aucun en-tête `Authorization` et ne configure pas l'authentification WebSocket.

`withXSRF(...)` ne s'applique qu'aux requêtes HTTP. Ses valeurs par défaut sont :

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

L'injection est ignorée pour les méthodes sûres selon la RFC `GET`, `HEAD`, `OPTIONS` et `TRACE`. Toute autre méthode, y compris une méthode non sûre personnalisée comme `PROPPATCH`, passe par les mêmes contrôles d'en-tête existant, de même origine et de token avant l'injection. Un en-tête configuré déjà présent est conservé. Dans le navigateur, la lecture du cookie se limite aux requêtes same-origin. Hors navigateur, fournissez un `tokenProvider` synchrone ; il prend la priorité sur la lecture du cookie.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

Gardez les fournisseurs de token serveur dans la portée de la requête. `withCredentials(true)` ne rend pas les cookies cross-origin lisibles par le JavaScript du navigateur et ne déclenche pas l'injection d'un en-tête XSRF cross-origin.

## Observateurs de progression

`onDownloadProgress` indique le nombre d'octets lus dans le corps de la réponse Fetch. `lengthComputable` n'est vrai que si un `Content-Length` positif est disponible.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` n'observe qu'un corps de requête `ReadableStream<Uint8Array>`. Les constructeurs de commande haut niveau actuels exposent des setters de projection pour Blob et ArrayBuffer, mais aucun setter de flux brut. Il n'existe donc pas d'exemple `defineRequest` standard capable de fournir le flux requis par cette option. Ne présentez pas un flux construit manuellement comme un `body` de commande haut niveau fonctionnel.

Les callbacks de progression s'exécutent sur le chemin de lecture ou d'écriture du transport. Gardez-les rapides et sans exception.

## Frontière Fetch bas niveau

`fetchHandler(httpRequest, fetchImpl?)` est exporté. Il convertit la `HttpRequest` Defjs en `Request` native, appelle Fetch, analyse la représentation de réponse choisie et renvoie un wrapper Defjs `HttpResponse`. Les échecs Fetch deviennent des wrappers de statut 0.

Appeler directement `fetchHandler` contourne :

- le décodage de l'entrée de commande et la projection de requête ;
- la sélection du statut de sortie HTTP et le décodage Struct ;
- l'orchestration des intercepteurs du client ;
- la conversion vers le tuple `RequestError` haut niveau.

Il s'agit d'une frontière bas niveau exportée, pas du parcours de commande recommandé. Aucun engagement de stabilité à long terme n'est établi ici.

## Étapes suivantes

- [Intercepteurs](/fr-FR/core/interceptors) couvre le clonage des requêtes, le court-circuit et les nouvelles tentatives.
- [Erreurs](/fr-FR/core/errors) décrit les échecs de statut HTTP, de transport et de définition.
- [Struct](/fr-FR/core/struct) explique le décodage structurel strict.
