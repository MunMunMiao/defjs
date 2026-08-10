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

Pasa los valores de los placeholders sin codificar. Defjs serializa cada escalar, rechaza los valores vacíos y los valores completos `.` o `..`, y aplica `encodeURIComponent` exactamente una vez antes de sustituirlos. `/`, `?`, `#`, `%`, los espacios y Unicode permanecen dentro de un único segmento. No precodifiques los valores: `%` se trata como entrada original y se codifica como `%25`.

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

Si declaras `output` y omites `responseType`, la respuesta se interpreta como `json` por defecto. Los modos explícitos son `json`, `text`, `blob` y `arraybuffer`. A continuación, el Struct elegido realiza la decodificación estructural. Si omites `output`, no se admite `responseType`, los datos del resultado son `undefined` y el wrapper de respuesta devuelto tiene `body: null`. El runtime intenta cancelar el cuerpo de la respuesta en modo best-effort en vez de leerlo o decodificarlo.

La clasificación del resultado del comando tiene una prioridad fija: fallo de transporte con estado 0 → sin `output` → coincidencia exacta del estado o `UNDECLARED_STATUS` → `response.error` → decodificación del Struct. Por tanto, los errores de representación del cuerpo solo pueden ocurrir cuando se declara `output`; una rama de estado no declarado sigue prevaleciendo si Fetch registró uno.

### Errores de representación

Para un output declarado con coincidencia exacta, si falla JSON u otro codec del cuerpo, Fetch conserva la excepción original en `HttpResponse.error`. La ejecución se detiene antes de aplicar el Struct de salida y devuelve `[RESPONSE_VALIDATION_FAILED, undefined, response]`; la excepción queda en `cause` y no se produce `error.data` tipado.

Una respuesta no 2xx ordinaria no rellena `response.error`; su estado se representa con `status` y `ok`. Si el estado no 2xx y el cuerpo están declarados y el cuerpo es válido, se decodifica el Struct y el error `HTTP_STATUS` conserva el cuerpo tipado en `error.data`.

## El resultado HTTP

```typescript
const [error, data, response] = await client.execute(getUser({ path: { id: 42 } }))
```

Si todo va bien, `response` es un wrapper `HttpResponse` de Defjs cuyo cuerpo coincide con `data`. Si hay un error, la disponibilidad de la respuesta depende de hasta dónde haya llegado la ejecución. Consulta la clasificación exacta en [Errores](/es-ES/core/errors).

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

Para la ejecución HTTP, SSE y WebSocket, `timeout` debe ser un entero seguro positivo dentro de `1..2_147_483_647`; `0`, los valores negativos o fraccionarios, `NaN`, `Infinity` y los valores superiores al límite devuelven `REQUEST_VALIDATION_FAILED` antes de crear cualquier recurso de request, stream o socket.

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

La inyección se omite para los métodos seguros según RFC `GET`, `HEAD`, `OPTIONS` y `TRACE`. Para cualquier otro método, incluidos métodos personalizados no seguros como `PROPPATCH`, se aplican las mismas comprobaciones de cabecera existente, mismo origen y token antes de la inyección. Si la cabecera configurada ya existe, se conserva. En navegador, la lectura de cookies se limita a peticiones del mismo origen. Fuera del navegador, proporciona un `tokenProvider` síncrono; tiene prioridad sobre la lectura de cookies.

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
- [Struct](/es-ES/core/struct) explica la decodificación estructural estricta.
