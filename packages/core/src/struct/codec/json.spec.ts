import { describe, expect, test } from 'vitest'
import { struct, tag } from '../index'
import { decodeJson, encodeJson } from './json'

describe('codec/json.ts', () => {
  test('maps API JSON field names through tag.json()', () => {
    const user = struct.object({
      id: struct.number().tag(tag.json('id')),
      name: struct.string().tag(tag.json('user_name')),
    })

    expect(encodeJson(user, { id: 1, name: 'Miao' })).toEqual({
      id: 1,
      user_name: 'Miao',
    })
    expect(decodeJson(user, { id: 1, user_name: 'Miao' })).toEqual({
      id: 1,
      name: 'Miao',
    })
  })

  test('rewrites tagged keys back to JSON wire form', () => {
    const user = struct.object({
      page: struct.number(),
      pageSize: struct.number().tag(tag.json('page_size')),
    })

    expect(encodeJson(user, { pageSize: 50, page: 1 })).toEqual({ page_size: 50, page: 1 })
  })

  test('unknown JSON wire keys are ignored', () => {
    const query = struct.object({
      pageSize: struct.number().tag(tag.json('page_size')),
    })

    expect(decodeJson(query, { page_size: 20, pageSize: 99 })).toEqual({ pageSize: 20 })
  })

  test('requireTag ignores untagged wire keys', () => {
    const query = struct.object({
      internal: struct.string(),
      pageSize: struct.number().tag(tag.json('page_size')),
    })

    expect(decodeJson(query, { internal: 'ignored', page_size: 20 }, { requireTag: true })).toEqual({
      internal: '',
      pageSize: 20,
    })
  })

  test('recurses into nested JSON objects', () => {
    const blog = struct.object({
      authorId: struct.string().tag(tag.json('author_id')),
      tags: struct.array(struct.string()),
    })

    expect(encodeJson(blog, { authorId: 'u_1', tags: ['a', 'b'] })).toEqual({
      author_id: 'u_1',
      tags: ['a', 'b'],
    })
  })

  test('requireTag applies recursively to nested objects and arrays', () => {
    const profile = struct.object({
      name: struct.string().tag(tag.json('full_name')),
      secret: struct.string().optional(),
    })
    const user = struct.object({
      internalOnly: struct.string().optional(),
      profile: profile.tag(tag.json('profile')),
      team: struct.array(profile).tag(tag.json('team')),
    })

    expect(
      encodeJson(
        user,
        {
          internalOnly: 'hidden',
          profile: { name: 'Miao', secret: 'local' },
          team: [{ name: 'Core', secret: 'local-team' }],
        },
        { requireTag: true },
      ),
    ).toEqual({
      profile: { full_name: 'Miao' },
      team: [{ full_name: 'Core' }],
    })

    expect(
      decodeJson(
        user,
        {
          internalOnly: 'ignored',
          profile: { full_name: 'Miao', secret: 'ignored' },
          team: [{ full_name: 'Core', secret: 'ignored-team' }],
        },
        { requireTag: true },
      ),
    ).toEqual({
      profile: { name: 'Miao' },
      team: [{ name: 'Core' }],
    })
  })

  test('requireTag applies to top-level arrays of objects', () => {
    const profile = struct.object({
      name: struct.string().tag(tag.json('full_name')),
      secret: struct.string().optional(),
    })
    const profiles = struct.array(profile)

    expect(encodeJson(profiles, [{ name: 'Miao', secret: 'local' }], { requireTag: true })).toEqual([{ full_name: 'Miao' }])
    expect(decodeJson(profiles, [{ full_name: 'Miao', secret: 'ignored' }], { requireTag: true })).toEqual([{ name: 'Miao' }])
  })

  test('requireTag decodes tagged union objects symmetrically', () => {
    const event = struct.or(
      struct.object({
        payload: struct.string().tag(tag.json('body')),
        type: struct.literal('message').tag(tag.json('kind')),
      }),
      struct.object({
        count: struct.number().tag(tag.json('count')),
        type: struct.literal('count').tag(tag.json('kind')),
      }),
    )

    expect(encodeJson(event, { payload: 'hello', type: 'message' }, { requireTag: true })).toEqual({
      body: 'hello',
      kind: 'message',
    })
    expect(encodeJson(event, { count: 3, type: 'count' }, { requireTag: true })).toEqual({
      count: 3,
      kind: 'count',
    })
    expect(decodeJson(event, { body: 'hello', kind: 'message' }, { requireTag: true })).toEqual({
      payload: 'hello',
      type: 'message',
    })
    expect(decodeJson(event, { count: 3, kind: 'count' }, { requireTag: true })).toEqual({
      count: 3,
      type: 'count',
    })
    expect(decodeJson(event, { count: 1, kind: 'message' }, { requireTag: true })).toEqual({
      payload: '',
      type: 'message',
    })
  })

  test('union encode branch selection uses pure field type checks without a discriminator', () => {
    const event = struct.or(
      struct.object({
        value: struct.string().tag(tag.json('text')),
      }),
      struct.object({
        value: struct.number().tag(tag.json('count')),
      }),
    )

    expect(encodeJson(event, { value: 'hello' }, { requireTag: true })).toEqual({ text: 'hello' })
    expect(encodeJson(event, { value: 3 }, { requireTag: true })).toEqual({ count: 3 })
    expect(decodeJson(event, { count: 3 }, { requireTag: true })).toEqual({ value: 3 })
  })

  test('union encode branch selection recurses into collection field types', () => {
    const arrayEvent = struct.or(
      struct.object({ value: struct.array(struct.string()).tag(tag.json('texts')) }),
      struct.object({ value: struct.array(struct.number()).tag(tag.json('counts')) }),
    )
    const recordEvent = struct.or(
      struct.object({ value: struct.record(struct.string()).tag(tag.json('labels')) }),
      struct.object({ value: struct.record(struct.number()).tag(tag.json('totals')) }),
    )
    const tupleEvent = struct.or(
      struct.object({ value: struct.tuple([struct.string()]).tag(tag.json('label_tuple')) }),
      struct.object({ value: struct.tuple([struct.number()]).tag(tag.json('count_tuple')) }),
    )

    expect(encodeJson(arrayEvent, { value: [1, 2] }, { requireTag: true })).toEqual({ counts: [1, 2] })
    expect(decodeJson(arrayEvent, { counts: [1, 2] }, { requireTag: true })).toEqual({ value: [1, 2] })
    expect(encodeJson(recordEvent, { value: { total: 3 } }, { requireTag: true })).toEqual({ totals: { total: 3 } })
    expect(decodeJson(recordEvent, { totals: { total: 3 } }, { requireTag: true })).toEqual({ value: { total: 3 } })
    expect(encodeJson(tupleEvent, { value: [3] }, { requireTag: true })).toEqual({ count_tuple: [3] })
    expect(decodeJson(tupleEvent, { count_tuple: [3] }, { requireTag: true })).toEqual({ value: [3] })
  })

  test('union encode branch selection keeps option order for uninformative fields', () => {
    const arrayEvent = struct.or(
      struct.object({ value: struct.array(struct.string()).tag(tag.json('texts')) }),
      struct.object({ value: struct.array(struct.number()).tag(tag.json('counts')) }),
    )
    const recordEvent = struct.or(
      struct.object({ value: struct.record(struct.string()).tag(tag.json('labels')) }),
      struct.object({ value: struct.record(struct.number()).tag(tag.json('totals')) }),
    )
    const stringEvent = struct.or(
      struct.object({
        value: struct.string().tag(tag.json('text')),
      }),
      struct.object({ value: struct.string().tag(tag.json('raw')) }),
    )

    expect(encodeJson(arrayEvent, { value: [] }, { requireTag: true })).toEqual({ texts: [] })
    expect(encodeJson(recordEvent, { value: {} }, { requireTag: true })).toEqual({ labels: {} })
    expect(encodeJson(stringEvent, { value: 'hello' }, { requireTag: true })).toEqual({ text: 'hello' })
  })

  test('requireTag decodes discriminated union objects symmetrically', () => {
    const event = struct.discriminatedUnion('type', [
      struct.object({
        payload: struct.string().tag(tag.json('body')),
        type: struct.literal('message').tag(tag.json('kind')),
      }),
      struct.object({
        count: struct.number().tag(tag.json('count')),
        type: struct.literal('count').tag(tag.json('kind')),
      }),
    ])

    expect(encodeJson(event, { payload: 'hello', type: 'message' }, { requireTag: true })).toEqual({
      body: 'hello',
      kind: 'message',
    })
    expect(encodeJson(event, { count: 3, type: 'count' }, { requireTag: true })).toEqual({
      count: 3,
      kind: 'count',
    })
    expect(decodeJson(event, { body: 'hello', kind: 'message' }, { requireTag: true })).toEqual({
      payload: 'hello',
      type: 'message',
    })
    expect(decodeJson(event, { count: 3, kind: 'count' }, { requireTag: true })).toEqual({
      count: 3,
      type: 'count',
    })
    expect(decodeJson(event, { count: 1, kind: 'message' }, { requireTag: true })).toEqual({
      payload: '',
      type: 'message',
    })
  })

  test('requireTag decodes intersection right-side tagged objects symmetrically', () => {
    const profile = struct.object({
      name: struct.string().tag(tag.json('full_name')),
    })
    const schema = struct.intersection(struct.unknown(), profile)

    expect(encodeJson(schema, { name: 'Miao' }, { requireTag: true })).toEqual({ full_name: 'Miao' })
    expect(decodeJson(schema, { full_name: 'Miao' }, { requireTag: true })).toEqual({ name: 'Miao' })
    expect(decodeJson(schema, {}, { requireTag: true })).toEqual({ name: '' })
  })
})
