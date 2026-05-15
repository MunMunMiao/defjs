import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema refine behavior', () => {
  test('runs refine for domain rules', () => {
    const password = schema.string().refine(value => value['length'] >= 8, 'password too short')
    const payload = schema.object({
      password,
      confirm: schema.string().refine(value => value['endsWith']('!')),
    })

    const [okErr, okVal] = payload.parse({ password: 'abcdefgh', confirm: 'hello!' })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({
      confirm: 'hello!',
      password: 'abcdefgh',
    })

    const [err] = payload.parse({ password: 'short', confirm: 'hello' })
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues).toEqual([
      {
        code: 'custom',
        expected: 'string',
        message: 'password too short',
        path: ['password'],
        received: 'short',
      },
      {
        code: 'custom',
        expected: 'string',
        message: 'Expected string at confirm, received "hello"',
        path: ['confirm'],
        received: 'hello',
      },
    ])
  })

  test('supports refine returning string and Error', () => {
    const schemaValue = schema
      .number()
      .refine(value => (Number(value) > 0 ? true : 'must be positive'))
      .refine(value => (Number(value) < 10 ? true : new Error('must be less than 10')))

    const [okErr, okVal] = schemaValue.parse(5)
    expect(okErr).toBeNull()
    expect(okVal).toBe(5)

    const [e1] = schemaValue.parse(0)
    expect(e1).toBeInstanceOf(SchemaError)
    const [e2] = schemaValue.parse(10)
    expect(e2).toBeInstanceOf(SchemaError)
  })

  test('formats nested paths in errors', () => {
    const payload = schema.object({
      items: schema.array(
        schema.object({
          id: schema.number(),
        }),
      ),
    })

    const [err] = payload.parse({ items: [{ id: 'bad' }] })
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]).toEqual({
      code: 'invalid_type',
      expected: 'number',
      message: 'Expected number at items[0].id, received "bad"',
      path: ['items', 0, 'id'],
      received: 'bad',
    })
  })

  test('formats root errors and SchemaError fallback message', () => {
    const error = new SchemaError([])
    expect(error.message).toBe('Schema parse failed')
    const [err] = schema.string().parse(1)
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.message).toBe('Expected string at <root>, received 1')
  })

  test('async refine fails on invalid value', async () => {
    const s = schema.string().refine(() => false)
    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('prettify formats root path as <root>', () => {
    const [err] = schema.string().refine(() => false).parse('x')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err!.prettify()).toContain('<root>')
  })

  test('format reuses existing nested path nodes', () => {
    const payload = schema.object({
      a: schema.object({
        x: schema.string(),
        y: schema.number(),
      }),
    })
    const [err] = payload.parse({ a: { x: 1, y: 'bad' } })
    expect(err).toBeInstanceOf(SchemaError)
    const formatted = err!.format()
    expect(formatted.a?._errors).toEqual([])
    expect(formatted.a?.x?._errors).toEqual(['Expected string at a.x, received 1'])
    expect(formatted.a?.y?._errors).toEqual(['Expected number at a.y, received "bad"'])
  })

  test('covers remaining expected type and describe value branches', () => {
    const [anyErr, anyVal] = schema.any().parse(undefined)
    expect(anyErr).toBeNull()
    expect(anyVal).toBeUndefined()
    const [unkErr, unkVal] = schema.unknown().parse(undefined)
    expect(unkErr).toBeNull()
    expect(unkVal).toBeUndefined()

    const [boolErr] = schema
      .boolean()
      .refine(() => false)
      .parse(true)
    expect(boolErr).toBeInstanceOf(SchemaError)
    expect(boolErr?.message).toContain('Expected boolean at <root>, received true')

    const [fileErr] = schema
      .file()
      .refine(() => false)
      .parse(new File([], 'cover.png'))
    expect(fileErr).toBeInstanceOf(SchemaError)
    expect(fileErr?.message).toContain('Expected File at <root>, received File(cover.png)')

    const [nullErr] = schema
      .null()
      .refine(() => false)
      .parse(null)
    expect(nullErr).toBeInstanceOf(SchemaError)
    expect(nullErr?.message).toContain('Expected null at <root>, received null')

    const [anyRefErr] = schema
      .any()
      .refine(() => false)
      .parse(undefined)
    expect(anyRefErr).toBeInstanceOf(SchemaError)
    expect(anyRefErr?.message).toContain('Expected any at <root>, received undefined')

    expect(() => (schema.string() as unknown as { refine: (value: number) => unknown }).refine(1)).toThrowError(
      'refine() requires a validation function',
    )

    // parse(null) on a value schema now returns zero value (Go encoding/json alignment)
    const [strNullErr, strNullVal] = schema.string().parse(null)
    expect(strNullErr).toBeNull()
    expect(strNullVal).toBe('')

    const [sfErr] = schema.string().parse(new File([], 'avatar.png'))
    expect(sfErr).toBeInstanceOf(SchemaError)
    expect(sfErr?.message).toContain('Expected string at <root>, received File(avatar.png)')

    const [sbErr] = schema.string().parse(new Blob())
    expect(sbErr).toBeInstanceOf(SchemaError)
    expect(sbErr?.message).toContain('Expected string at <root>, received Blob(application/octet-stream)')

    const [sabErr] = schema.string().parse(new ArrayBuffer(1))
    expect(sabErr).toBeInstanceOf(SchemaError)
    expect(sabErr?.message).toContain('Expected string at <root>, received ArrayBuffer(1)')

    const [saErr] = schema.string().parse([])
    expect(saErr).toBeInstanceOf(SchemaError)
    expect(saErr?.message).toContain('Expected string at <root>, received array')

    const [sdErr] = schema.string().parse(new Date())
    expect(sdErr).toBeInstanceOf(SchemaError)
    expect(sdErr?.message).toContain('Expected string at <root>, received [object Date]')

    const [oaErr] = schema.object({ name: schema.string() }).parse([])
    expect(oaErr).toBeInstanceOf(SchemaError)
    expect(oaErr?.message).toContain('Expected object at <root>, received array')

    // parse(null) on value-type schemas yields zero values rather than throwing
    const [abErr, abVal] = schema.arrayBuffer().parse(null)
    expect(abErr).toBeNull()
    expect(abVal).toBeInstanceOf(ArrayBuffer)

    const [blErr, blVal] = schema.blob().parse(null)
    expect(blErr).toBeNull()
    expect(blVal).toBeInstanceOf(Blob)

    const [arrErr, arrVal] = schema.array(schema.string()).parse(null)
    expect(arrErr).toBeNull()
    expect(arrVal).toEqual([])

    const [recErr, recVal] = schema.record(schema.string()).parse(null)
    expect(recErr).toBeNull()
    expect(recVal).toEqual({})

    const [tupErr, tupVal] = schema.tuple([schema.string()]).parse(null)
    expect(tupErr).toBeNull()
    expect(tupVal).toEqual([''])

    const [anyFalseErr] = schema
      .any()
      .refine(() => false)
      .parse('x')
    expect(anyFalseErr).toBeInstanceOf(SchemaError)
    expect(anyFalseErr?.message).toContain('Expected any at <root>, received "x"')

    const [unkFalseErr] = schema
      .unknown()
      .refine(() => false)
      .parse('x')
    expect(unkFalseErr).toBeInstanceOf(SchemaError)
    expect(unkFalseErr?.message).toContain('Expected unknown at <root>, received "x"')

    const [enumErr] = schema
      .enum(['live'] as const)
      .refine(() => false)
      .parse('live')
    expect(enumErr).toBeInstanceOf(SchemaError)
    expect(enumErr?.message).toContain('Expected "live" at <root>, received "live"')

    const [litErr] = schema
      .literal('ok')
      .refine(() => false)
      .parse('ok')
    expect(litErr).toBeInstanceOf(SchemaError)
    expect(litErr?.message).toContain('Expected "ok" at <root>, received "ok"')

    const [orErr] = schema
      .or(schema.string(), schema.number())
      .refine(() => false)
      .parse('x')
    expect(orErr).toBeInstanceOf(SchemaError)
    expect(orErr?.message).toContain('Expected string | number at <root>, received "x"')

    const [objErr] = schema
      .object({ name: schema.string() })
      .refine(() => false)
      .parse({ name: 'x' })
    expect(objErr).toBeInstanceOf(SchemaError)
    expect(objErr?.message).toContain('Expected object at <root>, received object')

    const [recRefErr] = schema
      .record(schema.string())
      .refine(() => false)
      .parse({ key: 'x' })
    expect(recRefErr).toBeInstanceOf(SchemaError)
    expect(recRefErr?.message).toContain('Expected record<string> at <root>, received object')

    const [tupRefErr] = schema
      .tuple([schema.string()])
      .refine(() => false)
      .parse(['x'])
    expect(tupRefErr).toBeInstanceOf(SchemaError)
    expect(tupRefErr?.message).toContain('Expected tuple at <root>, received array')

    const [intErr] = schema
      .intersection(
        schema.object({ a: schema.string() }),
        schema.object({ b: schema.number() }),
      )
      .refine(() => false)
      .parse({ a: 'x', b: 1 })
    expect(intErr).toBeInstanceOf(SchemaError)
    expect(intErr?.message).toContain('Expected object & object at <root>')

    const [duErr] = schema
      .discriminatedUnion('type', [
        schema.object({ type: schema.literal('a'), a: schema.string() }),
        schema.object({ type: schema.literal('b'), b: schema.number() }),
      ])
      .refine(() => false)
      .parse({ type: 'a', a: 'x' })
    expect(duErr).toBeInstanceOf(SchemaError)
    expect(duErr?.message).toContain('Expected "a" | "b" at <root>')

    const [dateErr, dateVal] = schema.date().default(new Date('2024-01-01')).parse(undefined)
    expect(dateErr).toBeNull()
    expect(dateVal).toEqual(new Date('2024-01-01'))

    const [abRefErr] = schema
      .arrayBuffer()
      .refine(() => false)
      .parse(new ArrayBuffer(1))
    expect(abRefErr).toBeInstanceOf(SchemaError)
    expect(abRefErr?.message).toContain('Expected ArrayBuffer')

    const [blobErr] = schema
      .blob()
      .refine(() => false)
      .parse(new Blob())
    expect(blobErr).toBeInstanceOf(SchemaError)
    expect(blobErr?.message).toContain('Expected Blob')

    const [bigintErr] = schema
      .bigint()
      .refine(() => false)
      .parse(1n)
    expect(bigintErr).toBeInstanceOf(SchemaError)
    expect(bigintErr?.message).toContain('Expected bigint')

    // intersection where left branch is not an object falls back to right value
    const [intNonObjErr, intNonObjVal] = schema
      .intersection(schema.string(), schema.string())
      .parse('x')
    expect(intNonObjErr).toBeNull()
    expect(intNonObjVal).toBe('x')

    const [dateBoolErr] = schema.date().parse(true)
    expect(dateBoolErr).toBeNull()

    const [objOptErr, objOptVal] = schema.object({
      name: schema.string(),
      age: schema.number().optional(),
    }).parse({ name: 'x' })
    expect(objOptErr).toBeNull()
    expect(objOptVal).toEqual({ name: 'x' })
  })
})
