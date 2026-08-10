import { afterEach, describe, expect, test } from 'vitest'
import type { ErrorMap } from './index'
import { StructError, setErrorMap, struct } from './index'
import { parseStructTuple as parse } from './introspection'

afterEach(() => {
  setErrorMap(undefined)
})

describe('StructError format / flatten / prettify', () => {
  const userStruct = struct.object({
    id: struct.string(),
    profile: struct.object({
      email: struct.string(),
    }),
    tags: struct.array(struct.string()),
  })

  test('format exposes only the first parse issue', () => {
    const [err] = parse(userStruct, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const tree = err.format()
    expect(tree._errors).toEqual([])
    expect(tree['id']).toEqual({ _errors: ['Expected string at id, received 42'] })
    expect(tree['profile']).toBeUndefined()
    expect(tree['tags']).toBeUndefined()
    expect(err.issues).toHaveLength(1)
  })

  test('flatten groups the first parse issue by path segment', () => {
    const [err] = parse(userStruct, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const flat = err.flatten()
    expect(flat.formErrors).toEqual([])
    expect(flat.fieldErrors['id']).toEqual(['Expected string at id, received 42'])
    expect(flat.fieldErrors['profile']).toBeUndefined()
    expect(flat.fieldErrors['tags']).toBeUndefined()
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

  test('prettify renders the first parse issue', () => {
    const [err] = parse(userStruct, { id: 42, profile: { email: false }, tags: [10] })
    expect(err).toBeInstanceOf(StructError)
    if (!err) {
      throw new Error('expected parse error')
    }

    const text = err.prettify()
    expect(text).toContain('× id: Expected string at id, received 42')
    expect(text).not.toContain('profile.email')
    expect(text).not.toContain('tags[0]')
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
    expect(error.prettify()).toBe('Struct parse failed')
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
