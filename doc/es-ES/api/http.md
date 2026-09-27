---
title: HTTP
description: defineRequest, opciones de execute y tipos de solicitud/respuesta HTTP.
---

# HTTP

Declara una solicitud tipada, construye un comando a partir del input, ejecútalo.

## defineRequest() {#defineRequest}

```ts
function defineRequest(definition: RequestDefinition): RequestCommandBuilder
```

- **definition** — `method`, `path`, struct `input` opcional, structs `output` y `error` opcionales, `operation` y `build` opcionales.
- **Devuelve** un builder. Llámalo con el input para obtener un `HttpCommand`.

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

`output` es un struct para el cuerpo 2xx; `error` es un struct para todo cuerpo no-2xx. Ninguno se indexa por estado. Omitir uno significa que ese cuerpo nunca se lee — mira [Declarar es afirmar](/es-ES/guide/design-decisions#declarar-es-afirmar).

## executeHttpCommand() {#executeHttpCommand}

```ts
function executeHttpCommand(clientConfig: ClientConfig, command: HttpCommand, options?: HttpExecuteOptions): Promise<HttpAwaitResult>
```

Entrada de bajo nivel que usa `client.execute`. En la app llama a `client.execute(command, options)`.

- **Devuelve** `[null, data, response]` o `[fault, undefined, undefined]`.

Un estado no-2xx siempre es `HTTP_STATUS`. Su `data` es el cuerpo `error` decodificado cuando se declaró uno, y `undefined` en caso contrario. Al fallar, el tercer hueco de la tupla es `undefined`; los metadatos de la respuesta los lleva el fault.

## fetchHandler() {#fetchHandler}

```ts
function fetchHandler(httpRequest: HttpRequest, fetchImpl?: typeof fetch): Promise<HttpResponse<unknown>>
```

Transporte HTTP por defecto. Se usa salvo que `withHTTPHandle` lo reemplace. Rechaza — en lugar de resolver con una respuesta sintética — cuando ninguna respuesta llegó al cliente.

## makeResponse() {#makeResponse}

```ts
function makeResponse<R>(options?: MakeResponseOptions<R>): HttpResponse<R>
```

Construye un `HttpResponse` sin llamada de red (interceptores, tests). El estado por defecto es `0`. `ok` es true en 2xx. El valor que devuelve pasa por la misma comprobación de media type y el mismo struct declarado que una respuesta del cable; no hay ningún atajo de confianza.

## Options de execute

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

La cancelación es `abort` **o** `timeout`, no ambos. `signal` se combina con cualquiera; **no** es un alias de `abort`. Válido: `{ timeout }`, `{ abort }`, `{ signal, timeout }`, `{ signal, abort }`. Inválido: `{ abort, timeout }`. `timeout` debe ser un entero seguro positivo en `1..2_147_483_647`.

## Tipos

### RequestDefinition {#RequestDefinition}

`method`, `path`, `input` opcional, `output`, `error`, `responseType` (`'json' | 'text' | 'blob' | 'arraybuffer'`), `operation`, `build` opcional (montas la petición tú; requiere `input`).

### ResponseDeclaration {#ResponseDeclaration}

```ts
type ResponseDeclaration<TOutput, TError> = { output?: TOutput; error?: TError }
```

La mitad `output` / `error` de una `RequestDefinition`. Si faltan ambas, `responseType` también se rechaza: no se decodifica nada, así que no hay nada que seleccionar.

### HttpAwaitResult {#HttpAwaitResult}

```ts
type HttpAwaitResult<TData = undefined, TErrorData = undefined> =
  | [error: null, result: TData, response: [TData] extends [undefined] ? HttpMeta : DecodedResponse<TData>]
  | [error: FaultOf<TErrorData>, result: undefined, response: undefined]
```

Al tener éxito, el tercer hueco lleva `body` solo si se declaró `output`. Al fallar es `undefined`: el fault ya guarda los metadatos de respuesta que existieran.

### HttpRequest {#HttpRequest}

Solicitud saliente normalizada: `method`, `endpoint`, `headers`, `body`, `abort`, `operation`, hooks de progreso, `baseEndpoint`, metadatos de query.

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

Metadatos de la respuesta, disponibles siempre que una respuesta llegó al cliente. **No** llevan `body`: un cuerpo solo existe una vez que un struct declarado decodificó uno.

### DecodedResponse {#DecodedResponse}

```ts
type DecodedResponse<TBody> = HttpMeta & { readonly body: TBody }
```

Una respuesta cuyo cuerpo se decodificó contra el struct declarado. Tener este tipo en la mano es la prueba de que la decodificación ocurrió, y por eso un fallo de decodificación reporta solo `HttpMeta`.

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

La forma de cable que producen los transportes y ven los interceptores: `body` es texto o JSON ya parseado, no un valor decodificado. Lo que llega a quien llama es `DecodedResponse`.

### HttpProgressEvent {#HttpProgressEvent}

### HttpProgressFn {#HttpProgressFn}

`loaded`, `total`, `lengthComputable`. Los callbacks pueden ser async.

Ver [guía de HTTP](../core/http.md) y [Comandos](../core/commands.md). Un callback que lanza es `EXT_OBSERVER_FAILED`.

## RequestCommandBuilder {#RequestCommandBuilder}

Lo devuelve `defineRequest`. Llámalo con input y sale un `HttpCommand`.

## HttpCommand {#HttpCommand}

Command opaco del request builder. Pásaselo a `client.execute`.

## UseRequestConfig {#UseRequestConfig}

Progreso y cancelación. `HttpExecuteOptions` añade `signal`.

## RequestSuccessData {#RequestSuccessData}

Cuerpo de éxito inferido del struct `output` declarado, o `undefined` si no hay ninguno.

## RequestErrorData {#RequestErrorData}

Cuerpo de error inferido del struct `error` declarado, o `undefined` si no hay ninguno.

## HttpResponseType {#HttpResponseType}

`'arraybuffer' | 'blob' | 'json' | 'text'`

## MakeResponseOptions {#MakeResponseOptions}

Campos para `makeResponse`: `status`, `statusText`, `url`, `headers`, `body`, `request`.
