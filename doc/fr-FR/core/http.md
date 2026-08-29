---
title: HTTP
description: Définis une requête, exécute-la, branche sur le statut, et annule avec signal ou timeout.
---

# HTTP

Définis → exécute → branche sur le tuple → annule quand l’écran part. C’est toute la boucle HTTP.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## Résoudre l’URL

`withEndpoint(...)` a besoin d’une URL absolue valide. Le pathname de l’endpoint reste comme répertoire ; query et hash sont écartés avant la résolution de commande.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Les placeholders de path sont des scalaires bruts, encodés exactement une fois. Les valeurs vides et `.` / `..` sont rejetées. Slash, `?`, `#`, `%`, espaces et Unicode dans un placeholder restent un seul segment encodé — ne pré-encode pas.

Le path de définition ne peut pas contenir `?` ou `#`, et ne peut pas être absolu ou protocol-relative. L’encodeur de query par défaut accepte les scalaires et tableaux de scalaires. Les valeurs de query nested/complexes ont besoin de `withQueryParamsSerializer(...)` sinon la construction échoue.

## Encoder l’entrée

`struct.request(...)` garde path, query, headers et body séparés. Le wrapper body choisit le codec et le content type :

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: {
    200: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
  },
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Les alias ne réécrivent que les clés wire sortantes. Les valeurs parsées et les entrées de commande gardent les noms logiques.

| Wrapper                    | Body runtime      | Content type par défaut                                               |
| -------------------------- | ----------------- | --------------------------------------------------------------------- |
| `struct.json(inner)`       | Chaîne JSON       | `application/json`                                                    |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                            |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`                     |
| `struct.formData(shape)`   | `FormData`        | Boundary multipart plateforme ; Defjs efface un `Content-Type` périmé |
| `struct.blob()`            | `Blob`            | Type du Blob ou `application/octet-stream`                            |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                            |

Un `build` custom expose les mêmes setters de location/codec. L’écriture finale du body gagne (valeur + métadonnées content-type). Les commandes de haut niveau ne transforment pas un objet arbitraire en body — déclare un wrapper ou utilise le setter correspondant.

## Dispatcher par statut

`output` est une map statut → Struct ou `{ status, body }[]`. Avec `output` et sans `responseType`, la représentation par défaut est `json`. Types explicites : `json`, `text`, `blob`, `arraybuffer`.

Ordre des opérations :

1. Statut `0` → erreur de transport.
2. Pas d’`output` → 2xx réussit avec `data === undefined` ; non-2xx → `HTTP_STATUS` avec `error.data === undefined`. Body non décodé.
3. Avec `output`, le statut déclaré exact sélectionne son Struct. Forme tableau : un match plus tard override un match groupé plus tôt.
4. Statut non déclaré → `UNDECLARED_STATUS` **avant** le décodage du body.
5. Échec de représentation → `RESPONSE_VALIDATION_FAILED`, pas de data partielle.
6. 2xx déclaré décodé → résultat ; non-2xx déclaré décodé → `error.data` typé sur `HTTP_STATUS`.

`HttpResponse` a `url`, `status`, `statusText`, `headers`, `body`, `error` et `ok`. `ok` signifie seulement `200 <= status < 300`. C’est une valeur Defjs, pas une `Response` native. Sans `output`, `responseType` n’est pas autorisé.

## Cancel the work

Les options d’exécution prennent `signal` plus soit `abort` soit `timeout`. **`abort` et `timeout` sont mutuellement exclusifs.** `signal` peut se combiner avec l’un ou l’autre.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.kind === 'transport' && error.code === 'ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` doit être un entier sûr positif dans `1..2_147_483_647`. Annulation reconnue → `ABORTED` ; timeout d’exécution → `TIMEOUT` ; autres échecs Fetch/intercepteur → `NETWORK_ERROR`. Annuler après que le serveur a accepté une écriture ne **prouve** pas que l’écriture a été annulée.

## Credentials et XSRF

`withCredentials(true)` pose Fetch `credentials: 'include'` pour HTTP et SSE. Il ne crée pas `Authorization` et ne configure pas l’auth WebSocket. `false` laisse credentials non spécifié.

`withXSRF(...)` est HTTP seulement. Défauts : `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. L’en-tête s’injecte seulement pour les méthodes non safe, seulement si l’appelant ne l’a pas déjà posé, et seulement pour les requêtes navigateur same-origin. Saute `GET`, `HEAD`, `OPTIONS`, `TRACE`. Hors navigateur, passe un `tokenProvider` synchrone scopé à la requête si tu as besoin de l’injection.

Garde credentials, tokens XSRF et query strings hors des logs de routine. N’utilise pas les query params comme canal général de credentials.

## Progress et la frontière Fetch

`onDownloadProgress` tourne pendant qu’une représentation de réponse explicite est lue. `lengthComputable` n’est vrai qu’avec un `Content-Length` positif. Pas de `responseType` → pas de décodage du body → pas de progress de lecture du body.

`onUploadProgress` observe un body de requête `ReadableStream<Uint8Array>` pendant que Fetch le lit. Les wrappers body normaux n’exposent pas de setter de stream brut — le progress d’upload est surtout pour la construction bas niveau.

`fetchHandler(httpRequest, fetchImpl?)` est la frontière Fetch bas niveau : construit une `Request` native, appelle Fetch, lit la représentation, renvoie `HttpResponse`. Il ne valide **pas** l’entrée de commande, ne dispatche pas `output` et ne lance pas les intercepteurs. Utile pour les tests de transport injectés — pas un substitut à `client.execute`.

## Limites de replay

Defjs ne relance **pas** HTTP automatiquement. Relancer une lecture a encore besoin d’une politique timeout/réseau/doublon revue. Relancer une mutation a besoin d’octets rejouables, du support serveur, d’une clé d’idempotence liée à la portée auth + octets de requête, et d’une politique de doublons côté récepteur.

Une frontière client/commande/Fetch ne peut pas savoir si une écriture échouée a été commitée. Garde les décisions de replay dans l’app ou un intercepteur revu. Les intercepteurs peuvent short-circuit ou remplacer la requête bas niveau ; le statut et le body finaux doivent quand même satisfaire le contrat de la commande.

## Recettes liées

- [GET avec un 404 déclaré](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Annuler un appel HTTP](../recipes/cancel-http.md)
- [Tester avec un handle Fetch local](../recipes/test-with-handle.md)
