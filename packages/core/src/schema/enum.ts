import type { Schema } from './schema'
import { createEnumSchema, createObjectEnumSchema } from './schema'

type EnumValue<T> = T extends readonly (infer U extends string)[]
  ? U
  : T extends Record<string, infer U extends number | string>
    ? U
    : never

export function _enum<const T extends readonly [string, ...string[]]>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
export function _enum<const T extends Record<string, number | string>>(value: T): Schema<EnumValue<T> | undefined, EnumValue<T>>
export function _enum(value: Record<string, number | string> | readonly [string, ...string[]]) {
  if (Array.isArray(value)) {
    return createEnumSchema(value as readonly [string, ...string[]])
  }

  return createObjectEnumSchema(value as Record<string, number | string>)
}
