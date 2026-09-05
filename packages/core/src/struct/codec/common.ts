import { encodeValue } from '../encode'
import { mapAliasedObjectFields } from '../fields'

import { isObjectStruct, parseStructValue } from '../introspection'
import type { AnyStructLike, RuntimeStruct } from '../types'

export { mapAliasedObjectFields } from '../fields'

export const ALIAS_ENCODE_OPTIONS = { encodeObject: mapAliasedObjectFields }

export function encodeObjectByAlias(struct: AnyStructLike, value: unknown, label = 'json'): unknown {
  if (!isObjectStruct(struct)) {
    return encodeAliasedField(struct, value, label)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  return mapAliasedObjectFields(struct as unknown as RuntimeStruct, value, (fieldStruct, fieldValue) =>
    encodeAliasedField(fieldStruct, fieldValue, label),
  )
}

export function decodeObjectByAlias(struct: AnyStructLike, value: unknown): unknown {
  return parseStructValue(struct, value, { useAliases: true })
}

export function assertPlainObject(value: unknown, message: string): asserts value is { [key: string]: unknown } {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(message)
  }
}

function encodeAliasedField(struct: AnyStructLike, value: unknown, label: string): unknown {
  if (isObjectStruct(struct)) {
    return encodeObjectByAlias(struct, value, label)
  }

  return encodeValue(struct as unknown as RuntimeStruct, value, ALIAS_ENCODE_OPTIONS)
}
