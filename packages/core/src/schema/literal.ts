import { createLiteralSchema } from './schema'

export function _literal<const T extends boolean | null | number | string>(value: T) {
  return createLiteralSchema(value)
}
