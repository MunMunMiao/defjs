---
title: HTTP
description: Use defineRequest to define HTTP endpoints, master status-code-to-schema mapping, cancellation and timeout, progress tracking, and response type control.
---

# HTTP

Usa `defineRequest` para definir un endpoint HTTP, luego ejecútalo con `Client.execute()`. El paquete core maneja validación de esquema, despacho por código de estado, fusión de señales y parseo del cuerpo de respuesta automáticamente.

## Definir un endpoint

`defineRequest` acepta un objeto de definición con `method`, `path`, `input` (opcional), `output` (opcional) y `build` (opcional).

Cuando se proporciona `input`, `build` también debe proporcionarse para describir cómo los campos de entrada se mapean a partes de la petición (parámetros de ruta, parámetros de consulta, cabeceras, cuerpo).

```typescript
import { defineRequest, string, number, object } from '@defjs/core'

const User = object({
  id: number(),
  name: string(),
})

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: object({
    path: object({ id: number() }),
  }),
  build(request, input) {
    request.setPathParams({
      id: input.path.id,
    })
  },
  output: {
    200: User,
  },
})
```

Si no se necesita entrada, omite tanto `input` como `build`:

```typescript
const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: {
    200: object({
      items: array(User),
    }),
  },
})
```

## Mapeo de output por código de estado a esquema

`output` mapea códigos de estado HTTP a esquemas. El runtime selecciona el esquema coincidente por código de estado de respuesta.

Se soportan tanto formas de objeto como de matriz:

```typescript
import { defineRequest, object, string } from '@defjs/core'

// Forma de objeto: claves son códigos de estado, valores son esquemas
const createUser = defineRequest({
  method: 'POST',
  path: '/users',
  input: object({
    body: object({ name: string() }),
  }),
  build(request, input) {
    request.setJson({ name: input.body.name })
  },
  output: {
    201: object({ id: number(), name: string() }),
    400: object({ message: string() }),
    409: object({ message: string() }),
  },
})

// Forma de matriz: admite mapear múltiples códigos de estado al mismo esquema
const updateUser = defineRequest({
  method: 'PUT',
  path: '/users/:id',
  // ...
  output: [
    { status: 200, body: object({ id: number(), name: string() }) },
    { status: [400, 422], body: object({ message: string() }) },
  ],
})
```

Si el servidor devuelve un código de estado no declarado en `output`, la petición falla con un `DefinitionError` cuyo `code` es `UNDECLARED_STATUS`.

## Inferencia de tipos de datos de éxito / error

`output` impulsa la inferencia de tipos TypeScript. `Client.execute()` devuelve `HttpAwaitResult` que distingue automáticamente datos de éxito 2xx de datos de error no-2xx.

```typescript
import { createClient, defineRequest, object, string, number } from '@defjs/core'

const client = createClient(/* ... */)

const endpoint = defineRequest({
  method: 'POST',
  path: '/items',
  output: {
    200: object({ id: number(), name: string() }),
    400: object({ field: string(), reason: string() }),
    500: object({ traceId: string() }),
  },
})

const [error, result, response] = await client.execute(endpoint)

if (error === null) {
  // result está tipado como { id: number; name: string }
  console.log(result.id)
} else if (error.kind === 'http') {
  // error.data está tipado como { field: string; reason: string } | { traceId: string }
  console.error(error.status, error.data)
} else if (error.kind === 'transport') {
  console.error('Network or cancellation error:', error.message)
} else if (error.kind === 'definition') {
  console.error('Request/response validation failed:', error.code)
}
```

### Helpers de tipo

- `RequestSuccessData<TOutput>`: Extrae todos los tipos de output de esquemas 2xx de `output`. Si no existe mapeo 2xx, infiere como `unknown`.
- `RequestErrorData<TOutput>`: Extrae todos los tipos de output de esquemas no-2xx de `output`. Si no existe mapeo no-2xx, infiere como `unknown`.

## Ejecutar una petición

Llama a `Client.execute()` con un comando. El segundo argumento es `HttpExecuteOptions` opcional:

```typescript
const [error, result, response] = await client.execute(command, {
  context: {
    /* contexto personalizado legible por interceptores */
  },
  onDownloadProgress: (event) => {
    /* ... */
  },
  onUploadProgress: (event) => {
    /* ... */
  },
  abort: abortSignal,
  timeout: 5000,
  signal: abortSignal, // alias, equivalente a abort
})
```

El `HttpAwaitResult` devuelto es una trípla:

