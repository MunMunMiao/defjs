import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'

const checkoutModeStruct = struct.enum(['maintenance', 'standard'])
type CheckoutMode = Infer<typeof checkoutModeStruct>

// Step 1: Round-trip ConfigMap resourceVersion in the document and type stale 409 writes separately.
export const replaceCheckoutConfig = defineRequest({
  method: 'PUT',
  path: '/api/v1/namespaces/:namespace/configmaps/:name',
  input: struct.request({
    path: struct.object({ name: struct.string(), namespace: struct.string() }),
    body: struct.json(
      struct.object({
        metadata: struct.object({ name: struct.string(), namespace: struct.string(), resourceVersion: struct.string() }),
        data: struct.object({ checkoutMode: checkoutModeStruct }),
      }),
    ),
  }),
  output: [
    { status: 200, body: struct.object({ metadata: struct.object({ resourceVersion: struct.string() }) }) },
    { status: 409, body: struct.object({ code: struct.literal('Conflict') }) },
  ],
})

// Step 2: Publish the server's next version or a conflict result without replaying stale configuration.
export async function replaceConfigMapIfCurrent(
  client: Client,
  namespace: string,
  name: string,
  resourceVersion: string,
  checkoutMode: CheckoutMode,
) {
  if (!resourceVersion) throw new TypeError('resourceVersion is required')

  const [error, replaced, response] = await client.execute(
    replaceCheckoutConfig({
      path: { name, namespace },
      body: { metadata: { name, namespace, resourceVersion }, data: { checkoutMode } },
    }),
  )
  if (error) {
    if (error.kind === 'http' && error.status === 409) return { kind: 'conflict' as const }
    throw error
  }
  if (response.error) throw response.error
  return { kind: 'replaced' as const, resourceVersion: replaced.metadata.resourceVersion }
}

export async function main(): Promise<void> {
  // Step 3: Model checkout configuration at one opaque resource version.
  const state: { checkoutMode: CheckoutMode; resourceVersion: string } = {
    checkoutMode: 'standard',
    resourceVersion: '847',
  }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = (await request.json()) as {
      data: { checkoutMode: CheckoutMode }
      metadata: { resourceVersion: string }
    }
    if (body.metadata.resourceVersion !== state.resourceVersion) {
      return Response.json({ code: 'Conflict' }, { status: 409 })
    }

    state.checkoutMode = body.data.checkoutMode
    state.resourceVersion = '848'
    return Response.json({ metadata: { resourceVersion: state.resourceVersion } })
  }

  // Step 4: Replace it once with the current version, then retry with stale input.
  const client = createClient(withEndpoint('https://kubernetes.invalid'), withHTTPHandle(fixtureFetch))
  const replaced = await replaceConfigMapIfCurrent(client, 'team-blue', 'checkout-flags', '847', 'maintenance')
  if (replaced.kind !== 'replaced') throw new Error('current ConfigMap version was rejected')
  const conflict = await replaceConfigMapIfCurrent(client, 'team-blue', 'checkout-flags', '847', 'standard')

  // Step 5: Emit the new version, conflict classification, and surviving mode.
  console.log(
    JSON.stringify({
      replaced: replaced.resourceVersion,
      conflict: conflict.kind,
      checkoutMode: state.checkoutMode,
    }),
  )
}

if (import.meta.main) {
  await main()
}
