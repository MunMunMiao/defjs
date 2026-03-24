import type { RecordSchema, SchemaLike } from './schema'
import { createRecordSchema } from './schema'

export function _record<const T extends SchemaLike>(value: T): RecordSchema<T> {
  return createRecordSchema(value)
}
