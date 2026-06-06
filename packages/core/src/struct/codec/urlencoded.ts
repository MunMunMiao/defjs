import { encodeStructValue, getStructFields, isObjectStruct } from '../introspection'
import { UrlencodedTag } from '../tag'
import type { SchemaLike } from '../types'
import { assertPlainObject, getWireKey } from './common'

export type SearchParamScalar = boolean | null | number | string

export function encodeUrlencoded(struct: SchemaLike<any, any, boolean>, value: unknown): URLSearchParams {
  if (!isObjectStruct(struct)) {
    throw new TypeError('urlencoded encode expects object struct')
  }

  assertPlainObject(value, 'urlencoded encode expects object value')

  const params = new URLSearchParams()
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(UrlencodedTag.kind)
    appendSearchParam(params, getWireKey(field.key, fieldTag), encodeStructValue(field.struct, value[field.key]))
  }

  return params
}

export function appendSearchParam(params: URLSearchParams, key: string, value: unknown): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendSearchParamItem(params, key, item, 'append')
    }
    return
  }

  appendSearchParamItem(params, key, value, 'set')
}

function appendSearchParamItem(params: URLSearchParams, key: string, value: unknown, mode: 'append' | 'set'): void {
  if (isSearchParamScalar(value)) {
    const encoded = stringifySearchParamScalar(value)
    if (mode === 'append') {
      params.append(key, encoded)
      return
    }

    params.set(key, encoded)
    return
  }

  throw new TypeError(`urlencoded value for "${key}" requires an explicit serializer`)
}

export function isSearchParamScalar(value: unknown): value is SearchParamScalar {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

export function stringifySearchParamScalar(value: SearchParamScalar): string {
  return value === null ? 'null' : String(value)
}
