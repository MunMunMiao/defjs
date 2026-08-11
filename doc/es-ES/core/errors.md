---
title: Errores
description: Gestiona las tuplas de resultado específicas de cada transporte y distingue los objetos simples de la unión discriminada RequestError.
---

# Errores

Todos los transportes compatibles devuelven una tupla de tres elementos con el error en primer lugar, pero el tercero depende del transporte.

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

- HTTP devuelve los datos decodificados y un wrapper `HttpResponse` de Defjs.
- SSE devuelve un manejador lógico del stream y una instantánea de la apertura inicial.
- WebSocket devuelve una sesión lógica y una instantánea de la conexión inicial.

Cuando hay un error, el segundo elemento es `undefined`. El tercero también puede ser `undefined` si el arranque falló antes de que el transporte produjera la instantánea correspondiente.

## `RequestError`

`RequestError` es un objeto simple con discriminante que se devuelve en la tupla. No extiende la clase nativa `Error`.

```typescript
import type { DefinitionError, HttpStatusError, TransportError } from '@defjs/core'

type RequestErrorShape<TErrorData = unknown> = HttpStatusError<TErrorData, number> | TransportError | DefinitionError
```

La unión exportada se llama `RequestError<TErrorData>`.

Ramifica primero por `kind` y, cuando haga falta, por `code`.

### Errores de estado HTTP

Una respuesta HTTP no 2xx declarada produce:

```typescript
interface HttpStatusError<TErrorData = unknown, TStatus extends number = number> {
  kind: 'http'
  code: 'HTTP_STATUS'
  status: TStatus
  message: string
  data: TErrorData
  response: HttpResponse<unknown>
}
```

Los genéricos se ordenan primero por datos y después por estado. El `RequestError<TErrorData>` exportado sigue siendo útil en los límites de la aplicación, mientras que la ejecución de un endpoint devuelve una unión de ramas `HttpStatusError<Data, Status>` específicas por estado. Por eso, comprobar `error.status` estrecha `error.data` al cuerpo declarado para ese estado:

```typescript
const [error] = await client.execute(getUser())

if (error?.kind === 'http') {
  if (error.status === 404) {
    console.error(error.data.missing)
  } else {
    // En este endpoint, los estados restantes 409 | 422 comparten el cuerpo de conflicto.
    console.error(error.data.conflict)
  }
}
```

`data` solo existe en `HttpStatusError`. Conserva esta unión correlacionada con el estado en el límite del endpoint en vez de ampliarla a una unión de datos sin relación.

### Errores de transporte

Un fallo de red, una cancelación o un timeout produce:

```typescript
interface TransportError {
  kind: 'transport'
  code: 'ABORTED' | 'NETWORK_ERROR' | 'TIMEOUT'
  message: string
  cause?: unknown
}
```

Los errores de transporte no tienen los campos `data` ni `response`.

### Errores de definición

La decodificación de la entrada, la construcción de la petición, la decodificación de la respuesta o un estado HTTP no declarado pueden producir:

```typescript
interface DefinitionError {
  kind: 'definition'
  code: 'REQUEST_VALIDATION_FAILED' | 'RESPONSE_VALIDATION_FAILED' | 'UNDECLARED_STATUS'
  message: string
  cause?: unknown
  response?: HttpResponse<unknown>
}
```

| Código                       | Causa actual                                                                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `REQUEST_VALIDATION_FAILED`  | Ha fallado la decodificación estructural de la entrada, la construcción de la petición o `build` ha producido enlaces no válidos. |
| `RESPONSE_VALIDATION_FAILED` | Una respuesta declarada o la respuesta inicial de SSE no ha superado la validación estructural o de contenido.                    |
| `UNDECLARED_STATUS`          | HTTP ha devuelto un estado sin un Struct de salida correspondiente cuando se había declarado `output`.                            |

`UNDECLARED_STATUS` se aplica tanto a estados 2xx como a estados no 2xx sin correspondencia.

## Distinguir los tipos de error

```typescript
declare const useUser: (user: unknown) => void

const [error, user, response] = await client.execute(getUser())

if (!error) {
  useUser(user)
} else {
  switch (error.kind) {
    case 'http':
      console.error('HTTP request failed', {
        operation: 'get-user',
        status: error.status,
      })
      break

    case 'transport':
      switch (error.code) {
        case 'ABORTED':
          console.info('get-user cancelled')
          break
        case 'TIMEOUT':
          console.warn('get-user timed out')
          break
        case 'NETWORK_ERROR':
          console.error('get-user transport failed')
          break
      }
      break

    case 'definition':
      console.error('get-user contract failed', {
        code: error.code,
        status: error.response?.status,
      })
      break
  }
}
```

