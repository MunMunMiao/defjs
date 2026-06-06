import { encodeValue, matchesDefinition } from '../encode'
import { getStructFields, isObjectStruct, parseStructValue } from '../introspection'
import { resolveRuntimeSchema } from '../shape'
import { DEFINITION } from '../symbols'
import type { FieldTag, TagNamespace } from '../tag'
import type { Path, RuntimeSchema, SchemaLike } from '../types'
import { hasOwnKey, isPlainObject } from '../utils'

export type TaggedObject = Record<string, unknown>

export type TagObjectOptions = {
  requireTag?: boolean
}

export function encodeObjectByTag(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions = {},
): unknown {
  if (!isObjectStruct(struct)) {
    return encodeTaggedField(struct, value, namespace, options)
  }

  assertPlainObject(value, `${namespace.name} encode expects object value`)

  const output: TaggedObject = Object.create(null)
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(namespace.kind)
    if (options.requireTag && !fieldTag) {
      continue
    }

    if (!hasOwnKey(value, field.key)) {
      continue
    }

    const fieldValue = value[field.key]
    if (typeof fieldValue === 'undefined') {
      continue
    }

    output[getWireKey(field.key, fieldTag)] = encodeTaggedField(field.struct, fieldValue, namespace, options)
  }

  return output
}

export function decodeObjectByTag(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions = {},
): unknown {
  if (!isObjectStruct(struct)) {
    return parseStructValue(struct, decodeTaggedField(struct, value, namespace, options, []))
  }

  return parseStructValue(struct, normalizeObjectByTag(struct, value, namespace, options, []))
}

function normalizeObjectByTag(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions,
  path: Path,
): TaggedObject {
  assertPlainObject(value, `${namespace.name} decode expects object value`)

  const normalized: TaggedObject = Object.create(null)
  for (const field of getStructFields(struct)) {
    const fieldTag = field.tags.get(namespace.kind)
    if (options.requireTag && !fieldTag) {
      continue
    }

    const wireKey = getWireKey(field.key, fieldTag)
    if (!hasOwnKey(value, wireKey)) {
      continue
    }

    const rawValue = value[wireKey]
    normalized[field.key] = decodeTaggedField(field.struct, rawValue, namespace, options, [...path, field.key])
  }

  return normalized
}

export function getWireKey(fieldKey: string, fieldTag: FieldTag | undefined): string {
  if (typeof fieldTag?.value === 'string') {
    return fieldTag.value
  }
  return fieldKey
}

export function assertPlainObject(value: unknown, message: string): asserts value is TaggedObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(message)
  }
}

function encodeTaggedField(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions,
): unknown {
  if (isObjectStruct(struct)) {
    return encodeObjectByTag(struct, value, namespace, options)
  }

  return encodeValue(struct as RuntimeSchema, value, {
    encodeObject: (objectStruct, objectValue, encodeChild) => {
      const output: TaggedObject = Object.create(null)
      for (const field of getStructFields(objectStruct)) {
        const fieldTag = field.tags.get(namespace.kind)
        if (options.requireTag && !fieldTag) {
          continue
        }

        if (!hasOwnKey(objectValue, field.key)) {
          continue
        }

        const fieldValue = objectValue[field.key]
        if (typeof fieldValue === 'undefined') {
          continue
        }

        output[getWireKey(field.key, fieldTag)] = encodeChild(field.struct as RuntimeSchema, fieldValue)
      }
      return output
    },
  })
}

function decodeTaggedField(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions,
  path: Path,
): unknown {
  const runtime = resolveRuntimeSchema(struct as RuntimeSchema)
  const definition = runtime[DEFINITION]

  switch (definition.kind) {
    case 'object':
      return normalizeObjectByTag(runtime, value, namespace, options, path)

    case 'array':
      return Array.isArray(value)
        ? value.map((item, index) => decodeTaggedField(definition.item, item, namespace, options, [...path, index]))
        : value

    case 'tuple':
      return Array.isArray(value)
        ? value.map((item, index) => {
            const itemStruct = definition.items[index]
            return itemStruct ? decodeTaggedField(itemStruct, item, namespace, options, [...path, index]) : item
          })
        : value

    case 'record': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: TaggedObject = Object.create(null)
      for (const [key, entry] of Object.entries(value)) {
        output[key] = decodeTaggedField(definition.value, entry, namespace, options, [...path, key])
      }
      return output
    }

    case 'or':
      for (const option of definition.options) {
        const decoded = tryDecodeTaggedField(option, value, namespace, options, path)
        if (!decoded.ok) {
          continue
        }
        const optionRuntime = resolveRuntimeSchema(option as RuntimeSchema)
        if (matchesDefinition(optionRuntime[DEFINITION], decoded.value, optionRuntime)) {
          return decoded.value
        }
      }
      return value

    case 'discriminatedUnion':
      for (const option of definition.options) {
        const decoded = tryDecodeTaggedField(option, value, namespace, options, path)
        if (decoded.ok && isPlainObject(decoded.value) && definition.map.get(decoded.value[definition.discriminator]) === option) {
          return decoded.value
        }
      }
      return value

    case 'intersection':
      return decodeTaggedField(definition.right, value, namespace, options, path)

    default:
      return value
  }
}

function tryDecodeTaggedField(
  struct: SchemaLike<any, any, boolean>,
  value: unknown,
  namespace: TagNamespace,
  options: TagObjectOptions,
  path: Path,
): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: decodeTaggedField(struct, value, namespace, options, path) }
  } catch {
    return { ok: false }
  }
}
