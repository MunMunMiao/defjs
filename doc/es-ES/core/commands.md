---
title: Comandos
description: Define endpoints, crea constructores de comandos y comandos, proyecta la entrada Struct sobre el protocolo e infiere tipos de salida HTTP.
---

# Comandos

Defjs distingue tres etapas relacionadas:

1. Una **definición de endpoint** describe un contrato estable HTTP, SSE o WebSocket.
2. Un **constructor de comandos** es la función que devuelve `defineRequest`, `defineEventStream` o `defineWebSocket`.
3. Un **comando** es el valor que obtienes al llamar a ese constructor con una entrada. Pasa el comando a `client.execute(...)`.

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
})

const command = getUser({ path: { id: 42 } })
const result = await client.execute(command)
```

En este caso, el objeto pasado a `defineRequest` es la definición del endpoint, `getUser` es el constructor de comandos y `command` es el comando.

## Definiciones de endpoint HTTP

`defineRequest(...)` acepta estos campos:

| Campo          | Significado                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `method`       | Cadena con el método HTTP.                                                                                      |
| `operation`    | Identidad estática explícita opcional de baja cardinalidad para telemetría y diagnóstico.                       |
| `path`         | Ruta relativa del endpoint, con placeholders `:name` opcionales.                                                |
| `input`        | Struct que decodifica estructuralmente la entrada del comando.                                                  |
| `build`        | Proyección vinculada al esquema que lleva campos de entrada a partes de la petición. Requiere `input`.          |
| `output`       | Relación entre estados y Structs para decodificar la respuesta e inferir el resultado.                          |
| `responseType` | Modo opcional `json`, `text`, `blob` o `arraybuffer`, solo si declaras `output`; de lo contrario no se permite. |

`operation?: string` también está disponible en definiciones SSE y WebSocket. Defínelo de forma explícita desde el contrato del endpoint, por ejemplo `users.lookup`; no lo derives de una ruta renderizada, URL, datos de usuario o tenant, IDs de petición ni otros valores de alta cardinalidad.

Usa `struct.request(...)` cuando los campos del comando correspondan directamente a secciones del protocolo:

```typescript
import { defineRequest, struct } from '@defjs/core'

const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({
      organizationId: struct.string().alias('organization_id'),
    }),
    query: struct.object({
      notify: struct.boolean().optional(),
    }),
    headers: struct.object({
      requestId: struct.string().alias('x-request-id'),
    }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ id: struct.number() }) },
    { status: 409, body: struct.object({ message: struct.string() }) },
  ],
})

const command = createUser({
  path: { organizationId: 'acme' },
  query: { notify: true },
  headers: { requestId: 'request-42' },
  body: { displayName: 'Ada' },
})
```

Quien llama utiliza los nombres lógicos de los campos. Los alias eligen las claves enviadas por el protocolo.

## Cuándo exige argumento el constructor

Un constructor sin `input` no acepta argumentos:

```typescript
const health = defineRequest({ method: 'GET', path: '/health' })
health()
```

Cuando declaras `input`, el argumento raíz del comando sigue siendo obligatorio. Dentro de `struct.request(...)`, una sección `path`, `query` o `headers` cuyos campos sean todos optional o nullish puede omitirse por completo; el parsing normaliza cada sección omitida a `{}`. Una sección con cualquier campo obligatorio sigue siendo obligatoria. Las secciones body también siguen siendo obligatorias aunque los campos de su objeto interno sean optional.

```typescript
const search = defineRequest({
  method: 'GET',
  path: '/search',
  input: struct.request({
    query: struct.object({ q: struct.string() }),
  }),
})

search({ query: { q: 'docs' } })
// search() // TypeScript error: an argument is required.
// search({ query: {} }) // TypeScript and runtime error: q is required.
```

Las secciones de petición cuyos campos sean todos optional pueden omitirse, pero el argumento del comando sigue presente:

```typescript
const OptionalSections = struct.request({
  path: struct.object({ locale: struct.string().optional() }),
  query: struct.object({ page: struct.number().optional() }),
  headers: struct.object({ traceId: struct.string().optional() }),
})
const list = defineRequest({ method: 'GET', path: '/items', input: OptionalSections })

list({})
list({ query: { page: 2 } })

const [optionalError, normalized] = struct.parse(OptionalSections, {})
if (optionalError) throw optionalError
// normalized es { path: {}, query: {}, headers: {} }.

const filtered = defineRequest({
  method: 'GET',
  path: '/items',
  input: struct.request({
    query: struct.object({ q: struct.string(), page: struct.number().optional() }),
  }),
})

