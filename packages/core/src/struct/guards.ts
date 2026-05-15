import { DEFINITION } from './symbols'
import type { AnySchema } from './types'

export function isStruct(value: unknown): value is AnySchema {
  return typeof value === 'object' && value !== null && DEFINITION in value
}
