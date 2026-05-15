import { describe, expect, test } from 'vitest'
import { decodeJson, StructError, struct, tag } from './index'

describe('parse.ts object and composite values', () => {
  test('supports user profile defaults and optional keys', () => {
    const profile = struct.object({
      id: struct.string(),
      nickname: struct.string().optional(),
      score: struct.number(),
      active: struct.boolean(),
    })

    const [err1, val1] = profile.parse({ id: 'u_1' })
    if (err1) {
      throw err1
    }
    expect(val1).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
    const [err2, val2] = profile.parse({ id: 'u_1', nickname: undefined })
    if (err2) {
      throw err2
    }
    expect(val2).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
  })

  test('keeps optional, null and nullish behavior distinct', () => {
    const requestSchema = struct.object({
      locale: struct.string().optional(),
      timezone: struct.string().nullish(),
      theme: struct.string().null(),
    })

    const [err1, val1] = requestSchema.parse({})
    if (err1) {
      throw err1
    }
    expect(val1).toEqual({
      theme: null,
    })
    const [err2, val2] = requestSchema.parse({ timezone: null })
    if (err2) {
      throw err2
    }
    expect(val2).toEqual({
      theme: null,
      timezone: null,
    })
    const [err3] = requestSchema.parse({ theme: 'dark' })
    expect(err3).toBeNull()
  })

  test('maps tagged json input key without changing output key', () => {
    const querySchema = struct.object({
      pageSize: struct.number().tag(tag.json('page_size')),
      page: struct.number(),
    })

    const val = decodeJson(querySchema, { page: 1, page_size: 50 })
    expect(val).toEqual({
      page: 1,
      pageSize: 50,
    })
  })

  test('passes through any and unknown values', () => {
    const uploadSchema = struct.object({
      metadata: struct.any(),
      raw: struct.unknown(),
    })

    const raw = 'raw body'
    const metadata = ['skip', 'validation']

    const [err1, val1] = uploadSchema.parse({ metadata, raw })
    if (err1) {
      throw err1
    }
    expect(val1).toEqual({ metadata, raw })
  })

  test('parses literal, enum and union values', () => {
    const status = struct.enum(['draft', 'published'] as const)
    const channel = struct.enum({ Web: 'web', Mobile: 'mobile', Retry: 3 } as const)
    const id = struct.or(struct.string(), struct.number())

    const [s1err, s1val] = status.parse(undefined)
    if (s1err) {
      throw s1err
    }
    expect(s1val).toBe('draft')
    const [c1err, c1val] = channel.parse(undefined)
    if (c1err) {
      throw c1err
    }
    expect(c1val).toBe('web')
    const [i1err, i1val] = id.parse('u_123')
    if (i1err) {
      throw i1err
    }
    expect(i1val).toBe('u_123')
    const [i2err, i2val] = id.parse(9)
    if (i2err) {
      throw i2err
    }
    expect(i2val).toBe(9)
    const [l1err, l1val] = struct.literal('ok').parse(undefined)
    if (l1err) {
      throw l1err
    }
    expect(l1val).toBe('ok')
    const [se] = status.parse('archived')
    expect(se).toBeInstanceOf(StructError)
    const [ce] = channel.parse(false)
    expect(ce).toBeInstanceOf(StructError)
    const [le] = struct.literal('ok').parse('no')
    expect(le).toBeInstanceOf(StructError)
    const [ie] = id.parse(false)
    expect(ie).toBeInstanceOf(StructError)
  })

  test('supports tuple and record structures for request payloads', () => {
    const coordinate = struct.tuple([struct.number(), struct.number()])
    const headers = struct.record(struct.string())

    const [c1err, c1val] = coordinate.parse([120, 30])
    if (c1err) {
      throw c1err
    }
    expect(c1val).toEqual([120, 30])
    const [c2err, c2val] = coordinate.parse([120, 31])
    if (c2err) {
      throw c2err
    }
    expect(c2val).toEqual([120, 31])
    const [h1err, h1val] = headers.parse({ 'x-trace-id': 'trace-1' })
    if (h1err) {
      throw h1err
    }
    expect(h1val).toEqual({ 'x-trace-id': 'trace-1' })
    const [h2err, h2val] = headers.parse({})
    if (h2err) {
      throw h2err
    }
    expect(h2val).toEqual({})
    const [ce1] = coordinate.parse('bad')
    expect(ce1).toBeInstanceOf(StructError)
    const [ce2] = coordinate.parse([120, 'bad'])
    expect(ce2).toBeInstanceOf(StructError)
    const [he1] = headers.parse({ retry: 1 })
    expect(he1).toBeInstanceOf(StructError)
    const [he2] = headers.parse([])
    expect(he2).toBeInstanceOf(StructError)
  })

  test('supports blob file and arrayBuffer payloads', () => {
    const body = struct.arrayBuffer()
    const cover = struct.blob()
    const attachment = struct.file()

    const pdf = new Blob(['pdf'], { type: 'application/pdf' })
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const bytes = new ArrayBuffer(4)

    const [be1, bv1] = body.parse(bytes)
    if (be1) {
      throw be1
    }
    expect(bv1).toBe(bytes)
    const [ce1, cv1] = cover.parse(pdf)
    if (ce1) {
      throw ce1
    }
    expect(cv1).toBe(pdf)
    const [ae1, av1] = attachment.parse(avatar)
    if (ae1) {
      throw ae1
    }
    expect(av1).toBe(avatar)
    const [be2, bv2] = body.parse(undefined)
    if (be2) {
      throw be2
    }
    expect(bv2).toBeInstanceOf(ArrayBuffer)
    const [ce2, cv2] = cover.parse(undefined)
    if (ce2) {
      throw ce2
    }
    expect(cv2).toBeInstanceOf(Blob)
    const [ae2, av2] = attachment.parse(undefined)
    if (ae2) {
      throw ae2
    }
    expect(av2).toBeInstanceOf(File)
    const [be3] = body.parse({})
    expect(be3).toBeInstanceOf(StructError)
    const [ce3] = cover.parse('bad')
    expect(ce3).toBeInstanceOf(StructError)
    const [ae3] = attachment.parse(pdf)
    expect(ae3).toBeInstanceOf(StructError)
  })

  test('treats null-prototype objects as plain objects', () => {
    const input = Object.assign(Object.create(null), {
      'x-request-id': 'trace-2',
    }) as Record<string, string>

    const [err, val] = struct.record(struct.string()).parse(input)
    if (err) {
      throw err
    }
    expect(val).toEqual({
      'x-request-id': 'trace-2',
    })
  })

  test('strip drops unknown keys by default (Go json default)', () => {
    const base = struct.object({
      id: struct.string(),
    })

    const [err, val] = base.parse({ id: 'u_1', extra: 'ignored' })
    if (err) {
      throw err
    }
    expect(val).toEqual({ id: 'u_1' })
  })

  test('parse option rejects unknown keys like json.Decoder.DisallowUnknownFields', () => {
    const user = struct.object({
      id: struct.string(),
    })

    const [e1, v1] = user.parse({ id: 'u_1' }, { unknownFields: 'error' })
    if (e1) {
      throw e1
    }
    expect(v1).toEqual({ id: 'u_1' })

    const [e2] = user.parse({ id: 'u_1', extra: 'no' }, { unknownFields: 'error' })
    expect(e2).toBeInstanceOf(StructError)

    const [e3] = user.parse({ id: 'u_1', extra: 'no', also: 1 }, { unknownFields: 'error' })
    expect(e3).toBeInstanceOf(StructError)
    expect(e3?.issues).toEqual([
      {
        code: 'unrecognized_keys',
        expected: 'declared field',
        message: 'Unrecognized key "extra"',
        path: ['extra'],
        received: 'no',
      },
      {
        code: 'unrecognized_keys',
        expected: 'declared field',
        message: 'Unrecognized key "also"',
        path: ['also'],
        received: 1,
      },
    ])
  })

  test('decodeJson can reject unknown wire keys through parse options', () => {
    const renamed = struct.object({
      pageSize: struct.number().tag(tag.json('page_size')),
    })

    expect(decodeJson(renamed, { page_size: 20 })).toEqual({ pageSize: 20 })
    expect(() => decodeJson(renamed, { page_size: 20, extra: 99 }, { unknownFields: 'error' })).toThrow(StructError)
  })
})
