import { createClient, defineRequest, struct, StructError, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Require a string aisle before any successful inventory body reaches application code.
export const readInventorySnapshot = defineRequest({
  method: 'GET',
  path: '/warehouses/warehouse-east/inventory/:sku',
  input: struct.request({ path: struct.object({ sku: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.object({
        sku: struct.string(),
        available: struct.boolean(),
        location: struct.object({ aisle: struct.string() }),
      }),
    },
  ] as const,
})

// Step 2: Expose only fully validated snapshots from the HTTP 200 response.
export async function loadInventorySnapshot(client: Client, sku: string) {
  const [error, snapshot] = await client.execute(readInventorySnapshot({ path: { sku } }))
  if (error) throw error
  return snapshot
}

// Step 3: Recognize Defjs response-validation failures without misclassifying other errors.
function isResponseValidationError(
  error: unknown,
): error is { cause: StructError; code: 'RESPONSE_VALIDATION_FAILED'; kind: 'definition' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'kind' in error &&
    error.kind === 'definition' &&
    'code' in error &&
    error.code === 'RESPONSE_VALIDATION_FAILED' &&
    'cause' in error &&
    error.cause instanceof StructError
  )
}

export async function main(): Promise<void> {
  // Step 4: Omit the required aisle from an otherwise successful response.
  const fixtureFetch: typeof fetch = async () => Response.json({ sku: 'sku-2048', available: true, location: {} })

  // Step 5: Load the snapshot through the declared response Struct.
  const client = createClient(withEndpoint('https://fixture.invalid'), withHTTPHandle(fixtureFetch))

  try {
    await loadInventorySnapshot(client, 'sku-2048')
  } catch (error) {
    if (!isResponseValidationError(error)) throw error
    const issue = error.cause.issues[0]

    // Step 6: Emit only the validation code, issue path, and message.
    console.log(
      JSON.stringify({
        code: error.code,
        path: issue?.path.join('.') ?? '',
        message: issue?.message ?? '',
      }),
    )
  }
}

if (import.meta.main) {
  await main()
}
