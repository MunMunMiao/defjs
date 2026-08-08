---
title: HTTP
description: Construye URLs y cuerpos HTTP, selecciona Structs según la respuesta, cancela trabajo, configura credenciales y XSRF, y entiende el límite con Fetch.
---

# HTTP

`defineRequest(...)` crea un constructor de comandos HTTP. [Comandos](/es-ES/core/commands) cubre las definiciones y proyecciones de entrada; esta página describe el protocolo HTTP y su ciclo de vida.

## Construcción de la URL

`withEndpoint(...)` debe recibir una URL base absoluta. Su ruta se conserva como un directorio:

```typescript
const client = createClient(withEndpoint('https://api.example.com/v1'))

const listUsers = defineRequest({
  method: 'GET',
  path: '/users',
})

// Resolves to https://api.example.com/v1/users
```

Si falta, se añade una barra al final de la ruta base. Cualquier query o fragmento que contenga el endpoint base se descarta.

Los valores `path` de un endpoint son rutas relativas del contrato. Se admite una barra inicial, que se elimina antes de resolver la URL para que no sustituya el directorio base. En tiempo de ejecución se rechazan:

- URLs absolutas y URLs relativas al protocolo;
- rutas que contengan `?`;
- rutas que contengan `#`.

Los placeholders de ruta usan `:name`:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
  }),
})
```

Los valores de los placeholders se insertan sin codificarlos como segmentos de ruta. Restringe los identificadores o aplica `encodeURIComponent` a cada segmento no fiable antes de crear el comando. Una barra o un segmento de punto sin codificar puede cambiar la ruta resuelta; si se inserta `?` o `#`, la validación de la ruta del endpoint rechaza la petición.

## Codificación de la petición

Usa `struct.request(...)` para proyectar directamente sobre el protocolo:

```typescript
const createUser = defineRequest({
  method: 'POST',
  path: '/organizations/:organizationId/users',
  input: struct.request({
    path: struct.object({ organizationId: struct.string() }),
    query: struct.object({ notify: struct.boolean().optional() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
})
```

El Struct del cuerpo elige la codificación y el `Content-Type` por defecto:

| Struct del cuerpo          | Cuerpo enviado        | `Content-Type` por defecto                        |
| -------------------------- | --------------------- | ------------------------------------------------- |
| `struct.json(inner)`       | `JSON.stringify(...)` | `application/json`                                |
| `struct.text()`            | cadena                | `text/plain;charset=UTF-8`                        |
| `struct.urlencoded(shape)` | `URLSearchParams`     | `application/x-www-form-urlencoded;charset=UTF-8` |
| `struct.formData(shape)`   | `FormData`            | lo define la plataforma, incluido su boundary     |
| `struct.blob()`            | `Blob`                | tipo del Blob o `application/octet-stream`        |
| `struct.arrayBuffer()`     | `ArrayBuffer`         | `application/octet-stream`                        |

Un `build` personalizado puede utilizar los métodos HTTP correspondientes. Los setters sustituyen esa parte de la petición; `addHeaders`, `addFormData` y `addFormUrlEncoded` añaden datos a la parte actual. Todos los valores deben proceder de la proyección vinculada al esquema.

### Valores de query

El codificador de query por defecto admite valores escalares planos y arrays de escalares. Los objetos anidados fallan durante la construcción de la petición.

`withQueryParamsSerializer((params, rawParams) => string)` permite cambiar cómo se representan los valores planos ya aceptados. Recibe una vista `URLSearchParams` y el registro plano codificado. No hace válidos los objetos de query anidados: se rechazan antes de llegar a la serialización.

Los alias se convierten en las claves de salida de la query, la ruta y las cabeceras. El código que llama sigue usando los nombres lógicos del Struct.

## Estados y decodificación de la salida

`output` relaciona códigos de estado con Structs de respuesta:

```typescript
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
  }),
  output: [
    { status: 200, body: struct.object({ id: struct.number(), name: struct.string() }) },
    { status: 404, body: struct.object({ message: struct.string() }) },
  ] as const,
})
```

En tiempo de ejecución se elige el Struct por el estado exacto. Cuando se ha declarado `output`, cualquier estado sin correspondencia produce `UNDECLARED_STATUS`. Los cuerpos 2xx declarados forman la unión de datos correctos; los cuerpos no 2xx declarados forman `error.data`.

`response.ok` solo significa `status >= 200 && status < 300`. No indica que hayan tenido éxito la decodificación de la salida, la validación de la aplicación ni la autorización.

Si declaras `output` y omites `responseType`, la respuesta se interpreta como `json` por defecto. Los modos explícitos son `json`, `text`, `blob` y `arraybuffer`. A continuación, el Struct elegido realiza la decodificación estructural. Si omites `output`, los datos del resultado son `undefined` y el wrapper de respuesta devuelto tiene `body: null`.

### Defecto actual con JSON malformado

