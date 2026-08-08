---
title: Contexto
description: Pasa metadatos propios de una petición por las cadenas de interceptores HTTP y SSE mediante HttpContext.
---

# Contexto

`HttpContext` es un contenedor de metadatos cuyas claves son tokens. Acompaña a una ejecución HTTP o SSE y está disponible en el `HttpRequest` que reciben los interceptores. No se serializa por sí mismo en la URL, las cabeceras ni el cuerpo.

## Tokens y valores por defecto

Crea un token tipado mediante una función que proporcione su valor por defecto:

```typescript
import { makeHttpContextToken } from '@defjs/core'

const operationToken = makeHttpContextToken(() => 'unknown-operation')
const requestIdToken = makeHttpContextToken(() => 'missing-request-id')
```

`context.get(token)` llama a la función del token cuando el contexto no tiene un valor guardado. El valor por defecto no se inserta en el contexto, por lo que una función con estado puede producir un valor nuevo en cada lectura ausente. Es preferible que los valores por defecto sean deterministas.

## Crear y pasar un contexto

```typescript
import { makeHttpContext } from '@defjs/core'

const context = makeHttpContext().set(operationToken, 'get-user').set(requestIdToken, 'request-42')

const [error, user] = await client.execute(getUser({ path: { id: 42 } }), {
  context,
})
```

`set(...)` muta el contexto y devuelve el mismo objeto para que puedas encadenar llamadas. `get(...)` y `set(...)` lanzan `TypeError` si reciben valores que no son tokens creados mediante `makeHttpContextToken(...)`.

Los interceptores leen el mismo objeto:

```typescript
import { createHttpInterceptor } from '@defjs/core'

const operationLogger = createHttpInterceptor(async (request, next) => {
  const operation = request.context?.get(operationToken) ?? 'unknown-operation'
  const requestId = request.context?.get(requestIdToken) ?? 'missing-request-id'

  console.info('outbound request started', { operation, requestId })
  const response = await next(request)
  console.info('outbound request finished', { operation, requestId, status: response.status })
  return response
})
```

Utiliza nombres de operación fijos y metadatos revisados. No incluyas por defecto en los logs secretos, cabeceras sin filtrar, cuerpos, URLs ni cadenas de query.

## Semántica por referencia

La ejecución pasa `HttpContext` por referencia. Si un interceptor lo muta, los interceptores posteriores y quien conserve ese objeto también pueden observar el cambio.

Crea un contexto nuevo para cada petición cuando contenga datos de la petición, del usuario, del tenant, de trazas, cookies o autorización. Reutilizar un mismo contexto mutable en trabajos concurrentes puede sobrescribir o filtrar metadatos.

Actualmente, las opciones de ejecución HTTP y SSE aceptan `context`; las de WebSocket no. Un manejador lógico SSE conserva el contexto de petición asociado a sus intentos de conexión. Aun así, la aplicación debe tratar ese contexto como un recurso perteneciente al ámbito de petición del stream.

## Copiar y combinar

`makeHttpContext(existing)` crea una copia superficial del mapa de tokens:

```typescript
const base = makeHttpContext().set(operationToken, 'list-users')
const copy = makeHttpContext(base)

copy.set(requestIdToken, 'request-43')
```

Los mapas son independientes, pero los valores que sean objetos no se clonan en profundidad.

`makeHttpContext(entries)` acepta pares de token y valor:

```typescript
const context = makeHttpContext([
  [operationToken, 'create-user'],
  [requestIdToken, 'request-44'],
])
```

`mergeHttpContexts(primary, secondary)` devuelve un contexto nuevo. Cuando un token existe en ambos, el valor de `secondary` sustituye al de `primary`.

```typescript
import { mergeHttpContexts } from '@defjs/core'

const primary = makeHttpContext().set(operationToken, 'default-operation')
const secondary = makeHttpContext().set(operationToken, 'get-user')
const merged = mergeHttpContexts(primary, secondary)

merged.get(operationToken) // 'get-user'
```

Si pasas un único contexto, también obtienes una copia. Si no pasas ninguno, obtienes un contexto vacío.

## API de contexto

| Miembro             | Comportamiento                                                                  |
| ------------------- | ------------------------------------------------------------------------------- |
| `set(token, value)` | Guarda un valor y devuelve el mismo contexto.                                   |
| `get(token)`        | Devuelve el valor guardado o llama a la función de valor por defecto del token. |
| `has(token)`        | Comprueba si hay un valor guardado.                                             |
| `del(token)`        | Elimina un valor y devuelve el mismo contexto.                                  |
| `keys()`            | Itera sobre los tokens guardados.                                               |
| `length`            | Número de tokens guardados.                                                     |

`isHttpContext(...)` e `isHttpContextToken(...)` están disponibles cuando necesitas guards en tiempo de ejecución.

El mapeo de peticiones es un asunto distinto. Consulta [Comandos](/es-ES/core/commands) para ver las secciones automáticas de petición y las proyecciones vinculadas al esquema, e [Interceptores](/es-ES/core/interceptors) para entender el comportamiento de la cadena.
