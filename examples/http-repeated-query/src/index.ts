import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Model support labels as an exploded query array so each value retains its own key.
export const searchTickets = defineRequest({
  method: 'GET',
  path: '/support/tickets',
  input: struct.request({ query: struct.object({ label: struct.array(struct.string()) }) }),
  output: [{ status: 200, body: struct.object({ tickets: struct.array(struct.object({ id: struct.string() })) }) }],
})

// Step 2: Expose validated tickets without teaching callers the repeated-key wire format.
export async function findTicketsByLabels(client: Client, labels: readonly string[]) {
  const [error, result] = await client.execute(searchTickets({ query: { label: [...labels] } }))
  if (error) throw error
  return result.tickets
}

export async function main(): Promise<void> {
  // Step 3: Capture every repeated label key from the native request URL.
  let query = ''
  let labels: string[] = []
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(new Request(input, init).url)
    query = url.search
    labels = url.searchParams.getAll('label')
    return new Response(JSON.stringify({ tickets: [{ id: 'ticket-482' }, { id: 'ticket-731' }] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Search with two ordered support-ticket labels.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const tickets = await findTicketsByLabels(client, ['urgent', 'awaiting customer'])

  // Step 5: Emit the wire query, decoded labels, and validated tickets.
  console.log(JSON.stringify({ query, labels, tickets }))
}

if (import.meta.main) {
  await main()
}
