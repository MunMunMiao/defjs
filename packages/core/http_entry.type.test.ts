import { createHttpInterceptor, withEndpoint as rootWithEndpoint, withInterceptors as rootWithInterceptors } from './src/public_api'
import { createHttpClient, defineRequest, struct, withEndpoint } from './src/http_entry'

const rootHttpInterceptor = createHttpInterceptor((request, next) => next(request))
createHttpClient(rootWithEndpoint('https://example.test'), rootWithInterceptors(rootHttpInterceptor))
createHttpClient(withEndpoint('https://example.test'))

const health = defineRequest({
  method: 'GET',
  path: '/health',
  output: { 200: struct.object({ ok: struct.boolean() }) },
})

createHttpClient(withEndpoint('https://example.test')).execute(health())
