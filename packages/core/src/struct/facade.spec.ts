import { afterEach, describe, expect, test, vi } from 'vitest'
import { isStruct, struct } from './index'
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
} from './struct'

const originalStructuredClone = globalThis.structuredClone

afterEach(() => {
  globalThis.structuredClone = originalStructuredClone
  vi.restoreAllMocks()
})

describe('facade.ts', () => {
  test('exports every constructor from namespace', () => {
    expect(struct.string).toBe(createStringSchema)
    expect(struct.number).toBe(createNumberSchema)
    expect(struct.boolean).toBe(createBooleanSchema)
    expect(struct.null).toBe(createNullSchema)
    expect(struct.any).toBe(createAnySchema)
    expect(struct.unknown).toBe(createUnknownSchema)
    expect(struct.literal).toBe(createLiteralSchema)
    expect(struct.enum).toBeTypeOf('function')
    expect(struct.object).toBe(createObjectSchema)
    expect(struct.array).toBe(createArraySchema)
    expect(struct.tuple).toBe(createTupleSchema)
    expect(struct.record).toBe(createRecordSchema)
    expect(struct.or).toBeTypeOf('function')
    expect(struct.blob).toBe(createBlobSchema)
    expect(struct.file).toBe(createFileSchema)
    expect(struct.arrayBuffer).toBe(createArrayBufferSchema)
  })

  test('supports primitive defaults for boolean and exact null schema', () => {
    const [boolErr, boolVal] = struct.boolean().parse(undefined)
    if (boolErr) {
      throw boolErr
    }
    expect(boolVal).toBe(false)

    const [nullErr1, nullVal1] = struct.null().parse(undefined)
    if (nullErr1) {
      throw nullErr1
    }
    expect(nullVal1).toBeNull()

    const [nullErr2, nullVal2] = struct.null().parse(null)
    if (nullErr2) {
      throw nullErr2
    }
    expect(nullVal2).toBeNull()
  })

  test('covers internal primitive definitions that are otherwise short-circuited', () => {
    const booleanSchema = struct.boolean() as unknown as Record<symbol, unknown>
    const nullSchema = struct.null() as unknown as Record<symbol, unknown>
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
    expect(isStruct(struct.string())).toBe(true)
    expect(
      isStruct({
        parse() {
          return undefined
        },
      }),
    ).toBe(false)
  })

  test('returns immutable chained schema objects', () => {
    const base = struct.string()
    const optionalValue = base.optional()

    expect(base).not.toBe(optionalValue)

    const [baseErr, baseVal] = base.parse(undefined)
    if (baseErr) {
      throw baseErr
    }
    expect(baseVal).toBe('')

    const [optErr, optVal] = optionalValue.parse(undefined)
    if (optErr) {
      throw optErr
    }
    expect(optVal).toBeUndefined()
  })

  test('object schema snapshots the declared shape at construction time', () => {
    const shape = { name: struct.string() }
    const user = struct.object(shape)
    ;(shape as Record<string, unknown>)['secret'] = struct.string()

    const [err, val] = user.parse({ name: 'Miao', secret: 'hidden' })

    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'Miao' })
  })
})
