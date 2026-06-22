import { resolveStructFields } from '../fields'
import { encodeStructValue, isObjectStruct } from '../introspection'
import { DEFINITION } from '../symbols'
import type { AnyStructLike, ObjectDefinition, RuntimeStruct } from '../types'
import { hasOwnKey } from '../utils'
import { assertPlainObject } from './common'

export interface EncodedWireField {
  readonly key: string
  readonly value: unknown
}

export function forEachEncodedWireField(
  struct: AnyStructLike,
  value: unknown,
  label: string,
  visit: (field: EncodedWireField) => void,
): void {
  if (!isObjectStruct(struct)) {
    throw new TypeError(`${label} encode expects object struct`)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  for (const field of resolveStructFields(
    struct as unknown as RuntimeStruct,
    (struct as unknown as RuntimeStruct)[DEFINITION] as ObjectDefinition,
  )) {
    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    const encoded = encodeStructValue(field.struct, fieldValue)
    if (typeof encoded === 'undefined') {
      continue
    }

    visit({ key: field.wireKey, value: encoded })
  }
}

export function writeRepeated(key: string, value: unknown, write: (key: string, value: unknown) => void): void {
  if (typeof value === 'undefined') {
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      writeRepeated(key, item, write)
    }
    return
  }

  write(key, value)
}
