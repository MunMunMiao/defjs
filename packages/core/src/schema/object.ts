import type { ObjectSchema } from './schema'
import { createObjectSchema } from './schema'

export function _object<const T extends Record<string, any>>(shape: T): ObjectSchema<T> {
  return createObjectSchema(shape)
}
