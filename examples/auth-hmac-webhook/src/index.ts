import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  struct,
  type Client,
  type Infer,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

const maxAgeMs = 5 * 60_000
const encoder = new TextEncoder()

// Step 1: Fix the captured-payment event and JSON delivery contract before signing final bytes.
export const paymentCapturedStruct = struct.object({
  amountCents: struct.number(),
  event: struct.literal('payment.captured'),
  orderId: struct.string(),
})
export type PaymentCaptured = Infer<typeof paymentCapturedStruct>
export const deliverPaymentWebhook = defineRequest({
  method: 'POST',
  path: '/webhooks/payments',
  input: struct.request({ body: struct.json(paymentCapturedStruct) }),
  output: [{ status: 204, body: struct.null() }],
})

function importHmacKey(secret: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', Uint8Array.from(secret).buffer, { hash: 'SHA-256', name: 'HMAC' }, false, ['sign', 'verify'])
}

function signedBytes(timestamp: number, messageId: string, method: string, path: string, body: Uint8Array) {
  const prefix = encoder.encode(`v1\n${timestamp}\n${messageId}\n${method}\n${path}\n`)
  const value = new Uint8Array(prefix.byteLength + body.byteLength)
  value.set(prefix)
  value.set(body, prefix.byteLength)
  return value
}

function toHex(value: ArrayBuffer): string {
  return [...new Uint8Array(value)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function fromHex(value: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(value.length / 2))
  for (let index = 0; index < bytes.length; index++) bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16)
  return bytes
}

// Step 2: Bind both sides to one raw-byte HMAC frame, enforce five-minute freshness, and reserve each verified message ID before trusting the decoded payment event.
function createWebhookSigner(secret: Uint8Array, now: () => number, messageId: () => string) {
  const key = importHmacKey(secret)
  return createHttpInterceptor(async (request, next) => {
    if (typeof request.body !== 'string') throw new TypeError('webhook signer requires a text body')

    const timestamp = Math.floor(now() / 1000)
    const id = messageId()
    const path = new URL(request.endpoint, request.baseEndpoint).pathname
    const signature = await crypto.subtle.sign(
      'HMAC',
      await key,
      signedBytes(timestamp, id, request.method, path, encoder.encode(request.body)),
    )
    const headers = new Headers(request.headers)
    headers.set('x-webhook-id', id)
    headers.set('x-webhook-timestamp', String(timestamp))
    headers.set('x-webhook-signature', `v1=${toHex(signature)}`)
    return next({ ...request, headers })
  })
}

function createWebhookReceiver(secret: Uint8Array, now: () => number) {
  const key = importHmacKey(secret)
  const acceptedIds = new Set<string>()

  return async (request: Request): Promise<PaymentCaptured> => {
    const messageId = request.headers.get('x-webhook-id') ?? ''
    const timestampText = request.headers.get('x-webhook-timestamp') ?? ''
    const signatureText = request.headers.get('x-webhook-signature') ?? ''
    if (!/^[A-Za-z0-9-]{8,64}$/u.test(messageId) || !/^[1-9][0-9]*$/u.test(timestampText) || !/^v1=[0-9a-f]{64}$/u.test(signatureText)) {
      throw new Error('invalid webhook signature headers')
    }

    const timestamp = Number(timestampText)
    if (!Number.isSafeInteger(timestamp) || Math.abs(now() - timestamp * 1000) > maxAgeMs) {
      throw new Error('stale webhook')
    }
    const body = new Uint8Array(await request.arrayBuffer())
    const valid = await crypto.subtle.verify(
      'HMAC',
      await key,
      fromHex(signatureText.slice(3)),
      signedBytes(timestamp, messageId, request.method, new URL(request.url).pathname, body),
    )
    if (!valid) throw new Error('invalid webhook signature')

    const document: unknown = JSON.parse(new TextDecoder().decode(body))
    if (typeof document !== 'object' || document === null) throw new TypeError('invalid payment event')
    const event = document as Record<string, unknown>
    if (event['event'] !== 'payment.captured' || !Number.isSafeInteger(event['amountCents']) || typeof event['orderId'] !== 'string') {
      throw new TypeError('invalid payment event')
    }
    if (acceptedIds.has(messageId)) throw new Error('webhook already accepted')
    acceptedIds.add(messageId)
    return {
      amountCents: event['amountCents'] as number,
      event: 'payment.captured',
      orderId: event['orderId'],
    }
  }
}

// Step 3: Deliver one captured-payment command without exposing signature policy to business callers.
export async function sendPaymentCaptured(client: Client, payment: PaymentCaptured) {
  const [error, , response] = await client.execute(deliverPaymentWebhook({ body: payment }))
  if (error) throw error
  if (response.error) throw response.error
  return response.status
}

export async function main(): Promise<void> {
  // Step 4: Create fixed signing inputs and a receiver that verifies raw request bytes.
  const secret = new Uint8Array(32).fill(7)
  const now = 1_700_000_000_000
  const verify = createWebhookReceiver(secret, () => now)
  let orderId = ''
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    orderId = (await verify(request)).orderId
    return new Response(null, { status: 204 })
  }

  // Step 5: Deliver the captured-payment event through the HMAC signing interceptor.
  const client = createClient(
    withEndpoint('https://payments.invalid'),
    withHTTPHandle(fixtureFetch),
    withInterceptors(
      createWebhookSigner(
        secret,
        () => now,
        () => 'payment-1042',
      ),
    ),
  )

  const status = await sendPaymentCaptured(client, {
    amountCents: 12_900,
    event: 'payment.captured',
    orderId: 'order-1042',
  })

  // Step 6: Emit the verified order and status without secret or signature material.
  console.log(JSON.stringify({ orderId, status }))
}

if (import.meta.main) {
  await main()
}
