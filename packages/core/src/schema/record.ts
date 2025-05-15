import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'
import type { Infer } from './util'

export type RecordOutput<T> = {
  [key: string]: Infer<T>
}

export interface RecordMetadata<T> extends BaseMetadata<RecordOutput<T>> {
  kind: 'record'
  shape: T
}

export interface RecordSchema<T> extends Schema {
  readonly [_metadata]: RecordMetadata<T>
}

export function _record<T extends Schema>(shape: T): RecordSchema<T> {
  const md = {
    kind: 'record',
    shape,
    default: Object(),
  } as RecordMetadata<T>

  return createSchema(md) as RecordSchema<T>
}
