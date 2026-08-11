import { createClient, defineRequest, struct, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Bind payment identity and immutable USD body to typed creation and replay outcomes.
export const submitCheckoutPayment = defineRequest({
  method: 'POST',
  path: '/v1/payments',
  input: struct.request({
    headers: struct.object({ idempotencyKey: struct.string().alias('Idempotency-Key') }),
    body: struct.json(
      struct.object({
        amountCents: struct.number(),
        currency: struct.literal('USD'),
        orderId: struct.string(),
      }),
    ),
  }),
  output: [
    { status: 201, body: struct.object({ paymentId: struct.string(), replayed: struct.boolean() }) },
    { status: 200, body: struct.object({ paymentId: struct.string(), replayed: struct.boolean() }) },
    { status: 409, body: struct.object({ code: struct.literal('idempotency_payload_mismatch') }) },
  ],
})

// Step 2: Create one reusable command so retries retain the idempotency key and serialized payload.
export function createPaymentOperation(orderId: string, amountCents: number, idempotencyKey: string) {
  return submitCheckoutPayment({
    headers: { idempotencyKey },
    body: { amountCents, currency: 'USD', orderId },
  })
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index])
}

// Step 3: Use an in-memory fixture to reserve each key against exact bytes; production reservation must be durable, atomic with payment creation, and partitioned by authenticated scope.
export function createPaymentReceiver(options: { dropFirstResponseAfterCommit?: boolean } = {}): typeof fetch {
  const payments = new Map<string, { body: Uint8Array; paymentId: string }>()
  let responseDropped = false
  return async (input, init) => {
    const request = new Request(input, init)
    const key = request.headers.get('idempotency-key')
    if (!key) throw new Error('payment request is missing Idempotency-Key')
    const body = new Uint8Array(await request.arrayBuffer())

    const existing = payments.get(key)
    if (existing) {
      if (!sameBytes(existing.body, body)) {
        return Response.json({ code: 'idempotency_payload_mismatch' }, { status: 409 })
      }
      return Response.json({ paymentId: existing.paymentId, replayed: true }, { status: 200 })
    }

    JSON.parse(new TextDecoder().decode(body))
    const paymentId = `pay-${9_001 + payments.size}`
    payments.set(key, { body: body.slice(), paymentId })
    if (options.dropFirstResponseAfterCommit && !responseDropped) {
      responseDropped = true
      throw new TypeError('connection lost after payment commit')
    }
    return Response.json({ paymentId, replayed: false }, { status: 201 })
  }
}

export async function main(): Promise<void> {
  // Step 4: Create a client backed by the byte-comparing payment receiver.
  const client = createClient(
    withEndpoint('https://payments.invalid'),
    withHTTPHandle(createPaymentReceiver({ dropFirstResponseAfterCommit: true })),
  )

  // Step 5: Execute the same immutable payment operation twice.
  const operation = createPaymentOperation('order-874', 12_500, 'payment-order-874-attempt-1')
  const [firstError] = await client.execute(operation)
  if (firstError?.kind !== 'transport' || firstError.code !== 'NETWORK_ERROR') {
    throw new Error('expected an unknown outcome after the receiver committed')
  }

  const [replayError, replay, replayResponse] = await client.execute(operation)
  if (replayError) throw replayError
  if (replayResponse.error) throw replayResponse.error

  const [mismatchError] = await client.execute(createPaymentOperation('order-874', 12_501, 'payment-order-874-attempt-1'))
  if (mismatchError?.kind !== 'http' || mismatchError.status !== 409 || mismatchError.data.code !== 'idempotency_payload_mismatch') {
    throw new Error('expected the receiver to reject a changed payload under the committed key')
  }

  // Step 6: Emit the typed replay response from the second delivery.
  console.log(JSON.stringify(replay))
}

if (import.meta.main) {
  await main()
}