No registres `cause`, `data`, las cabeceras o el cuerpo de la respuesta ni URLs sin una política explícita de enmascarado de datos sensibles y conservación.

### Puente a `Error` nativo

Algunas integraciones necesitan que se lance un `Error` nativo. Crea un error de diagnóstico nuevo en ese límite y expón por defecto solo las clasificaciones estables `kind`, `code` y el `status` HTTP disponible:

```typescript
import type { RequestError } from '@defjs/core'

type DiagnosticRequestError = Error & {
  readonly code: RequestError<unknown>['code']
  readonly kind: RequestError<unknown>['kind']
  readonly status: number | undefined
}

export function toDiagnosticError(error: RequestError<unknown>): DiagnosticRequestError {
  const status = error.kind === 'http' ? error.status : error.kind === 'definition' ? error.response?.status : undefined
  const diagnostic = Object.assign(new Error(`Defjs request failed: ${error.kind}/${error.code}`), {
    code: error.code,
    kind: error.kind,
    status,
  })
  diagnostic.name = 'DefjsRequestError'
  return diagnostic
}
```

El error recién creado conserva su propio stack del límite. Nunca adjunta ni copia el `cause` sin procesar, su mensaje o sus frames de stack, `data`, cabeceras o cuerpos de respuesta ni URLs de petición o respuesta. Las propias cadenas de los frames pueden contener URLs y secretos, por lo que copiar frames seleccionados de la causa no es una opción predeterminada segura. El proyecto ejecutable `examples/observability-redacted-logging` comprueba que se conserva el estado 404 y que no se filtran los datos de la respuesta ni un stack de causa creado con un secreto.

## Cuándo está disponible la respuesta

`HttpResponse` es un wrapper de Defjs, no un objeto `Response` nativo. Expone el estado y su texto, cabeceras, URL, cuerpo, `error` y `ok`. `ok` solo indica que el estado está en el rango 2xx. `error` se reserva para fallos de transporte o representación del cuerpo; una respuesta no 2xx ordinaria lo deja vacío.

Un cuerpo no 2xx válido y declarado se decodifica con su Struct y se conserva tipado en `HttpStatusError.data`. Una representación malformada produce `RESPONSE_VALIDATION_FAILED` con la excepción original del codec como `cause`, una respuesta si se recibió y sin `data`.

En HTTP:

- un error de estado HTTP declarado tiene `error.response`;
- los errores de validación de la salida y los estados no declarados pueden tener `error.response`;
- la validación de la petición, una cancelación anterior a la respuesta, una excepción de un interceptor y los fallos de transporte con estado 0 pueden dejar la tupla sin respuesta.

En SSE, un arranque fallido aún puede devolver una instantánea de apertura como tercer elemento si llegó una respuesta antes de fallar la validación del contenido o del estado. En WebSocket, un arranque fallido solo puede devolver una instantánea de conexión si llegó a capturarse una.

## Funciones para crear errores y constantes

La entrada raíz exporta helpers de creación para código de integración:

```typescript
import { ERR_ABORTED, ERR_TIMEOUT, createDefinitionError, createHttpStatusError, createTransportError } from '@defjs/core'
```

- `createTransportError(cause)` normaliza cancelaciones, timeouts y otras causas.
- `createDefinitionError(code, cause, response?)` crea un error de definición.
- `createHttpStatusError(status, message, response, data?)` crea un error de estado HTTP.
- `ERR_ABORTED` y `ERR_TIMEOUT` son valores `Error` compartidos que reconoce el normalizador.

Estos helpers crean objetos `RequestError` planos; no los lanzan.

Las rutas de comandos incluidas convierten sus fallos de arranque previstos en tuplas. Esto no cubre cualquier código de extensión: los interceptores y callbacks de la aplicación pueden lanzar excepciones, y si se pasa un comando incompatible a la implementación general en tiempo de ejecución, la promesa se rechaza.

## Siguiente paso

- [HTTP](/es-ES/core/http) explica la selección por estado y la decodificación de respuestas.
- [SSE](/es-ES/core/sse) distingue entre un fallo de arranque y un error posterior a la apertura.
- [WebSocket](/es-ES/core/web-socket) cubre los errores en tiempo de ejecución y el cierre definitivo.
