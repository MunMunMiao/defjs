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

    const [err, val] = lite.parse({ id: 'u_1', name: 'x', score: 99 })
    expect(err).toBeNull()
    expect(val).toEqual({ id: 'u_1', name: 'x' })
  })

  test('omit removes selected fields', () => {
    const noScore = base.omit({ score: true })

    const [err, val] = noScore.parse({ id: 'u_1', name: 'x' })
    expect(err).toBeNull()
    expect(val).toEqual({ id: 'u_1', name: 'x' })
  })

  test('partial makes every field optional in Output', () => {
    const optional = base.partial()

    const [e1, v1] = optional.parse({})
    expect(e1).toBeNull()
    expect(v1).toEqual({})
    const [e2, v2] = optional.parse({ id: 'u_1' })
    expect(e2).toBeNull()
    expect(v2).toEqual({ id: 'u_1' })
  })

  test('required flips back optional fields to required, defaulting to zero values when missing', () => {
    const withMaybe = schema.object({
      id: schema.string(),
      tag: schema.string().optional(),
    })

    const strict = withMaybe.required()
    const [e1, v1] = strict.parse({ id: 'u_1' })
    expect(e1).toBeNull()
    expect(v1).toEqual({ id: 'u_1', tag: '' })
    const [e2, v2] = strict.parse({ id: 'u_1', tag: 'release' })
    expect(e2).toBeNull()
    expect(v2).toEqual({ id: 'u_1', tag: 'release' })
  })

  test('extend appends or overrides fields with a plain shape', () => {
    const widened = base.extend({
      score: schema.number().int(),
      active: schema.boolean(),
    })

    const [okErr, okVal] = widened.parse({ id: 'u_1', name: 'x', score: 10, active: true })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({
      id: 'u_1',
      name: 'x',
      score: 10,
      active: true,
    })
    const [badErr] = widened.parse({ id: 'u_1', name: 'x', score: 3.14, active: true })
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('merge combines two object schemas, letting the later definition win on conflict', () => {
    const extra = schema.object({
      score: schema.number().min(0),
      created: schema.string(),
    })

    const merged = base.merge(extra)
    const [err, val] = merged.parse({ id: 'u_1', name: 'x', score: 7, created: '2026-05-12' })
    expect(err).toBeNull()
    expect(val).toEqual({
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

    const [e1, v1] = keys.parse('id')
    expect(e1).toBeNull()
    expect(v1).toBe('id')
    const [e2, v2] = keys.parse('name')
    expect(e2).toBeNull()
    expect(v2).toBe('name')
    const [e3, v3] = keys.parse('score')
    expect(e3).toBeNull()
    expect(v3).toBe('score')
    const [badErr] = keys.parse('unknown')
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('keyof on empty shape throws at chain time', () => {
    const empty = schema.object({})
    expect(() => empty.keyof()).toThrowError('keyof() requires at least one declared key')
  })

  test('utility methods preserve strict / passthrough / strip unknownKeys state', () => {
    const strictPick = base.strict().pick({ id: true })
    const [spErr] = strictPick.parse({ id: 'u_1', extra: 'no' })
    expect(spErr).toBeInstanceOf(SchemaError)

    const passthroughExtend = base.passthrough().extend({ extra: schema.string() })
    const [peErr, peVal] = passthroughExtend.parse({ id: 'u_1', name: 'x', score: 1, extra: 'kept', stray: 'also' })
    expect(peErr).toBeNull()
    expect(peVal).toEqual({
      id: 'u_1',
      name: 'x',
      score: 1,
      extra: 'kept',
      stray: 'also',
    })
  })
})
