import { describe, expect, test } from 'vitest'
import { decodeJson } from './codec/json'
import { StructError, struct } from './index'
import { parseStructTuple as parse } from './introspection'

describe('parse.ts object and composite values', () => {
  test('supports user profile defaults and optional keys', () => {
    const profile = struct.object({
      id: struct.string(),
      nickname: struct.string().optional(),
      score: struct.number(),
      active: struct.boolean(),
    })

    const [err1, val1] = parse(profile, { id: 'u_1' })
    if (err1) {
      throw err1
    }
    expect(val1).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
    const [err2, val2] = parse(profile, { id: 'u_1', nickname: undefined })
    if (err2) {
      throw err2
    }
    expect(val2).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
  })

  test('keeps Go-style missing, optional, nullable, nullish, and zero-value policy', () => {
    const shape = struct.object({
      name: struct.string(),
      age: struct.number(),
      active: struct.boolean(),
      note: struct.string().optional(),
      nickname: struct.string().null(),
      bio: struct.string().nullish(),
      empty: struct.null(),
      tags: struct.array(struct.string()),
    })

    const [error, value] = parse(shape, {})

    expect(error).toBeNull()
    expect(value).toEqual({
      active: false,
      age: 0,
      bio: null,
      empty: null,
      name: '',
      nickname: null,
      tags: [],
    })
    expect(Object.hasOwn(value, 'note')).toBe(false)
  })

  test('keeps value-type null inputs on the zero-value path', () => {
    const [stringErr, stringValue] = parse(struct.string(), null)
    expect(stringErr).toBeNull()
    expect(stringValue).toBe('')

    const [bigintErr, bigintValue] = parse(struct.bigint(), null)
    expect(bigintErr).toBeNull()
    expect(bigintValue).toBe(0n)

    const [numberErr, numberValue] = parse(struct.bigint(), 42)
    expect(numberErr).toBeInstanceOf(StructError)
    expect(numberValue).toBe(0n)
  })

  test('maps tagged json input key without changing output key', () => {
    const queryStruct = struct.object({
      pageSize: struct.number().alias('page_size'),
      page: struct.number(),
    })

    const val = decodeJson(queryStruct, { page: 1, page_size: 50 })
    expect(val).toEqual({
      page: 1,
      pageSize: 50,
    })
  })

  test('passes through any and unknown values', () => {
    const uploadStruct = struct.object({
      metadata: struct.any(),
      raw: struct.unknown(),
    })

    const raw = 'raw body'
    const metadata = ['skip', 'validation']

    const [err1, val1] = parse(uploadStruct, { metadata, raw })
    if (err1) {
      throw err1
    }
    expect(val1).toEqual({ metadata, raw })
  })

  test('parses literal, enum and union values', () => {
    const status = struct.enum(['draft', 'published'] as const)
    const channel = struct.enum({ Web: 'web', Mobile: 'mobile', Retry: 3 } as const)
    const id = struct.or(struct.string(), struct.number())

    const [s1err, s1val] = parse(status, undefined)
    if (s1err) {
      throw s1err
    }
    expect(s1val).toBe('draft')
    const [c1err, c1val] = parse(channel, undefined)
    if (c1err) {
      throw c1err
    }
    expect(c1val).toBe('web')
    const [i1err, i1val] = parse(id, 'u_123')
    if (i1err) {
      throw i1err
    }
    expect(i1val).toBe('u_123')
    const [i2err, i2val] = parse(id, 9)
    if (i2err) {
      throw i2err
    }
    expect(i2val).toBe(9)
    const [l1err, l1val] = parse(struct.literal('ok'), undefined)
    if (l1err) {
      throw l1err
    }
    expect(l1val).toBe('ok')
    const [se] = parse(status, 'archived')
    expect(se).toBeInstanceOf(StructError)
    const [ce] = parse(channel, false)
    expect(ce).toBeInstanceOf(StructError)
    const [le] = parse(struct.literal('ok'), 'no')
    expect(le).toBeInstanceOf(StructError)
    const [ie] = parse(id, false)
    expect(ie).toBeInstanceOf(StructError)
  })

  test('supports tuple and record structures for request payloads', () => {
    const coordinate = struct.tuple([struct.number(), struct.number()])
    const headers = struct.record(struct.string())

    const [c1err, c1val] = parse(coordinate, [120, 30])
    if (c1err) {
      throw c1err
    }
    expect(c1val).toEqual([120, 30])
    const [c2err, c2val] = parse(coordinate, [120, 31])
    if (c2err) {
      throw c2err
    }
    expect(c2val).toEqual([120, 31])
    const [h1err, h1val] = parse(headers, { 'x-trace-id': 'trace-1' })
    if (h1err) {
      throw h1err
    }
    expect(h1val).toEqual({ 'x-trace-id': 'trace-1' })
    const [h2err, h2val] = parse(headers, {})
    if (h2err) {
      throw h2err
    }
    expect(h2val).toEqual({})
    const [ce1] = parse(coordinate, 'bad')
    expect(ce1).toBeInstanceOf(StructError)
    const [ce2] = parse(coordinate, [120, 'bad'])
    expect(ce2).toBeInstanceOf(StructError)
    const [he1] = parse(headers, { retry: 1 })
    expect(he1).toBeInstanceOf(StructError)
    const [he2] = parse(headers, [])
    expect(he2).toBeInstanceOf(StructError)
  })

  test('supports blob file and arrayBuffer payloads', () => {
    const body = struct.arrayBuffer()
    const cover = struct.blob()
    const attachment = struct.file()

    const pdf = new Blob(['pdf'], { type: 'application/pdf' })
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const bytes = new ArrayBuffer(4)

    const [be1, bv1] = parse(body, bytes)
    if (be1) {
      throw be1
    }
    expect(bv1).toBe(bytes)
    const [ce1, cv1] = parse(cover, pdf)
    if (ce1) {
      throw ce1
    }
    expect(cv1).toBe(pdf)
    const [ae1, av1] = parse(attachment, avatar)
    if (ae1) {
      throw ae1
    }
    expect(av1).toBe(avatar)
    const [be2, bv2] = parse(body, undefined)
    if (be2) {
      throw be2
    }
    expect(bv2).toBeInstanceOf(ArrayBuffer)
    const [ce2, cv2] = parse(cover, undefined)
    if (ce2) {
      throw ce2
    }
    expect(cv2).toBeInstanceOf(Blob)
    const [ae2, av2] = parse(attachment, undefined)
    if (ae2) {
      throw ae2
    }
    expect(av2).toBeInstanceOf(File)
    const [be3] = parse(body, {})
    expect(be3).toBeInstanceOf(StructError)
    const [ce3] = parse(cover, 'bad')
    expect(ce3).toBeInstanceOf(StructError)
    const [ae3] = parse(attachment, pdf)
    expect(ae3).toBeInstanceOf(StructError)
  })

  test('treats null-prototype objects as plain objects', () => {
    const input = Object.assign(Object.create(null), {
      'x-request-id': 'trace-2',
    }) as unknown as { [key: string]: string }

    const [err, val] = parse(struct.record(struct.string()), input)
    if (err) {
      throw err
    }
    expect(val).toEqual({
      'x-request-id': 'trace-2',
    })
  })

  test('keeps request section output order path query headers body', () => {
    const Input = struct.request({
      body: struct.json(struct.object({ name: struct.string() })),
      headers: struct.object({ trace: struct.string() }),
      path: struct.object({ id: struct.string() }),
      query: struct.object({ page: struct.number() }),
    })

    const [error, value] = parse(Input, {})

    expect(error).toBeNull()
    expect(Object.keys(value)).toEqual(['path', 'query', 'headers', 'body'])
  })

  test('drops unknown keys as the only object parse policy', () => {
    const base = struct.object({
      id: struct.string(),
    })

    const [err, val] = parse(base, { id: 'u_1', extra: 'ignored' })
    if (err) {
      throw err
    }
    expect(val).toEqual({ id: 'u_1' })
  })
})
