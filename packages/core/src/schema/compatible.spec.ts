import { describe, expect, test } from 'vitest'
import { isCompatibleSchema, isStandardSchemaLike, parseCompatibleSchema, type StandardSchemaLike } from './compatible'
import { SchemaError, schema } from './index'

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
    expect(isCompatibleSchema(schema.string())).toBe(true)
    expect(isCompatibleSchema('nope')).toBe(false)
  })

  test('parses both native schemas and standard compatible schemas', async () => {
    await expect(parseCompatibleSchema(schema.number(), 12)).resolves.toBe(12)

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

  test('maps standard schema issues into SchemaError', async () => {
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
      new SchemaError([
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
