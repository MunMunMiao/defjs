---
title: HTTP
description: defineRequest, options d’execute, et types de requête/réponse HTTP.
---

# HTTP

Déclare une requête typée, construis une commande depuis l’input, exécute-la.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, struct `input` optionnel, `output` indexé par statut, `operation` et `build` optionnels.
- **Renvoie** un builder. Appelle-le avec l’input pour obtenir un `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
  },
})
```

`output` peut aussi être une liste de groupes `{ status, body }` (un struct body pour plusieurs codes).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Entrée bas niveau utilisée par `client.execute`. Dans le code d’application, appelle `client.execute(command, options)`.

- **Renvoie** `[null, body, response]` ou `[error, undefined, response?]`.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Transport HTTP par défaut. Utilisé sauf si `withHTTPHandle` le remplace.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Construis un `HttpResponse` sans appel réseau (intercepteurs, tests). Le statut par défaut est `0`. `ok` est true pour du 2xx.

## Options d’execute

## HttpExecuteOptions {#HttpExecuteOptions}

```ts
type HttpExecuteOptions = {
  onDownloadProgress?: HttpProgressFn
  onUploadProgress?: HttpProgressFn
  abort?: AbortSignal
  timeout?: number
  signal?: AbortSignal
}
```

L’annulation c’est `abort` **ou** `timeout`, pas les deux. `signal` se combine avec l’un ou l’autre ; ce n’est **pas** un alias de `abort`. Valide : `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. Invalide : `{ abort, timeout }`. `timeout` doit être un entier sûr positif dans `1..2_147_483_647`.

## Types

### RequestDefinition {#RequestDefinition}

`method`, `path`, `input` optionnel, `output`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, `build` optionnel (assemblage custom de requête ; exige `input`).

### RequestOutputShape {#RequestOutputShape}

```ts
type RequestOutputShape = { [status: number]: AnyStruct } | readonly { status: number | readonly number[]; body: AnyStruct }[]
```

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TSuccess, TErrorData> =
  | [error: null, result: TSuccess, response: HttpResponse<TSuccess>]
  | [error: RequestError<TErrorData>, result: undefined, response: HttpResponse<unknown> | undefined]
```

### HttpRequest {#HttpRequest}

Requête sortante normalisée : `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, hooks de progress, `baseEndpoint`, métadonnées de query.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly error?: unknown
  readonly ok: boolean
}
```

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Les callbacks peuvent être async.

Voir [le guide HTTP](../core/http.md) et [Commandes](../core/commands.md).

## ResponseGroupItem {#ResponseGroupItem}

Une ligne `{ status, body }` dans la forme liste de `RequestOutputShape`. `status` peut être un code, ou plusieurs qui partagent le même body struct.

## RequestCommandBuilder {#RequestCommandBuilder}

Renvoyé par `defineRequest`. Appelle avec l’input, tu obtiens un `HttpCommand`.

## HttpCommand {#HttpCommand}

Command opaque du request builder. Passe-la à `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progression, annulation. `HttpExecuteOptions` ajoute `signal`.

## RequestSuccessData {#RequestSuccessData}

Body de succès inféré des `output` 2xx déclarés.

## RequestErrorData {#RequestErrorData}

Body d’erreur inféré des `output` non-2xx déclarés.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Champs pour `makeResponse` : `status`, `statusText`, `url`, `headers`, `body`, `error`.
