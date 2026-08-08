import { createClient, defineRequest, struct, type Client, type Infer, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Preserve omission and explicit null deletion in the customer contact Merge Patch contract.
const customerContactPatchStruct = struct.object({
  phone: struct.string().null().optional(),
  locale: struct.string().optional(),
})
const customerContactStruct = struct.object({
  customerId: struct.string(),
  displayName: struct.string(),
  phone: struct.string().optional(),
  locale: struct.string(),
})
export type CustomerContactPatch = Infer<typeof customerContactPatchStruct>
export const patchCustomerContact = defineRequest({
  method: 'PATCH',
  path: '/customers/:id/contact',
  input: struct.object({
    id: struct.string(),
    patch: customerContactPatchStruct,
  }),
  output: [
    {
      status: 200,
      body: customerContactStruct,
    },
  ] as const,
  build(build, input) {
    build.setPathParams({ id: input.id })
    build.setJson(input.patch, { contentType: 'application/merge-patch+json' })
  },
})

// Step 2: Expose only the validated contact after the merge-patch media type is honored.
export async function updateCustomerContact(client: Client, customerId: string, patch: CustomerContactPatch) {
  const [error, contact, response] = await client.execute(patchCustomerContact({ id: encodeURIComponent(customerId), patch }))
  if (error) throw error
  if (response.error) throw response.error
  return contact
}

export async function main(): Promise<void> {
  // Step 3: Model the existing contact and apply Merge Patch semantics in the fixture.
  const contact: Infer<typeof customerContactStruct> = {
    customerId: 'customer-1042',
    displayName: 'Mina Chen',
    phone: '+12025550142',
    locale: 'en-US',
  }
  let mediaType = ''
  let sentPatch: CustomerContactPatch = {}
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    mediaType = request.headers.get('content-type') ?? ''
    sentPatch = (await request.json()) as CustomerContactPatch
    if (sentPatch.phone === null) delete contact.phone
    else if (sentPatch.phone !== undefined) contact.phone = sentPatch.phone
    if (sentPatch.locale !== undefined) contact.locale = sentPatch.locale
    return new Response(JSON.stringify(contact), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 4: Delete the phone and update the locale through the typed patch operation.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))
  const updated = await updateCustomerContact(client, 'customer-1042', { phone: null, locale: 'fr-FR' })

  // Step 5: Emit the media type, sent patch, and resulting contact.
  console.log(JSON.stringify({ mediaType, sentPatch, contact: updated }))
}

if (import.meta.main) {
  await main()
}
