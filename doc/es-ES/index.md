---
layout: home

hero:
  name: Defjs
  text: Comandos tipados para HTTP, SSE y WebSocket
  tagline: Define los datos que viajan por la red con Structs, crea clientes explícitos y mantén visibles los resultados y el ciclo de vida propios de cada transporte.
  actions:
    - theme: brand
      text: Empezar
      link: /es-ES/guide/getting-started
    - theme: alt
      text: Ver en GitHub
      link: https://github.com/defjs/defjs

features:
  - title: Contratos de endpoint
    details: Separa las definiciones de endpoint, los constructores de comandos y los comandos. Los Structs decodifican en tiempo de ejecución tanto la entrada de quien llama como los datos del transporte.
  - title: Resultados propios de cada transporte
    details: HTTP, SSE y WebSocket devuelven tuplas de tres elementos con el error en primer lugar. El tercer elemento es, según el transporte, un wrapper de respuesta, una instantánea de la apertura inicial o una instantánea de la conexión inicial.
  - title: Cadenas de interceptores
    details: Registra interceptores HTTP, SSE y WebSocket en un cliente. Cada transporte selecciona los suyos y los ejecuta en orden de cebolla.
  - title: Ciclo de vida explícito
    details: SSE puede reintentar tras fallos de red o de lectura. La reconexión WebSocket es opcional. La aplicación sigue siendo responsable de la iteración, la cancelación y el cierre definitivo.
  - title: Decodificación en ejecución
    details: Decodifica entradas, respuestas, eventos de stream y mensajes WebSocket con los mismos contratos Struct que controlan la inferencia de TypeScript.
  - title: Integraciones de aplicación
    details: Comparte clientes mediante Vue o React y añade instrumentación OpenTelemetry saliente en servicios de servidor.
---

## Crea un cliente de API tipado

Empieza describiendo el contrato HTTP, SSE o WebSocket que consume tu aplicación. Defjs convierte esa definición en un constructor de comandos, valida los datos en ejecución y mantiene explícito el resultado del transporte.

El flujo HTTP principal es breve: crea un cliente para tu API, define un endpoint, llama a su constructor de comandos y ejecuta el comando.

```typescript
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))

const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ],
})

const [error, user, response] = await client.execute(getUser({ path: { id: 1 } }))

if (error) {
  console.error(error.kind, error.code)
} else {
  console.log(user.name, response.status)
}
```

Apunta el cliente al servicio que usa tu aplicación y haz que los Structs coincidan con su contrato real de respuesta. Tu aplicación sigue controlando credenciales, estado de interfaz, reintentos, cancelación y liberación de recursos.

## Sigue leyendo

- [Primeros pasos](/es-ES/guide/getting-started) instala el paquete y lleva tu aplicación hasta la primera petición tipada.
- [Cliente](/es-ES/core/client) describe la composición de opciones y las tres sobrecargas de `execute`.
- [Comandos](/es-ES/core/commands) explica definiciones de endpoint, constructores de comandos, comandos y proyecciones vinculadas al esquema.
- [HTTP](/es-ES/core/http), [SSE](/es-ES/core/sse) y [WebSocket](/es-ES/core/web-socket) documentan cada transporte y la responsabilidad de su ciclo de vida.
- [Vue](/es-ES/plugins/vue), [React](/es-ES/plugins/react) y [OpenTelemetry Server](/es-ES/plugins/opentelemetry-server) muestran cómo conectar Defjs con el framework y la telemetría de tu aplicación.
