import { expect, inject, test } from 'vitest'
import { runRuntimeFixture } from './shared'

test('built package should run in bun', async () => {
  const result = (await runRuntimeFixture('bun', 'smoke.mjs', {
    DEFJS_TEST_SERVER_HOST: inject('testServerHost'),
  })) as {
    http: { ok: boolean; result: { id: number } }
    sse: { events: string[]; ok: boolean }
    ws: {
      connection?: { protocol?: string }
      echo?: { done: boolean; value: { text: string; type: string } }
      ready?: { done: boolean; value: { ok: boolean; type: string } }
    }
  }

  expect(result.http.ok).toBe(true)
  expect(result.http.result).toEqual({ id: 1 })
  expect(result.sse.ok).toBe(true)
  expect(result.sse.events).toEqual(['first', 'second line 1\nsecond line 2'])
  expect(result.ws.connection?.protocol).toBe('json')
  expect(result.ws.ready?.value).toEqual({ ok: true, type: 'ready' })
  expect(result.ws.echo?.value).toEqual({ text: 'compat', type: 'message' })
})
