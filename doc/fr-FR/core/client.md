---
title: Client
description: Crée un client explicite, compose les options, exécute des commandes et possède le nettoyage.
---

# Client

Un `Client` détient la config d’endpoint + transport et dispatche les commandes HTTP, SSE et WebSocket. Il ne met pas en cache, ne relance pas auto et ne babysitte pas les flux ouverts.

## Basic Setup

```typescript twoslash
import { createClient, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
```

## Composer les options

Les options s’appliquent de gauche à droite. Les setters remplacent ; `withInterceptors(...items)` append.

```typescript twoslash
import { createClient, createHttpInterceptor, withCredentials, withEndpoint, withInterceptors } from '@defjs/core'

const audit = createHttpInterceptor(async (request, next) => {
  const started = performance.now()
  const response = await next(request)
  console.info(request.operation ?? request.method, response.status, Math.round(performance.now() - started))
  return response
})

const client = createClient(withEndpoint('https://api.example.com'), withInterceptors(audit), withCredentials(true))
void client
```

Les intercepteurs mixtes sont filtrés par transport à l’exécution ; l’ordre relatif parmi le kind sélectionné reste.

## Exécuter par transport

- HTTP → `[error, data, response]`
- SSE → `[error, stream, open]` (`open` est l’instantané de démarrage ; `stream.open` peut changer après reconnect)
- WebSocket → `[error, session, connection]`

L’execute WebSocket peut overrider `beforeConnect`, `heartbeat`, `protocols` et `reconnect`. `timeout` doit être un entier sûr positif dans `1..2_147_483_647`.

Tu possèdes le nettoyage : abort HTTP, ferme SSE + `await stream.closed`, ferme WebSocket + `await session.closed`.

## Injecter un transport de test

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: { 200: struct.object({ id: struct.number(), name: struct.string() }) },
})

const handle: typeof fetch = async () => Response.json({ id: 7, name: 'Ada' })
const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(handle))
const [error, user] = await client.execute(getUser({ path: { id: 7 } }))
if (!error) console.log(user.name)
```

## Portée serveur vs navigateur

Sur un serveur, crée le client dans la frontière de la requête quand les options ou closures d’intercepteur capturent auth, cookies, utilisateurs ou tenants. L’identité du client n’est pas une frontière de sécurité à elle seule.

## Référence

| Helper                                                                                                        | Effet                                                   |
| ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `withEndpoint(url)`                                                                                           | Endpoint de base absolu pour tous les transports        |
| `withHTTPHandle(fetch)`                                                                                       | Remplace Fetch pour HTTP                                |
| `withSSEHandle(fetch)`                                                                                        | Remplace Fetch pour SSE                                 |
| `withWebSocketHandle(WebSocket)`                                                                              | Remplace le constructeur WebSocket                      |
| `withInterceptors(...items)`                                                                                  | Append des intercepteurs mixtes                         |
| `withQueryParamsSerializer(fn)`                                                                               | Remplace la sérialisation de query                      |
| `withCredentials(boolean)`                                                                                    | Fetch `credentials: 'include'` pour HTTP/SSE quand true |
| `withXSRF(options?)`                                                                                          | Cookie XSRF HTTP → en-tête                              |
| `withSSEReconnect` / `withSSEOnInvalidEvent`                                                                  | Réglages SSE                                            |
| `withWebSocketReconnect` / `withWebSocketHeartbeat` / `withWebSocketProtocols` / `withWebSocketBeforeConnect` | Réglages WebSocket                                      |

## Recettes liées

- [Tester avec un handle Fetch local](../recipes/test-with-handle.md)
- [Annuler un appel HTTP](../recipes/cancel-http.md)
