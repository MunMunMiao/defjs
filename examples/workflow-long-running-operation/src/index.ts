import { setTimeout as sleep } from 'node:timers/promises'
import { createClient, defineRequest, struct, type Client, withEndpoint, withHTTPHandle } from '@defjs/core'

const DOWNLOAD_ORIGIN = 'https://downloads.invalid'
const EXPORT_DEADLINE_MS = 1_000
const MAX_EXPORT_POLLS = 3
const POLL_INTERVAL_MS = 1

// Step 1: Type the accepted export start and its operation identity.
export const startReportExport = defineRequest({
  method: 'POST',
  path: '/reports/:reportId/exports',
  input: struct.request({ path: struct.object({ reportId: struct.string() }) }),
  output: [{ status: 202, body: struct.object({ operationId: struct.string() }) }] as const,
})

// Step 2: Model pending, completed, and failed poll states before workflow branching.
export const readReportExport = defineRequest({
  method: 'GET',
  path: '/report-exports/:operationId',
  input: struct.request({ path: struct.object({ operationId: struct.string() }) }),
  output: [
    {
      status: 200,
      body: struct.discriminatedUnion('state', [
        struct.object({ state: struct.literal('pending') }),
        struct.object({ state: struct.literal('completed'), downloadUrl: struct.string() }),
        struct.object({ state: struct.literal('failed'), code: struct.string() }),
      ]),
    },
  ] as const,
})

// Step 3: Compose caller cancellation with one total deadline, clear its timer in finally, enforce the poll cap, and validate the download origin.
export async function runReportExport(client: Client, reportId: string, signal?: AbortSignal): Promise<string> {
  const deadline = new AbortController()
  const timer = setTimeout(() => deadline.abort(new DOMException('report export deadline exceeded', 'TimeoutError')), EXPORT_DEADLINE_MS)
  const workflowSignal = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal

  try {
    const [startError, operation, startResponse] = await client.execute(
      startReportExport({ path: { reportId: encodeURIComponent(reportId) } }),
      { signal: workflowSignal },
    )
    if (startError) throw startError
    if (startResponse.error) throw startResponse.error

    for (let poll = 1; poll <= MAX_EXPORT_POLLS; poll++) {
      const [pollError, state, pollResponse] = await client.execute(
        readReportExport({ path: { operationId: encodeURIComponent(operation.operationId) } }),
        { signal: workflowSignal },
      )
      if (pollError) throw pollError
      if (pollResponse.error) throw pollResponse.error

      if (state.state === 'completed') {
        const download = new URL(state.downloadUrl)
        if (download.protocol !== 'https:' || download.origin !== DOWNLOAD_ORIGIN || download.username || download.password) {
          throw new Error('report export returned an untrusted download URL')
        }
        return download.href
      }
      if (state.state === 'failed') throw new Error(`report export failed: ${state.code}`)
      if (poll < MAX_EXPORT_POLLS) await sleep(POLL_INTERVAL_MS, undefined, { signal: workflowSignal })
    }
    throw new Error('report export exceeded maximum polls')
  } finally {
    clearTimeout(timer)
  }
}

export async function main(): Promise<void> {
  // Step 4: Return one pending poll followed by a completed export locally.
  let polls = 0
  const fixtureFetch: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    if (request.method === 'POST') return Response.json({ operationId: 'export-901' }, { status: 202 })
    if (new URL(request.url).pathname !== '/report-exports/export-901') {
      throw new Error('fixture received an unknown report export')
    }

    polls += 1
    return Response.json(
      polls === 1 ? { state: 'pending' } : { state: 'completed', downloadUrl: 'https://downloads.invalid/sales-2025-03.csv' },
    )
  }

  // Step 5: Run the bounded start-and-poll workflow for the sales report.
  const client = createClient(withEndpoint('https://reports.invalid'), withHTTPHandle(fixtureFetch))
  const downloadUrl = await runReportExport(client, 'sales-2025-03')

  // Step 6: Emit the trusted completion URL after two polls.
  console.log(JSON.stringify({ downloadUrl }))
}

if (import.meta.main) {
  await main()
}
