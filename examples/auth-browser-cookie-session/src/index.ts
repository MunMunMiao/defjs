import { createClient, defineRequest, struct, type Client, withCredentials, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Model the support session probe as a bodyless 204 without pretending cookies are observable in Node.
export const probeSessionRequest = defineRequest({
  method: 'GET',
  path: '/session',
  output: [{ status: 204, body: struct.null() }],
})

// Step 2: Confirm only Defjs-level success while leaving cookie authentication to the browser.
export async function probeSupportSession(client: Client): Promise<void> {
  const [error, , response] = await client.execute(probeSessionRequest())
  if (error) throw error
  if (response.error) throw response.error
}

export async function main(): Promise<void> {
  // Step 3: Capture the native credential mode in a bodyless local session fixture.
  let credentials: RequestCredentials = 'same-origin'
  const fixtureFetch: typeof fetch = async (input, init) => {
    credentials = new Request(input, init).credentials
    return new Response(null, { status: 204 })
  }

  // Step 4: Probe the session through the dedicated credentialed client.
  const client = createClient(withEndpoint('https://support-api.invalid'), withCredentials(true), withHTTPHandle(fixtureFetch))
  await probeSupportSession(client)

  // Step 5: Report the observed include mode without claiming cookie authentication.
  console.log(JSON.stringify({ credentials }))
}

if (import.meta.main) {
  await main()
}
