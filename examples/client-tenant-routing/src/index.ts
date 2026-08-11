import {
  createClient,
  createHttpInterceptor,
  defineRequest,
  makeHttpContext,
  makeHttpContextToken,
  struct,
  type Client,
  withEndpoint,
  withHTTPHandle,
  withInterceptors,
} from '@defjs/core'

// Step 1: Model tenant routing as request-scoped context beside one typed project read.
const tenantRouteContext = makeHttpContextToken(() => '')
export const listProjects = defineRequest({
  method: 'GET',
  path: '/projects',
  output: [{ status: 200, body: struct.array(struct.object({ id: struct.string() })) }],
})

// Step 2: Validate the tenant slug and bind it to one execution context before dispatch.
export async function listTenantProjects(client: Client, tenantRoute: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(tenantRoute)) {
    throw new TypeError('tenant route must be a lowercase slug')
  }

  const context = makeHttpContext().set(tenantRouteContext, tenantRoute)
  const [error, projects, response] = await client.execute(listProjects(), { context })
  if (error) throw error
  if (response.error) throw response.error
  return projects
}

// Step 3: Translate the current route context into a gateway-partition header; enforce authentication and tenant authorization separately.
export const tenantRouting = createHttpInterceptor((request, next) => {
  const tenantRoute = request.context?.get(tenantRouteContext)
  if (!tenantRoute) throw new Error('tenant route context is required')

  const headers = new Headers(request.headers)
  headers.set('x-tenant-route', tenantRoute)
  return next({ ...request, headers })
})

export async function main(): Promise<void> {
  // Step 4: Map each accepted tenant route to distinct local project data.
  const projectsByRoute = new Map([
    ['meridian-eu', [{ id: 'route-optimizer' }]],
    ['meridian-us', [{ id: 'customs-ledger' }]],
  ])
  const fixtureFetch: typeof fetch = async (input, init) => {
    const tenantRoute = new Request(input, init).headers.get('x-tenant-route')
    const projects = tenantRoute ? projectsByRoute.get(tenantRoute) : undefined
    if (!projects) throw new Error('fixture received an unknown tenant route')
    return Response.json(projects)
  }

  // Step 5: Reuse one client for two reads with independent routing contexts.
  const client = createClient(withEndpoint('https://projects.invalid'), withHTTPHandle(fixtureFetch), withInterceptors(tenantRouting))

  const projects = {
    'meridian-eu': await listTenantProjects(client, 'meridian-eu'),
    'meridian-us': await listTenantProjects(client, 'meridian-us'),
  }

  // Step 6: Emit the projects observed for each tenant route.
  console.log(JSON.stringify(projects))
}

if (import.meta.main) {
  await main()
}
