---
title: Errores
description: Ramifica por kind y code para 404s, timeouts, estados no declarados y fallos de transporte.
---

# Errores

Gestiona un 404 declarado, un timeout o un estado no declarado leyendo la tupla error-first — no capturando throws. `RequestError` sigue siendo una unión por `kind` / `code`, y cada valor es un `Error` nativo (`instanceof Error` es verdadero). Empieza por `kind`, luego `code`.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const [error, user, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.kind === 'http' && error.status === 404) {
  console.log(error.data.message)
} else if (error?.kind === 'transport' && error.code === 'TIMEOUT') {
  console.log('timed out')
} else if (error?.kind === 'definition' && error.code === 'UNDECLARED_STATUS') {
  console.log('status not in output map', error.response?.status)
} else if (!error) {
  console.log(user.name, response.status)
}
```

```typescript twoslash
import { createTransportError, ERR_ABORTED, type RequestError } from '@defjs/core'

function classify(error: RequestError): string {
  if (error.kind === 'http') return `status:${error.status}`
  if (error.kind === 'transport') return `transport:${error.code}`
  return `definition:${error.code}`
}

const example = createTransportError(ERR_ABORTED)
console.log(classify(example))
```

## Códigos estables

| `kind`       | Códigos                                                                                              | Significado                                                                                                                                    |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `http`       | `HTTP_STATUS`                                                                                        | Un no-2xx llegó al límite HTTP. Conserva `status`, `response` y cualquier `data` tipado por estado.                                            |
| `transport`  | `ABORTED`, `TIMEOUT`, `NETWORK_ERROR`                                                                | Cancel, timeout o fallo de Fetch/transporte bloqueó un resultado normal.                                                                       |
| `definition` | `REQUEST_VALIDATION_FAILED`, `RESPONSE_VALIDATION_FAILED`, `UNDECLARED_STATUS`, `INTERCEPTOR_FAILED` | Fallo de entrada, construcción de solicitud, representación de respuesta, decode Struct, contrato de estado o interceptor que lanzó o rechazó. |

`cause` es opcional en errores de transporte y definición. `response` siempre está en errores de estado HTTP; puede aparecer en errores de definición cuando ya existía una respuesta.

## Formas de tupla por transporte

```typescript twoslash
import type {
  EventStreamHandle,
  EventStreamOpenInfo,
  HttpResponse,
  RequestError,
  WebSocketConnectionInfo,
  WebSocketSession,
} from '@defjs/core'

type HttpResult =
  | [error: null, data: unknown, response: HttpResponse<unknown>]
  | [error: RequestError, data: undefined, response: HttpResponse<unknown> | undefined]
type SseResult =
  | [error: null, stream: EventStreamHandle<unknown>, open: EventStreamOpenInfo]
  | [error: RequestError, stream: undefined, open: EventStreamOpenInfo | undefined]
type SocketResult =
  | [error: null, session: WebSocketSession<unknown>, connection: WebSocketConnectionInfo]
  | [error: RequestError, session: undefined, connection: WebSocketConnectionInfo | undefined]

