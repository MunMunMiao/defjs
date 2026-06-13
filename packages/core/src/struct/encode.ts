import { resolveObjectShape } from './shape'
import { DEFINITION } from './symbols'
import type { RuntimeSchema, SchemaDefinition } from './types'
import { hasOwnKey, isPlainObject } from './utils'

export type EncodeChild = (schema: RuntimeSchema, value: unknown) => unknown

export interface EncodeOptions {
  encodeObject?: (schema: RuntimeSchema, value: Record<string, unknown>, encodeChild: EncodeChild) => unknown
}

export function encodeValue(schema: RuntimeSchema, value: unknown, options: EncodeOptions = {}): unknown {
  const definition = schema[DEFINITION]

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
      return Array.isArray(value) ? value.map((item) => encodeValue(definition.item as unknown as RuntimeSchema, item, options)) : value

    case 'tuple':
      return Array.isArray(value)
        ? value.map((item, index) =>
            index < definition.items.length ? encodeValue(definition.items[index] as unknown as RuntimeSchema, item, options) : item,
          )
        : value

    case 'record': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: Record<string, unknown> = Object.create(null)
      for (const [key, entry] of Object.entries(value)) {
        output[key] = encodeValue(definition.value as unknown as RuntimeSchema, entry, options)
      }
      return output
    }

    case 'object': {
      if (!isPlainObject(value)) {
        return value
      }
      if (options.encodeObject) {
        return options.encodeObject(schema, value, (fieldSchema, fieldValue) => encodeValue(fieldSchema, fieldValue, options))
      }
      const output: Record<string, unknown> = Object.create(null)
      const shape = resolveObjectShape(schema, definition)
      for (const [key, fieldSchema] of Object.entries(shape)) {
        if (!hasOwnKey(value, key)) {
          continue
        }
        output[key] = encodeValue(fieldSchema as unknown as RuntimeSchema, value[key], options)
      }
      return output
    }

    case 'request': {
      if (!isPlainObject(value)) {
        return value
      }
      const output: Record<string, unknown> = Object.create(null)
      if (definition.path && hasOwnKey(value, 'path')) {
        output['path'] = encodeValue(definition.path as unknown as RuntimeSchema, value['path'], options)
      }
      if (definition.query && hasOwnKey(value, 'query')) {
        output['query'] = encodeValue(definition.query as unknown as RuntimeSchema, value['query'], options)
      }
      if (definition.headers && hasOwnKey(value, 'headers')) {
        output['headers'] = encodeValue(definition.headers as unknown as RuntimeSchema, value['headers'], options)
      }
      if (definition.body && hasOwnKey(value, 'body')) {
        output['body'] = encodeValue(definition.body as unknown as RuntimeSchema, value['body'], options)
      }
      return output
    }

    case 'requestBody':
      return encodeValue(definition.schema as unknown as RuntimeSchema, value, options)

    case 'or': {
      for (const opt of definition.options) {
        const optDef = (opt as unknown as RuntimeSchema)[DEFINITION]
        if (matchesDefinition(optDef, value, opt as unknown as RuntimeSchema)) {
          return encodeValue(opt as unknown as RuntimeSchema, value, options)
        }
      }
      return value
    }

    case 'discriminatedUnion': {
      if (isPlainObject(value)) {
        const matched = definition.map.get((value as Record<string, unknown>)[definition.discriminator])
        if (matched) {
          return encodeValue(matched as unknown as RuntimeSchema, value, options)
        }
      }
      return value
    }

    case 'intersection':
      return encodeValue(definition.right as unknown as RuntimeSchema, value, options)
  }
}

// Best-effort runtime type guard used by encode() to route union / intersection / discriminatedUnion to the right branch.
// Use strict native type checks instead of `definition.is`: some primitive predicates accept wire forms
// such as string dates or bigint strings, while encode() receives parsed runtime values.
export function matchesDefinition(definition: SchemaDefinition, value: unknown, schema?: RuntimeSchema): boolean {
  switch (definition.kind) {
    case 'any':
    case 'unknown':
      return true
    case 'null':
      return value === null
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'bigint':
      return typeof value === 'bigint'
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime())
    case 'blob':
      return typeof Blob !== 'undefined' && value instanceof Blob
    case 'file':
      return typeof File !== 'undefined' && value instanceof File
    case 'arrayBuffer':
      return value instanceof ArrayBuffer
    case 'literal':
      return Object.is(value, definition.value)
    case 'enum':
      return definition.values.includes(value as never)
    case 'array': {
      if (!Array.isArray(value)) {
        return false
      }
      const itemSchema = definition.item as unknown as RuntimeSchema
      for (const item of value) {
        if (!matchesFieldValue(itemSchema, item)) {
          return false
        }
      }
      return true
    }
    case 'tuple':
      if (!Array.isArray(value) || value.length !== definition.items.length) {
        return false
      }
      for (let index = 0; index < definition.items.length; index += 1) {
        if (!matchesFieldValue(definition.items[index] as unknown as RuntimeSchema, value[index])) {
          return false
        }
      }
      return true
    case 'object':
      if (!isPlainObject(value)) {
        return false
      }
      if (!schema) {
        return true
      }
      return matchesObjectValue(schema, value)

    case 'request':
      return isPlainObject(value)

    case 'requestBody':
      return matchesFieldValue(definition.schema as unknown as RuntimeSchema, value)

    case 'record': {
      if (!isPlainObject(value)) {
        return false
      }
      const valueSchema = definition.value as unknown as RuntimeSchema
      for (const entry of Object.values(value)) {
        if (!matchesFieldValue(valueSchema, entry)) {
          return false
        }
      }
      return true
    }
    case 'or':
      return definition.options.some((opt) =>
        matchesDefinition((opt as unknown as RuntimeSchema)[DEFINITION], value, opt as unknown as RuntimeSchema),
      )
    case 'discriminatedUnion':
      return isPlainObject(value) && definition.map.has((value as Record<string, unknown>)[definition.discriminator])
    case 'intersection':
      return (
        matchesDefinition((definition.left as unknown as RuntimeSchema)[DEFINITION], value, definition.left as unknown as RuntimeSchema) &&
        matchesDefinition((definition.right as unknown as RuntimeSchema)[DEFINITION], value, definition.right as unknown as RuntimeSchema)
      )
  }
}

function matchesObjectValue(schema: RuntimeSchema, value: Record<string, unknown>): boolean {
  const definition = schema[DEFINITION]
  if (definition.kind !== 'object') {
    return true
  }

  const shape = resolveObjectShape(schema, definition)
  for (const [key, fieldSchema] of Object.entries(shape)) {
    const fieldDefinition = (fieldSchema as unknown as RuntimeSchema)[DEFINITION]
    if (!hasOwnKey(value, key)) {
      if (isRequiredField(fieldDefinition)) {
        return false
      }
      continue
    }

    const fieldValue = value[key]
    if (fieldDefinition.kind === 'literal' && !Object.is(fieldValue, fieldDefinition.value)) {
      return false
    }
    if (fieldDefinition.kind === 'enum' && !fieldDefinition.values.includes(fieldValue as never)) {
      return false
    }
    if (!matchesFieldValue(fieldSchema as unknown as RuntimeSchema, fieldValue)) {
      return false
    }
  }

  return true
}

function matchesFieldValue(schema: RuntimeSchema, value: unknown): boolean {
  return matchesDefinition(schema[DEFINITION], value, schema)
}

function isRequiredField(definition: SchemaDefinition): boolean {
  return !definition.flags.optional && !definition.flags.nullable
}
