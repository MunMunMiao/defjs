import { describe, expect, test } from 'vitest'
import { StructError, struct, tag } from './index'

describe('runtime.ts chain methods', () => {
  test('brand is a runtime no-op preserving nominal output value', () => {
    const userId = struct.string().brand<'UserId'>()
    const [err, val] = userId.parse('u_1')
    if (err) {
      throw err
    }
    expect(val).toBe('u_1')
  })

  test('null, nullish and optional only adjust missing value behavior', () => {
    const schema = struct.object({
      a: struct.string().optional(),
      b: struct.string().null(),
      c: struct.string().nullish(),
    })

    const [err, val] = schema.parse({})
    if (err) {
      throw err
    }
    expect(val).toEqual({ b: null })
  })

  test('tag stores metadata without changing parse output', () => {
    const user = struct.object({
      name: struct.string().tag(tag.json('full_name')),
    })

    const [err, val] = user.parse({ name: 'Miao' })
    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'Miao' })
  })

  test('invalid primitive parse returns StructError and zero value', () => {
    const [err, val] = struct.string().parse(42)

    expect(err).toBeInstanceOf(StructError)
    expect(val).toBe('')
  })
})
