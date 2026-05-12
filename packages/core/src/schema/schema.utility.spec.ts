import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('object schema utility methods', () => {
  const base = schema.object({
    id: schema.string(),
    name: schema.string(),
    score: schema.number(),
  })

  test('pick keeps only selected fields', () => {
    const lite = base.pick({ id: true, name: true })

    expect(lite.parse({ id: 'u_1', name: 'x', score: 99 })).toEqual({ id: 'u_1', name: 'x' })
  })

  test('omit removes selected fields', () => {
    const noScore = base.omit({ score: true })

    expect(noScore.parse({ id: 'u_1', name: 'x' })).toEqual({ id: 'u_1', name: 'x' })
  })

  test('partial makes every field optional in Output', () => {
    const optional = base.partial()

    expect(optional.parse({})).toEqual({})
    expect(optional.parse({ id: 'u_1' })).toEqual({ id: 'u_1' })
  })

  test('required flips back optional fields to required, defaulting to zero values when missing', () => {
    const withMaybe = schema.object({
      id: schema.string(),
      tag: schema.string().optional(),
    })

    const strict = withMaybe.required()
    expect(strict.parse({ id: 'u_1' })).toEqual({ id: 'u_1', tag: '' })
    expect(strict.parse({ id: 'u_1', tag: 'release' })).toEqual({ id: 'u_1', tag: 'release' })
  })

  test('extend appends or overrides fields with a plain shape', () => {
    const widened = base.extend({
      score: schema.number().int(),
      active: schema.boolean(),
    })

    expect(widened.parse({ id: 'u_1', name: 'x', score: 10, active: true })).toEqual({
      id: 'u_1',
      name: 'x',
      score: 10,
      active: true,
    })
    expect(() => widened.parse({ id: 'u_1', name: 'x', score: 3.14, active: true })).toThrowError(SchemaError)
  })

  test('merge combines two object schemas, letting the later definition win on conflict', () => {
    const extra = schema.object({
      score: schema.number().min(0),
      created: schema.string(),
    })

    const merged = base.merge(extra)
    expect(merged.parse({ id: 'u_1', name: 'x', score: 7, created: '2026-05-12' })).toEqual({
      id: 'u_1',
      name: 'x',
      score: 7,
      created: '2026-05-12',
    })
  })

  test('merge rejects non-object schemas at chain time', () => {
    expect(() => base.merge(schema.string() as never)).toThrowError('merge() requires another object schema')
  })

  test('keyof returns an enum schema with declared keys', () => {
    const keys = base.keyof()

    expect(keys.parse('id')).toBe('id')
    expect(keys.parse('name')).toBe('name')
    expect(keys.parse('score')).toBe('score')
    expect(() => keys.parse('unknown')).toThrowError(SchemaError)
  })

  test('keyof on empty shape throws at chain time', () => {
    const empty = schema.object({})
    expect(() => empty.keyof()).toThrowError('keyof() requires at least one declared key')
  })

  test('utility methods preserve strict / passthrough / strip unknownKeys state', () => {
    const strictPick = base.strict().pick({ id: true })
    expect(() => strictPick.parse({ id: 'u_1', extra: 'no' })).toThrowError(SchemaError)

    const passthroughExtend = base.passthrough().extend({ extra: schema.string() })
    expect(passthroughExtend.parse({ id: 'u_1', name: 'x', score: 1, extra: 'kept', stray: 'also' })).toEqual({
      id: 'u_1',
      name: 'x',
      score: 1,
      extra: 'kept',
      stray: 'also',
    })
  })
})
