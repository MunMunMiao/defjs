import { describe, expect, test } from 'vitest'
import { SchemaError, schema } from './index'

describe('schema safe parse and async parse', () => {
  test('safeParse returns discriminated result without throwing', () => {
    const user = schema.object({
      id: schema.string(),
      score: schema.number(),
    })

    const ok = user.safeParse({ id: 'u_1', score: 12 })
    expect(ok).toEqual({ ok: true, value: { id: 'u_1', score: 12 } })

    const bad = user.safeParse({ id: 42, score: 'x' })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error).toBeInstanceOf(SchemaError)
      expect(bad.error.issues.map(item => item.path)).toEqual([['id'], ['score']])
    }
  })

  test('parseAsync resolves the parsed value for sync schemas', async () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')

    await expect(positive.parseAsync(5)).resolves.toBe(5)
    await expect(positive.parseAsync(-1)).rejects.toBeInstanceOf(SchemaError)
  })

  test('safeParseAsync mirrors safeParse for sync schemas', async () => {
    const positive = schema.number().refine(value => value > 0 || 'must be positive')

    await expect(positive.safeParseAsync(7)).resolves.toEqual({ ok: true, value: 7 })

    const failed = await positive.safeParseAsync(-3)
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.error).toBeInstanceOf(SchemaError)
    }
  })

  test('parseAsync awaits async refinements', async () => {
    const remoteUnique = schema.string().refine(async value => (value === 'taken' ? 'name already taken' : true))

    await expect(remoteUnique.parseAsync('free')).resolves.toBe('free')
    await expect(remoteUnique.parseAsync('taken')).rejects.toThrowError('name already taken')
  })

  test('safeParseAsync wraps async refinement failures', async () => {
    const remoteCheck = schema.number().refine(async value => value > 0 || new Error('must be positive'))

    await expect(remoteCheck.safeParseAsync(3)).resolves.toEqual({ ok: true, value: 3 })

    const failed = await remoteCheck.safeParseAsync(-1)
    expect(failed.ok).toBe(false)
    if (!failed.ok) {
      expect(failed.error.issues[0]?.message).toBe('must be positive')
    }
  })

  test('sync parse rejects schemas with async refinements with actionable error', () => {
    const slow = schema.string().refine(async value => value.length > 0)

    expect(() => slow.parse('ok')).toThrowError('Async refinement detected; use parseAsync() or safeParseAsync()')

    const safe = slow.safeParse('ok')
    expect(safe.ok).toBe(false)
    if (!safe.ok) {
      expect(safe.error.issues[0]?.message).toContain('Async refinement detected')
    }
  })

  test('parseAsync drives nested object and array refinements concurrently in order', async () => {
    const usersSchema = schema.object({
      profiles: schema.array(
        schema.object({
          email: schema.string().refine(async value => value.includes('@') || 'invalid email'),
        }),
      ),
    })

    await expect(
      usersSchema.parseAsync({
        profiles: [{ email: 'a@x' }, { email: 'b@x' }],
      }),
    ).resolves.toEqual({
      profiles: [{ email: 'a@x' }, { email: 'b@x' }],
    })

    const bad = await usersSchema.safeParseAsync({
      profiles: [{ email: 'a@x' }, { email: 'no-at-sign' }],
    })
    expect(bad.ok).toBe(false)
    if (!bad.ok) {
      expect(bad.error.issues[0]?.path).toEqual(['profiles', 1, 'email'])
      expect(bad.error.issues[0]?.message).toBe('invalid email')
    }
  })

  test('safeParse preserves Go-style zero value semantics for missing fields', () => {
    const profile = schema.object({
      id: schema.string(),
      score: schema.number(),
    })

    const result = profile.safeParse(undefined)
    expect(result).toEqual({ ok: true, value: { id: '', score: 0 } })
  })
})
