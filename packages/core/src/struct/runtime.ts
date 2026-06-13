import { DEFINITION, TYPES } from './symbols'
import type { FieldTagOption } from './tag'
import type { PrimitiveDefinition, PrimitiveKind, RuntimeSchema, Schema, SchemaDefinition, SchemaFlags, SchemaLike } from './types'

export function createPrimitiveSchema<TInput, TOutput = TInput>(
  definition: Omit<PrimitiveDefinition<PrimitiveKind, TInput, TOutput>, 'flags'>,
): Schema<TInput | undefined, TOutput> {
  return castSchema<Schema<TInput | undefined, TOutput>>(
    makeSchema({
      ...definition,
      flags: DEFAULT_FLAGS,
    } as SchemaDefinition),
  )
}

export const DEFAULT_FLAGS: SchemaFlags = { nullable: false, optional: false }

export function castSchema<TSchema extends SchemaLike>(schema: SchemaLike): TSchema {
  // Type boundary: all schema runtime objects are created by makeSchema/createPrimitiveSchema; the branded generic surface
  // exists only for compile-time input/output inference and has no distinct runtime representation.
  return schema as TSchema
}

export function makeSchema(definition: SchemaDefinition): RuntimeSchema {
  const schema: RuntimeSchema = {
    [DEFINITION]: definition,
    [TYPES]: undefined as never,
    _struct: undefined as never,
    null() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          nullable: true,
        },
      })
    },
    nullish() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          nullable: true,
          optional: true,
        },
      })
    },
    optional() {
      return makeSchema({
        ...definition,
        flags: {
          ...definition.flags,
          optional: true,
        },
      })
    },
    tag(...options: FieldTagOption[]) {
      if (options.some((option) => typeof option !== 'function')) {
        throw new TypeError('tag() requires tag option functions')
      }

      return makeSchema({
        ...definition,
        tagOptions: [...(definition.tagOptions ?? []), ...options],
      })
    },
  }

  Object.defineProperty(schema, '_struct', {
    enumerable: false,
    value: undefined,
  })

  return schema
}