filtered({ query: { q: 'docs' } })
// filtered({}) // Error de TypeScript: query contiene el campo obligatorio q.
```

Esto valida la presencia y el tipo estructural, no reglas de aplicación sobre autorización, rangos, importes, formatos o transiciones de estado.

## Construcción automática de la petición

Cuando `input` es un `struct.request(...)` y no declaras `build`, Defjs proyecta automáticamente las secciones definidas:

- `path` sustituye los placeholders de la ruta.
- `query` se convierte en parámetros de query.
- `headers` se convierte en cabeceras de la petición.
- `body` utiliza su wrapper de cuerpo.

Los cuerpos de petición deben declarar uno de los límites admitidos:

```typescript
struct.json(struct.object({ name: struct.string() }))
struct.text()
struct.urlencoded({ name: struct.string() })
struct.formData({ file: struct.file() })
struct.blob()
struct.arrayBuffer()
```

No coloques directamente un `struct.object(...)` en `request.body`; `struct.request(...)` lo rechaza. HTTP admite todas las formas de cuerpo. SSE no admite la sección de cuerpo y WebSocket no admite ni cabeceras ni cuerpo.

## `build` personalizado

Usa `build(request, input)` cuando los campos lógicos deban ir a otras ubicaciones o claves del protocolo. El parámetro `input` es una **proyección vinculada al esquema**, no el valor que ha pasado quien llama una vez decodificado.

```typescript
const createBatch = defineRequest({
  method: 'POST',
  path: '/accounts/:account_id/users',
  input: struct.object({
    accountId: struct.number(),
    users: struct.array(
      struct.object({
        displayName: struct.string(),
        email: struct.string(),
      }),
    ),
  }),
  build(request, input) {
    request.setPathParams({ account_id: input.accountId })
    request.setJson({
      users: input.users.map((user) => ({
        display_name: user.displayName,
        email: user.email,
      })),
    })
  },
  output: [{ status: 202, body: struct.object({ accepted: struct.number() }) }],
})
```

Una proyección puede:

- seleccionar campos declarados;
- elegir las claves de destino del protocolo;
- proyectar cada elemento de un array en un único elemento mediante `.map(...)`;
- codificar un objeto seleccionado con los alias de sus campos al vincularlo a JSON.

Una proyección no puede inspeccionar los valores de quien llama, bifurcar según ellos, calcular transformaciones arbitrarias, cambiar la cantidad de elementos de un array ni inyectar literales. Por ejemplo, `request.setJson({ version: 'v1' })` no es una proyección válida porque `'v1'` no procede de la vista de enlaces de entrada.

Normaliza y valida los datos de la aplicación antes de crear el comando. Reserva `build` para el mapeo declarativo sobre el protocolo.

### Capacidades de `build`

| Destino                                                             | HTTP | SSE | WebSocket |
| ------------------------------------------------------------------- | ---- | --- | --------- |
| `setPathParams`, `setQueryParams`                                   | Sí   | Sí  | Sí        |
| `setHeaders`, `addHeaders`                                          | Sí   | Sí  | No        |
| Métodos de cuerpo JSON, texto, HTML, formulario, Blob y ArrayBuffer | Sí   | No  | No        |

El contexto de build de TypeScript depende del transporte. Las comprobaciones en tiempo de ejecución también rechazan una salida incompatible si se han eludido los tipos.

## Inferencia de la salida HTTP

`output` acepta un objeto o un array de pares estado/cuerpo:

```typescript
const User = struct.object({ id: struct.number() })
const NotFound = struct.object({ message: struct.string() })
const Conflict = struct.object({ conflict: struct.string() })

const objectOutput = {
  '200': User,
  '404': NotFound,
}

const getUsers = defineRequest({
  method: 'GET',
  path: '/users',
  output: [
    { status: 200, body: User },
    { status: 404, body: NotFound },
    { status: [409, 422], body: Conflict },
  ],
})
```

El tipo de éxito HTTP es la unión de los cuerpos 2xx declarados. `error.data` se mantiene correlacionado con el estado no 2xx declarado. `defineRequest(...)` usa un const generic, por lo que las entradas inline y los arrays agrupados de estados conservan sus literales sin `as const`. Después de `client.execute(getUsers())`, comprobar `error.status === 404` estrecha los datos a `NotFound`; la rama restante `409 | 422` los estrecha a `Conflict`.

Cuando declaras `output`, cada estado devuelto debe tener un Struct correspondiente. Un estado 2xx o no 2xx sin declarar produce `UNDECLARED_STATUS`. Si omites `output`, el cuerpo no se lee ni se decodifica y se cancela con el mejor esfuerzo; el resultado es `undefined`.

## Definiciones SSE y WebSocket

`defineEventStream(...)` sustituye el `output` de HTTP por un mapa `events`. Los nombres de evento seleccionan los Structs; una entrada `default` opcional procesa en tiempo de ejecución los nombres no declarados.

```typescript
const notifications = defineEventStream({
  maxBufferSize: 64 * 1024,
  maxQueueSize: 100,
  path: '/notifications',
  events: {
    message: struct.json(struct.object({ text: struct.string() })),
    default: struct.string(),
  },
})
```

`defineWebSocket(...)` declara mapas de mensajes `incoming` y, opcionalmente, `outgoing`. Los sobres de mensaje utilizan un discriminante `type`.

```typescript
const chat = defineWebSocket({
  maxIncomingQueueSize: 100,
  path: '/chat',
  incoming: {
    message: struct.object({ text: struct.string() }),
  },
  outgoing: {
    send: struct.object({ text: struct.string() }),
  },
})
```

Consulta [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) para conocer la decodificación, las colas, la reconexión y quién debe cerrar los recursos.

## Trata los comandos como valores opacos

El código de aplicación debería crear comandos y pasarlos a `Client.execute(...)`. No dependas de las etiquetas de transporte ni de reflexión sobre su estructura.

La entrada raíz exporta actualmente interfaces de comandos de transporte y funciones de ejecución de bajo nivel. No hacen falta en el flujo recomendado y esta documentación no establece su compromiso de estabilidad a largo plazo. Los símbolos de etiqueta de los comandos y las funciones guard que usa el dispatch en tiempo de ejecución no se exportan desde la raíz.

## Siguiente paso

- [Client](/es-ES/core/client) cubre las sobrecargas de ejecución y la composición de opciones.
- [HTTP](/es-ES/core/http) es la referencia sobre URLs, codificación, respuestas y cancelación.
- [Struct](/es-ES/core/struct) explica la decodificación estructural estricta.
