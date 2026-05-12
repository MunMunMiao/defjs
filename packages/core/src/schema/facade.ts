import type { Schema, SchemaLike, UnionSchema } from './schema'
import {
  createAnySchema,
  createArrayBufferSchema,
  createArraySchema,
  createBlobSchema,
  createBooleanSchema,
  createEnumSchema,
  createFileSchema,
  createLiteralSchema,
  createNullSchema,
  createNumberSchema,
  createObjectEnumSchema,
  createObjectSchema,
  createRecordSchema,
  createStringSchema,
  createTupleSchema,
  createUnionSchema,
  createUnknownSchema,
} from './schema'

type EnumValue<T> = T extends readonly (infer U extends string)[]
  ? U
  : T extends Record<string, infer U extends number | string>
    ? U
    : never

function schemaEnum<const T extends readonly [string, ...string[]]>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
function schemaEnum<const T extends Record<string, number | string>>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
function schemaEnum(value: Record<string, number | string> | readonly [string, ...string[]]) {
  if (Array.isArray(value)) {
    return createEnumSchema(value as readonly [string, ...string[]])
  }

  return createObjectEnumSchema(value as Record<string, number | string>)
}

function schemaOr<const T extends readonly [SchemaLike, ...SchemaLike[]]>(...options: T): UnionSchema<T> {
  return createUnionSchema(options)
}

export const schema = {
  any: createAnySchema,
  array: createArraySchema,
  arrayBuffer: createArrayBufferSchema,
  blob: createBlobSchema,
  boolean: createBooleanSchema,
  enum: schemaEnum,
  file: createFileSchema,
  literal: createLiteralSchema,
  null: createNullSchema,
  number: createNumberSchema,
  object: createObjectSchema,
  or: schemaOr,
  record: createRecordSchema,
  string: createStringSchema,
  tuple: createTupleSchema,
  unknown: createUnknownSchema,
} as const
