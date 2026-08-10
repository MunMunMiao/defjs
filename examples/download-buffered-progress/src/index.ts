import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import { createCarrierTemplateFixture } from './fixture'

// Step 1: Treat carrier templates as binary responses whose decoded buffers remain locally bounded.
export const getCarrierTemplate = defineRequest({
  method: 'GET',
  path: '/carrier-templates/:id',
  responseType: 'arraybuffer',
  input: struct.request({ path: struct.object({ id: struct.string() }) }),
  output: [{ status: 200, body: struct.arrayBuffer() }] as const,
})

// Step 2: Abort on the first over-limit progress event and verify final size before returning bytes.
export const MAX_BUFFERED_TEMPLATE_BYTES = 64 * 1024
export async function downloadCarrierTemplate(client: Client, id: string, onProgress: (loadedBytes: number) => void) {
  const limit = new AbortController()
  let limitFailure: RangeError | undefined
  const [error, bytes] = await client.execute(getCarrierTemplate({ path: { id } }), {
    signal: limit.signal,
    onDownloadProgress(progress) {
      onProgress(progress.loaded)
      if (progress.loaded > MAX_BUFFERED_TEMPLATE_BYTES && !limitFailure) {
        limitFailure = new RangeError(`carrier template exceeds ${MAX_BUFFERED_TEMPLATE_BYTES} bytes`)
        limit.abort(limitFailure)
      }
    },
  })

  if (limitFailure) throw limitFailure
  if (error) throw error
  if (bytes.byteLength > MAX_BUFFERED_TEMPLATE_BYTES) {
    throw new RangeError(`carrier template exceeds ${MAX_BUFFERED_TEMPLATE_BYTES} bytes`)
  }
  return bytes
}

export async function main(): Promise<void> {
  // Step 3: Create the oversized two-chunk fixture, which settles its stream and removes its abort listener when the byte ceiling cancels the download.
  const fixtureFetch = createCarrierTemplateFixture(MAX_BUFFERED_TEMPLATE_BYTES)
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  let loadedBytes = 0

  // Step 4: Start the download while recording the latest buffered byte count.
  try {
    await downloadCarrierTemplate(client, 'oversize', (loaded) => {
      loadedBytes = loaded
    })
  } catch (error) {
    if (!(error instanceof RangeError)) throw error

    // Step 5: Emit the size-limit failure observed immediately after the ceiling.
    console.log(JSON.stringify({ loadedBytes, error: error.message }))
  }
}

if (import.meta.main) {
  await main()
}
