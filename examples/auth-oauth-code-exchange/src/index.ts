import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

const clientId = 'desktop-finance'
const registeredRedirectUri = 'http://127.0.0.1:4567/callback'

// Step 1: Bind the token form to the registered desktop client, exact callback, and OAuth wire names.
export const exchangeAuthorizationCode = defineRequest({
  method: 'POST',
  path: '/oauth/token',
  input: struct.request({
    body: struct.urlencoded({
      clientId: struct.literal(clientId).alias('client_id'),
      grantType: struct.literal('authorization_code').alias('grant_type'),
      code: struct.string(),
      codeVerifier: struct.string().alias('code_verifier'),
      redirectUri: struct.literal(registeredRedirectUri).alias('redirect_uri'),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        accessToken: struct.string().alias('access_token'),
        expiresIn: struct.number().alias('expires_in'),
        tokenType: struct.literal('Bearer').alias('token_type'),
      }),
    },
  ] as const,
})

// Step 2: Reject callback or PKCE drift before redeeming the code for a validated token.
export async function redeemDesktopCode(client: Client, code: string, verifier: string, redirectUri: string) {
  if (redirectUri !== registeredRedirectUri) throw new TypeError('redirect URI does not match the registered callback')
  if (!/^[A-Za-z0-9._~-]{43,128}$/u.test(verifier)) throw new TypeError('invalid PKCE verifier')

  const [error, token, response] = await client.execute(
    exchangeAuthorizationCode({
      body: { clientId, code, codeVerifier: verifier, grantType: 'authorization_code', redirectUri },
    }),
  )
  if (error) throw error
  if (response.error) throw response.error
  return token
}

export async function main(): Promise<void> {
  // Step 3: Capture the public-client binding from a local token endpoint.
  let received = { clientId: '', grantType: '', redirectUri: '' }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const form = new URLSearchParams(await new Request(input, init).text())
    received = {
      clientId: form.get('client_id') ?? '',
      grantType: form.get('grant_type') ?? '',
      redirectUri: form.get('redirect_uri') ?? '',
    }
    return Response.json({ access_token: 'fixture-access-token', expires_in: 600, token_type: 'Bearer' })
  }

  // Step 4: Redeem the code with the exact redirect and PKCE verifier.
  const client = createClient(withEndpoint('https://issuer.invalid'), withHTTPHandle(fixtureFetch))
  const token = await redeemDesktopCode(client, 'desktop-code-1042', 'A'.repeat(43), registeredRedirectUri)

  // Step 5: Emit registration and token metadata without code, verifier, or token.
  console.log(
    JSON.stringify({
      clientId: received.clientId,
      expiresIn: token.expiresIn,
      grantType: received.grantType,
      redirectUri: received.redirectUri,
      tokenType: token.tokenType,
    }),
  )
}

if (import.meta.main) {
  await main()
}
