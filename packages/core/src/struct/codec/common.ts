import { encodeValue } from '../encode'
import { resolveStructFields } from '../fields'
import { isObjectStruct, parseStructValue } from '../introspection'
import { DEFINITION } from '../symbols'
import type { AnyStructLike, RuntimeStruct } from '../types'
import { hasOwnKey } from '../utils'

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

export function mapAliasedObjectFields(
  struct: RuntimeStruct,
  value: { [key: string]: unknown },
  encodeChild: (struct: RuntimeStruct, value: unknown) => unknown,
): { [key: string]: unknown } {
  const output: { [key: string]: unknown } = Object.create(null)
  const definition = struct[DEFINITION]
  if (definition.kind !== 'object') {
    throw new TypeError('json encode expects object struct')
  }

  for (const field of resolveStructFields(struct, definition)) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    output[field.wireKey] = encodeChild(field.struct, fieldValue)
  }

  return output
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

  return encodeValue(struct as unknown as RuntimeStruct, value, {
    encodeObject: (objectStruct, objectValue, encodeChild) => mapAliasedObjectFields(objectStruct, objectValue, encodeChild),
  })
}
