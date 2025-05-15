
import { type BaseMetadata, type Schema, _metadata, createSchema } from './schema'
import { isArray, isNumber, isObject, isString } from './util'

export function _fromArray(md: EnumMetadata<never>, input: string[]): void {
  for (let i = 0; i < input.length; i++) {
    const key = input[i]
    if (!isString(key)) {
      throw new Error('key should be a string')
    }
    md.enum[key] = i
  }
}

export function _fromObject(md: EnumMetadata<never>, input: object): void {
  for (const [key, value] of Object.entries(input)) {
    if (isString(value) || isNumber(value)) {
      md.enum[key] = value
    }
  }
}

export type EnumOutput<T> = T extends string[]
  ? {
      readonly [K in keyof T & `${number}` as T[K]]: K extends `${infer N extends number}` ? N : never
    }
  : T extends { [key: string]: string | number }
    ? {
        readonly [K in keyof T]: T[K]
      }
    : never

export interface EnumMetadata<T> extends BaseMetadata<EnumOutput<T>> {
  kind: 'enum'
  enum: {
    [key: string]: string | number
  }
}

export interface EnumSchema<T> extends Schema {
  get enum(): Readonly<EnumOutput<T>>

  readonly [_metadata]: EnumMetadata<T>
}

/**
 * Create an enum schema from an array or object.
 * ```typescript
 * const statusEnum = _enum(['A', 'B', 'C'])
 * ```
 */
export function _enum<const T extends { [key: string]: string | number }>(value: T): EnumSchema<T>
export function _enum<const T extends string[]>(value: T): EnumSchema<T>
export function _enum(value: unknown): EnumSchema<never> {
  const md = { kind: 'enum', default: 0, enum: {} } as EnumMetadata<never>

  switch (true) {
    case isArray(value):
      _fromArray(md, value)
      break
    case isObject(value):
      _fromObject(md, value)
      break
    default:
      throw new Error('should be an array or object')
  }

  const s = createSchema(md) as EnumSchema<never>
  const _enum: { [key: string]: string | number } = {}

  for (const [k, v] of Object.entries(md.enum)){
    Object.defineProperty(_enum, k, {
      get() {
        return v
      },
    })
  }

  Object.defineProperty(s, 'enum', {
    get() {
      return _enum;
    }
  })

  return s
}
