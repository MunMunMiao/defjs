import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'
import LinkHeader from 'http-link-header'

// Step 1: Fix the open-issue collection and bounded page shape that pagination may request.
const ISSUE_PAGE_SIZE = 50
export const MAX_ISSUE_PAGES = 20

export const listOpenRepositoryIssues = defineRequest({
  method: 'GET',
  path: '/repositories/:repository/issues',
  input: struct.request({
    path: struct.object({ repository: struct.string() }),
    query: struct.object({
      page: struct.number(),
      perPage: struct.number().alias('per_page'),
      state: struct.literal('open'),
    }),
  }),
  output: [
    {
      status: 200,
      body: struct.array(struct.object({ id: struct.string(), title: struct.string() })),
    },
  ] as const,
})

// Step 2: Treat Link metadata as untrusted and allow only advancing pages on the same collection.
function nextIssuePage(value: string | null, apiOrigin: string, repository: string, currentPage: number): number | null {
  if (value === null) return null

  const collection = new URL(`/repositories/${encodeURIComponent(repository)}/issues`, apiOrigin)
  const reference = LinkHeader.parse(value).rel('next')[0]
  if (reference === undefined) return null

  const target = new URL(reference.uri, collection)
  if (target.origin !== collection.origin || target.pathname !== collection.pathname) {
    throw new Error('pagination next target escaped the issue collection')
  }

  const page = Number(target.searchParams.get('page'))
  if (!Number.isSafeInteger(page) || page <= currentPage) {
    throw new Error('pagination next target did not advance the page')
  }
  return page
}

// Step 3: Rebuild each page through the typed request instead of dispatching advertised URLs.
export async function listAllOpenIssues(client: Client, apiOrigin: string, repository: string) {
  const issues: Array<{ id: string; title: string }> = []
  let page = 1
  let pages = 0

  while (pages < MAX_ISSUE_PAGES) {
    pages++
    const [error, currentIssues, response] = await client.execute(
      listOpenRepositoryIssues({
        path: { repository },
        query: { page, perPage: ISSUE_PAGE_SIZE, state: 'open' },
      }),
    )
    if (error) throw error
    if (response.error) throw response.error

    issues.push(...currentIssues)
    const nextPage = nextIssuePage(response.headers.get('link'), apiOrigin, repository, page)
    if (nextPage === null) return issues
    page = nextPage
  }
  throw new Error(`issue listing exceeded ${MAX_ISSUE_PAGES} pages`)
}

export async function main(): Promise<void> {
  // Step 4: Serve a same-origin next link followed by the terminal issue page.
  const apiOrigin = 'https://issues.invalid'
  const fixtureFetch: typeof fetch = async (input, init) => {
    const page = new URL(new Request(input, init).url).searchParams.get('page')
    if (page === '1') {
      return Response.json([{ id: 'CHK-17', title: 'Retry button remains disabled' }], {
        headers: { link: `<${apiOrigin}/repositories/checkout/issues?page=2>; rel="next"` },
      })
    }
    return Response.json([{ id: 'CHK-23', title: 'Tax total rounds incorrectly' }])
  }

  // Step 5: Traverse both pages through the bounded Link-header reader.
  const client = createClient(withEndpoint(apiOrigin), withHTTPHandle(fixtureFetch))
  const issues = await listAllOpenIssues(client, apiOrigin, 'checkout')

  // Step 6: Emit issue IDs in their original page order.
  console.log(JSON.stringify({ issueIds: issues.map((issue) => issue.id) }))
}

if (import.meta.main) {
  await main()
}
