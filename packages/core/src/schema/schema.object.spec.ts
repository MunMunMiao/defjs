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

    expect(profile.parse({ id: 'u_1' })).toEqual({
      active: false,
      id: 'u_1',
      score: 0,
    })
    expect(profile.parse({ id: 'u_1', nickname: undefined })).toEqual({
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

    expect(requestSchema.parse({})).toEqual({
      locale: 'zh-CN',
      theme: null,
    })
    expect(requestSchema.parse({ timezone: null })).toEqual({
      locale: 'zh-CN',
      theme: null,
      timezone: null,
    })
    expect(() => requestSchema.parse({ theme: 'dark' })).not.toThrow()
  })

  test('maps alias input key without changing output key', () => {
    const querySchema = schema.object({
      pageSize: schema.number().alias('page_size').default(20),
      page: schema.number().default(1),
    })

    expect(querySchema.parse({ page_size: 50 })).toEqual({
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

    expect(uploadSchema.parse({ metadata, raw })).toEqual({ metadata, raw })
    expect(() => uploadSchema.parse({ raw: 'bad' })).toThrowError(SchemaError)
  })

  test('parses literal, enum and union values', () => {
    const status = schema.enum(['draft', 'published'] as const)
    const channel = schema.enum({ Web: 'web', Mobile: 'mobile', Retry: 3 } as const)
    const id = schema.or(
      schema.string().refine(value => value['startsWith']('u_')),
      schema.number(),
    )

    expect(status.parse(undefined)).toBe('draft')
    expect(channel.parse(undefined)).toBe('web')
    expect(id.parse('u_123')).toBe('u_123')
    expect(id.parse(9)).toBe(9)
    expect(schema.literal('ok').parse(undefined)).toBe('ok')
    expect(() => status.parse('archived')).toThrowError(SchemaError)
    expect(() => channel.parse(false)).toThrowError(SchemaError)
    expect(() => schema.literal('ok').parse('no')).toThrowError(SchemaError)
    expect(() => id.parse(false)).toThrowError(SchemaError)
  })

  test('supports tuple and record structures for request payloads', () => {
    const coordinate = schema.tuple([schema.number(), schema.number().default(30)])
    const headers = schema.record(schema.string())

    expect(coordinate.parse([120])).toEqual([120, 30])
    expect(coordinate.parse([120, 31])).toEqual([120, 31])
    expect(headers.parse({ 'x-trace-id': 'trace-1' })).toEqual({ 'x-trace-id': 'trace-1' })
    expect(headers.parse({})).toEqual({})
    expect(() => coordinate.parse('bad')).toThrowError(SchemaError)
    expect(() => coordinate.parse([120, 'bad'])).toThrowError(SchemaError)
    expect(() => headers.parse({ retry: 1 })).toThrowError(SchemaError)
    expect(() => headers.parse([])).toThrowError(SchemaError)
  })

  test('supports blob file and arrayBuffer payloads', () => {
    const body = schema.arrayBuffer()
    const cover = schema.blob()
    const attachment = schema.file()

    const pdf = new Blob(['pdf'], { type: 'application/pdf' })
    const avatar = new File(['avatar'], 'avatar.png', { type: 'image/png' })
    const bytes = new ArrayBuffer(4)

    expect(body.parse(bytes)).toBe(bytes)
    expect(cover.parse(pdf)).toBe(pdf)
    expect(attachment.parse(avatar)).toBe(avatar)
    expect(body.parse(undefined)).toBeInstanceOf(ArrayBuffer)
    expect(cover.parse(undefined)).toBeInstanceOf(Blob)
    expect(attachment.parse(undefined)).toBeInstanceOf(File)
    expect(() => body.parse({})).toThrowError(SchemaError)
    expect(() => cover.parse('bad')).toThrowError(SchemaError)
    expect(() => attachment.parse(pdf)).toThrowError(SchemaError)
  })

  test('treats null-prototype objects as plain objects', () => {
    const input = Object.assign(Object.create(null), {
      'x-request-id': 'trace-2',
    }) as Record<string, string>

    expect(schema.record(schema.string()).parse(input)).toEqual({
      'x-request-id': 'trace-2',
    })
  })

  test('strip drops unknown keys by default (Go json default)', () => {
    const base = schema.object({
      id: schema.string(),
    })

    expect(base.parse({ id: 'u_1', extra: 'ignored' })).toEqual({ id: 'u_1' })
  })

  test('strict rejects unknown keys like json.Decoder.DisallowUnknownFields', () => {
    const strictUser = schema
      .object({
        id: schema.string(),
      })
      .strict()

    expect(strictUser.parse({ id: 'u_1' })).toEqual({ id: 'u_1' })

    expect(() => strictUser.parse({ id: 'u_1', extra: 'no' })).toThrowError(SchemaError)

    try {
      strictUser.parse({ id: 'u_1', extra: 'no', also: 1 })
    } catch (error) {
      const issues = (error as SchemaError).issues
      expect(issues).toEqual([
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
    }
  })

  test('passthrough keeps unknown keys verbatim', () => {
    const loose = schema
      .object({
        id: schema.string(),
      })
      .passthrough()

    expect(loose.parse({ id: 'u_1', extra: 'kept', count: 7 })).toEqual({
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
    expect(round.parse({ id: 'u_1', extra: 'dropped' })).toEqual({ id: 'u_1' })
  })

  test('respects alias under strict mode', () => {
    const renamed = schema
      .object({
        pageSize: schema.number().alias('page_size'),
      })
      .strict()

    expect(renamed.parse({ page_size: 20 })).toEqual({ pageSize: 20 })

    expect(() => renamed.parse({ page_size: 20, pageSize: 99 })).toThrowError(SchemaError)
  })
})
