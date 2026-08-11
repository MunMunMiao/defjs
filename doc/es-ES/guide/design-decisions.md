---
title: Decisiones de diseño
description: Por qué Defjs utiliza clientes explícitos, tuplas específicas de cada transporte, opciones de ciclo de vida al ejecutar, builds basados en proyecciones y observadores.
---

# Decisiones de diseño

Esta página explica el razonamiento que hay detrás de la API actual. Las páginas de referencia describen los campos y sus valores por defecto.

## Clientes explícitos

Defjs no proporciona un cliente global por defecto para todo el proceso. `createClient(...)` deja clara la responsabilidad en el punto de uso y permite que una aplicación cree clientes distintos para diferentes endpoints, credenciales, pruebas o ámbitos de petición.

Ese aislamiento tiene límites. Los interceptores y callbacks de las opciones pueden capturar estado compartido de la aplicación, así que dos objetos cliente no quedan aislados automáticamente de todo lo que los rodea. Además, `setErrorMap(...)` es global para el proceso. En servidor, crea clientes por petición siempre que las opciones o closures contengan datos de la petición, del usuario, del tenant, cookies o información de autorización.

Un cliente explícito también facilita hablar de quién controla los recursos, pero el cliente no es un gestor de recursos. No registra ni libera peticiones HTTP, manejadores SSE o sesiones WebSocket activas.

## Tuplas específicas de cada transporte

Todos los comandos compatibles devuelven una tupla de tres elementos con el error en primer lugar, pero el tercero conserva el significado de su transporte:

```typescript
const [httpError, data, response] = await client.execute(httpCommand)
const [sseError, stream, startupOpen] = await client.execute(sseCommand)
const [socketError, session, startupConnection] = await client.execute(socketCommand)
```

Así no se confunden bajo una abstracción imprecisa un wrapper de respuesta HTTP, una instantánea de la apertura inicial SSE y una instantánea de la conexión inicial WebSocket. El segundo elemento sigue la misma regla: HTTP devuelve datos decodificados, SSE un manejador lógico del stream y WebSocket una sesión lógica.

La tupla hace explícitos los fallos previsibles durante el arranque sin obligarte a controlar el flujo mediante excepciones. No garantiza que interceptores, callbacks, listeners o valores no admitidos nunca puedan rechazar una promesa o lanzar una excepción.

## Las opciones de ciclo de vida pertenecen a la ejecución

Las definiciones de endpoint describen contratos estables del protocolo y poseen los límites de las colas de transporte. La cancelación, el timeout, el heartbeat y la reconexión pertenecen a la ejecución responsable del trabajo.

HTTP y SSE aceptan opciones de cancelación al ejecutar. WebSocket también permite configurar por ejecución `beforeConnect`, heartbeat, reconexión y protocolos. Las opciones del cliente proporcionan valores por defecto reutilizables cuando el transporte los admite; las capacidades de entrada y salida de WebSocket permanecen en el endpoint.

Esta separación permite reutilizar un comando. Un proceso en segundo plano y una pantalla interactiva pueden ejecutar el mismo comando con ciclos de vida distintos sin redefinir la ruta ni el esquema de mensajes.

## `build` trabaja con proyecciones

Un `build(request, input)` personalizado recibe una vista declarativa de enlaces derivada del Struct de entrada. No puede acceder a los valores que ha pasado quien llama.

La vista registra cómo se proyectan los campos de origen sobre la ruta, la query, las cabeceras y el cuerpo. Este modelo permite seleccionar campos, elegir explícitamente las claves del protocolo y proyectar arrays elemento a elemento. Impide de forma deliberada bifurcar según un valor, aplicar transformaciones arbitrarias o inyectar literales en la proyección.

Esta restricción mantiene la construcción de la petición ligada a los campos declarados en el Struct. Normaliza y valida las reglas de negocio antes de crear el comando. Consulta [Comandos](/es-ES/core/commands) para ver las formas de proyección admitidas.

## Los observadores no controlan el flujo

`onInvalidEvent` en SSE observa eventos descartados. Las excepciones y promesas rechazadas se aíslan del flujo de control del stream, de modo que el procesamiento continúa; aun así, se espera a un observador asíncrono y este puede retrasar mensajes posteriores.

Los listeners de estado y de errores en tiempo de ejecución de WebSocket también son observadores. Las excepciones y promesas rechazadas se aíslan: los fallos de un listener de estado se reenvían a los listeners de errores en tiempo de ejecución, los fallos de estos últimos se envían al `reportError` global si existe, y los demás listeners y el ciclo de vida continúan.

Toma las decisiones de ciclo de vida mediante el manejador o la sesión devueltos. Reserva los observadores para logs acotados, métricas o actualizaciones de estado y elimínalos cuando se libere su propietario.

## Despliegue de sourcemaps

Elige explícitamente la política de sourcemaps de producción:

- **public**: despliega el map con el bundle. Incluye `sourcesContent`, por lo que el source de la aplicación y dependencias queda accesible públicamente incluso con rutas relativas.

- **hidden**: elimina la referencia source-map del bundle, sube el map de forma privada a la plataforma de errores y no lo publiques. El archivo map sigue conteniendo rutas sensibles y `sourcesContent`; “hidden” no lo hace seguro.

- **disabled**: no emite map de producción. Evita su divulgación, pero renuncia a la simbolización a nivel de source de stacks de producción y dificulta el debugging.

Restringe el acceso y la retención de maps privados como cualquier otro artefacto de depuración. Las rutas relativas no son una frontera de confidencialidad.

## Límite de OpenAPI

Elige una única fuente de contrato autoritativa. Una organización con un workflow OpenAPI establecido debe conservarlo y usar un mature generator junto con un runtime validator explícito en el límite de la aplicación; los tipos TypeScript generados no validan responses en runtime. En un servicio greenfield Defjs, define el wire contract directamente con Structs y endpoints de Defjs.

Core no añadirá un OpenAPI generator/exporter ni mantendrá OpenAPI y Defjs como dos fuentes sincronizadas. El dual-source drift es peor que componer herramientas existentes en un límite claro.

## Referencia relacionada

- [Client](/es-ES/core/client) documenta cómo se combinan las opciones y el ámbito del cliente.
- [Errores](/es-ES/core/errors) describe los fallos de las tuplas y cuándo hay una respuesta disponible.
- [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) explican los manejadores lógicos, los intentos físicos y el cierre definitivo.
