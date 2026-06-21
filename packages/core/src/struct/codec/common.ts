import { encodeValue } from '../encode'
import { matchesDefinition } from '../match'
import { resolveStructFields } from '../fields'
import { isObjectStruct, parseStructValue } from '../introspection'
import { resolveRuntimeStruct } from '../shape'
import { DEFINITION } from '../symbols'
import type { AnyStructLike, DiscriminatedUnionDefinition, Path, RuntimeStruct } from '../types'
import { hasOwnKey, isObjectIntersectionStruct, isPlainObject } from '../utils'

export function encodeObjectByAlias(struct: AnyStructLike, value: unknown, label = 'json'): unknown {
  if (!isObjectStruct(struct)) {
    return encodeAliasedField(struct, value, label)
  }

  assertPlainObject(value, `${label} encode expects object value`)

  return mapAliasedObjectFields(struct as unknown as RuntimeStruct, value, (fieldStruct, fieldValue) =>
    encodeAliasedField(fieldStruct, fieldValue, label),
  )
}

export function decodeObjectByAlias(struct: AnyStructLike, value: unknown, label = 'json'): unknown {
  if (!isObjectStruct(struct)) {
    return parseStructValue(struct, decodeAliasedField(struct, value, label, []))
  }

  return parseStructValue(struct, normalizeObjectByAlias(struct, value, label, []))
}

function normalizeObjectByAlias(struct: AnyStructLike, value: unknown, label: string, path: Path): { [key: string]: unknown } {
  assertPlainObject(value, `${label} decode expects object value`)

  const runtime = struct as unknown as RuntimeStruct
  const definition = runtime[DEFINITION]
  if (definition.kind !== 'object') {
    throw new TypeError(`${label} decode expects object struct`)
  }

  const normalized: { [key: string]: unknown } = Object.create(null)
  for (const field of resolveStructFields(runtime, definition)) {
    if (!hasOwnKey(value, field.wireKey)) {
      continue
    }

    const rawValue = value[field.wireKey]
    normalized[field.key] = decodeAliasedField(field.struct, rawValue, label, [...path, field.key])
  }

  return normalized
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

function decodeAliasedField(struct: AnyStructLike, value: unknown, label: string, path: Path): unknown {
  const runtime = resolveRuntimeStruct(struct as unknown as RuntimeStruct)
  const definition = runtime[DEFINITION]

  switch (definition.kind) {
    case 'object':
      return normalizeObjectByAlias(runtime, value, label, path)

    case 'array':
      return Array.isArray(value) ? value.map((item, index) => decodeAliasedField(definition.item, item, label, [...path, index])) : value

    case 'tuple':
      return Array.isArray(value)
        ? value.map((item, index) => {
            const itemStruct = definition.items[index]
            return itemStruct ? decodeAliasedField(itemStruct, item, label, [...path, index]) : item
          })
        : value

    case 'record': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: { [key: string]: unknown } = Object.create(null)
      for (const [key, entry] of Object.entries(value)) {
        output[key] = decodeAliasedField(definition.value, entry, label, [...path, key])
      }
      return output
    }

    case 'or':
      for (const option of definition.options) {
        const decoded = tryDecodeAliasedField(option, value, label, path)
        if (!decoded.ok) {
          continue
        }
        const optionRuntime = resolveRuntimeStruct(option as unknown as RuntimeStruct)
        if (matchesDefinition(optionRuntime[DEFINITION], decoded.value, optionRuntime)) {
          return decoded.value
        }
      }
      return value

    case 'discriminatedUnion': {
      const routed = readDiscriminatorWireValue(definition, value)
      if (routed.ok) {
        return decodeAliasedField(routed.option, value, label, path)
      }
      if (routed.ambiguous) {
        throw new TypeError('ambiguous discriminated union discriminator')
      }
      return value
    }

    case 'intersection': {
      const leftDecoded = decodeAliasedField(definition.left, value, label, path)
      const rightDecoded = decodeAliasedField(definition.right, value, label, path)
      return isObjectIntersectionStruct(definition.left) &&
        isObjectIntersectionStruct(definition.right) &&
        isPlainObject(leftDecoded) &&
        isPlainObject(rightDecoded)
        ? { ...leftDecoded, ...rightDecoded }
        : rightDecoded
    }

    default:
      return value
  }
}

function readDiscriminatorWireValue(
  definition: DiscriminatedUnionDefinition,
  value: unknown,
): { ok: true; option: RuntimeStruct } | { ok: false; ambiguous: boolean } {
  if (!isPlainObject(value)) {
    return { ambiguous: false, ok: false }
  }

  let matched: RuntimeStruct | undefined
  for (const option of definition.options) {
    const runtime = option as unknown as RuntimeStruct
    const optionDefinition = runtime[DEFINITION]
    if (optionDefinition.kind !== 'object') {
      continue
    }
    const fields = resolveStructFields(runtime, optionDefinition)
    const discriminator = fields.find((field) => field.key === definition.discriminator)
    const wireKey = discriminator?.wireKey ?? definition.discriminator
    if (!hasOwnKey(value, wireKey)) {
      continue
    }

    const candidate = definition.map.get(value[wireKey]) as RuntimeStruct | undefined
    if (!candidate) {
      continue
    }
    if (matched && matched !== candidate) {
      return { ambiguous: true, ok: false }
    }
    matched = candidate
  }

  return matched ? { ok: true, option: matched } : { ambiguous: false, ok: false }
}

function tryDecodeAliasedField(
  struct: AnyStructLike,
  value: unknown,
  label: string,
  path: Path,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: decodeAliasedField(struct, value, label, path) }
  } catch {
    return { ok: false }
  }
}