const results: [HttpResult, SseResult, SocketResult] | undefined = undefined
void results
```

Fallo de arranque → segundo elemento `undefined`. Tercer elemento solo cuando ese transporte produjo antes una respuesta/snapshot. Tras devolver un handle SSE o una sesión WebSocket, los fallos posteriores viven en el ciclo de vida de ese handle — no reescriben la tupla de arranque ya resuelta.

## Estado HTTP y data

Exact-status primero. Con `output`, Defjs elige el Struct coincidente antes de decodificar el cuerpo, así que `error.status` y `error.data` se mantienen correlacionados.

| Situación                                              | Resultado de la tupla                   | Comportamiento del cuerpo                                 |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| 2xx con estado declarado coincidente                   | Éxito                                   | Struct seleccionado → `data`                              |
| No-2xx con estado declarado coincidente                | `HTTP_STATUS`                           | Struct seleccionado → `error.data` tipado                 |
| Cualquier estado sin declaración coincidente           | `UNDECLARED_STATUS`                     | El estado gana **antes** de decodificar el cuerpo         |
| Estado coincidente, falla la representación del cuerpo | `RESPONSE_VALIDATION_FAILED`            | Sin valor tipado parcial                                  |
| `output` omitido                                       | 2xx tiene éxito; no-2xx → `HTTP_STATUS` | Cuerpo no decodificado; `data` es `undefined`             |
| Estado de respuesta `0`                                | Error de transporte                     | `response.error` → `NETWORK_ERROR`, `ABORTED` o `TIMEOUT` |

`HttpResponse.ok` significa solo `200 <= status < 300`. Un no-2xx normal no pone `HttpResponse.error` — esa propiedad es para fallo de transporte en el límite Fetch o fallo de representación del cuerpo.

## Arranque vs post-open

SSE valida estado, `text/event-stream` y cuerpo antes de resolver el handle. Estado fallido → `HTTP_STATUS`. Content type malo o cuerpo ausente → `RESPONSE_VALIDATION_FAILED`. El snapshot de apertura aún puede aterrizar en el tercer slot de la tupla.

El arranque WebSocket cubre handshake + primer open físico. Fallo del constructor, cierre pre-open, timeout o cancel → tupla de arranque. Puede existir un snapshot de conexión aunque el socket nunca llegue a `open`.

| Transporte | Tras el arranque                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| SSE        | El iterador rechaza en error fatal; `stream.closed` se resuelve con `code: 'error'` y un `EventStreamErrorCode`                                                    |
| WebSocket  | `onRuntimeError` para fallos de mensaje/cola/heartbeat/runtime; `receive` falla en errores terminales; `session.closed` → `kind: 'error' \| 'aborted' \| 'closed'` |
| HTTP       | La promesa de execute se asienta una vez. El código de interceptor/callback aún puede lanzar fuera de la normalización de la tupla                                 |

`ABORTED` / `TIMEOUT` describen el resultado de arranque visto por el llamador. Aun así cierras un stream/sesión devuelto y esperas su promesa terminal.

## Registro y cause de Struct

Cada `RequestError` es un `Error` nativo. `String(error)` da la cadena estable `<name>: <message>`; `kind`, `code`, `status`, `response` y `data` siguen siendo enumerables para logs estructurados. `cause` es el enlace nativo no enumerable de la cadena causal: no copies sus helpers al error exterior.

```typescript twoslash
import { StructError, type RequestError } from '@defjs/core'

export function logRequestError(error: RequestError): void {
  console.error(String(error), { code: error.code, kind: error.kind })
  if (error.cause instanceof StructError) {
    console.error(error.cause.format(), error.cause.flatten(), error.cause.prettify())
  }
}
```

Llama a `format()`, `flatten()` y `prettify()` solo después de comprobar `error.cause instanceof StructError`. La tupla unificada no cambia; mejorar el registro no convierte los fallos declarados en throws.

## Reference

| Rama                     | Comprobación de flujo                        | Campos estables útiles                          | Suele ausente / sensible                  |
| ------------------------ | -------------------------------------------- | ----------------------------------------------- | ----------------------------------------- |
| Política de estado HTTP  | `error.kind === 'http'`                      | `error.status`, `error.data` revisado           | Cuerpo, cabeceras, URL, `cause`           |
| Cancelación del llamador | `kind === 'transport' && code === 'ABORTED'` | `kind`, `code`                                  | Motivo de abort y stack                   |
| Timeout                  | `kind === 'transport' && code === 'TIMEOUT'` | `kind`, `code`                                  | URL de la solicitud y cause subyacente    |
| Fallo de contrato        | `error.kind === 'definition'`                | `kind`, `code`, `response?.status` revisado     | Issues Struct, cuerpo, valores de entrada |
| Runtime de stream/sesión | `stream.closed` / `session.closed`           | Código/kind terminal, estado de cierre revisado | Payloads de evento, frames, causes        |

No infieras CORS desde el estado `0` — ramifica por `kind` y `code`.

Trata `cause`, `data`, cabeceras/cuerpos de respuesta, URL, issues Struct, valores de entrada y stacks como sensibles. Un resumen conservador:

```typescript twoslash
import type { RequestError } from '@defjs/core'

export function summarize(error: RequestError): { kind: RequestError['kind']; code: RequestError['code']; status?: number } {
  return {
    kind: error.kind,
    code: error.code,
    status: error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined,
  }
}
```

`createTransportError`, `createDefinitionError` y `createHttpStatusError` construyen y devuelven instancias nativas de `Error`. Los fallos normales de solicitud siguen en la tupla unificada; la identidad nativa de `Error` no los convierte por sí sola en throws. `ERR_ABORTED` y `ERR_TIMEOUT` son causes compartidas que reconoce el normalizador de transporte.

## Recetas relacionadas

- [GET con un 404 declarado](../recipes/get-declared-404.md)
- [Cancelar una llamada HTTP](../recipes/cancel-http.md)
