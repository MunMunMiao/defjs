import { describe, expect, test } from 'vitest'
import { isHttpContext, isHttpContextToken, makeHttpContext, makeHttpContextToken, mergeHttpContexts } from './context'

describe('Context', () => {
  test('should throw error when set other token', () => {
    const context = makeHttpContext()
    const token = {} as any
    expect(() => context.set(token, 'value')).toThrowError()
  })

  test('should throw error when get other token', () => {
    const context = makeHttpContext()
    const token = {} as any
    expect(() => context.get(token)).toThrowError()
  })

  test('should set and get value', () => {
    const context = makeHttpContext()
    const token = makeHttpContextToken(() => 'default')
    context.set(token, 'value')
    expect(context.get(token)).toBe('value')
  })

  test('should get default value', () => {
    const context = makeHttpContext()
    const token = makeHttpContextToken(() => 'default')
    expect(context.get(token)).toBe('default')
  })

  test('should delete value', () => {
    const context = makeHttpContext()
    const token = makeHttpContextToken(() => 'default')
    context.set(token, 'value')
    context.del(token)
    expect(context.has(token)).toBeFalsy()
  })

  test('should check if value exists', () => {
    const context = makeHttpContext()
    const token = makeHttpContextToken(() => 'default')
    context.set(token, 'value')
    expect(context.has(token)).toBeTruthy()
  })

  test('should return keys', () => {
    const context = makeHttpContext()
    const token1 = makeHttpContextToken(() => 'default')
    const token2 = makeHttpContextToken(() => 'default')
    context.set(token1, 'value')
    context.set(token2, 'value')
    const keys = Array.from(context.keys())
    expect(keys).toEqual([token1, token2])
  })

  test('should check if value is HttpContextToken', () => {
    const token = makeHttpContextToken(() => 'default')
    expect(isHttpContextToken(token)).toBeTruthy()
    expect(isHttpContextToken({})).toBeFalsy()
  })

  test('should check if value is HttpContext', () => {
    const context = makeHttpContext()
    expect(isHttpContext(context)).toBeTruthy()
    expect(isHttpContext({})).toBeFalsy()
  })

  test('should make context with HttpContext', () => {
    const token = makeHttpContextToken(() => 1)

    const oldContext = makeHttpContext()
    oldContext.set(token, 1)

    const newContext = makeHttpContext(oldContext)

    expect(newContext.get(token)).toBe(1)
  })

  test('should make context with entries', () => {
    const token = makeHttpContextToken(() => 1)
    const context = makeHttpContext([[token, 1]])
    expect(context.get(token)).toBe(1)
  })

  test('should unset un token key', () => {
    const context = makeHttpContext([[{} as any, 1]])
    expect(context.length).toBe(0)
  })

  test('ctx.get does not mutate the underlying map(no miss-then-cache)', () => {
    const token = makeHttpContextToken(() => 'default-value')
    const ctx = makeHttpContext()

    expect(ctx.has(token)).toBe(false)
    expect(ctx.get(token)).toBe('default-value')
    // 关键:get 之后 has 仍是 false
    expect(ctx.has(token)).toBe(false)
    expect(ctx.length).toBe(0)
  })

  test('token factory is invoked each time get is called for unset token', () => {
    let calls = 0
    const token = makeHttpContextToken(() => ++calls)
    const ctx = makeHttpContext()

    expect(ctx.get(token)).toBe(1)
    expect(ctx.get(token)).toBe(2)
    expect(ctx.length).toBe(0)
  })

  test('explicit set null is distinguishable from unset', () => {
    const token = makeHttpContextToken<string | null>(() => 'default')
    const ctx = makeHttpContext()

    ctx.set(token, null)
    expect(ctx.has(token)).toBe(true)
    expect(ctx.get(token)).toBe(null)
  })

  test('should merge http contexts with secondary context taking precedence', () => {
    const tokenA = makeHttpContextToken(() => 'a-default')
    const tokenB = makeHttpContextToken(() => 'b-default')

    const primary = makeHttpContext().set(tokenA, 'from-primary').set(tokenB, 'from-primary')
    const secondary = makeHttpContext().set(tokenB, 'from-secondary')

    const merged = mergeHttpContexts(primary, secondary)
    expect(merged.get(tokenA)).toBe('from-primary')
    expect(merged.get(tokenB)).toBe('from-secondary')
  })

  test('should merge with no contexts', () => {
    const merged = mergeHttpContexts(undefined, undefined)
    expect(merged.length).toBe(0)
  })

  test('should merge with only primary context', () => {
    const token = makeHttpContextToken(() => 'default')
    const primary = makeHttpContext().set(token, 'primary')
    const merged = mergeHttpContexts(primary, undefined)
    expect(merged.get(token)).toBe('primary')
  })

  test('should merge with only secondary context', () => {
    const token = makeHttpContextToken(() => 'default')
    const secondary = makeHttpContext().set(token, 'secondary')
    const merged = mergeHttpContexts(undefined, secondary)
    expect(merged.get(token)).toBe('secondary')
  })
})
