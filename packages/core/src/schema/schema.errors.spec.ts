import { afterEach, describe, expect, test } from 'vitest'
import { type ErrorMap, SchemaError, schema, setErrorMap } from './index'

afterEach(() => {
  setErrorMap(undefined)
})

describe('SchemaError format / flatten / prettify', () => {
  const userSchema = schema.object({
    id: schema.string(),
    profile: schema.object({
      email: schema.string().email(),
    }),
    tags: schema.array(schema.string()),
  })

  test('format builds a nested tree of issues', () => {
    const result = userSchema.safeParse({ id: 42, profile: { email: 'bad' }, tags: [10] })
    expect(result.ok).toBe(false)
    if (result.ok) {
      return
    }

    const tree = result.error.format()
    expect(tree._errors).toEqual([])
    expect(tree['id']).toEqual({ _errors: ['Expected string at id, received 42'] })
    expect(tree['profile']).toEqual({
      _errors: [],
      email: { _errors: ['Invalid email'] },
    })
    expect(tree['tags']).toEqual({
      _errors: [],
      '0': { _errors: ['Expected string at tags[0], received 10'] },
    })
  })

  test('flatten groups by first path segment', () => {
    const result = userSchema.safeParse({ id: 42, profile: { email: 'bad' }, tags: [10] })
    if (result.ok) {
      throw new Error('expected failure')
    }

    const flat = result.error.flatten()
    expect(flat.formErrors).toEqual([])
    expect(flat.fieldErrors['id']).toEqual(['Expected string at id, received 42'])
    expect(flat.fieldErrors['profile']).toEqual(['Invalid email'])
    expect(flat.fieldErrors['tags']).toEqual(['Expected string at tags[0], received 10'])
  })

  test('flatten places empty-path issues in formErrors', () => {
    const refined = schema.object({ a: schema.string() }).refine(value => value['a'].length > 0 || 'a must not be empty')
    const result = refined.safeParse({ a: '' })
    if (result.ok) {
      throw new Error('expected failure')
    }

    const flat = result.error.flatten()
    expect(flat.formErrors).toEqual(['a must not be empty'])
    expect(flat.fieldErrors).toEqual({})
  })

  test('prettify renders multi-line human readable output', () => {
    const result = userSchema.safeParse({ id: 42, profile: { email: 'bad' }, tags: [10] })
    if (result.ok) {
      throw new Error('expected failure')
    }

    const text = result.error.prettify()
    expect(text).toContain('× id: Expected string at id, received 42')
    expect(text).toContain('× profile.email: Invalid email')
    expect(text).toContain('× tags[0]: Expected string at tags[0], received 10')
  })

  test('prettify on empty issues falls back to a sane string', () => {
    const error = new SchemaError([])
    expect(error.prettify()).toBe('Schema parse failed')
  })
})

describe('schema errorMap (global i18n hook)', () => {
  test('setErrorMap overrides default issue messages', () => {
    const map: ErrorMap = issue => {
      if (issue.code === 'invalid_type') {
        return `字段 ${issue.path.join('.')} 类型不符（期望 ${issue.expected}）`
      }
      return undefined
    }
    setErrorMap(map)

    const result = schema.string().safeParse(42)
    if (result.ok) {
      throw new Error('expected failure')
    }

    expect(result.error.issues[0]?.message).toBe('字段  类型不符（期望 string）')
  })

  test('errorMap returning undefined preserves the default message', () => {
    setErrorMap(() => undefined)

    const result = schema.string().safeParse(42)
    if (result.ok) {
      throw new Error('expected failure')
    }

    expect(result.error.issues[0]?.message).toBe('Expected string at <root>, received 42')
  })

  test('clearing errorMap restores defaults', () => {
    setErrorMap(() => 'custom')

    const before = schema.string().safeParse(42)
    if (before.ok) {
      throw new Error('expected failure')
    }
    expect(before.error.issues[0]?.message).toBe('custom')

    setErrorMap(undefined)

    const after = schema.string().safeParse(42)
    if (after.ok) {
      throw new Error('expected failure')
    }
    expect(after.error.issues[0]?.message).toBe('Expected string at <root>, received 42')
  })
})
