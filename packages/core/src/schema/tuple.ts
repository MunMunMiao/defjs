import type { SchemaLike, TupleSchema } from './schema'
import { createTupleSchema } from './schema'

export function _tuple<const T extends readonly [SchemaLike, ...SchemaLike[]]>(items: T): TupleSchema<T> {
  return createTupleSchema(items)
}
