import type { ArraySchema, SchemaLike } from './schema'
import { createArraySchema } from './schema'

export function _array<const T extends SchemaLike>(item: T): ArraySchema<T> {
  return createArraySchema(item)
}
