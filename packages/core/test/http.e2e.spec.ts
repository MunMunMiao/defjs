import { expect, inject, test } from 'vitest'
import { createClient, createHttpInterceptor, defineRequest, withEndpoint, withInterceptors } from '../src'

test('should settle public HTTP cancellation when an interceptor hangs after a real response', async () => {
  const controller = new AbortController()
  let markNextResolved!: () => void
  const nextResolved = new Promise<void>((resolve) => {
    markNextResolved = resolve
  })
  const client = createClient(
    withEndpoint(inject('testServerHost')),
    withInterceptors(
      createHttpInterceptor(async (request, next) => {
        await next(request)
        markNextResolved()
        return await new Promise<never>(() => undefined)
      }),
    ),
  )
  const useRequest = defineRequest({ method: 'GET', path: '/' })
  const pending = client.execute(useRequest(), { signal: controller.signal })

  await nextResolved
  controller.abort('caller stopped')

  const [error, result, response] = await pending
  expect(error).toMatchObject({ code: 'ABORTED', kind: 'transport' })
  expect(result).toBeUndefined()
  expect(response).toBeUndefined()
}, 2_000)
