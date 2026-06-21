import { encodeValue } from './encode'
import { StructError } from './errors'
import { resolveStructFields } from './fields'
import { isStruct } from './guards'
import { parseValue, safeZeroValue } from './parse'
import { assertStruct, resolveObjectShape } from './shape'
import { DEFINITION } from './symbols'
import type { ObjectStruct, ObjectShape, ParseTuple, RuntimeStruct, StructLike } from './types'

export interface StructField {
  readonly alias: string | undefined
  readonly key: string
  readonly struct: StructLike<unknown, unknown, boolean>
}

export function isObjectStruct(value: unknown): value is ObjectStruct<ObjectShape> {
  return isStruct(value) && (value as RuntimeStruct)[DEFINITION].kind === 'object'
}

export function getStructFields(struct: StructLike<unknown, unknown, boolean>): readonly StructField[] {
  assertStruct(struct, 'struct')
  const runtime = struct as unknown as RuntimeStruct
  const definition = runtime[DEFINITION]
  if (definition.kind !== 'object') {
    throw new TypeError('object struct is required')
  }

  resolveObjectShape(runtime, definition)
  return Object.freeze(
    resolveStructFields(runtime, definition).map((field) =>
      Object.freeze({
        alias: field.alias,
        key: field.key,
        struct: field.struct as unknown as StructLike<unknown, unknown, boolean>,
      }),
    ),
  )
}

export function encodeStructValue(struct: StructLike<unknown, unknown, boolean>, value: unknown): unknown {
  assertStruct(struct, 'struct')
  return encodeValue(struct as unknown as RuntimeStruct, value)
}

export function parseStructTuple<S extends StructLike<unknown, unknown, boolean>>(
  struct: S,
  value: unknown,
): ParseTuple<S['_struct']['output']> {
  assertStruct(struct, 'struct')
  const runtime = struct as unknown as RuntimeStruct
  const result = parseValue(runtime, value, [], 'value')
  if (result.ok) {
    return [null, result.value as unknown as S['_struct']['output']]
  }
  return [new StructError(result.issues), safeZeroValue(runtime) as unknown as S['_struct']['output']]
}

export function parseStructValue(struct: StructLike<unknown, unknown, boolean>, value: unknown): unknown {
  assertStruct(struct, 'struct')
  const [error, output] = parseStructTuple(struct, value)
  if (error) {
    throw error
  }
  return output
}
