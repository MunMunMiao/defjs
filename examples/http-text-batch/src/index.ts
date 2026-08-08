import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Keep metric writes as plain text with a deliberately bodyless success contract.
export const writeMetricLines = defineRequest({
  method: 'POST',
  path: '/metrics/write',
  input: struct.request({ body: struct.text() }),
  output: [{ status: 204, body: struct.null() }] as const,
})

export const MAX_BATCH_LINES = 500
export const MAX_BATCH_BYTES = 4 * 1024

// Step 2: Own line integrity, count, and UTF-8 budgets before dispatching a telemetry batch.
export async function writeMetricBatch(client: Client, lines: readonly string[]) {
  if (lines.length === 0 || lines.length > MAX_BATCH_LINES) {
    throw new RangeError(`metric batch must contain between one and ${MAX_BATCH_LINES} lines`)
  }
  if (lines.some((line) => !line || /[\r\n]/u.test(line))) throw new TypeError('each metric must be one non-empty line')

  const body = lines.join('\n')
  const bytes = new TextEncoder().encode(body).byteLength
  if (bytes > MAX_BATCH_BYTES) throw new RangeError(`metric batch exceeds ${MAX_BATCH_BYTES} UTF-8 bytes`)

  const [error, , response] = await client.execute(writeMetricLines({ body }))
  if (error) throw error
  if (response.error) throw response.error
  return { lines: lines.length, bytes }
}

export async function main(): Promise<void> {
  // Step 3: Capture the final text media type and newline-framed body.
  let contentType = ''
  let body = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    contentType = request.headers.get('content-type') ?? ''
    body = await request.text()
    return new Response(null, { status: 204 })
  }

  // Step 4: Write the bounded two-line metric batch.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const batch = await writeMetricBatch(client, ['cpu,host=checkout-1 usage=0.42', 'memory,host=checkout-1 used_bytes=734003200i'])

  // Step 5: Emit the observed wire body and accepted batch count.
  console.log(JSON.stringify({ contentType, body, batch }))
}

if (import.meta.main) {
  await main()
}
