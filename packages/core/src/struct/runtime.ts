import { DEFINITION, TYPES } from './symbols'
import type { FieldTagOption } from './tag'
import type { PrimitiveDefinition, PrimitiveKind, RuntimeSchema, Schema, SchemaDefinition, SchemaFlags } from './types'

export function createPrimitiveSchema<TInput, TOutput = TInput>(
  definition: Omit<PrimitiveDefinition<PrimitiveKind, TInput, TOutput>, 'flags'>,
): Schema<TInput | undefined, TOutput> {
  return makeSchema({
    ...definition,
    flags: DEFAULT_FLAGS,
  }) as unknown as Schema<TInput | undefined, TOutput>
}

export const DEFAULT_FLAGS: SchemaFlags = { nullable: false, optional: false }

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
      if (options.some(option => typeof option !== 'function')) {
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