::: danger Un JSON malformado puede parecer correcto
El límite Fetch actual guarda el fallo de parseo de JSON en `HttpResponse.error` y deja el cuerpo como `null`. La ejecución del comando HTTP no comprueba ese error antes de aplicar el Struct de salida. Como un valor `null` aplicado a un Struct que no admite nulos puede decodificarse a su valor cero, actualmente un cuerpo JSON 2xx malformado puede producir `[null, zeroValue, response]`.

No interpretes un resultado formado solo por valores cero como prueba de que el servidor envió JSON válido. Hace falta corregir la implementación y añadir una prueba de regresión; esta documentación solo puede advertir del problema.
:::

## El resultado HTTP

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

Si todo va bien, `response` es un wrapper `SettledResponse` de Defjs cuyo cuerpo coincide con `data`. Si hay un error, la disponibilidad de la respuesta depende de hasta dónde haya llegado la ejecución. Consulta la clasificación exacta en [Errores](/es-ES/core/errors).

## Cancelación y timeout

La ejecución HTTP acepta `abort`, `signal` y `timeout`:

```typescript
const controller = new AbortController()

const [error] = await client.execute(command, {
  signal: controller.signal,
  timeout: 5_000,
})
```

`signal` se combina con la señal interna del cliente y con un timeout positivo. El campo independiente `abort` es otra señal de cancelación que conserva la API actual. No puedes proporcionar a la vez `abort` y `timeout`: en ese caso se devuelve `REQUEST_VALIDATION_FAILED`. `signal` sí puede combinarse con cualquiera de los dos.

Una cancelación reconocida produce `ABORTED`. El motivo de un `AbortSignal.timeout(...)` o el timeout de la ejecución produce `TIMEOUT`. Los demás fallos de Fetch producen `NETWORK_ERROR`.

## Credenciales y XSRF

`withCredentials(true)` asigna `credentials: 'include'` a Fetch para HTTP y SSE. Con `false`, la opción de Fetch queda sin especificar; no se fuerza `omit`. Este ajuste no añade una cabecera `Authorization` ni configura la autenticación de WebSocket.

`withXSRF(...)` solo se aplica a peticiones HTTP. Los valores por defecto son:

```typescript
withXSRF({
  cookieName: 'XSRF-TOKEN',
  headerName: 'X-XSRF-TOKEN',
})
```

Solo se intenta inyectar el token para `POST`, `PUT`, `PATCH` y `DELETE`. Si la cabecera configurada ya existe, se conserva. En navegador, la lectura de cookies se limita a peticiones del mismo origen. Fuera del navegador, proporciona un `tokenProvider` síncrono; tiene prioridad sobre la lectura de cookies.

```typescript
import type { HttpRequest } from '@defjs/core'

declare const readRequestScopedToken: (request: HttpRequest) => string | null

withXSRF({
  tokenProvider: ({ request }) => readRequestScopedToken(request),
})
```

En servidor, mantén los proveedores de tokens dentro del ámbito de la petición. `withCredentials(true)` no permite que JavaScript lea cookies de otro origen en el navegador ni provoca que se inyecte la cabecera XSRF en peticiones a otro origen.

## Observadores de progreso

`onDownloadProgress` informa de los bytes a medida que se lee el cuerpo de la respuesta Fetch. `lengthComputable` solo vale `true` cuando existe un `Content-Length` positivo.

```typescript
declare const updateProgress: (value: number | undefined) => void

const [error, file] = await client.execute(downloadFile(), {
  onDownloadProgress({ loaded, total, lengthComputable }) {
    updateProgress(lengthComputable ? loaded / total : undefined)
  },
})
```

`onUploadProgress` solo observa un cuerpo de petición `ReadableStream<Uint8Array>`. Los constructores de comandos de alto nivel actuales exponen setters de proyección para Blob y ArrayBuffer, pero no para un stream sin procesar. Por tanto, no hay un ejemplo estándar con `defineRequest` que pueda proporcionar el stream que exige esta opción. No presentes un stream construido manualmente como un cuerpo válido de un comando de alto nivel.

Los callbacks de progreso se ejecutan durante la lectura o escritura del transporte. Deben ser rápidos y no lanzar excepciones.

## Límite Fetch de bajo nivel

`fetchHandler(httpRequest, fetchImpl?)` está exportado. Convierte un `HttpRequest` de Defjs en un `Request` nativo, llama a Fetch, interpreta la representación de respuesta elegida y devuelve un wrapper `HttpResponse` de Defjs. Los fallos de Fetch se convierten en wrappers con estado 0.

Llamar directamente a `fetchHandler` evita:

- la decodificación de la entrada del comando y la proyección de la petición;
- la selección por estado de la salida HTTP y su decodificación mediante Struct;
- la orquestación de interceptores del cliente;
- la conversión a la tupla `RequestError` de alto nivel.

Es un límite de bajo nivel exportado, no el flujo de comandos recomendado. Aquí no se establece su compromiso de estabilidad a largo plazo.

## Siguiente paso

- [Interceptores](/es-ES/core/interceptors) cubre la clonación de peticiones, el cortocircuito y los reintentos.
- [Errores](/es-ES/core/errors) documenta los fallos de estado HTTP, transporte y definición.
- [Struct](/es-ES/core/struct) explica la decodificación estructural con valores cero.
