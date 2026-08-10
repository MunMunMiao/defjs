import { DEFINITION } from './symbols'
import type { InternalParseResult, Path, PrimitiveKind, RuntimeStruct, Struct, StructDefinition, StructFlags, StructLike } from './types'

export interface PrimitiveDefinitionInput<K extends PrimitiveKind, TInput, TOutput = TInput> {
  decode?: (value: TInput, path: Path) => InternalParseResult<TOutput>
  encode?: (value: TOutput) => unknown
  expected: string
  is: (value: unknown) => value is TInput
  kind: K
  alias?: string
  runtimeIs?: (value: unknown) => boolean
}

export function createPrimitiveStruct<TInput, TOutput = TInput>(
  definition: PrimitiveDefinitionInput<PrimitiveKind, TInput, TOutput>,
): Struct<TInput, TOutput> {
  return castStruct<Struct<TInput, TOutput>>(
    makeStruct({
      ...definition,
      flags: DEFAULT_FLAGS,
    } as StructDefinition),
  )
}

export const DEFAULT_FLAGS: StructFlags = { nullable: false, optional: false }

export function castStruct<TStruct extends StructLike>(struct: StructLike): TStruct {
  // Type boundary: all struct runtime objects are created by makeStruct/createPrimitiveStruct; the branded generic surface
  // exists only for compile-time input/output inference and has no distinct runtime representation.
  return struct as TStruct
}

export function makeStruct(definition: StructDefinition): RuntimeStruct {
  const withFlags = (flags: Partial<StructFlags>): RuntimeStruct =>
    makeStruct({
      ...definition,
      flags: {
        ...definition.flags,
        ...flags,
      },
    })

  const struct: RuntimeStruct = {
    [DEFINITION]: definition,
    _struct: undefined as never,
    alias(name: string) {
      if (typeof name !== 'string') {
        throw new TypeError('alias() requires a string name')
      }

      return makeStruct({
        ...definition,
        alias: name,
      })
    },
    null() {
      return withFlags({ nullable: true })
    },
    nullish() {
      return withFlags({ nullable: true, optional: true })
    },
    optional() {
      return withFlags({ optional: true })
    },
  }

  Object.defineProperty(struct, '_struct', {
    enumerable: false,
    value: undefined,
  })

  return struct
}
