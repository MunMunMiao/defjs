import { describe, expect, test } from 'vitest'
import { createClient } from './client'
import { withEndpoint } from './option'
import type { Command } from './command'

describe('Client.execute', () => {
  test('client should have execute method', () => {
    const client = createClient(withEndpoint('https://example.com'))
    expect(typeof client.execute).toBe('function')
  })

  test('execute rejects for unsupported command kind', async () => {
    const client = createClient(withEndpoint('https://example.com'))
    await expect(client.execute({ kind: 'test' } as Command)).rejects.toThrow('Unsupported command kind: test')
  })
})
