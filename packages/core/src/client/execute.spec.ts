import { describe, expect, test } from 'vitest'
import { makeResponse } from '../internal/http_response'
import { createHttpInterceptor } from '../interceptor'
import { struct } from '../struct'
import { defineRequest } from '../http'
import { createClient, execute } from './client'
import type { Command } from './command'
import { withEndpoint, withInterceptors } from './option'

describe('Client.execute', () => {
  test('client should have execute method', () => {
    const client = createClient(withEndpoint('https://example.com'))
    expect(typeof client.execute).toBe('function')
  })

  test('execute rejects for unsupported command kind', async () => {
    const client = createClient(withEndpoint('https://example.com'))
    await expect(client.execute({ kind: 'test' } as Command)).rejects.toThrow('Unsupported command kind: test')
  })

  test('top-level execute dispatches http command', async () => {
    const useGet = defineRequest({
      method: 'GET',
      output: {
        200: struct.object({ ok: struct.boolean() }),
      },
      path: '/ok',
    })

    const client = createClient(
      withEndpoint('https://example.com'),
      withInterceptors(
        createHttpInterceptor(async () =>
          makeResponse({
            body: { ok: true },
            status: 200,
          }),
        ),
      ),
    )

    const [error, result] = await execute(useGet(), { client })

    expect(error).toBeNull()
    expect(result).toEqual({ ok: true })
  })
})
