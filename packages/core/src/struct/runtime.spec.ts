import { describe, expect, test } from 'vitest'
import { StructError, struct, tag } from './index'
import { parseStructTuple as parse } from './introspection'

describe('runtime.ts chain methods', () => {
  test('null, nullish and optional only adjust missing value behavior', () => {
    const schema = struct.object({
      a: struct.string().optional(),
      b: struct.string().null(),
      c: struct.string().nullish(),
    })

    const [err, val] = parse(schema, {})
    if (err) {
      throw err
    }
    expect(val).toEqual({ b: null })
  })

  test('tag stores metadata without changing parse output', () => {
    const user = struct.object({
      name: struct.string().tag(tag.json('full_name')),
    })

    const [err, val] = parse(user, { name: 'Miao' })
    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'Miao' })
  })

  test('invalid primitive parse returns StructError and zero value', () => {
    const [err, val] = parse(struct.string(), 42)

    expect(err).toBeInstanceOf(StructError)
    expect(val).toBe('')
  })
})
