import { describe, expect, test } from 'vitest'
import { isCompatibleSchema, isStandardSchemaLike, parseCompatibleSchema, type StandardSchemaLike } from './compatible'
import { StructError, struct } from './index'

describe('compatible schema helpers', () => {
  test('detects standard schema objects and rejects non-standard values', () => {
    const standardSchema: StandardSchemaLike<string, number> = {
      '~standard': {
        validate(value) {
          return {
            value: Number(value),
          }
        },
      },
    }

    expect(isStandardSchemaLike(standardSchema)).toBe(true)
    expect(isStandardSchemaLike(null)).toBe(false)
    expect(isStandardSchemaLike({})).toBe(false)
    expect(isCompatibleSchema(standardSchema)).toBe(true)
    expect(isCompatibleSchema(struct.string())).toBe(true)
    expect(isCompatibleSchema('nope')).toBe(false)
  })

  test('parses both native schemas and standard compatible schemas', async () => {
    await expect(parseCompatibleSchema(struct.number(), 12)).resolves.toBe(12)

    const standardSchema: StandardSchemaLike<{ id: string }, { id: number }> = {
      '~standard': {
        async validate(value) {
          const input = value as { id: string }
          return {
            value: {
              id: Number(input.id),
            },
          }
        },
      },
    }

    await expect(parseCompatibleSchema(standardSchema, { id: '7' })).resolves.toEqual({ id: 7 })
  })

  test('zen schema exposes ~standard for third-party consumers', () => {
    const userSchema = struct.object({
      id: struct.string(),
      score: struct.number(),
    })

    const standard = userSchema['~standard']

    expect(standard.version).toBe(1)
    expect(standard.vendor).toBe('defjs')

    const ok = standard.validate({ id: 'u_1', score: 42 })
    expect(ok).toEqual({ value: { id: 'u_1', score: 42 } })

    const fail = standard.validate({ id: 42, score: 'wrong' })
    expect(fail).toEqual({
      issues: [
        { message: 'Expected string at id, received 42', path: ['id'] },
        { message: 'Expected number at score, received "wrong"', path: ['score'] },
      ],
    })
  })

  test('standard compatible async schemas work through parseCompatibleSchema', async () => {
    const uniqueName: StandardSchemaLike<string, string> = {
      '~standard': {
        async validate(value) {
          const name = value as string
          return name === 'taken' ? { issues: [{ message: 'name already taken', path: [] }] } : { value: name }
        },
      },
    }

    await expect(parseCompatibleSchema(uniqueName, 'fresh')).resolves.toBe('fresh')
    await expect(parseCompatibleSchema(uniqueName, 'taken')).rejects.toBeInstanceOf(StructError)
  })

  test('~standard validate keeps native schemas sync', () => {
    const syncSchema = struct.object({ id: struct.string() })
    const syncResult = syncSchema['~standard'].validate({ id: 'u_1' })

    expect(syncResult).toEqual({ value: { id: 'u_1' } })
  })

  test('zen schema is consumable through parseCompatibleSchema as standard schema', async () => {
    const fromZen = struct.number()

    const adapter: StandardSchemaLike<unknown, number> = {
      '~standard': fromZen['~standard'] as StandardSchemaLike<unknown, number>['~standard'],
    }

    await expect(parseCompatibleSchema(adapter, 7)).resolves.toBe(7)
    await expect(parseCompatibleSchema(adapter, 'bad')).rejects.toBeInstanceOf(StructError)
  })

  test('maps standard schema issues into StructError', async () => {
    const invalidSchema: StandardSchemaLike = {
      '~standard': {
        validate() {
          return {
            issues: [
              {
                message: 'bad payload',
                path: ['payload', 0],
              },
              {},
            ],
          }
        },
      },
    }

    await expect(parseCompatibleSchema(invalidSchema, 'x')).rejects.toEqual(
      new StructError([
        {
          code: 'custom',
          expected: 'valid value',
          message: 'bad payload',
          path: ['payload', 0],
          received: undefined,
        },
        {
          code: 'custom',
          expected: 'valid value',
          message: 'Schema parse failed',
          path: [],
          received: undefined,
        },
      ]),
    )
  })
})
