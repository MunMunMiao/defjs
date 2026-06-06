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
  createFormDataBodySchema,
  createIntersectionSchema,
  createJsonBodySchema,
  createLiteralSchema,
  createNullSchema,
  createNumberSchema,
  createObjectEnumSchema,
  createObjectSchema,
  createRecordSchema,
  createRequestSchema,
  createStringSchema,
  createTextBodySchema,
  createTupleSchema,
  createUnionSchema,
  createUnknownSchema,
  createUrlencodedBodySchema,
} from './constructors'
import type { Schema, SchemaLike, UnionSchema } from './types'

type EnumValue<T> = T extends readonly (infer U extends string)[]
  ? U
  : T extends Record<string, infer U extends number | string>
    ? U
    : never

function structEnum<const T extends readonly [string, ...string[]]>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
function structEnum<const T extends Record<string, number | string>>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
function structEnum(value: Record<string, number | string> | readonly [string, ...string[]]) {
  if (Array.isArray(value)) {
    return createEnumSchema(value as readonly [string, ...string[]])
  }

  return createObjectEnumSchema(value as Record<string, number | string>)
}

function structOr<const T extends readonly [SchemaLike, ...SchemaLike[]]>(...options: T): UnionSchema<T> {
  return createUnionSchema(options)
}

export const struct = {
  any: createAnySchema,
  array: createArraySchema,
  arrayBuffer: createArrayBufferSchema,
  bigint: createBigIntSchema,
  blob: createBlobSchema,
  boolean: createBooleanSchema,
  date: createDateSchema,
  discriminatedUnion: createDiscriminatedUnionSchema,
  enum: structEnum,
  file: createFileSchema,
  formData: createFormDataBodySchema,
  intersection: createIntersectionSchema,
  json: createJsonBodySchema,
  literal: createLiteralSchema,
  null: createNullSchema,
  number: createNumberSchema,
  object: createObjectSchema,
  or: structOr,
  record: createRecordSchema,
  request: createRequestSchema,
  string: createStringSchema,
  text: createTextBodySchema,
  tuple: createTupleSchema,
  unknown: createUnknownSchema,
  urlencoded: createUrlencodedBodySchema,
} as const
