import { afterEach, describe, expect, test, vi } from 'vitest'
import { isSchema, schema } from './index'
import {
  createAnySchema,
  createArrayBufferSchema,
  createArraySchema,
  createBlobSchema,
  createBooleanSchema,
  createFileSchema,
  createLiteralSchema,
  createNullSchema,
  createNumberSchema,
  createObjectSchema,
  createRecordSchema,
  createStringSchema,
  createTupleSchema,
  createUnknownSchema,
} from './schema'

const originalStructuredClone = globalThis.structuredClone

afterEach(() => {
  globalThis.structuredClone = originalStructuredClone
  vi.restoreAllMocks()
})

describe('schema basics', () => {
  test('exports every constructor from namespace', () => {
    expect(schema.string).toBe(createStringSchema)
    expect(schema.number).toBe(createNumberSchema)
    expect(schema.boolean).toBe(createBooleanSchema)
    expect(schema.null).toBe(createNullSchema)
    expect(schema.any).toBe(createAnySchema)
    expect(schema.unknown).toBe(createUnknownSchema)
    expect(schema.literal).toBe(createLiteralSchema)
    expect(schema.enum).toBeTypeOf('function')
    expect(schema.object).toBe(createObjectSchema)
    expect(schema.array).toBe(createArraySchema)
    expect(schema.tuple).toBe(createTupleSchema)
    expect(schema.record).toBe(createRecordSchema)
    expect(schema.or).toBeTypeOf('function')
    expect(schema.blob).toBe(createBlobSchema)
    expect(schema.file).toBe(createFileSchema)
    expect(schema.arrayBuffer).toBe(createArrayBufferSchema)
  })

  test('supports primitive defaults for boolean and exact null schema', () => {
    const [boolErr, boolVal] = schema.boolean().parse(undefined)
    expect(boolErr).toBeNull()
    expect(boolVal).toBe(false)

    const [nullErr1, nullVal1] = schema.null().parse(undefined)
    expect(nullErr1).toBeNull()
    expect(nullVal1).toBeNull()

    const [nullErr2, nullVal2] = schema.null().parse(null)
    expect(nullErr2).toBeNull()
    expect(nullVal2).toBeNull()
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

    const [baseErr, baseVal] = base.parse(undefined)
    expect(baseErr).toBeNull()
    expect(baseVal).toBe('')

    const [optErr, optVal] = optionalValue.parse(undefined)
    expect(optErr).toBeNull()
    expect(optVal).toBeUndefined()

    const [defErr, defVal] = defaultValue.parse(undefined)
    expect(defErr).toBeNull()
    expect(defVal).toBe('x')
  })
})
