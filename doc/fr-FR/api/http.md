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

- **definition** — `method`, `path`, struct `input` optionnel, structs `output` et `error` optionnels, `operation` et `build` optionnels.
- **Renvoie** un builder. Appelle-le avec l’input pour obtenir un `HttpCommand`.

```ts
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})
```

`output` est un struct pour le corps 2xx ; `error` est un struct pour tout corps non-2xx. Aucun des deux n’est indexé par statut. Omettre l’un veut dire que ce corps n’est jamais lu — voir [Déclarer, c’est affirmer](/fr-FR/guide/design-decisions#déclarer-c-est-affirmer).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Entrée bas niveau utilisée par `client.execute`. Dans le code d’application, appelle `client.execute(command, options)`.

- **Retourne** `[null, data, response]` ou `[fault, undefined, undefined]`.

Un statut non-2xx est toujours `HTTP_STATUS`. Son `data` est le corps `error` décodé quand un `error` était déclaré, et `undefined` sinon. En cas d’échec, le troisième emplacement du tuple vaut `undefined` ; les métadonnées de la réponse sont portées par le fault.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Transport HTTP par défaut. Utilisé sauf si `withHTTPHandle` le remplace. Il reject — au lieu de resolve avec une réponse synthétique — quand aucune réponse n’a atteint le client.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Construis un `HttpResponse` sans appel réseau (intercepteurs, tests). Le statut par défaut est `0`. `ok` est true pour du 2xx. La valeur retournée passe par la même vérification de media type et le même struct déclaré qu’une réponse venue du réseau ; il n’y a aucun court-circuit de confiance.

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

`method`, `path`, `input` optionnel, `output`, `error`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, `build` optionnel (tu assembles la requête toi-même ; nécessite `input`).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

La moitié `output` / `error` d’une `RequestDefinition`. Si les deux manquent, `responseType` est aussi refusé : rien n’est décodé, donc il n’y a rien à sélectionner.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

En cas de succès, le troisième emplacement ne porte `body` que si `output` était déclaré. En cas d’échec il vaut `undefined` — le fault détient déjà les métadonnées de réponse qui existaient.

### HttpRequest {#HttpRequest}

Requête sortante normalisée : `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, hooks de progress, `baseEndpoint`, métadonnées de query.

### HttpMeta {#HttpMeta}

```ts
type HttpMeta = {
  readonly headers: Headers
  readonly ok: boolean
  readonly status: number
  readonly statusText: string
  readonly url: string
}
```

Métadonnées de la réponse, disponibles dès qu’une réponse a atteint le client. Elles ne portent **pas** de `body` : un corps n’existe qu’une fois qu’un struct déclaré en a décodé un.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

Une réponse dont le corps a été décodé contre le struct déclaré. Tenir ce type est la preuve que le décodage a eu lieu — c’est pourquoi un échec de décodage ne rapporte que `HttpMeta`.

### HttpResponse {#HttpResponse}

```ts
type HttpResponse<R> = {
  readonly url: string
  readonly status: number
  readonly statusText: string
  readonly headers: Headers
  readonly body: R | null
  readonly ok: boolean
}
```

La forme réseau que produisent les transports et que voient les intercepteurs : `body` est du texte ou du JSON déjà parsé, pas une valeur décodée. Ce qui atteint l’appelant, c’est `DecodedResponse`.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Les callbacks peuvent être async.

Voir [le guide HTTP](../core/http.md) et [Commandes](../core/commands.md). Un callback qui throw, c’est `EXT_OBSERVER_FAILED`.

## RequestCommandBuilder {#RequestCommandBuilder}

Renvoyé par `defineRequest`. Appelle avec l’input, tu obtiens un `HttpCommand`.

## HttpCommand {#HttpCommand}

Command opaque du request builder. Passe-la à `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progression, annulation. `HttpExecuteOptions` ajoute `signal`.

## RequestSuccessData {#RequestSuccessData}

Corps de succès inféré du struct `output` déclaré, ou `undefined` si aucun n’est déclaré.

## RequestErrorData {#RequestErrorData}

Corps d’erreur inféré du struct `error` déclaré, ou `undefined` si aucun n’est déclaré.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Champs pour `makeResponse` : `status`, `statusText`, `url`, `headers`, `body`, `request`.
