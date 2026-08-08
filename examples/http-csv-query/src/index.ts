import {
  createClient,
  defineRequest,
  struct,
  type Client,
  type QueryParamsSerializer,
  withEndpoint,
  withHTTPHandle,
  withQueryParamsSerializer,
} from '@defjs/core'

// Step 1: Model knowledge tags as one CSV query member while keeping article output typed.
export const searchKnowledgeBase = defineRequest({
  method: 'GET',
  path: '/knowledge/articles',
  input: struct.request({ query: struct.object({ tags: struct.array(struct.string()).alias('tag') }) }),
  output: [{ status: 200, body: struct.object({ articles: struct.array(struct.object({ id: struct.string() })) }) }] as const,
})

// Step 2: Keep tag search independent of the provider-specific delimiter encoding.
export async function findArticlesByTags(client: Client, tags: readonly string[]) {
  const [error, result] = await client.execute(searchKnowledgeBase({ query: { tags: [...tags] } }))
  if (error) throw error
  return result.articles
}

// Step 3: Encode each tag before joining so data commas cannot become array delimiters.
export const csvQuerySerializer: QueryParamsSerializer = (params) =>
  [...new Set(params.keys())]
    .map(
      (key) =>
        `${encodeURIComponent(key)}=${params
          .getAll(key)
          .map((value) => encodeURIComponent(value))
          .join(',')}`,
    )
    .join('&')

export async function main(): Promise<void> {
  // Step 4: Capture the raw CSV query and decode values only after splitting its delimiter.
  let query = ''
  let receivedTags: string[] = []
  const fixtureFetch: typeof fetch = async (input, init) => {
    query = new URL(new Request(input, init).url).search
    receivedTags = query.slice('?tag='.length).split(',').map(decodeURIComponent)
    return new Response(JSON.stringify({ articles: [{ id: 'kb-17' }, { id: 'kb-29' }] }), {
      headers: { 'content-type': 'application/json' },
      status: 200,
    })
  }

  // Step 5: Search with a tag whose own comma must remain percent-encoded.
  const client = createClient(
    withEndpoint('https://fixture.invalid'),
    withQueryParamsSerializer(csvQuerySerializer),
    withHTTPHandle(fixtureFetch),
  )
  const articles = await findArticlesByTags(client, ['type safety', 'priority,high'])

  // Step 6: Emit the exact query, decoded tags, and validated articles.
  console.log(JSON.stringify({ query, tags: receivedTags, articles }))
}

if (import.meta.main) {
  await main()
}
