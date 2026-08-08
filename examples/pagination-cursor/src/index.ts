import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

// Step 1: Treat the conversation cursor as opaque continuation data under a hard page cap.
export const MAX_CONVERSATION_PAGES = 20

export const listConversationMessages = defineRequest({
  method: 'GET',
  path: '/support/conversations/:conversationId/messages',
  input: struct.request({
    path: struct.object({ conversationId: struct.string() }),
    query: struct.object({ cursor: struct.string().optional() }),
  }),
  output: [
    {
      status: 200,
      body: struct.object({
        items: struct.array(struct.object({ id: struct.string() })),
        nextCursor: struct.string().optional(),
      }),
    },
  ] as const,
})

// Step 2: Own cursor progress detection and preserve message order across validated pages.
export async function collectConversationMessageIds(client: Client, conversationId: string): Promise<string[]> {
  const messageIds: string[] = []
  const seenCursors = new Set<string>()
  let cursor: string | undefined
  let pages = 0

  while (pages < MAX_CONVERSATION_PAGES) {
    pages++
    const [error, page, response] = await client.execute(
      listConversationMessages({
        path: { conversationId: encodeURIComponent(conversationId) },
        query: { cursor },
      }),
    )
    if (error) throw error
    if (response.error) throw response.error

    messageIds.push(...page.items.map((message) => message.id))
    const nextCursor = page.nextCursor
    if (!nextCursor) return messageIds
    if (seenCursors.has(nextCursor)) throw new Error('pagination cursor did not advance')
    seenCursors.add(nextCursor)
    cursor = nextCursor
  }
  throw new Error(`conversation exceeded ${MAX_CONVERSATION_PAGES} pages`)
}

export async function main(): Promise<void> {
  // Step 3: Serve two local pages selected by the opaque cursor.
  const fixtureFetch: typeof fetch = async (input, init) => {
    const url = new URL(new Request(input, init).url)
    const body = url.searchParams.has('cursor')
      ? { items: [{ id: 'message-103' }] }
      : { items: [{ id: 'message-101' }, { id: 'message-102' }], nextCursor: 'after-message-102' }
    return Response.json(body)
  }

  // Step 4: Collect the conversation through the bounded cursor iterator.
  const client = createClient(withEndpoint('https://support.invalid'), withHTTPHandle(fixtureFetch))
  const messageIds = await collectConversationMessageIds(client, 'conversation-482')

  // Step 5: Emit message IDs in page and item order.
  console.log(JSON.stringify({ messageIds }))
}

if (import.meta.main) {
  await main()
}
