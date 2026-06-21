---
title: Commands
description: Master defineRequest, defineEventStream, and defineWebSocket, including command object structure and input optional rules.
---

# Comandos

Defjs se construye alrededor de "comandos": objetos ejecutables tipados creados por `defineRequest`, `defineEventStream` y `defineWebSocket`. Cada comando lleva un `kind` (tipo de transporte), una `definition` (esquema de endpoint) y `input` (datos de llamada). El Cliente despacha a la lógica de transporte correcta según `kind`.

## defineRequest: Definición de endpoint HTTP

`defineRequest` define un endpoint HTTP RESTful. Acepta un objeto de definición y devuelve un constructor de comandos.

```typescript
import { defineRequest } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const GetUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  output: [
    { status: 200, body: object({ name: string(), age: number() }) },
    { status: 404, body: object({ message: string() }) },
  ],
})

const command = GetUser({ path: { id: '42' } })
```

### Campos del objeto de definición

| Campo          | Tipo                              | Descripción                                                           |
| -------------- | --------------------------------- | --------------------------------------------------------------------- |
| `method`       | `string`                          | Método HTTP, p. ej., `GET`, `POST`                                    |
| `path`         | `string`                          | Ruta URL, admite marcadores `:param`                                  |
| `input`        | `AnyStruct \| undefined`          | Validador Struct de datos de entrada                                  |
| `build`        | `RequestBuildHandler`             | Mapea entrada parseada a partes de la petición HTTP                   |
| `output`       | `RequestOutputShape \| undefined` | Mapea códigos de estado a Structs de respuesta                        |
| `responseType` | `HttpResponseType`                | Opcional, fuerza modo de parseo de respuesta (`json`, `text`, `blob`) |

### Relación input / output / build

1. **input**: Describe los datos que el llamador debe proporcionar. En tiempo de ejecución, el Cliente valida y parsea los datos crudos usando el `input` Struct.
2. **build**: Recibe un `RequestBuilder` y la entrada parseada (`RequestBuildInput`), mapeando datos a parámetros de ruta, parámetros de consulta, cabeceras y cuerpo.
3. **output**: Describe las posibles respuestas del servidor. El Cliente selecciona el Struct coincidente por código de estado HTTP y deriva los tipos de éxito (2xx) y error (no-2xx).

Si se omite `build`, `input` también debe omitirse. El comando entonces no acepta entrada y envía directamente a `path`.

Si se proporciona `build`, `input` también debe proporcionarse. Esta es una regla estricta de diseño.

### Atajo para sin entrada

```typescript
const ListUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

const command = ListUsers() // No se necesitan argumentos
```

### Inferencia de tipos de output

`output` admite tanto formas de matriz como de objeto, con comportamiento equivalente:

```typescript
// Forma de matriz (recomendada)
output: [
  { status: 200, body: UserStruct },
  { status: [401, 403], body: AuthErrorStruct },
]

// Forma de objeto
output: {
  200: UserStruct,
  '401': AuthErrorStruct,
  '403': AuthErrorStruct,
}
```

Los resultados de ejecución se tipan automáticamente: los datos 2xx entran en la rama de éxito, todo lo demás en la rama de error.

---

## defineEventStream: Definición de flujo SSE

`defineEventStream` define un endpoint SSE (Server-Sent Events). Mapea nombres de eventos a Structs para seguridad de tipos a nivel de evento.

```typescript
import { defineEventStream } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const Notifications = defineEventStream({
  path: '/notifications',
  events: {
    message: object({ text: string() }),
    userJoined: object({ userId: number(), name: string() }),
  },
})

const command = Notifications()
```

### Mapeo de events

Cada clave en `events` corresponde al campo `event` de SSE. El Cliente busca el Struct coincidente por nombre de `event` cuando llega un mensaje.

### Fallback default

Si el servidor envía un nombre de evento no declarado, puedes proporcionar un esquema `default` como respaldo:

```typescript
const Stream = defineEventStream({
  path: '/events',
  events: {
    update: object({ version: number() }),
    default: string(), // Eventos no coincidentes parseados como string
  },
})
```

Sin `default`, los eventos no coincidentes se descartan. Si un interceptor `onInvalidEvent` está configurado, recibe una notificación.

### SSE con entrada

SSE usa `GET` por defecto. Si necesitas parámetros de consulta, proporciona `input` y `build` como `defineRequest`:

```typescript
const FilteredStream = defineEventStream({
  path: '/events',
  input: object({
    query: object({ category: string() }),
  }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
  events: {
    item: object({ id: number(), title: string() }),
  },
})

const command = FilteredStream({ query: { category: 'news' } })
```

El `build` de SSE no admite cuerpo de petición ni `withCredentials`.

---

## defineWebSocket: Definición de WebSocket

`defineWebSocket` define un endpoint WebSocket, distinguiendo esquemas de mensajes **incoming** (servidor → cliente) y **outgoing** (cliente → servidor).

