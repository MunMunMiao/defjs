---
title: Decisiones de diseño
description: Por qué Defjs mantiene explícitos contratos, comandos, resultados de transporte, decodificación y responsabilidad.
---

# Decisiones de diseño

Defjs hace unos cuantos trade-offs deliberados. Las APIs de conveniencia suelen ocultar quién es dueño de una solicitud, un stream o una sesión. Defjs deja ese límite visible para que puedas reutilizar el mismo contrato de endpoint sin adoptar en silencio una caché, un planificador de reintentos o un gestor de recursos.

## Clientes explícitos

`createClient(...)` convierte la config del endpoint en un valor explícito. Entornos o ámbitos de solicitud distintos obtienen endpoints, credenciales, interceptores, serializadores y handles de transporte distintos. `createClient(...)`

El coste: no hay un default a nivel de proceso. Ese coste ayuda en un servidor — crea el cliente dentro del límite de la solicitud cuando las opciones o clausuras capturan auth, cookies, usuarios, tenants o metadatos de la solicitud. Un cliente explícito tampoco aísla el estado capturado por un interceptor. La identidad del cliente no es por sí sola un límite de seguridad.

Un cliente despacha comandos. No es dueño del trabajo activo. Quien arranca una solicitud HTTP, un stream SSE o una sesión WebSocket debe cancelarlo o cerrarlo y esperar la promesa terminal.

## Definiciones, builders y comandos

La definición es el contrato estable: método, path, Struct de entrada, mapeo de salida, límites de transporte. El builder es la vista invocable. Llamarlo crea un comando opaco para una sola ejecución.

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: {
    200: struct.object({ id: struct.number(), name: struct.string() }),
    404: struct.object({ message: struct.string() }),
  },
})

const command = getUser({ path: { id: 7 } })
```

Un trabajo en segundo plano y un dueño de UI pueden ejecutar la misma forma `getUser` con políticas distintas de cancel/retry. Mantener el comando opaco evita que el código de la app dependa de tags o símbolos internos del transporte.

## Resultados específicos del transporte

Los tres transportes usan una tupla error-first. Una sola «respuesta» genérica borraría hechos del ciclo de vida.

- HTTP → `[error, data, response]` — salida decodificada + `HttpResponse`
- SSE → `[error, stream, open]` — un stream lógico + snapshot de respuesta de arranque
- WebSocket → `[error, session, connection]` — sesión lógica + snapshot de conexión de arranque

El tercer valor es un snapshot, no una promesa de que futuros reconnects mantengan la misma conexión física. Un fallo de arranque aún puede incluir una respuesta/snapshot cuando el transporte produjo uno primero. Tras el arranque, el control del ciclo de vida pertenece al handle o sesión devueltos.

## Decodificación en runtime

La inferencia de TypeScript describe lo que esperas; no puede comprobar una respuesta del servidor en runtime. El parseo Struct es la otra mitad del contrato. Defjs valida la entrada del comando antes de construir la solicitud, decodifica la representación seleccionada y luego parsea el Struct correspondiente.

Ese orden mantiene estado y cuerpo como hechos separados. La selección exacta del estado declarado ocurre **antes** de decodificar el cuerpo. No-2xx declarado → `error.data` tipado. Cuerpo declarado malformado → `RESPONSE_VALIDATION_FAILED`. Estado no declarado → `UNDECLARED_STATUS` (no un éxito/fallo sin tipo). Más estricto que «cualquier JSON que llegó», pero puedes tomar una decisión segura.

## Los límites de `build`

El mapeo automático de `struct.request(...)` es el default cuando la entrada ya tiene path/query/headers/body. Un `build(request, input)` personalizado es una proyección acotada cuando la forma del llamador y la del cable difieren:

```typescript twoslash
import { defineRequest, struct } from '@defjs/core'

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
  output: { 202: struct.object({ accepted: struct.number() }) },
})

const command = createBatch({
  accountId: 42,
  users: [{ displayName: 'Ada', email: 'ada@example.com' }],
})
```

`input` es una vista ligada al schema, no el objeto runtime del llamador. La proyección puede seleccionar campos declarados, renombrar destinos y mapear un ítem de array de origen a un ítem de salida. No puede ramificar por valores, inyectar literales ni cambiar la cardinalidad. Normaliza los datos de negocio y haz la validación que dependa de valores antes de crear el comando.

## Observadores y colocación de políticas

Los interceptores son para política a nivel de transporte: auth, tracing, short-circuit, retry revisado. Solo se ejecutan para su transporte y se componen en orden cebolla. Las opciones de ejecución son para el lifetime de ese trabajo: `signal`, `timeout`, heartbeat de WebSocket, reconnect opt-in.

Los observadores informan de lo que ocurrió sin convertirse en un segundo dueño. SSE `onInvalidEvent`, listeners de estado WebSocket y listeners de errores de runtime sirven para diagnósticos y métricas acotados. El stream/sesión devuelto sigue siendo dueño de la iteración, el cierre, el unsubscribe y la espera terminal. Caché, supresión de resultados obsoletos, idempotencia y mapeo de errores de dominio van alrededor de `client.execute(...)`, donde tu app ve su propia política y estado.

## OpenAPI, sourcemaps y telemetría

Defjs no genera ni sincroniza un segundo contrato OpenAPI. Si OpenAPI ya es la autoridad, mantenlo y añade validación en runtime en el límite de la app. Para un servicio nuevo, las definiciones de endpoint y los Structs pueden ser el contrato de cable directo — sin una segunda fuente de verdad.

`withOpenTelemetryServer(...)` añade instrumentación Defjs **saliente** a un cliente. No inicializa un SDK de OpenTelemetry. `tracer` es obligatorio, `meter` es opcional, los tres transportes están habilitados por defecto y la propagación por query de WebSocket está deshabilitada por defecto. Mantén los nombres de operación estáticos y de baja cardinalidad. Revisa propagación, hooks, URL, cabeceras, payloads, causes y retención como potencialmente sensibles.

Los sourcemaps son una decisión de despliegue, no un comportamiento de Defjs. Un mapa público con `sourcesContent` expone el código fuente; un mapa oculto sigue conteniendo fuente y rutas; desactivar mapas elimina la simbolización a nivel de fuente. Trata los mapas privados como artefactos de depuración desplegables con reglas explícitas de acceso y retención.

## Recetas relacionadas

- [GET con un 404 declarado](../recipes/get-declared-404.md)
- [Probar con un handle Fetch local](../recipes/test-with-handle.md)
