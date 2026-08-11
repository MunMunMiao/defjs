import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'

const DELIVERY_TIMEOUT_MS = 20

// Step 1: Bind shipment-ready deliveries to one typed mutation and bodyless acceptance response.
const shipmentReadyDeliveryStruct = struct.object({
  deliveryId: struct.string(),
  event: struct.literal('shipment.ready'),
  orderId: struct.string(),
  shipmentId: struct.string(),
})
export type ShipmentReadyDelivery = Infer<typeof shipmentReadyDeliveryStruct>
export const deliverShipmentReadyWebhook = defineRequest({
  method: 'POST',
  path: '/webhooks/order-events',
  input: struct.request({
    body: struct.json(shipmentReadyDeliveryStruct),
  }),
  output: [{ status: 204, body: struct.null() }],
})

// Step 2: Send once under the operation deadline and preserve timeout as an ambiguous outcome.
export async function sendShipmentReadyWebhook(client: Client, delivery: ShipmentReadyDelivery) {
  const [error, , response] = await client.execute(deliverShipmentReadyWebhook({ body: delivery }), {
    timeout: DELIVERY_TIMEOUT_MS,
  })
  if (error) {
    if (error.kind === 'transport' && error.code === 'TIMEOUT') return { kind: 'timeout' as const }
    throw error
  }
  if (response.error) throw response.error
  return { kind: 'delivered' as const }
}

export async function main(): Promise<void> {
  // Step 3: Serve one immediate acceptance and one delayed fixture response whose abort clears its pending timer before rejecting.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    const body: unknown = await request.json()
    const deliveryId = typeof body === 'object' && body !== null && 'deliveryId' in body ? body.deliveryId : undefined
    if (deliveryId !== 'delivery-1002') return new Response(null, { status: 204 })

    return new Promise((resolve, reject) => {
      const delayedResponse = setTimeout(() => resolve(new Response(null, { status: 204 })), DELIVERY_TIMEOUT_MS * 2)
      const onAbort = () => {
        clearTimeout(delayedResponse)
        reject(request.signal.reason)
      }
      if (request.signal.aborted) onAbort()
      else request.signal.addEventListener('abort', onAbort, { once: true })
    })
  }

  // Step 4: Deliver both shipment events once through the bounded client.
  const client = createClient(withEndpoint('https://merchant.invalid'), withHTTPHandle(fixtureFetch))
  const delivered = await sendShipmentReadyWebhook(client, {
    deliveryId: 'delivery-1001',
    event: 'shipment.ready',
    orderId: 'order-2048',
    shipmentId: 'shipment-7341',
  })
  const timedOut = await sendShipmentReadyWebhook(client, {
    deliveryId: 'delivery-1002',
    event: 'shipment.ready',
    orderId: 'order-2048',
    shipmentId: 'shipment-7341',
  })

  // Step 5: Emit the accepted and timed-out delivery classifications.
  console.log(JSON.stringify({ delivered, timedOut }))
}

if (import.meta.main) {
  await main()
}
