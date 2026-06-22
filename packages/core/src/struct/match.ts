import { resolveObjectShape } from './shape'
import { DEFINITION } from './symbols'
import type { RuntimeStruct, StructDefinition, StructLike } from './types'
import { hasOwnKey, isPlainObject } from './utils'

export function matchesRuntimeValue(struct: RuntimeStruct, value: unknown): boolean {
  return matchesDefinition(struct[DEFINITION], value, struct)
}

export function selectUnionOptions(options: readonly StructLike<unknown, unknown, boolean>[], value: unknown): RuntimeStruct[] {
  const matches: RuntimeStruct[] = []
  for (const option of options) {
    const runtime = option as unknown as RuntimeStruct
    if (matchesRuntimeValue(runtime, value)) {
      matches.push(runtime)
    }
  }
  return matches
}

export function selectUnionOption(options: readonly StructLike<unknown, unknown, boolean>[], value: unknown): RuntimeStruct | undefined {
  return selectUnionOptions(options, value)[0]
}

export function matchesDefinition(definition: StructDefinition, value: unknown, struct: RuntimeStruct): boolean {
  if (value === null) {
    return definition.kind === 'null' || definition.flags.nullable
  }
  if (typeof value === 'undefined') {
    return definition.flags.optional
  }

  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return true
    case 'arrayBuffer':
    case 'bigint':
    case 'blob':
    case 'boolean':
    case 'date':
    case 'file':
    case 'null':
    case 'number':
    case 'string':
      return (definition.runtimeIs ?? definition.is)(value)
    case 'literal':
      return Object.is(value, definition.value)
    case 'enum':
      return definition.values.includes(value as never)
    case 'array':
      return Array.isArray(value) && value.every((item) => matchesRuntimeValue(definition.item as unknown as RuntimeStruct, item))
    case 'tuple':
      return (
        Array.isArray(value) &&
        value.length === definition.items.length &&
        definition.items.every((item, index) => matchesRuntimeValue(item as unknown as RuntimeStruct, value[index]))
      )
    case 'object':
      return isPlainObject(value) && matchesObjectValue(struct, value)
    case 'request':
      return isPlainObject(value)
    case 'requestBody':
      return matchesRuntimeValue(definition.struct as unknown as RuntimeStruct, value)
    case 'record':
      return (
        isPlainObject(value) &&
        Object.values(value).every((entry) => matchesRuntimeValue(definition.value as unknown as RuntimeStruct, entry))
      )
    case 'or':
      return definition.options.some((option) => matchesRuntimeValue(option as unknown as RuntimeStruct, value))
    case 'discriminatedUnion':
      return isPlainObject(value) && definition.map.has(value[definition.discriminator])
    case 'intersection': {
      const left = definition.left as RuntimeStruct
      const right = definition.right as RuntimeStruct
      return matchesRuntimeValue(left, value) && matchesRuntimeValue(right, value)
    }
  }
}

function matchesObjectValue(struct: RuntimeStruct, value: { [key: string]: unknown }): boolean {
  const definition = struct[DEFINITION]
  if (definition.kind !== 'object') {
    return true
  }

  const shape = resolveObjectShape(struct, definition)
  for (const [key, fieldStruct] of Object.entries(shape)) {
    const field = fieldStruct as unknown as RuntimeStruct
    const fieldDefinition = field[DEFINITION]
    if (!hasOwnKey(value, key)) {
      if (isRequiredField(fieldDefinition)) {
        return false
      }
      continue
    }

    if (!matchesRuntimeValue(field, value[key])) {
      return false
    }
  }

  return true
}

function isRequiredField(definition: StructDefinition): boolean {
  return !definition.flags.optional && !definition.flags.nullable
}
