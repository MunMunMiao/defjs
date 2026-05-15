import { describe, expect, test } from 'vitest'
import { StructError, struct } from './index'

describe('parse_async.ts', () => {
  test('primitive types via parseAsync', async () => {
    const [anyErr, anyVal] = await struct.any().parseAsync('x')
    if (anyErr) {
      throw anyErr
    }
    expect(anyVal).toBe('x')

    const [unknownErr, unknownVal] = await struct.unknown().parseAsync('x')
    if (unknownErr) {
      throw unknownErr
    }
    expect(unknownVal).toBe('x')

    const [bufErr, bufVal] = await struct.arrayBuffer().parseAsync(new ArrayBuffer(1))
    if (bufErr) {
      throw bufErr
    }
    expect(bufVal).toBeInstanceOf(ArrayBuffer)

    const [bigintErr, bigintVal] = await struct.bigint().parseAsync(42n)
    if (bigintErr) {
      throw bigintErr
    }
    expect(bigintVal).toBe(42n)

    const [blobErr, blobVal] = await struct.blob().parseAsync(new Blob(['x']))
    if (blobErr) {
      throw blobErr
    }
    expect(blobVal).toBeInstanceOf(Blob)

    const [boolErr, boolVal] = await struct.boolean().parseAsync(true)
    if (boolErr) {
      throw boolErr
    }
    expect(boolVal).toBe(true)

    const [dateErr, dateVal] = await struct.date().parseAsync(new Date('2026-05-12'))
    if (dateErr) {
      throw dateErr
    }
    expect(dateVal).toBeInstanceOf(Date)

    const [fileErr, fileVal] = await struct.file().parseAsync(new File([], 'x'))
    if (fileErr) {
      throw fileErr
    }
    expect(fileVal).toBeInstanceOf(File)

    const [nullErr, nullVal] = await struct.null().parseAsync(null)
    if (nullErr) {
      throw nullErr
    }
    expect(nullVal).toBeNull()
  })

  test('enum parseAsync success and failure', async () => {
    const s = struct.enum(['a', 'b'])
    const [okErr, val] = await s.parseAsync('a')
    if (okErr) {
      throw okErr
    }
    expect(val).toBe('a')

    const [err] = await s.parseAsync('c')
    expect(err).toBeInstanceOf(StructError)
  })

  test('intersection parseAsync success and failure', async () => {
    const s = struct.intersection(struct.object({ a: struct.string() }), struct.object({ b: struct.number() }))
    const [okErr, val] = await s.parseAsync({ a: 'x', b: 1 })
    if (okErr) {
      throw okErr
    }
    expect(val).toEqual({ a: 'x', b: 1 })

    const [err1] = await s.parseAsync({ a: 'x', b: 'bad' })
    expect(err1).toBeInstanceOf(StructError)

    const [err2] = await s.parseAsync({ a: 1, b: 1 })
    expect(err2).toBeInstanceOf(StructError)
  })

  test('or parseAsync', async () => {
    const s = struct.or(struct.string(), struct.number())
    const [err, val] = await s.parseAsync('x')
    if (err) {
      throw err
    }
    expect(val).toBe('x')
  })

  test('record parseAsync success and failure', async () => {
    const s = struct.record(struct.string())
    const [okErr, val] = await s.parseAsync({ key: 'x' })
    if (okErr) {
      throw okErr
    }
    expect(val).toEqual({ key: 'x' })

    const [err] = await s.parseAsync('not an object')
    expect(err).toBeInstanceOf(StructError)
  })

  test('tuple parseAsync', async () => {
    const s = struct.tuple([struct.string(), struct.number()])
    const [okErr, val] = await s.parseAsync(['x', 1])
    if (okErr) {
      throw okErr
    }
    expect(val).toEqual(['x', 1])

    const [err] = await s.parseAsync(['x', 'bad'])
    expect(err).toBeInstanceOf(StructError)
  })

  test('or parseAsync failure', async () => {
    const s = struct.or(struct.string(), struct.number())
    const [err] = await s.parseAsync(true)
    expect(err).toBeInstanceOf(StructError)
  })

  test('object parseAsync with missing optional field', async () => {
    const s = struct.object({
      name: struct.string(),
      age: struct.number().optional(),
    })
    const [err, val] = await s.parseAsync({ name: 'x' })
    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'x' })
  })

  test('parseAsync with nullable for undefined', async () => {
    const s = struct.string().null()
    const [err, val] = await s.parseAsync(undefined)
    if (err) {
      throw err
    }
    expect(val).toBeNull()
  })

  test('parseAsync with optional for undefined', async () => {
    const s = struct.string().optional()
    const [err, val] = await s.parseAsync(undefined)
    if (err) {
      throw err
    }
    expect(val).toBeUndefined()
  })

  test('parseAsync null on value-type schema yields zero value', async () => {
    const [err, val] = await struct.string().parseAsync(null)
    if (err) {
      throw err
    }
    expect(val).toBe('')
  })

  test('parseAsync intersection reports incompatible branches', async () => {
    const s = struct.intersection(struct.string(), struct.number())
    const [err] = await s.parseAsync('x')
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync record with optional value drops undefined keys', async () => {
    const s = struct.record(struct.string().optional())
    const [err, val] = await s.parseAsync({ key: undefined })
    if (err) {
      throw err
    }
    expect(val).toEqual({})
  })

  test('parseAsync record with invalid value type', async () => {
    const s = struct.record(struct.number())
    const [err] = await s.parseAsync({ key: 'not-a-number' })
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync tuple with non-array input', async () => {
    const s = struct.tuple([struct.string()])
    const [err] = await s.parseAsync('not-an-array')
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync literal with mismatching value', async () => {
    const s = struct.literal('ok')
    const [err] = await s.parseAsync('not-ok')
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync array with non-array input', async () => {
    const s = struct.array(struct.string())
    const [err] = await s.parseAsync('not-an-array')
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync object with non-object input', async () => {
    const s = struct.object({ name: struct.string() })
    const [err] = await s.parseAsync('not-an-object')
    expect(err).toBeInstanceOf(StructError)
  })

  test('parseAsync unknownFields option rejects unknown keys', async () => {
    const s = struct.object({ name: struct.string() })
    const [err] = await s.parseAsync({ name: 'x', extra: 1 }, { unknownFields: 'error' })
    expect(err).toBeInstanceOf(StructError)
    expect(err?.issues[0]?.code).toBe('unrecognized_keys')
  })

  test('parseAsync strip drops unknown keys', async () => {
    const s = struct.object({ name: struct.string() })
    const [err, val] = await s.parseAsync({ name: 'x', extra: 1 })
    if (err) {
      throw err
    }
    expect(val).toEqual({ name: 'x' })
  })
})
