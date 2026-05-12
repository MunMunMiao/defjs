import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema object and composite values', () => {
  test('supports user profile defaults and optional keys', () => {
    const profile = schema.object({
      id: schema.string(),
      nickname: schema.string().optional(),
      score: schema.number(),
      active: schema.boolean(),
    })

    const [err1, val1] = profile.parse({ id: 'u_1' })
    expect(err1).toBeNull()
    expect(val1).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
    const [err2, val2] = profile.parse({ id: 'u_1', nickname: undefined })
    expect(err2).toBeNull()
    expect(val2).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
  })

  test('keeps optional defaulted field and nullish behavior distinct', () => {
    const requestSchema = schema.object({
      locale: schema.string().optional().default('zh-CN'),
      timezone: schema.string().nullish(),
      theme: schema.string().null(),
    })

    const [err1, val1] = requestSchema.parse({})
    expect(err1).toBeNull()
    expect(val1).toEqual({
      locale: 'zh-CN',
      theme: null,
    })
    const [err2, val2] = requestSchema.parse({ timezone: null })
    expect(err2).toBeNull()
    expect(val2).toEqual({
      locale: 'zh-CN',
      theme: null,
      timezone: null,
    })
    const [err3] = requestSchema.parse({ theme: 'dark' })
    expect(err3).toBeNull()
  })

  test('maps alias input key without changing output key', () => {
    const querySchema = schema.object({
      pageSize: schema.number().alias('page_size').default(20),
      page: schema.number().default(1),
    })

    const [err, val] = querySchema.parse({ page_size: 50 })
    expect(err).toBeNull()
    expect(val).toEqual({
      page: 1,
      pageSize: 50,
    })
  })

  test('passes through any and unknown while still honoring refine', () => {
    const uploadSchema = schema.object({
      metadata: schema.any(),
      raw: schema.unknown().refine(value => typeof value === 'object' && value !== null, 'raw must be object'),
    })

    const raw = { ext: 'png', size: 128 }
    const metadata = ['skip', 'validation']

    const [err1, val1] = uploadSchema.parse({ metadata, raw })
    expect(err1).toBeNull()
    expect(val1).toEqual({ metadata, raw })
    const [err2] = uploadSchema.parse({ raw: 'bad' })
    expect(err2).toBeInstanceOf(SchemaError)
  })

  test('parses literal, enum and union values', () => {
    const status = schema.enum(['draft', 'published'] as const)
    const channel = schema.enum({ Web: 'web', Mobile: 'mobile', Retry: 3 } as const)
    const id = schema.or(
      schema.string().refine(value => value['startsWith']('u_')),
      schema.number(),
    )

    const [s1err, s1val] = status.parse(undefined)
    expect(s1err).toBeNull()
    expect(s1val).toBe('draft')
    const [c1err, c1val] = channel.parse(undefined)
    expect(c1err).toBeNull()
    expect(c1val).toBe('web')
    const [i1err, i1val] = id.parse('u_123')
    expect(i1err).toBeNull()
    expect(i1val).toBe('u_123')
    const [i2err, i2val] = id.parse(9)
    expect(i2err).toBeNull()
    expect(i2val).toBe(9)
    const [l1err, l1val] = schema.literal('ok').parse(undefined)
    expect(l1err).toBeNull()
    expect(l1val).toBe('ok')
    const [se] = status.parse('archived')
    expect(se).toBeInstanceOf(SchemaError)
    const [ce] = channel.parse(false)
    expect(ce).toBeInstanceOf(SchemaError)
    const [le] = schema.literal('ok').parse('no')
    expect(le).toBeInstanceOf(SchemaError)
    const [ie] = id.parse(false)
    expect(ie).toBeInstanceOf(SchemaError)
  })

  test('supports tuple and record structures for request payloads', () => {
    const coordinate = schema.tuple([schema.number(), schema.number().default(30)])
    const headers = schema.record(schema.string())

    const [c1err, c1val] = coordinate.parse([120])
    expect(c1err).toBeNull()
    expect(c1val).toEqual([120, 30])
    const [c2err, c2val] = coordinate.parse([120, 31])
    expect(c2err).toBeNull()
    expect(c2val).toEqual([120, 31])
    const [h1err, h1val] = headers.parse({ 'x-trace-id': 'trace-1' })
    expect(h1err).toBeNull()
    expect(h1val).toEqual({ 'x-trace-id': 'trace-1' })
    const [h2err, h2val] = headers.parse({})
    expect(h2err).toBeNull()
    expect(h2val).toEqual({})
    const [ce1] = coordinate.parse('bad')
    expect(ce1).toBeInstanceOf(SchemaError)
    const [ce2] = coordinate.parse([120, 'bad'])
    expect(ce2).toBeInstanceOf(SchemaError)
    const [he1] = headers.parse({ retry: 1 })
    expect(he1).toBeInstanceOf(SchemaError)
    const [he2] = headers.parse([])
    expect(he2).toBeInstanceOf(SchemaError)
  })

  test('supports blob file and arrayBuffer payloads', () => {
    const body = schema.arrayBuffer()
    const cover = schema.blob()
    const attachment = schema.file()

    const pdf = new Blob(['pdf'], { type: 'application/pdf' })
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const bytes = new ArrayBuffer(4)

    const [be1, bv1] = body.parse(bytes)
    expect(be1).toBeNull()
    expect(bv1).toBe(bytes)
    const [ce1, cv1] = cover.parse(pdf)
    expect(ce1).toBeNull()
    expect(cv1).toBe(pdf)
    const [ae1, av1] = attachment.parse(avatar)
    expect(ae1).toBeNull()
    expect(av1).toBe(avatar)
    const [be2, bv2] = body.parse(undefined)
    expect(be2).toBeNull()
    expect(bv2).toBeInstanceOf(ArrayBuffer)
    const [ce2, cv2] = cover.parse(undefined)
    expect(ce2).toBeNull()
    expect(cv2).toBeInstanceOf(Blob)
    const [ae2, av2] = attachment.parse(undefined)
    expect(ae2).toBeNull()
    expect(av2).toBeInstanceOf(File)
    const [be3] = body.parse({})
    expect(be3).toBeInstanceOf(SchemaError)
    const [ce3] = cover.parse('bad')
    expect(ce3).toBeInstanceOf(SchemaError)
    const [ae3] = attachment.parse(pdf)
    expect(ae3).toBeInstanceOf(SchemaError)
  })

  test('treats null-prototype objects as plain objects', () => {
    const input = Object.assign(Object.create(null), {
      'x-request-id': 'trace-2',
    }) as Record<string, string>

    const [err, val] = schema.record(schema.string()).parse(input)
    expect(err).toBeNull()
    expect(val).toEqual({
      'x-request-id': 'trace-2',
    })
  })

  test('strip drops unknown keys by default (Go json default)', () => {
    const base = schema.object({
      id: schema.string(),
    })

    const [err, val] = base.parse({ id: 'u_1', extra: 'ignored' })
    expect(err).toBeNull()
    expect(val).toEqual({ id: 'u_1' })
  })

  test('strict rejects unknown keys like json.Decoder.DisallowUnknownFields', () => {
    const strictUser = schema
      .object({
        id: schema.string(),
      })
      .strict()

    const [e1, v1] = strictUser.parse({ id: 'u_1' })
    expect(e1).toBeNull()
    expect(v1).toEqual({ id: 'u_1' })

    const [e2] = strictUser.parse({ id: 'u_1', extra: 'no' })
    expect(e2).toBeInstanceOf(SchemaError)

    const [e3] = strictUser.parse({ id: 'u_1', extra: 'no', also: 1 })
    expect(e3).toBeInstanceOf(SchemaError)
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

  test('passthrough keeps unknown keys verbatim', () => {
    const loose = schema
      .object({
        id: schema.string(),
      })
      .passthrough()

    const [err, val] = loose.parse({ id: 'u_1', extra: 'kept', count: 7 })
    expect(err).toBeNull()
    expect(val).toEqual({
      id: 'u_1',
      extra: 'kept',
      count: 7,
    })
  })

  test('strip explicitly returns to default behavior after strict', () => {
    const base = schema.object({
      id: schema.string(),
    })

    const round = base.strict().strip()
    const [err, val] = round.parse({ id: 'u_1', extra: 'dropped' })
    expect(err).toBeNull()
    expect(val).toEqual({ id: 'u_1' })
  })

  test('respects alias under strict mode', () => {
    const renamed = schema
      .object({
        pageSize: schema.number().alias('page_size'),
      })
      .strict()

    const [e1, v1] = renamed.parse({ page_size: 20 })
    expect(e1).toBeNull()
    expect(v1).toEqual({ pageSize: 20 })

    const [e2] = renamed.parse({ page_size: 20, pageSize: 99 })
    expect(e2).toBeInstanceOf(SchemaError)
  })
})
