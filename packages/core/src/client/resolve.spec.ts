import { afterEach, describe, expect, test } from 'vitest'
import { ERR_NOT_FOUND_GLOBAL_CLIENT } from '../error'
import { createClient, resolveClientConfig } from './client'
import { withEndpoint } from './index'
import { resetGlobalClient, setGlobalClient } from './global'

describe('client resolve helpers', () => {
  afterEach(() => {
    resetGlobalClient()
  })

  test('should resolve explicit client config before global client', () => {
    const explicitClient = createClient(withEndpoint('https://explicit.example.com/v1'))
    const globalClient = createClient(withEndpoint('https://global.example.com/v1'))

    setGlobalClient(globalClient)

    expect(resolveClientConfig(explicitClient).endpoint).toBe('https://explicit.example.com/v1')
    expect(resolveClientConfig().endpoint).toBe('https://global.example.com/v1')
  })

  test('should throw when resolving client config without explicit or global client', () => {
    expect(() => resolveClientConfig()).toThrowError(ERR_NOT_FOUND_GLOBAL_CLIENT)
  })
})
