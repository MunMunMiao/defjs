import {
  basicAuthHttpInterceptor,
  createClient,
  defineRequest,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Fix the confidential-client grant and invoices:read scope at the issuer boundary.
export const requestMachineToken = defineRequest({
  method: 'POST',
  path: '/oauth2/token',
  input: struct.request({
    body: struct.urlencoded({
      grantType: struct.literal('client_credentials').alias('grant_type'),
      scope: struct.literal('invoices:read'),
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
    { status: 401, body: struct.object({ error: struct.literal('invalid_client') }) },
  ],
})

// Step 2: Return only a Struct-validated token document while client authentication remains client-owned.
export async function requestInvoiceReadToken(client: Client) {
  const [error, token, response] = await client.execute(
    requestMachineToken({ body: { grantType: 'client_credentials', scope: 'invoices:read' } }),
  )
  if (error) throw error
  if (response.error) throw response.error
  return token
}

export async function main(): Promise<void> {
  // Step 3: Parse the grant form and authenticate it in a deterministic local issuer.
  const expectedAuthorization = `Basic ${btoa('invoice-exporter:fixture-secret')}`
  let grantType = ''
  let scope = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const form = new URLSearchParams(await request.text())
    grantType = form.get('grant_type') ?? ''
    scope = form.get('scope') ?? ''
    if (request.headers.get('authorization') !== expectedAuthorization || grantType !== 'client_credentials' || scope !== 'invoices:read') {
      return Response.json({ error: 'invalid_client' }, { status: 401 })
    }
    return Response.json({ access_token: 'fixture-access-token', expires_in: 900, token_type: 'Bearer' })
  }

  // Step 4: Request the scoped machine token through the Basic-authenticated client.
  const client = createClient(
    withEndpoint('https://issuer.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(basicAuthHttpInterceptor(() => ({ username: 'invoice-exporter', password: 'fixture-secret' }))),
  )
  const token = await requestInvoiceReadToken(client)

  // Step 5: Emit grant and token metadata while withholding both credentials.
  console.log(JSON.stringify({ expiresIn: token.expiresIn, grantType, scope, tokenType: token.tokenType }))
}

if (import.meta.main) {
  await main()
}
