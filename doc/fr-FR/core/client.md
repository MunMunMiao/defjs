---
title: Client
description: Créez un client explicite, composez ses options, exécutez les commandes et inspectez sa configuration active.
---

# Client

Créez explicitement un `Client`, puis transmettez-le au code qui exécute les commandes.

```typescript
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

Le client conserve sa configuration et dirige les commandes vers HTTP, SSE ou WebSocket. Il ne gère ni registre global ni cycle de vie en arrière-plan.

## Composition des options

Les options s'exécutent de gauche à droite.

```typescript
const client = createClient(
  withEndpoint('https://old.example.com'),
  withEndpoint('https://api.example.com'),
  withInterceptors(operationLogger),
  withInterceptors(authInterceptor, retryInterceptor),
)
```

L'endpoint final est `https://api.example.com`. L'ordre des intercepteurs est `operationLogger`, `authInterceptor`, puis `retryInterceptor`.

La composition suit trois règles :

1. Les helpers qui définissent une valeur la remplacent. Cela comprend `withEndpoint`, les implémentations des transports, le sérialiseur de query, le mode Fetch `credentials`, la configuration XSRF et chaque réglage SSE ou WebSocket individuel.
2. `withInterceptors(...items)` ajoute les éléments à la suite. Plusieurs appels conservent l'ordre d'ajout des intercepteurs.
3. `withSSEOptions(...)` et `withWebSocketOptions(...)` remplacent chaque champ de premier niveau défini. La fusion reste superficielle : les objets imbriqués de reconnexion, de heartbeat ou de file ne sont pas fusionnés en profondeur.

Dans l'exemple suivant, le second objet de reconnexion remplace le premier. Il ne conserve pas `attempts: 5`.

```typescript
const client = createClient(
  withWebSocketOptions({
    reconnect: { attempts: 5, delayMs: 500 },
  }),
  withWebSocketOptions({
    reconnect: { delayMs: 2_000 },
  }),
)
```

Les helpers d'options groupées ignorent les propriétés à `undefined`. Toute autre propriété fournie au premier niveau remplace entièrement la valeur en cours.

### Options principales

| Option                           | Effet                                                                                     |
| -------------------------------- | ----------------------------------------------------------------------------------------- |
| `withEndpoint(url)`              | Définit l'endpoint de base absolu utilisé par tous les transports.                        |
| `withHTTPHandle(fetch)`          | Remplace l'implémentation Fetch pour HTTP.                                                |
| `withSSEHandle(fetch)`           | Remplace l'implémentation Fetch pour SSE.                                                 |
| `withWebSocketHandle(WebSocket)` | Remplace le constructeur WebSocket.                                                       |
| `withInterceptors(...items)`     | Ajoute à la suite des intercepteurs de transports différents.                             |
| `withQueryParamsSerializer(fn)`  | Remplace la sérialisation de la query pour HTTP, SSE et WebSocket.                        |
| `withCredentials(boolean)`       | Utilise `credentials: 'include'` avec Fetch pour HTTP et SSE lorsque la valeur est vraie. |
| `withXSRF(options?)`             | Configure l'injection du token XSRF pour HTTP.                                            |
| `withSSEOptions(options)`        | Remplace les champs SSE définis, sans fusion profonde.                                    |
| `withWebSocketOptions(options)`  | Remplace les champs WebSocket définis, sans fusion profonde.                              |

Les helpers SSE et WebSocket individuels définissent chacun le champ de premier niveau correspondant. Les pages des transports indiquent leurs valeurs par défaut et leurs conséquences sur le cycle de vie.

## Exécuter des commandes

`Client.execute` possède trois surcharges. Chacune renvoie un tuple à trois éléments, avec l'erreur en premier.

### HTTP

```typescript
const [error, data, response] = await client.execute(requestCommand, {
  signal,
  timeout: 5_000,
})
```

Le troisième élément est un wrapper Defjs `SettledResponse` lorsqu'une réponse est disponible. Les options HTTP comprennent `abort` ou `timeout`, l'alias supplémentaire `signal`, `context`, ainsi que les observateurs de progression d'envoi et de téléchargement.

### SSE

```typescript
const [error, stream, startupOpen] = await client.execute(streamCommand, {
  signal,
})
```

Le troisième élément est l'instantané d'ouverture validé au démarrage. `stream.open` est un getter dynamique distinct, qui peut changer après une tentative de reconnexion. L'exécution SSE accepte l'annulation et `HttpContext` ; la reconnexion et la file d'événements se configurent sur le client.

### WebSocket

```typescript
const [error, session, startupConnection] = await client.execute(socketCommand, {
  signal,
  reconnect: { attempts: 3 },
})
```

Le troisième élément est l'instantané de connexion au démarrage. `session.connection` est un getter dynamique qui peut décrire une tentative de connexion physique ultérieure. L'exécution WebSocket accepte l'annulation et les options `beforeConnect`, `heartbeat`, `protocols`, `queue` et `reconnect` propres à cette exécution. Elle n'accepte pas `HttpContext`.

Consultez [Erreurs](/fr-FR/core/errors) pour les branches d'échec exactes, ainsi que [HTTP](/fr-FR/core/http), [SSE](/fr-FR/core/sse) et [WebSocket](/fr-FR/core/web-socket) pour le cycle de vie de chaque transport.

## Portée du client

Une application navigateur peut conserver un client au niveau du module si son endpoint et les fonctions qu'il capture ne contiennent qu'un état adapté au navigateur et indépendant des requêtes.

```typescript
export const apiClient = createClient(withEndpoint(import.meta.env.VITE_API_ENDPOINT))
```

Côté serveur, ne réutilisez pas un client entre plusieurs requêtes si ses options ou intercepteurs capturent des données d'autorisation, des cookies, un tenant, un utilisateur ou un contexte de requête. Créez-le dans la portée de la requête serveur.

Un `Client` n'a pas de méthode `dispose()`. Il ne suit ni les requêtes, ni les flux SSE, ni les sessions WebSocket actifs. Le code qui démarre un travail doit annuler ou fermer la ressource à la limite de cycle de vie correspondante.

## Inspection avancée

Utilisez `isClient(value)` pour tester le marqueur du client à l'exécution.

```typescript
import { isClient } from '@defjs/core'

export function keepClient(value: unknown) {
  return isClient(value) ? value : undefined
}
```

`getClientConfig(client)` renvoie l'objet de configuration mutable vivant détenu par le client. Ce n'est ni un instantané ni une vue en lecture seule.

```typescript
import { getClientConfig, type Client } from '@defjs/core'

export function interceptorCount(client: Client): number {
  return getClientConfig(client).interceptors.length
}
```

Modifier cet objet change les exécutions suivantes et contourne la composition normale des options. Réservez-le au diagnostic ou à du code d'intégration soigneusement relu. `getClientConfig` lève une `TypeError` si son argument n'est pas un client valide.

## Étapes suivantes

- [Commandes](/fr-FR/core/commands) définit les valeurs transmises à `execute`.
- [Intercepteurs](/fr-FR/core/interceptors) explique le filtrage et l'ordre « oignon ».
- [Contexte](/fr-FR/core/context) présente les métadonnées par requête pour HTTP et SSE.
