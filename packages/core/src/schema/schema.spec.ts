import { afterEach, describe, expect, test, vi } from 'vitest'
import { _any } from './any'
import { _array } from './array'
import { _arrayBuffer } from './arraybuffer'
import { _blob } from './blob'
import { _boolean } from './boolean'
import { _enum } from './enum'
import { _file } from './file'
import { isSchema, schema } from './index'
import { _literal } from './literal'
import { _null } from './null'
import { _number } from './number'
import { _object } from './object'
import { _or } from './or'
import { _record } from './record'
import { _string } from './string'
import { _tuple } from './tuple'
import { _unknown } from './unknown'

const originalStructuredClone = globalThis.structuredClone

afterEach(() => {
  globalThis.structuredClone = originalStructuredClone
  vi.restoreAllMocks()
})

describe('schema basics', () => {
  test('exports every constructor from namespace', () => {
    expect(schema.string).toBe(_string)
    expect(schema.number).toBe(_number)
    expect(schema.boolean).toBe(_boolean)
    expect(schema.null).toBe(_null)
    expect(schema.any).toBe(_any)
    expect(schema.unknown).toBe(_unknown)
    expect(schema.literal).toBe(_literal)
    expect(schema.enum).toBe(_enum)
    expect(schema.object).toBe(_object)
    expect(schema.array).toBe(_array)
    expect(schema.tuple).toBe(_tuple)
    expect(schema.record).toBe(_record)
    expect(schema.or).toBe(_or)
    expect(schema.blob).toBe(_blob)
    expect(schema.file).toBe(_file)
    expect(schema.arrayBuffer).toBe(_arrayBuffer)
  })

  test('supports primitive defaults for boolean and exact null schema', () => {
    expect(schema.boolean().parse(undefined)).toBe(false)
    expect(schema.null().parse(undefined)).toBeNull()
    expect(schema.null().parse(null)).toBeNull()
  })

  test('covers internal primitive definitions that are otherwise short-circuited', () => {
    const booleanSchema = schema.boolean() as unknown as Record<symbol, unknown>
    const nullSchema = schema.null() as unknown as Record<symbol, unknown>
    const booleanDefinition = Object.getOwnPropertySymbols(booleanSchema)
      .map(symbol => booleanSchema[symbol])
      .find(value => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
    }
    const nullDefinition = Object.getOwnPropertySymbols(nullSchema)
      .map(symbol => nullSchema[symbol])
      .find(value => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
      zero: () => null
    }

    expect(booleanDefinition.is(true)).toBe(true)
    expect(nullDefinition.is(null)).toBe(true)
    expect(nullDefinition.zero()).toBeNull()
  })

  test('exposes schema identity helper', () => {
    expect(isSchema(schema.string())).toBe(true)
    expect(
      isSchema({
        parse() {
          return undefined
        },
      }),
    ).toBe(false)
  })

  test('returns immutable chained schema objects', () => {
    const base = schema.string()
    const optionalValue = base.optional()
    const defaultValue = base.default('x')

    expect(base).not.toBe(optionalValue)
    expect(base).not.toBe(defaultValue)
    expect(base.parse(undefined)).toBe('')
    expect(optionalValue.parse(undefined)).toBeUndefined()
    expect(defaultValue.parse(undefined)).toBe('x')
  })
})
