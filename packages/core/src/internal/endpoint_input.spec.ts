import { describe, expect, test } from 'vitest'
import { struct } from '../struct'
import { parseEndpointInput } from './endpoint_input'

describe('endpoint input helpers', () => {
  test('should parse endpoint input and keep raw input when struct is omitted', async () => {
    const input = {
      id: '1',
    }

    expect(await parseEndpointInput(undefined, input)).toBe(input)
    expect(
      await parseEndpointInput(
        struct.object({
          id: struct.number(),
        }),
        {
          id: 1,
        },
      ),
    ).toEqual({ id: 1 })
  })
})
