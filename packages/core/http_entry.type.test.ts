import { createHttpClient, defineRequest, struct, withEndpoint } from '@defjs/core/http'

const health = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

createHttpClient(withEndpoint('https://example.test')).execute(health())
