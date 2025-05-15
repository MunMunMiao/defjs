import { type BaseMetadata, type Schema, _metadata, createSchema, isSchema } from './schema'

export type ArrayOutput<T> = T extends Schema<infer O> ? O[] : never

export interface ArrayMetadata<T> extends BaseMetadata<ArrayOutput<T>> {
  kind: 'array'
  shape: T
}

export interface ArraySchema<T> extends Schema {
  readonly [_metadata]: ArrayMetadata<T>
}

export function _array<T extends Schema>(shape: () => T): ArraySchema<T>
export function _array<T extends Schema>(shape: T): ArraySchema<T>
export function _array<T extends Schema>(shape: () => T | T): ArraySchema<T> {
  let _shape: T

  if (typeof shape === 'function') {
    _shape = shape()
  } else {
    _shape = shape
  }

  if (!isSchema(_shape)) {
    throw new Error('schema must be a Schema')
  }

  const md = {
    kind: 'array',
    shape: _shape,
    default: Array(),
  } as ArrayMetadata<T>

  return createSchema(md) as ArraySchema<T>
}
