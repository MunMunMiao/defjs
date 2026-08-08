import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Bind delivery alerts to exact provider field names and repeated MediaUrl form entries.
export const createDeliveryMessage = defineRequest({
  method: 'POST',
  path: '/delivery-messages',
  input: struct.request({
    body: struct.urlencoded({
      to: struct.string().alias('To'),
      body: struct.string().alias('Body'),
      mediaUrls: struct.array(struct.string()).alias('MediaUrl'),
    }),
  }),
  output: [{ status: 201, body: struct.object({ id: struct.string() }) }] as const,
})

// Step 2: Return the message ID only after the form operation receives its typed 201.
export async function sendDeliveryAlert(client: Client, to: string, body: string, mediaUrls: readonly string[]) {
  const [error, message, response] = await client.execute(createDeliveryMessage({ body: { to, body, mediaUrls: [...mediaUrls] } }))
  if (error) throw error
  if (response.error) throw response.error
  return message.id
}

export async function main(): Promise<void> {
  // Step 3: Parse the native form and retain every repeated media value in order.
  let received = { contentType: '', to: '', mediaUrls: [] as string[] }
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const form = new URLSearchParams(await request.text())
    received = {
      contentType: request.headers.get('content-type') ?? '',
      to: form.get('To') ?? '',
      mediaUrls: form.getAll('MediaUrl'),
    }
    return new Response('{"id":"message-1042"}', {
      headers: { 'content-type': 'application/json' },
      status: 201,
    })
  }

  // Step 4: Send the delivery alert through the typed form operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const messageId = await sendDeliveryAlert(client, '+12025550142', 'Gate 7 delivery is ready', [
    'https://cdn.invalid/proof-front.jpg',
    'https://cdn.invalid/proof-label.jpg',
  ])

  // Step 5: Emit the message ID and stable form fields observed by the fixture.
  console.log(JSON.stringify({ messageId, ...received }))
}

if (import.meta.main) {
  await main()
}
