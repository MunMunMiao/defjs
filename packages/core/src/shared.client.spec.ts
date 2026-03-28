import { afterEach, describe, expect, test } from 'vitest'
import { createClient, restGlobalClient, setGlobalClient } from './client'
import { ERR_NOT_FOUND_GLOBAL_CLIENT } from './response'
import { schema } from './schema'
import { parseEndpointInput, resolveClientConfig } from './shared'

describe('shared client helpers', () => {
  afterEach(() => {
    restGlobalClient()
  })

  test('should resolve explicit client config before global client', () => {
    const explicitClient = createClient({
      endpoint: 'https://explicit.example.com/v1',
    })
    const globalClient = createClient({
      endpoint: 'https://global.example.com/v1',
    })

    setGlobalClient(globalClient)

    expect(resolveClientConfig(explicitClient).endpoint).toBe('https://explicit.example.com/v1')
    expect(resolveClientConfig().endpoint).toBe('https://global.example.com/v1')
  })

  test('should throw when resolving client config without explicit or global client', () => {
    expect(() => resolveClientConfig()).toThrowError(ERR_NOT_FOUND_GLOBAL_CLIENT)
  })

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
