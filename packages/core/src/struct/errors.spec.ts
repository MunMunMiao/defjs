import { afterEach, describe, expect, test } from 'vitest'
import type { ErrorMap } from './index'
import { StructError, setErrorMap, struct } from './index'
import { parseStructTuple as parse } from './introspection'

afterEach(() => {
  setErrorMap(undefined)
})

describe('StructError format / flatten / prettify', () => {
  const userSchema = struct.object({
    id: struct.string(),
    profile: struct.object({
      email: struct.string(),
    }),
    tags: struct.array(struct.string()),
  })

  test('format builds a nested tree of issues', () => {
    const [err] = parse(userSchema, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const tree = err.format()
    expect(tree._errors).toEqual([])
    expect(tree['id']).toEqual({ _errors: ['Expected string at id, received 42'] })
    expect(tree['profile']).toEqual({
      _errors: [],
      email: { _errors: ['Expected string at profile.email, received false'] },
    })
    expect(tree['tags']).toEqual({
      _errors: [],
      '0': { _errors: ['Expected string at tags[0], received 10'] },
    })
  })

  test('flatten groups by first path segment', () => {
    const [err] = parse(userSchema, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const flat = err.flatten()
    expect(flat.formErrors).toEqual([])
    expect(flat.fieldErrors['id']).toEqual(['Expected string at id, received 42'])
    expect(flat.fieldErrors['profile']).toEqual(['Expected string at profile.email, received false'])
    expect(flat.fieldErrors['tags']).toEqual(['Expected string at tags[0], received 10'])
  })

  test('flatten places empty-path issues in formErrors', () => {
    const err = new StructError([
      {
        code: 'custom',
        expected: 'form',
        message: 'a must not be empty',
        path: [],
        received: { a: '' },
      },
    ])

    const flat = err.flatten()
    expect(flat.formErrors).toEqual(['a must not be empty'])
    expect(flat.fieldErrors).toEqual({})
  })

  test('prettify renders multi-line human readable output', () => {
    const [err] = parse(userSchema, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const text = err.prettify()
    expect(text).toContain('× id: Expected string at id, received 42')
    expect(text).toContain('× profile.email: Expected string at profile.email, received false')
    expect(text).toContain('× tags[0]: Expected string at tags[0], received 10')
  })

  test('format keeps a declared _errors field separate from node errors', () => {
    const [err] = parse(struct.object({ _errors: struct.string() }), { _errors: 42 })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const tree = err.format()
    expect(tree._errors).toEqual([])
    expect(tree['\\_errors']).toEqual({ _errors: ['Expected string at _errors, received 42'] })
  })

  test('prettify renders deep array paths without stray dots', () => {
    const matrix = struct.array(struct.array(struct.array(struct.string())))
    const [err] = parse(matrix, [[[1]]])
    expect(err).toBeInstanceOf(StructError)

    expect(err?.prettify()).toContain('× [0][0][0]: Expected string at [0][0][0], received 1')
  })

  test('prettify on empty issues falls back to a sane string', () => {
    const error = new StructError([])
    expect(error.prettify()).toBe('Schema parse failed')
  })
})

describe('errors.ts errorMap', () => {
  test('setErrorMap overrides default issue messages', () => {
    const map: ErrorMap = (issue) => {
      if (issue.code === 'invalid_type') {
        return `字段 ${issue.path.join('.')} 类型不符（期望 ${issue.expected}）`
      }
      return undefined
    }
    setErrorMap(map)

    const [err] = parse(struct.string(), 42)
    expect(err).toBeInstanceOf(StructError)
    expect(err?.issues[0]?.message).toBe('字段  类型不符（期望 string）')
  })

  test('errorMap returning undefined preserves the default message', () => {
    setErrorMap(() => undefined)

    const [err] = parse(struct.string(), 42)
    expect(err).toBeInstanceOf(StructError)
    expect(err?.issues[0]?.message).toBe('Expected string at <root>, received 42')
  })

  test('clearing errorMap restores defaults', () => {
    setErrorMap(() => 'custom')

    const [before] = parse(struct.string(), 42)
    expect(before).toBeInstanceOf(StructError)
    expect(before?.issues[0]?.message).toBe('custom')

    setErrorMap(undefined)

    const [after] = parse(struct.string(), 42)
    expect(after).toBeInstanceOf(StructError)
    expect(after?.issues[0]?.message).toBe('Expected string at <root>, received 42')
  })
})