| Posición | Tipo                                     | Significado                                                         |
| -------- | ---------------------------------------- | ------------------------------------------------------------------- |
| 0        | `RequestError<TErrorData> \| null`       | Objeto de error; `null` en éxito                                    |
| 1        | `TSuccess \| undefined`                  | Datos de éxito; `undefined` en fallo                                |
| 2        | `SettledResponse<TSuccess> \| undefined` | Envoltorio de respuesta crudo con `status`, `headers`, `body`, etc. |

## Cancelación y tiempo de espera

`abort`, `timeout` y `signal` controlan el ciclo de vida de la petición. **`abort` y `timeout` no pueden usarse juntos** — hacerlo produce un error de validación antes de que se envíe la petición.

### Usar AbortSignal

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
})

// Cancelar después
controller.abort()

// Tras cancelación, error.kind es 'transport', code es 'ABORTED'
```

### Usar tiempo de espera

```typescript
const [error] = await client.execute(command, {
  timeout: 5000, // tiempo de espera de 5 segundos
})

// Tras tiempo de espera, error.kind es 'transport', code es 'TIMEOUT'
```

### Fusionar señales externas

Si se pasan tanto `abort` como `signal`, el framework las fusiona en un solo `AbortSignal`. `timeout` también participa como `AbortSignal.timeout()`. Cualquier señal que se active aborta la petición.

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  abort: controller.signal,
  signal: someOtherSignal, // fusionado con abort
})
```

### Distinguir errores

La cancelación y el tiempo de espera son ambos `TransportError`, distinguibles por `error.code`:

| Escenario          | `error.code`    | Descripción                                            |
| ------------------ | --------------- | ------------------------------------------------------ |
| Cancelación manual | `ABORTED`       | `controller.abort()` o señal externa activada          |
| Tiempo de espera   | `TIMEOUT`       | `timeout` expirado, o `AbortSignal.timeout()` activado |
| Fallo de red       | `NETWORK_ERROR` | Otras excepciones de fetch                             |

## Progreso de descarga / subida

Rastrea el progreso mediante `onDownloadProgress` y `onUploadProgress`.

### Progreso de descarga

```typescript
const [error, result] = await client.execute(command, {
  onDownloadProgress: (event) => {
    const percent = event.lengthComputable ? Math.round((event.loaded / event.total) * 100) : null
    console.log(`Download: ${event.loaded} / ${event.total} (${percent ?? 'unknown'}%)`)
  },
})
```

`HttpProgressEvent` contiene tres campos:

- `lengthComputable`: Si el servidor devolvió `Content-Length`
- `loaded`: Bytes recibidos hasta ahora
- `total`: Bytes totales (solo válido cuando `lengthComputable` es `true`)

### Progreso de subida

El progreso de subida solo funciona cuando el cuerpo de la petición es `ReadableStream<Uint8Array>`. El framework envuelve el flujo y hace callbacks después de cada chunk.

```typescript
const stream = new ReadableStream<Uint8Array>({
  start(controller) {
    controller.enqueue(new TextEncoder().encode('chunk 1'))
    controller.enqueue(new TextEncoder().encode('chunk 2'))
    controller.close()
  },
})

const [error, result] = await client.execute(command, {
  onUploadProgress: (event) => {
    console.log(`Upload: ${event.loaded} / ${event.total}`)
  },
})
```

## Tipos de respuesta

Por defecto, si se declara `output`, el framework parsea la respuesta automáticamente como `json`. Puedes anular esto con `responseType`, o especificarlo cuando `output` es `undefined`.

```typescript
import { defineRequest } from '@defjs/core'

// Tipo de respuesta explícito
const getImage = defineRequest({
  method: 'GET',
  path: '/images/:id',
  responseType: 'blob',
})

// Sin output, solo importa la respuesta cruda
const healthCheck = defineRequest({
  method: 'GET',
  path: '/health',
  responseType: 'text',
})
```

Valores de `responseType` soportados:

| Valor         | Descripción                                                   |
| ------------- | ------------------------------------------------------------- |
| `json`        | Leer texto luego `JSON.parse()`; cuerpo vacío devuelve `null` |
| `text`        | Devolver string de texto directamente                         |
| `blob`        | Devolver `Blob`                                               |
| `arraybuffer` | Devolver `ArrayBuffer`                                        |

Cuando `responseType` es `json` y `output` define un esquema para el código de estado devuelto, el framework valida el JSON parseado contra el esquema. Si la validación falla, se devuelve un `DefinitionError` con `code: 'RESPONSE_VALIDATION_FAILED'`.

## Qué sigue

- [Cliente →](/core/client) — Crear `Client`, interceptores, XSRF, opciones globales
- [SSE →](/core/sse) — Eventos enviados por el servidor y respuestas de streaming
- [WebSocket →](/core/web-socket) — Comunicación bidireccional en tiempo real
