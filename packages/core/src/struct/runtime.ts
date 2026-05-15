import { encodeValue } from './encode'
import { StructError } from './errors'
import { parseValue, safeZeroValue } from './parse'
import { parseValueAsync } from './parse_async'
import { DEFINITION, TYPES } from './symbols'
import type { FieldTagOption } from './tag'
import type {
  ParseOptions,
  ParseResult,
  PrimitiveDefinition,
  PrimitiveKind,
  RuntimeParseTuple,
  RuntimeSchema,
  Schema,
  SchemaDefinition,
  SchemaFlags,
  StandardSchemaProps,
} from './types'

export function createPrimitiveSchema<TInput, TOutput = TInput>(
  definition: Omit<PrimitiveDefinition<PrimitiveKind, TInput, TOutput>, 'flags'>,
): Schema<TInput | undefined, TOutput> {
  return makeSchema({
    ...definition,
    flags: DEFAULT_FLAGS,
  }) as unknown as Schema<TInput | undefined, TOutput>
}

export const DEFAULT_FLAGS: SchemaFlags = { nullable: false, optional: false }

function toStandardResult(result: ParseResult<unknown>) {
  return result.ok ? { value: result.value } : { issues: result.issues.map(item => ({ message: item.message, path: item.path })) }
}

export function makeSchema(definition: SchemaDefinition): RuntimeSchema {
  let standardCache: StandardSchemaProps<unknown, unknown> | undefined
  const schema: RuntimeSchema = {
    [DEFINITION]: definition,
    [TYPES]: undefined as never,
    _struct: undefined as never,
    get ['~standard'](): StandardSchemaProps<unknown, unknown> {
      if (!standardCache) {
        standardCache = {
          validate(value: unknown) {
            return toStandardResult(parseValue(schema, value, [], 'value'))
          },
          vendor: 'defjs',
          version: 1,
        }
      }
      return standardCache
    },
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
    parse(value: unknown, options?: ParseOptions): RuntimeParseTuple {
      const result = parseValue(schema, value, [], 'value', options)
      if (result.ok) {
        return [null, result.value]
      }
      return [new StructError(result.issues), safeZeroValue(schema)]
    },
    async parseAsync(value: unknown, options?: ParseOptions): Promise<RuntimeParseTuple> {
      const result = await parseValueAsync(schema, value, [], 'value', options)
      if (result.ok) {
        return [null, result.value]
      }
      return [new StructError(result.issues), safeZeroValue(schema)]
    },
    brand() {
      // Brand is primarily a type-level phantom; flag it at runtime so introspection / dev tools can detect it.
      return makeSchema({
        ...definition,
        flags: { ...definition.flags, branded: true },
      })
    },
    encode(value: unknown) {
      return encodeValue(schema, value)
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
