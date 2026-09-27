---
title: HTTP
description: Define una solicitud, ejecútala, ramifica por estado y cancela con signal o timeout.
---

# HTTP

Define → execute → ramifica en la tupla → cancela cuando la pantalla se va. Ese es todo el bucle HTTP.

## Basic Setup

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({ path: struct.object({ id: struct.number() }) }),
  output: struct.object({ id: struct.number(), name: struct.string() }),
  error: struct.object({ message: struct.string() }),
})

const [error, data, response] = await client.execute(getUser({ path: { id: 7 } }))
if (error?.code === 'HTTP_STATUS' && error.status === 404) {
  console.log(error.data.message)
} else if (!error) {
  console.log(data.name, response.status)
}
```

## Resolver la URL

`withEndpoint(...)` necesita una URL absoluta válida. El pathname del endpoint se queda como directorio; query y hash se descartan antes de la resolución del comando.

```ts
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com/v1'))
const getUser = defineRequest({
  method: 'GET',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.string() }),
    query: struct.object({ fields: struct.string().optional() }),
  }),
})

const command = getUser({ path: { id: 'a/b' }, query: { fields: 'name' } })
void client.execute(command)
// → https://api.example.com/v1/users/a%2Fb?fields=name
```

Los placeholders de path son escalares en bruto, codificados exactamente una vez. Se rechazan valores vacíos y `.` / `..`. Barras, `?`, `#`, `%`, espacios y Unicode en un placeholder se quedan en un segmento codificado — no pre-codifiques.

El path de la definición no puede contener `?` ni `#`, ni ser absoluto o protocol-relative. El encoder de query por defecto acepta escalares y arrays de escalares. Los valores de query anidados/complejos necesitan `withQueryParamsSerializer(...)` o la construcción falla.

## Codificar la entrada

`struct.request(...)` mantiene path, query, headers y body separados. El wrapper del cuerpo elige el codec y el content type:

```typescript twoslash
import { createClient, defineRequest, struct, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const updateUser = defineRequest({
  method: 'PATCH',
  path: '/users/:id',
  input: struct.request({
    path: struct.object({ id: struct.number() }),
    headers: struct.object({ requestId: struct.string().alias('x-request-id') }),
    body: struct.json(
      struct.object({
        displayName: struct.string().alias('display_name'),
      }),
    ),
  }),
  output: struct.object({ id: struct.number(), displayName: struct.string().alias('display_name') }),
})

const [error, user] = await client.execute(
  updateUser({
    path: { id: 7 },
    headers: { requestId: 'request-42' },
    body: { displayName: 'Ada' },
  }),
)
if (error) console.error(error.code)
else console.log(user.id)
```

Los alias reescriben solo las claves de cable salientes. Los valores parseados y las entradas del comando conservan los nombres lógicos.

| Wrapper                    | Cuerpo en runtime | Content type por defecto                                                  |
| -------------------------- | ----------------- | ------------------------------------------------------------------------- |
| `struct.json(inner)`       | String JSON       | `application/json`                                                        |
| `struct.text()`            | string            | `text/plain;charset=UTF-8`                                                |
| `struct.urlencoded(shape)` | `URLSearchParams` | `application/x-www-form-urlencoded;charset=UTF-8`                         |
| `struct.formData(shape)`   | `FormData`        | Boundary multipart de la plataforma; Defjs limpia `Content-Type` obsoleto |
| `struct.blob()`            | `Blob`            | Tipo del Blob o `application/octet-stream`                                |
| `struct.arrayBuffer()`     | `ArrayBuffer`     | `application/octet-stream`                                                |

Un `build` personalizado expone los mismos setters de ubicación/codec. Gana la escritura final del cuerpo (valor + metadatos de content-type). Los comandos de alto nivel no convierten un objeto arbitrario en cuerpo — declara un wrapper o usa el setter correspondiente.

## Cómo se lee un cuerpo

`output` es un Struct para el cuerpo 2xx; `error` es un Struct para todo lo demás. Con cualquiera de los dos declarado y sin `responseType`, la representación es `json` por defecto. Tipos explícitos: `json`, `text`, `blob`, `arraybuffer`. Sin ninguno declarado, `responseType` no se permite y el cuerpo nunca se lee.

Orden de operaciones:

1. `ok` elige el lado: `output` para 2xx, `error` para todo lo demás. Nunca ambos.
2. Nada declarado para ese lado → el cuerpo nunca se lee. 2xx tiene éxito con `data === undefined`; no-2xx es `HTTP_STATUS` con `data === undefined`. Un cuerpo ilegible en un lado que no declaraste se ignora, incluido el hecho de que no se pudo leer.
3. El media type se comprueba **antes** de leer el cuerpo. Una discrepancia es `RES_MEDIA_TYPE_INVALID` y no se parsea ni se decodifica nada.
4. Se lee la representación. Un fallo es `RES_DECODE_FAILED`.
5. El Struct parsea el valor. Un fallo es `RES_STRUCT_MISMATCH`.
6. 2xx → resultado y un `response.body` tipado; no-2xx → `data` tipado en `HTTP_STATUS`.

