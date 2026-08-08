import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Declare represented PDFs and only the provider's 404/410 absence statuses as valid outcomes.
export const readInvoicePdf = defineRequest({
  method: 'GET',
  path: '/invoice-pdfs/:id',
  responseType: 'text',
  input: struct.request({ path: struct.object({ id: struct.string() }) }),
  output: [
    { status: 200, body: struct.string() },
    { status: [404, 410] as const, body: struct.string() },
  ] as const,
})

// Step 2: Convert those two expected statuses to null while preserving every other failure.
export async function getInvoicePdf(client: Client, id: string): Promise<string | null> {
  const [error, pdf] = await client.execute(readInvoicePdf({ path: { id: encodeURIComponent(id) } }))
  if (error) {
    if (error.kind === 'http' && (error.status === 404 || error.status === 410)) return null
    throw error
  }
  return pdf
}

export async function main(): Promise<void> {
  // Step 3: Serve one represented invoice PDF and one declared absent invoice.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const id = new URL(new Request(input, init).url).pathname.split('/').at(-1)
    return id === 'invoice-pending' ? new Response('not generated', { status: 404 }) : new Response('PDF for invoice 1042', { status: 200 })
  }

  // Step 4: Execute both outcomes through the same typed invoice operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const available = await getInvoicePdf(client, 'invoice-1042')
  const pending = await getInvoicePdf(client, 'invoice-pending')

  // Step 5: Emit the available text and expected null result.
  console.log(JSON.stringify({ available, pending }))
}

if (import.meta.main) {
  await main()
}
