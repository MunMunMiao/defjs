import type { AnyStructLike } from '../types'
import { encodeFlatByAlias } from './flat'

export function encodeUrlencoded(struct: AnyStructLike, value: unknown): URLSearchParams {
  return encodeFlatByAlias(struct, value, {
    create: () => new URLSearchParams(),
    label: 'urlencoded',
    put: appendSearchParam,
  })
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

export function isSearchParamScalar(value: unknown): value is boolean | null | number | string {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null
}

export function stringifySearchParamScalar(value: boolean | null | number | string): string {
  return value === null ? 'null' : String(value)
}
