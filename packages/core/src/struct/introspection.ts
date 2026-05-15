import { encodeValue } from './encode'
import { isStruct } from './guards'
import { assertSchema, resolveObjectShape, resolveRuntimeSchema } from './shape'
import { DEFINITION } from './symbols'
import { type FieldTag, materializeFieldTags } from './tag'
import type { ObjectSchema, ObjectShape, ParseOptions, RuntimeSchema, SchemaLike } from './types'

export function getFieldTags(field: SchemaLike<any, any, boolean>, fieldKey: string): ReadonlyMap<symbol, FieldTag> {
  assertSchema(field, 'field')
  const definition = (field as RuntimeSchema)[DEFINITION]
  return materializeFieldTags(fieldKey, definition.tagOptions ?? [])
}

export function getFieldTag(field: SchemaLike<any, any, boolean>, kind: symbol, fieldKey: string): FieldTag | undefined {
  return getFieldTags(field, fieldKey).get(kind)
}

export interface StructField {
  readonly key: string
  readonly struct: SchemaLike<any, any, boolean>
  readonly tags: ReadonlyMap<symbol, FieldTag>
}

export function isObjectStruct(value: unknown): value is ObjectSchema<ObjectShape> {
  return isStruct(value) && resolveRuntimeSchema(value as RuntimeSchema)[DEFINITION].kind === 'object'
}

export function getStructFields(struct: SchemaLike<any, any, boolean>): readonly StructField[] {
  assertSchema(struct, 'struct')
  const runtime = resolveRuntimeSchema(struct as RuntimeSchema)
  const definition = runtime[DEFINITION]
  if (definition.kind !== 'object') {
    throw new TypeError('object struct is required')
  }

  const shape = resolveObjectShape(runtime, definition)
  return Object.entries(shape).map(([key, field]) => ({
    key,
    struct: field as SchemaLike<any, any, boolean>,
    tags: getFieldTags(field as SchemaLike<any, any, boolean>, key),
  }))
}

export function encodeStructValue(struct: SchemaLike<any, any, boolean>, value: unknown): unknown {
  assertSchema(struct, 'struct')
  return encodeValue(struct as RuntimeSchema, value)
}

export function parseStructValue(struct: SchemaLike<any, any, boolean>, value: unknown, options?: ParseOptions): unknown {
  assertSchema(struct, 'struct')
  const [error, output] = (struct as RuntimeSchema).parse(value, options)
  if (error) {
    throw error
  }
  return output
}