```typescript
import { defineWebSocket } from '@defjs/core'
import { number, object, string } from '@mobily/ts-belt'

const ChatSocket = defineWebSocket({
  path: '/chat/:roomId',
  input: object({
    path: object({ roomId: string() }),
  }),
  build(request, input) {
    request.setPathParams(input.path)
  },
  incoming: {
    message: object({ user: string(), text: string() }),
    system: object({ event: string() }),
  },
  outgoing: {
    sendMessage: object({ text: string() }),
    joinRoom: object({ roomId: string() }),
  },
})

const command = ChatSocket({ path: { roomId: 'lobby' } })
```

### Esquema de mensajes incoming

`incoming` define tipos de mensajes enviados por el servidor. Cada mensaje debe contener un campo `type` que coincida con una clave de `incoming`. Si el payload es un objeto, sus campos se fusionan con `type`:

```typescript
// Servidor envía: { type: 'message', user: 'Alice', text: 'Hi' }
// Parseado como:    { type: 'message', user: 'Alice', text: 'Hi' }
```

Si el payload es escalar (string, number, etc.), se envuelve como `{ type: 'xxx', data: <value> }`.

### Esquema de mensajes outgoing

`outgoing` define tipos de mensajes enviados por el cliente. El `type` se auto-completa desde el nombre de la clave. Tú solo proporcionas el payload:

```typescript
// Enviar: { type: 'sendMessage', text: 'Hello' }
// O:   { type: 'sendMessage', data: { text: 'Hello' } }
```

Si el payload de un mensaje outgoing es un objeto, ambas formas son soportadas. Si es escalar, debes usar `{ type: 'xxx', data: <value> }`.

### WebSocket solo incoming

Si no necesitas enviar mensajes al servidor, omite `outgoing`:

```typescript
const ReadOnlySocket = defineWebSocket({
  path: '/feed',
  incoming: {
    tick: object({ price: number() }),
  },
})
```

### Restricciones de build en WebSocket

El `build` de WebSocket solo admite `setPathParams` y `setQueryParams`. Las operaciones específicas de HTTP (cabeceras, cuerpo) no son soportadas.

---

## Estructura del objeto Command

Independientemente del tipo de definición, el comando construido sigue una estructura unificada:

```typescript
interface BaseCommand<TKind extends string> {
  readonly kind: TKind
}

// HTTP command
interface HttpCommand<TInput, TOutput> extends BaseCommand<'http'> {
  readonly definition: RequestDefinition<TInput, TOutput>
  readonly input: EndpointInput<TInput> | undefined
}

// SSE command
interface EventStreamCommand<TInput, TEvents> extends BaseCommand<'event-stream'> {
  readonly endpoint: EventStreamEndpoint<TInput, TEvents>
  readonly input: EndpointInput<TInput> | undefined
}

// WebSocket command
interface WebSocketCommand<TInput, TIncoming, TOutgoing> extends BaseCommand<'web-socket'> {
  readonly endpoint: WebSocketEndpoint<TInput, TIncoming, TOutgoing>
  readonly input: EndpointInput<TInput> | undefined
}
```

`kind` es la etiqueta de tipo de transporte. `Client.execute` despacha al ejecutor apropiado (HTTP fetch, flujo SSE, conexión WebSocket) según su valor.

---

## Reglas de entrada opcional (IsInputOptional)

Si el argumento del constructor de comandos es opcional se infiere automáticamente mediante `IsInputOptional`:

```typescript
type IsInputOptional<TInput> = [TInput] extends [undefined] ? true : {} extends EndpointInput<NonNullable<TInput>> ? true : false
```

Reglas:

1. **Sin `input` definido**: `TInput` es `undefined`, el parámetro es completamente opcional.
2. **Tiene `input` pero todos los campos son opcionales**: `{} extends EndpointInput<...>` es true, el parámetro sigue siendo opcional.
3. **Tiene `input` con campos requeridos**: El parámetro es requerido.

```typescript
// Sin input — opcional
const A = defineRequest({ method: 'GET', path: '/a' })
A() // OK

// Input con todos los campos opcionales — opcional
const B = defineRequest({
  method: 'GET',
  path: '/b',
  input: object({ query: object({ q: optional(string()) }) }),
  build(request, input) {
    request.setQueryParams(input.query)
  },
})
B() // OK
B({ query: {} }) // OK

// Campos requeridos — requerido
const C = defineRequest({
  method: 'POST',
  path: '/c',
  input: object({ body: object({ name: string() }) }),
  build(request, input) {
    request.setJson(input.body)
  },
})
C() // TypeScript error: falta argumento
C({ body: { name: 'defjs' } }) // OK
```

## Qué sigue

- [SSE →](/core/sse) — Ejecución SSE, reconexión y manejo de eventos
- [WebSocket →](/core/web-socket) — Conexión WebSocket, latido y gestión de estado
- [Cliente →](/core/client) — Creación de cliente y uso de `execute`
