import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema safe parse and async parse', () => {
  test('safeParse returns discriminated result without throwing', () => {
    const user = schema.object({
      id: schema.string(),
      score: schema.number(),
    })

    const [okErr, okVal] = user.parse({ id: 'u_1', score: 12 })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({ id: 'u_1', score: 12 })

    const [badErr, badVal] = user.parse({ id: 42, score: 'x' })
    expect(badErr).toBeInstanceOf(SchemaError)
    expect(badVal).toEqual({ id: '', score: 0 })
    expect(badErr?.issues.map(item => item.path)).toEqual([['id'], ['score']])
  })

  test('parseAsync resolves the parsed value for sync schemas', async () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')

    const [okErr, okVal] = await positive.parseAsync(5)
    expect(okErr).toBeNull()
    expect(okVal).toBe(5)

    const [badErr] = await positive.parseAsync(-1)
    expect(badErr).toBeInstanceOf(SchemaError)
  })

  test('safeParseAsync mirrors safeParse for sync schemas', async () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')

    const [okErr, okVal] = await positive.parseAsync(7)
    expect(okErr).toBeNull()
    expect(okVal).toBe(7)

    const [failedErr] = await positive.parseAsync(-3)
    expect(failedErr).toBeInstanceOf(SchemaError)
  })

  test('parseAsync awaits async refinements', async () => {
    const remoteUnique = schema.string().refine(async value => (value === 'taken' ? 'name already taken' : true))

    const [okErr, okVal] = await remoteUnique.parseAsync('free')
    expect(okErr).toBeNull()
    expect(okVal).toBe('free')

    const [badErr] = await remoteUnique.parseAsync('taken')
    expect(badErr).toBeInstanceOf(SchemaError)
    expect(badErr?.message).toContain('name already taken')
  })

  test('safeParseAsync wraps async refinement failures', async () => {
    const remoteCheck = schema.number().refine(async value => value > 0 || new Error('must be positive'))

    const [okErr, okVal] = await remoteCheck.parseAsync(3)
    expect(okErr).toBeNull()
    expect(okVal).toBe(3)

    const [failedErr] = await remoteCheck.parseAsync(-1)
    expect(failedErr).toBeInstanceOf(SchemaError)
    expect(failedErr?.issues[0]?.message).toBe('must be positive')
  })

  test('sync parse surfaces async refinements as actionable error', () => {
    const slow = schema.string().refine(async value => value.length > 0)

    const [err, val] = slow.parse('ok')
    expect(err).toBeInstanceOf(SchemaError)
    expect(err?.message).toContain('Async refinement detected')
    expect(val).toBe('')
  })

  test('parseAsync drives nested object and array refinements concurrently in order', async () => {
    const usersSchema = schema.object({
      profiles: schema.array(
        schema.object({
          email: schema.string().refine(async value => value.includes('@') || 'invalid email'),
        }),
      ),
    })

    const [okErr, okVal] = await usersSchema.parseAsync({
      profiles: [{ email: 'a@x' }, { email: 'b@x' }],
    })
    expect(okErr).toBeNull()
    expect(okVal).toEqual({
      profiles: [{ email: 'a@x' }, { email: 'b@x' }],
    })

    const [badErr] = await usersSchema.parseAsync({
      profiles: [{ email: 'a@x' }, { email: 'no-at-sign' }],
    })
    expect(badErr).toBeInstanceOf(SchemaError)
    expect(badErr?.issues[0]?.path).toEqual(['profiles', 1, 'email'])
    expect(badErr?.issues[0]?.message).toBe('invalid email')
  })

  test('safeParse preserves Go-style zero value semantics for missing fields', () => {
    const profile = schema.object({
      id: schema.string(),
      score: schema.number(),
    })

    const [err, val] = profile.parse(undefined)
    expect(err).toBeNull()
    expect(val).toEqual({ id: '', score: 0 })
  })
})
