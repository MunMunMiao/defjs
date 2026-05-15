import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('parseAsync covers all schema kinds', () => {
  test('primitive types via parseAsync', async () => {
    const [, anyVal] = await schema.any().parseAsync('x')
    expect(anyVal).toBe('x')

    const [, unknownVal] = await schema.unknown().parseAsync('x')
    expect(unknownVal).toBe('x')

    const [, bufVal] = await schema.arrayBuffer().parseAsync(new ArrayBuffer(1))
    expect(bufVal).toBeInstanceOf(ArrayBuffer)

    const [, bigintVal] = await schema.bigint().parseAsync(42n)
    expect(bigintVal).toBe(42n)

    const [, blobVal] = await schema.blob().parseAsync(new Blob(['x']))
    expect(blobVal).toBeInstanceOf(Blob)

    const [, boolVal] = await schema.boolean().parseAsync(true)
    expect(boolVal).toBe(true)

    const [, dateVal] = await schema.date().parseAsync(new Date('2026-05-12'))
    expect(dateVal).toBeInstanceOf(Date)

    const [, fileVal] = await schema.file().parseAsync(new File([], 'x'))
    expect(fileVal).toBeInstanceOf(File)

    const [, nullVal] = await schema.null().parseAsync(null)
    expect(nullVal).toBeNull()
  })

  test('enum parseAsync success and failure', async () => {
    const s = schema.enum(['a', 'b'])
    const [, val] = await s.parseAsync('a')
    expect(val).toBe('a')

    const [err] = await s.parseAsync('c')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('intersection parseAsync success and failure', async () => {
    const s = schema.intersection(
      schema.object({ a: schema.string() }),
      schema.object({ b: schema.number() }),
    )
    const [, val] = await s.parseAsync({ a: 'x', b: 1 })
    expect(val).toEqual({ a: 'x', b: 1 })

    const [err1] = await s.parseAsync({ a: 'x', b: 'bad' })
    expect(err1).toBeInstanceOf(SchemaError)

    const [err2] = await s.parseAsync({ a: 1, b: 1 })
    expect(err2).toBeInstanceOf(SchemaError)
  })

  test('or parseAsync', async () => {
    const s = schema.or(schema.string(), schema.number())
    const [, val] = await s.parseAsync('x')
    expect(val).toBe('x')
  })

  test('record parseAsync success and failure', async () => {
    const s = schema.record(schema.string())
    const [, val] = await s.parseAsync({ key: 'x' })
    expect(val).toEqual({ key: 'x' })

    const [err] = await s.parseAsync('not an object')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('tuple parseAsync', async () => {
    const s = schema.tuple([schema.string(), schema.number()])
    const [, val] = await s.parseAsync(['x', 1])
    expect(val).toEqual(['x', 1])

    const [err] = await s.parseAsync(['x', 'bad'])
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('or parseAsync failure', async () => {
    const s = schema.or(schema.string(), schema.number())
    const [err] = await s.parseAsync(true)
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('object parseAsync with missing optional field', async () => {
    const s = schema.object({
      name: schema.string(),
      age: schema.number().optional(),
    })
    const [, val] = await s.parseAsync({ name: 'x' })
    expect(val).toEqual({ name: 'x', age: undefined })
  })

  test('parseAsync with default value for undefined', async () => {
    const s = schema.string().default('fallback')
    const [, val] = await s.parseAsync(undefined)
    expect(val).toBe('fallback')
  })

  test('parseAsync with nullable for undefined', async () => {
    const s = schema.string().null()
    const [, val] = await s.parseAsync(undefined)
    expect(val).toBeNull()
  })

  test('parseAsync with optional for undefined', async () => {
    const s = schema.string().optional()
    const [, val] = await s.parseAsync(undefined)
    expect(val).toBeUndefined()
  })

  test('parseAsync null on value-type schema yields zero value', async () => {
    const [, val] = await schema.string().parseAsync(null)
    expect(val).toBe('')
  })

  test('parseAsync intersection with failing zero value falls back to undefined', async () => {
    const s = schema.intersection(
      schema.string(),
      schema.string().min(5),
    )
    const [err, val] = await s.parseAsync(null)
    expect(err).toBeInstanceOf(SchemaError)
    expect(val).toBeUndefined()
  })

  test('parseAsync record with optional value drops undefined keys', async () => {
    const s = schema.record(schema.string().optional())
    const [, val] = await s.parseAsync({ key: undefined })
    expect(val).toEqual({})
  })

  test('parseAsync record with invalid value type', async () => {
    const s = schema.record(schema.number())
    const [err] = await s.parseAsync({ key: 'not-a-number' })
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('parseAsync tuple with non-array input', async () => {
    const s = schema.tuple([schema.string()])
    const [err] = await s.parseAsync('not-an-array')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('parseAsync literal with mismatching value', async () => {
    const s = schema.literal('ok')
    const [err] = await s.parseAsync('not-ok')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('parseAsync array with non-array input', async () => {
    const s = schema.array(schema.string())
    const [err] = await s.parseAsync('not-an-array')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('parseAsync object with non-object input', async () => {
    const s = schema.object({ name: schema.string() })
    const [err] = await s.parseAsync('not-an-object')
    expect(err).toBeInstanceOf(SchemaError)
  })

  test('async refine returns Error instance', async () => {
    const s = schema.string().refine(() => new Error('async error'))
    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.message).toBe('async error')
  })

  test('parseAsync returns early when refine fails before transform', async () => {
    const s = schema
      .string()
      .refine(() => false, 'refine fails')
      .transform(value => value.toUpperCase(), value => value.toLowerCase())

    const [err] = await s.parseAsync('hello')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.message).toContain('refine fails')
  })

  test('parseAsync strict mode rejects unknown keys', async () => {
    const s = schema.object({ name: schema.string() }).strict()
    const [err] = await s.parseAsync({ name: 'x', extra: 1 })
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues[0]?.code).toBe('unrecognized_keys')
  })

  test('parseAsync passthrough mode keeps unknown keys', async () => {
    const s = schema.object({ name: schema.string() }).passthrough()
    const [, val] = await s.parseAsync({ name: 'x', extra: 1 })
    expect(val).toEqual({ name: 'x', extra: 1 })
  })

  test('parseAsync strict with missingKeys rejects missing required field', async () => {
    const s = schema.object({ name: schema.string() }).strict({ missingKeys: true })
    const [err] = await s.parseAsync({})
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.issues.some((it: { code: string }) => it.code === 'missing_key')).toBe(true)
  })

  test('parseAsync strip drops unknown keys', async () => {
    const s = schema.object({ name: schema.string() })
    const [, val] = await s.parseAsync({ name: 'x', extra: 1 })
    expect(val).toEqual({ name: 'x' })
  })
})