La decodificación ocurre una sola vez, después de la cadena de interceptores, así que una respuesta que un interceptor construyó con `makeResponse(...)` se lee exactamente igual que una que llegó por el cable.

Una respuesta exitosa es un `DecodedResponse<T>`: `url`, `status`, `statusText`, `headers`, `ok` y un `body` tipado. Donde no se decodificó nada obtienes `HttpMeta`: los mismos campos sin `body`. `ok` solo significa `200 <= status < 300`. Ninguno de los dos es una `Response` nativa. Un fallo de transporte es un fault, así que no hay ninguna respuesta con estado 0 que haga sus veces.

## Cancel the work {#cancel-the-work}

Las opciones de ejecución toman `signal` más `abort` o `timeout`. **`abort` y `timeout` son mutuamente excluyentes.** `signal` puede combinarse con cualquiera de los dos.

```ts
import { createClient, defineRequest, withEndpoint } from '@defjs/core'

const client = createClient(withEndpoint('https://api.example.com'))
const command = defineRequest({ method: 'GET', path: '/report' })()
const controller = new AbortController()
const pending = client.execute(command, { signal: controller.signal, timeout: 5_000 })

controller.abort('screen closed')
const [error] = await pending
if (error?.code === 'NET_ABORTED') {
  console.log('caller cancellation')
}
```

`timeout` debe ser un entero seguro positivo en `1..2_147_483_647`. Cancel reconocido → `NET_ABORTED`; timeout de ejecución → `NET_TIMEOUT`; otros fallos de Fetch/interceptor → `NET_UNREACHABLE`. Cancelar después de que el servidor aceptó una escritura **no** demuestra que la escritura se revirtió.

## Credenciales y XSRF

`withCredentials(true)` pone Fetch `credentials: 'include'` para HTTP y SSE. No crea `Authorization` ni configura auth de WebSocket. `false` deja las credenciales sin especificar.

`withXSRF(...)` es solo HTTP. Defaults: `cookieName: 'XSRF-TOKEN'`, `headerName: 'X-XSRF-TOKEN'`. La cabecera se inyecta solo para métodos no seguros, solo cuando el llamador no la puso ya, y solo para solicitudes same-origin del navegador. Omite `GET`, `HEAD`, `OPTIONS`, `TRACE`. Fuera del navegador, pasa un `tokenProvider` síncrono acotado a la solicitud si necesitas inyección.

Mantén credenciales, tokens XSRF y query strings fuera de los logs rutinarios. No uses query params como canal general de credenciales.

## Progreso y el límite Fetch

`onDownloadProgress` corre mientras se lee una representación de respuesta explícita. `lengthComputable` es true solo con un `Content-Length` positivo. Sin `responseType` → sin decode del cuerpo → sin progreso de lectura del cuerpo.

`onUploadProgress` observa un cuerpo de solicitud `ReadableStream<Uint8Array>` mientras Fetch lo lee. Los wrappers de cuerpo normales no exponen un setter de stream en bruto — el progreso de upload es sobre todo para construcción de bajo nivel.

`fetchHandler(httpRequest, fetchImpl?)` es el límite Fetch de nivel inferior: construye un `Request` nativo, llama a Fetch, lee la representación, devuelve `HttpResponse`. **No** valida la entrada del comando, no despacha `output` ni ejecuta interceptores. Útil para tests de transporte inyectado — no sustituye a `client.execute`.

## Límites de replay

Defjs **no** reintenta HTTP automáticamente. Reintentar una lectura sigue necesitando una política revisada de timeout/red/duplicados. Reintentar una mutación necesita bytes reproducibles, soporte del servidor, una clave de idempotencia ligada al ámbito de auth + bytes de la solicitud, y una política de duplicados en el receptor.

Un límite cliente/comando/Fetch no puede saber si una escritura fallida se confirmó. Mantén las decisiones de replay en la app o en un interceptor revisado. Los interceptores pueden cortocircuitar o reemplazar la solicitud de bajo nivel; el estado y el cuerpo finales deben seguir satisfaciendo el contrato del comando.

## Recetas relacionadas

- [GET con un 404 declarado](../recipes/get-declared-404.md)
- [POST JSON](../recipes/post-json.md)
- [Cancelar una llamada HTTP](../recipes/cancel-http.md)
- [Probar con un handle Fetch local](../recipes/test-with-handle.md)
