import { describe, expect, test } from 'vitest'
import { struct } from '../index'
import { decodeJson, encodeJson } from './json'

describe('codec/json.ts', () => {
  test('maps API JSON field names through alias()', () => {
    const user = struct.object({
      id: struct.number().alias('id'),
      name: struct.string().alias('user_name'),
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

  test('falls back to field names for fields without aliases', () => {
    const user = struct.object({
      page: struct.number(),
      pageSize: struct.number().alias('page_size'),
    })

    expect(encodeJson(user, { pageSize: 50, page: 1 })).toEqual({ page_size: 50, page: 1 })
    expect(decodeJson(user, { page_size: 50, page: 1 })).toEqual({ pageSize: 50, page: 1 })
  })

  test('unknown JSON wire keys are ignored', () => {
    const query = struct.object({
      pageSize: struct.number().alias('page_size'),
    })

    expect(decodeJson(query, { page_size: 20, pageSize: 99 })).toEqual({ pageSize: 20 })
  })

  test('does not filter unaliased fields', () => {
    const query = struct.object({
      internal: struct.string(),
      pageSize: struct.number().alias('page_size'),
    })

    expect(decodeJson(query, { internal: 'kept', page_size: 20 })).toEqual({
      internal: 'kept',
      pageSize: 20,
    })
    expect(encodeJson(query, { internal: 'kept', pageSize: 20 })).toEqual({
      internal: 'kept',
      page_size: 20,
    })
  })

  test('recurses into nested JSON objects and arrays', () => {
    const profile = struct.object({
      name: struct.string().alias('full_name'),
      secret: struct.string().optional(),
    })
    const user = struct.object({
      internalOnly: struct.string().optional(),
      profile: profile.alias('profile'),
      team: struct.array(profile).alias('team'),
    })

    expect(
      encodeJson(user, {
        internalOnly: 'visible',
        profile: { name: 'Miao', secret: 'local' },
        team: [{ name: 'Core', secret: 'local-team' }],
      }),
    ).toEqual({
      internalOnly: 'visible',
      profile: { full_name: 'Miao', secret: 'local' },
      team: [{ full_name: 'Core', secret: 'local-team' }],
    })

    expect(
      decodeJson(user, {
        internalOnly: 'visible',
        profile: { full_name: 'Miao', secret: 'local' },
        team: [{ full_name: 'Core', secret: 'local-team' }],
      }),
    ).toEqual({
      internalOnly: 'visible',
      profile: { name: 'Miao', secret: 'local' },
      team: [{ name: 'Core', secret: 'local-team' }],
    })
  })

  test('recurses into top-level arrays of objects', () => {
    const profile = struct.object({
      name: struct.string().alias('full_name'),
      secret: struct.string().optional(),
    })
    const profiles = struct.array(profile)

    expect(encodeJson(profiles, [{ name: 'Miao', secret: 'local' }])).toEqual([{ full_name: 'Miao', secret: 'local' }])
    expect(decodeJson(profiles, [{ full_name: 'Miao', secret: 'local' }])).toEqual([{ name: 'Miao', secret: 'local' }])
  })

  test('decodes aliased union objects symmetrically', () => {
    const event = struct.or(
      struct.object({
        payload: struct.string().alias('body'),
        type: struct.literal('message').alias('kind'),
      }),
      struct.object({
        count: struct.number().alias('count'),
        type: struct.literal('count').alias('kind'),
      }),
    )

    expect(encodeJson(event, { payload: 'hello', type: 'message' })).toEqual({
      body: 'hello',
      kind: 'message',
    })
    expect(encodeJson(event, { count: 3, type: 'count' })).toEqual({
      count: 3,
      kind: 'count',
    })
    expect(decodeJson(event, { body: 'hello', kind: 'message' })).toEqual({
      payload: 'hello',
      type: 'message',
    })
    expect(decodeJson(event, { count: 3, kind: 'count' })).toEqual({
      count: 3,
      type: 'count',
    })
    expect(decodeJson(event, { count: 1, kind: 'message' })).toEqual({
      payload: '',
      type: 'message',
    })
  })

  test('selects aliased union branches by scalar field type without a discriminator', () => {
    const event = struct.or(
      struct.object({ value: struct.string().alias('text') }),
      struct.object({ value: struct.number().alias('count') }),
    )

    expect(encodeJson(event, { value: 'hello' })).toEqual({ text: 'hello' })
    expect(encodeJson(event, { value: 3 })).toEqual({ count: 3 })
    expect(decodeJson(event, { count: 3 })).toEqual({ value: 3 })
  })

  test('selects object union branch when nullable primitive field is present as null', () => {
    const Payload = struct.or(
      struct.object({ kind: struct.literal('date'), at: struct.date().null().alias('created_at') }),
      struct.object({ kind: struct.literal('text'), value: struct.string() }),
    )

    expect(encodeJson(Payload, { kind: 'date', at: null })).toEqual({ kind: 'date', created_at: null })
  })

  test('selects aliased union branch by runtime date value rather than string wire guard', () => {
    const Payload = struct.or(
      struct.object({ value: struct.date().alias('created_at') }),
      struct.object({ value: struct.string().alias('text') }),
    )

    expect(encodeJson(Payload, { value: new Date('2026-05-12T10:00:00Z') })).toEqual({
      created_at: '2026-05-12T10:00:00.000Z',
    })
  })

  test('selects aliased union branch by runtime bigint value rather than number branch', () => {
    const Payload = struct.or(
      struct.object({ value: struct.bigint().alias('id') }),
      struct.object({ value: struct.number().alias('count') }),
    )

    expect(encodeJson(Payload, { value: 42n })).toEqual({ id: '42' })
  })

  test('selects aliased union branches through collection field types', () => {
    const arrayEvent = struct.or(
      struct.object({ value: struct.array(struct.string()).alias('texts') }),
      struct.object({ value: struct.array(struct.number()).alias('counts') }),
    )
    const recordEvent = struct.or(
      struct.object({ value: struct.record(struct.string()).alias('labels') }),
      struct.object({ value: struct.record(struct.number()).alias('totals') }),
    )
    const tupleEvent = struct.or(
      struct.object({ value: struct.tuple([struct.string()]).alias('label_tuple') }),
      struct.object({ value: struct.tuple([struct.number()]).alias('count_tuple') }),
    )

    expect(encodeJson(arrayEvent, { value: [1, 2] })).toEqual({ counts: [1, 2] })
    expect(decodeJson(arrayEvent, { counts: [1, 2] })).toEqual({ value: [1, 2] })
    expect(encodeJson(recordEvent, { value: { total: 3 } })).toEqual({ totals: { total: 3 } })
    expect(decodeJson(recordEvent, { totals: { total: 3 } })).toEqual({ value: { total: 3 } })
    expect(encodeJson(tupleEvent, { value: [3] })).toEqual({ count_tuple: [3] })
    expect(decodeJson(tupleEvent, { count_tuple: [3] })).toEqual({ value: [3] })
  })

  test('rejects ambiguous aliased union object branches', () => {
    const Payload = struct.or(
      struct.object({ value: struct.string().alias('text') }),
      struct.object({ value: struct.string().alias('label') }),
    )

    expect(() => encodeJson(Payload, { value: 'x' })).toThrow('ambiguous union encode')
  })

  test('rejects ambiguous aliased union array branches', () => {
    const Payload = struct.or(struct.array(struct.string()).alias('texts'), struct.array(struct.string()).alias('labels'))

    expect(() => encodeJson(Payload, [])).toThrow('ambiguous union encode')
  })

  test('decodes aliased discriminated union objects symmetrically', () => {
    const event = struct.discriminatedUnion('type', [
      struct.object({
        payload: struct.string().alias('body'),
        type: struct.literal('message').alias('kind'),
      }),
      struct.object({
        count: struct.number().alias('count'),
        type: struct.literal('count').alias('kind'),
      }),
    ])

    expect(encodeJson(event, { payload: 'hello', type: 'message' })).toEqual({
      body: 'hello',
      kind: 'message',
    })
    expect(encodeJson(event, { count: 3, type: 'count' })).toEqual({
      count: 3,
      kind: 'count',
    })
    expect(decodeJson(event, { body: 'hello', kind: 'message' })).toEqual({
      payload: 'hello',
      type: 'message',
    })
    expect(decodeJson(event, { count: 3, kind: 'count' })).toEqual({
      count: 3,
      type: 'count',
    })
    expect(decodeJson(event, { count: 1, kind: 'message' })).toEqual({
      payload: '',
      type: 'message',
    })
  })

  test('routes aliased discriminated union by discriminator wire key before normalizing target branch', () => {
    const Message = struct.discriminatedUnion('type', [
      struct.object({ type: struct.literal('text').alias('kind'), body: struct.string().alias('message_body') }),
      struct.object({ type: struct.literal('count').alias('kind'), count: struct.number().alias('total_count') }),
    ])

    expect(decodeJson(Message, { kind: 'count', total_count: 3 })).toEqual({ type: 'count', count: 3 })
  })

  test('rejects conflicting aliased discriminators in discriminated union decode', () => {
    const Message = struct.discriminatedUnion('type', [
      struct.object({ type: struct.literal('text').alias('kind'), body: struct.string() }),
      struct.object({ type: struct.literal('count').alias('event_type'), count: struct.number() }),
    ])

    expect(() => decodeJson(Message, { kind: 'text', event_type: 'count', count: 1 })).toThrow(
      'ambiguous discriminated union discriminator',
    )
  })

  test('decodes aliased intersection right-side objects symmetrically', () => {
    const profile = struct.object({
      name: struct.string().alias('full_name'),
    })
    const intersectionStruct = struct.intersection(struct.unknown(), profile)

    expect(encodeJson(intersectionStruct, { name: 'Miao' })).toEqual({ full_name: 'Miao' })
    expect(decodeJson(intersectionStruct, { full_name: 'Miao' })).toEqual({ name: 'Miao' })
    expect(decodeJson(intersectionStruct, {})).toEqual({ name: '' })
  })

  test('encodes and decodes both aliased intersection object sides', () => {
    const account = struct.object({
      id: struct.string().alias('account_id'),
    })
    const profile = struct.object({
      name: struct.string().alias('full_name'),
    })
    const intersectionStruct = struct.intersection(account, profile)

    expect(encodeJson(intersectionStruct, { id: 'u_1', name: 'Miao' })).toEqual({
      account_id: 'u_1',
      full_name: 'Miao',
    })
    expect(decodeJson(intersectionStruct, { account_id: 'u_1', full_name: 'Miao' })).toEqual({
      id: 'u_1',
      name: 'Miao',
    })
  })

  test('encodes and decodes nested aliased intersection object sides', () => {
    const account = struct.object({
      id: struct.string().alias('account_id'),
    })
    const profile = struct.object({
      name: struct.string().alias('full_name'),
    })
    const audit = struct.object({
      when: struct.date().alias('created_at'),
    })
    const intersectionStruct = struct.intersection(struct.intersection(account, profile), audit)

    expect(encodeJson(intersectionStruct, { id: 'u_1', name: 'Miao', when: new Date('2026-05-12T10:00:00Z') })).toEqual({
      account_id: 'u_1',
      created_at: '2026-05-12T10:00:00.000Z',
      full_name: 'Miao',
    })
    expect(decodeJson(intersectionStruct, { account_id: 'u_1', created_at: '2026-05-12T10:00:00.000Z', full_name: 'Miao' })).toEqual({
      id: 'u_1',
      name: 'Miao',
      when: new Date('2026-05-12T10:00:00Z'),
    })
  })
})
