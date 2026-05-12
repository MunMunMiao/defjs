import { describe, expect, test } from 'vitest'
import { schema } from '../schema'
import { parseEndpointInput } from './endpoint_input'

describe('endpoint input helpers', () => {
  test('should parse endpoint input and keep raw input when schema is omitted', async () => {
    const input = {
      id: '1',
    }

    expect(await parseEndpointInput(undefined, input)).toBe(input)
    expect(
      await parseEndpointInput(
        schema.object({
          id: schema.number(),
        }),
        {
          id: 1,
        },
      ),
    ).toEqual({ id: 1 })
  })
})
