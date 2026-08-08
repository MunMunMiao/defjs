import { createClient, defineRequest, struct, type Client, withCredentials, withEndpoint, withHTTPHandle, withXSRF } from '@defjs/core'

// Step 1: Constrain XSRF protection to the unsafe profile update and its validated result.
export const updateOperatorProfile = defineRequest({
  method: 'PUT',
  path: '/api/operators/operator-7/profile',
  input: struct.request({ body: struct.json(struct.object({ displayName: struct.string() })) }),
  output: [{ status: 200, body: struct.object({ updated: struct.boolean() }) }] as const,
})

// Step 2: Keep profile-saving code independent of same-origin token placement.
export async function saveOperatorProfile(client: Client, displayName: string) {
  const [error, result, response] = await client.execute(updateOperatorProfile({ body: { displayName } }))
  if (error) throw error
  if (response.error) throw response.error
  return result
}

export async function main(): Promise<void> {
  // Step 3: Save the borrowed browser globals and initialize header-placement evidence.
  const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const placement: Record<'crossOrigin' | 'sameOrigin', 'absent' | 'present'> = {
    crossOrigin: 'absent',
    sameOrigin: 'absent',
  }

  // Step 4: Send the same unsafe update to same-origin and regional fixture clients.
  try {
    Object.defineProperty(globalThis, 'location', { configurable: true, value: new URL('https://console.invalid') })
    Object.defineProperty(globalThis, 'document', {
      configurable: true,
      value: { cookie: 'XSRF-TOKEN=fixture-xsrf-token' },
    })
    const fixtureFetch: typeof fetch = async (input, init) => {
      const request = new Request(input, init)
      const target = new URL(request.url)
      placement[target.origin === 'https://console.invalid' ? 'sameOrigin' : 'crossOrigin'] = request.headers.has('x-xsrf-token')
        ? 'present'
        : 'absent'
      return Response.json({ updated: true })
    }
    const xsrf = withXSRF({ cookieName: 'XSRF-TOKEN', headerName: 'X-XSRF-TOKEN' })
    const sameOriginClient = createClient(
      withEndpoint('https://console.invalid'),
      withCredentials(true),
      xsrf,
      withHTTPHandle(fixtureFetch),
    )
    const regionalClient = createClient(
      withEndpoint('https://regional-api.invalid'),
      withCredentials(true),
      xsrf,
      withHTTPHandle(fixtureFetch),
    )
    await saveOperatorProfile(sameOriginClient, 'Avery Stone')
    await saveOperatorProfile(regionalClient, 'Avery Stone')
  } finally {
    // Step 5: Restore both global descriptors even when either request fails.
    if (locationDescriptor) Object.defineProperty(globalThis, 'location', locationDescriptor)
    else Reflect.deleteProperty(globalThis, 'location')
    if (documentDescriptor) Object.defineProperty(globalThis, 'document', documentDescriptor)
    else Reflect.deleteProperty(globalThis, 'document')
  }

  // Step 6: Emit only whether each request carried the XSRF header.
  console.log(JSON.stringify(placement))
}

if (import.meta.main) {
  await main()
}
