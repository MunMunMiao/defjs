import type { SchemaLike, UnionSchema } from './schema'
import { createUnionSchema } from './schema'

export function _or<const T extends readonly [SchemaLike, ...SchemaLike[]]>(...options: T): UnionSchema<T> {
  return createUnionSchema(options)
}
