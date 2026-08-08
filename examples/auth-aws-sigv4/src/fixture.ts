import { AwsV4Signer } from 'aws4fetch'

export type AwsCredential = { accessKeyId: string; secretAccessKey: string; sessionToken?: string }

type AcceptedReport = {
  credentialScope: string
  report: { completedOrders: number; warehouse: string }
}

// The local service independently recomputes the signature over the captured Request.
export function createSigV4Fixture(credential: AwsCredential, region: string, service: string) {
  let accepted: AcceptedReport | undefined
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init)
    const body = await request.clone().text()
    const authorization = request.headers.get('authorization') ?? ''
    const datetime = request.headers.get('x-amz-date') ?? ''
    const credentialScope = /^AWS4-HMAC-SHA256 Credential=[^/]+\/([^,]+),/u.exec(authorization)?.[1]
    if (!credentialScope || !datetime) throw new Error('signed request is missing SigV4 metadata')

    const headers = new Headers(request.headers)
    headers.delete('authorization')
    const verifier = new AwsV4Signer({
      ...credential,
      body,
      datetime,
      headers,
      method: request.method,
      region,
      service,
      url: request.url,
    })
    if (authorization !== (await verifier.authHeader())) throw new Error('SigV4 signature does not match the request')

    accepted = {
      credentialScope,
      report: JSON.parse(body) as AcceptedReport['report'],
    }
    return new Response(null, { status: 204 })
  }

  return {
    get accepted() {
      return accepted
    },
    fetch,
  }
}
