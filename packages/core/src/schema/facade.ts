import type { Schema, SchemaLike, UnionSchema } from './schema'
import {
  createAnySchema,
  createArrayBufferSchema,
  createArraySchema,
  createBigIntSchema,
  createBlobSchema,
  createBooleanSchema,
  createDateSchema,
  createDiscriminatedUnionSchema,
  createEnumSchema,
  createFileSchema,
  createIntersectionSchema,
  createLazySchema,
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
  bigint: createBigIntSchema,
  blob: createBlobSchema,
  boolean: createBooleanSchema,
  date: createDateSchema,
  discriminatedUnion: createDiscriminatedUnionSchema,
  enum: schemaEnum,
  file: createFileSchema,
  intersection: createIntersectionSchema,
  lazy: createLazySchema,
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
