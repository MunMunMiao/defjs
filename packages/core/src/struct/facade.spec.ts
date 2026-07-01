import { describe, expect, test } from 'vitest'
import { struct } from './index'
import { isStruct } from './guards'
import { parseStructTuple as parse } from './introspection'
import {
  createAnyStruct,
  createArrayBufferStruct,
  createArrayStruct,
  createBlobStruct,
  createBooleanStruct,
  createFileStruct,
  createLiteralStruct,
  createNullStruct,
  createNumberStruct,
  createObjectStruct,
  createRecordStruct,
  createStringStruct,
  createTupleStruct,
  createUnknownStruct,
} from './constructors'

describe('facade.ts', () => {
  test('exports every constructor from namespace', () => {
    expect(struct.string).toBe(createStringStruct)
    expect(struct.number).toBe(createNumberStruct)
    expect(struct.boolean).toBe(createBooleanStruct)
    expect(struct.null).toBe(createNullStruct)
    expect(struct.any).toBe(createAnyStruct)
    expect(struct.unknown).toBe(createUnknownStruct)
    expect(struct.literal).toBe(createLiteralStruct)
    expect(struct.enum).toBeTypeOf('function')
    expect(struct.object).toBe(createObjectStruct)
    expect(struct.array).toBe(createArrayStruct)
    expect(struct.tuple).toBe(createTupleStruct)
    expect(struct.record).toBe(createRecordStruct)
    expect(struct.or).toBeTypeOf('function')
    expect(struct.blob).toBe(createBlobStruct)
    expect(struct.file).toBe(createFileStruct)
    expect(struct.arrayBuffer).toBe(createArrayBufferStruct)
  })

  test('supports primitive defaults for boolean and exact null struct', () => {
    const [boolErr, boolVal] = parse(struct.boolean(), undefined)
    if (boolErr) {
      throw boolErr
    }
    expect(boolVal).toBe(false)

    const [nullErr1, nullVal1] = parse(struct.null(), undefined)
    if (nullErr1) {
      throw nullErr1
    }
    expect(nullVal1).toBeNull()

    const [nullErr2, nullVal2] = parse(struct.null(), null)
    if (nullErr2) {
      throw nullErr2
    }
    expect(nullVal2).toBeNull()
  })

  test('covers internal primitive definitions that are otherwise short-circuited', () => {
    const booleanStruct = struct.boolean() as unknown as { [key: symbol]: unknown }
    const nullStruct = struct.null() as unknown as { [key: symbol]: unknown }
    const booleanDefinition = Object.getOwnPropertySymbols(booleanStruct)
      .map((symbol) => booleanStruct[symbol])
      .find((value) => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
    }
    const nullDefinition = Object.getOwnPropertySymbols(nullStruct)
      .map((symbol) => nullStruct[symbol])
      .find((value) => typeof value === 'object' && value !== null && 'kind' in (value as object)) as {
      is: (value: unknown) => boolean
      zero: () => null
    }

    expect(booleanDefinition.is(true)).toBe(true)
    expect(nullDefinition.is(null)).toBe(true)
    expect(nullDefinition.zero()).toBeNull()
  })

  test('exposes struct identity helper', () => {
    expect(isStruct(struct.string())).toBe(true)
    expect(
      isStruct({
        parse() {
          return undefined
        },
      }),
    ).toBe(false)
  })

  test('returns immutable chained struct objects', () => {
    const base = struct.string()
    const optionalValue = base.optional()

    expect(base).not.toBe(optionalValue)

    const [baseErr, baseVal] = parse(base, undefined)
    if (baseErr) {
      throw baseErr
    }
    expect(baseVal).toBe('')

    const [optErr, optVal] = parse(optionalValue, undefined)
    if (optErr) {
      throw optErr
    }
    expect(optVal).toBeUndefined()
  })

  test('object struct snapshots the declared shape at construction time', () => {
    const shape = { name: struct.string() }
    const user = struct.object(shape)
    ;(shape as { [key: string]: unknown })['secret'] = struct.string()

    const [err, val] = parse(user, { name: 'Miao', secret: 'hidden' })

    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'Miao' })
  })
})
