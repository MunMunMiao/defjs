import { selectUnionOptions } from './match'
import { getRequestSections } from './request'

export { matchesDefinition } from './match'
import { resolveObjectShape, resolveRuntimeStruct } from './shape'
import { DEFINITION } from './symbols'
import type { RuntimeStruct, StructDefinition } from './types'
import { hasOwnKey, isObjectIntersectionStruct, isPlainObject } from './utils'

export interface EncodeOptions {
  encodeObject?: (
    struct: RuntimeStruct,
    value: { [key: string]: unknown },
    encodeChild: (struct: RuntimeStruct, value: unknown) => unknown,
  ) => unknown
  selectUnionOptions?: typeof selectUnionOptions
}

const NO_FLAG_MATCH = Symbol('NO_FLAG_MATCH')

function encodeFlagValue(definition: StructDefinition, value: unknown): unknown | typeof NO_FLAG_MATCH {
  if (value === null && (definition.kind === 'null' || definition.flags.nullable)) {
    return null
  }
  if (typeof value === 'undefined' && definition.flags.optional) {
    return undefined
  }
  return NO_FLAG_MATCH
}

function sameEncodedShape(
  leftStruct: RuntimeStruct,
  leftValue: unknown,
  rightStruct: RuntimeStruct,
  rightValue: unknown,
  options: EncodeOptions,
): boolean {
  return sameWireValue(
    getComparableEncodedValue(leftStruct, leftValue, options),
    getComparableEncodedValue(rightStruct, rightValue, options),
  )
}

function sameWireValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((item, index) => sameWireValue(item, right[index]))
    )
  }
  if (!isPlainObject(left) || !isPlainObject(right)) {
    return false
  }

  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => hasOwnKey(right, key) && sameWireValue(left[key], right[key]))
}

function getComparableEncodedValue(struct: RuntimeStruct, value: unknown, options: EncodeOptions): unknown {
  const definition = struct[DEFINITION]
  if (options.encodeObject && definition.alias && (definition.kind === 'array' || definition.kind === 'object')) {
    return { alias: definition.alias, value }
  }
  return value
}

export function encodeValue(struct: RuntimeStruct, value: unknown, options: EncodeOptions = {}): unknown {
  const definition = struct[DEFINITION]
  const flagged = encodeFlagValue(definition, value)
  if (flagged !== NO_FLAG_MATCH) {
    return flagged
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
    case 'null':
    case 'enum':
    case 'literal':
      return value

    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'number':
    case 'string':
      return definition.encode ? definition.encode(value as never) : value

    case 'array':
      return Array.isArray(value) ? value.map((item) => encodeValue(definition.item as unknown as RuntimeStruct, item, options)) : value

    case 'tuple':
      return Array.isArray(value)
        ? value.map((item, index) =>
            index < definition.items.length ? encodeValue(definition.items[index] as unknown as RuntimeStruct, item, options) : item,
          )
        : value

    case 'record': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: { [key: string]: unknown } = Object.create(null)
      for (const [key, entry] of Object.entries(value)) {
        output[key] = encodeValue(definition.value as unknown as RuntimeStruct, entry, options)
      }
      return output
    }

    case 'object': {
      if (!isPlainObject(value)) {
        return value
      }
      if (options.encodeObject) {
        return options.encodeObject(struct, value, (fieldStruct, fieldValue) => encodeValue(fieldStruct, fieldValue, options))
      }
      const output: { [key: string]: unknown } = Object.create(null)
      const shape = resolveObjectShape(struct, definition)
      for (const [key, fieldStruct] of Object.entries(shape)) {
        if (!hasOwnKey(value, key)) {
          continue
        }
        output[key] = encodeValue(fieldStruct as unknown as RuntimeStruct, value[key], options)
      }
      return output
    }

    case 'request': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: { [key: string]: unknown } = Object.create(null)
      for (const section of getRequestSections(definition)) {
        const key = section.key
        const sectionStruct = section.struct
        if (hasOwnKey(value, key)) {
          output[key] = encodeValue(sectionStruct, value[key], options)
        }
      }
      return output
    }

    case 'requestBody':
      return encodeValue(definition.struct as unknown as RuntimeStruct, value, options)

    case 'or': {
      const selectOptions = options.selectUnionOptions ?? selectUnionOptions
      const matches = selectOptions(definition.options, value)
      const firstOption = matches[0]
      if (!firstOption) {
        return value
      }

      const first = encodeValue(firstOption, value, options)
      for (let index = 1; index < matches.length; index += 1) {
        const option = matches[index] as RuntimeStruct
        const encoded = encodeValue(option, value, options)
        if (!sameEncodedShape(firstOption, first, option, encoded, options)) {
          throw new TypeError('ambiguous union encode: multiple union branches match with different wire output')
        }
      }
      return first
    }

    case 'discriminatedUnion': {
      if (isPlainObject(value)) {
        const matched = definition.map.get((value as { [key: string]: unknown })[definition.discriminator])
        if (matched) {
          return encodeValue(matched as unknown as RuntimeStruct, value, options)
        }
      }
      return value
    }

    case 'intersection': {
      const leftEncoded = encodeValue(resolveRuntimeStruct(definition.left), value, options)
      const rightEncoded = encodeValue(resolveRuntimeStruct(definition.right), value, options)
      return isObjectIntersectionStruct(definition.left) &&
        isObjectIntersectionStruct(definition.right) &&
        isPlainObject(leftEncoded) &&
        isPlainObject(rightEncoded)
        ? { ...leftEncoded, ...rightEncoded }
        : rightEncoded
    }
  }
}
