import {
  createClient,
  defineWebSocket,
  struct,
  type WebSocketIncomingData,
  withEndpoint,
  withWebSocketHandle,
  withWebSocketReconnect,
} from '@defjs/core'
import { createClient as createGraphqlClient } from 'graphql-ws'
import { createRealtimeFixture, JOB_ID, type FixtureTrace, type StatusUpdate } from './fixture'

const statusIncoming = {
  'status-update': struct.object({
    jobId: struct.string(),
    progress: struct.number(),
    state: struct.literal('complete'),
  }),
}

const statusOutgoing = {
  'record-view': struct.object({ jobId: struct.string(), mutationId: struct.string() }),
  'watch-status': struct.object({ jobId: struct.string() }),
}

export type JobStatusEvent = WebSocketIncomingData<typeof statusIncoming>

export const jobStatus = defineWebSocket({
  maxIncomingQueueSize: 8,
  path: '/v1/jobs/status',
  incoming: statusIncoming,
  outgoing: statusOutgoing,
})

const statusWatch = { jobId: JOB_ID, type: 'watch-status' } as const
const statusMutation = { jobId: JOB_ID, mutationId: 'status-viewed-1', type: 'record-view' } as const
const graphqlSubscription = {
  operationName: 'JobStatus',
  query: 'subscription JobStatus($jobId: ID!) { jobStatus(jobId: $jobId) { jobId state progress } }',
  variables: { jobId: JOB_ID },
}
const subscriptionId = 'job-status-subscription'

type GraphqlResult = { jobStatus: StatusUpdate }

export interface CloseObservation {
  readonly code: number | null
  readonly reason: string
  readonly wasClean: boolean | null
}

export interface RuntimeErrorObservation {
  readonly firstIssuePath: readonly (string | number)[]
  readonly issueCount: number
  readonly message: string
  readonly name: string
}

export interface LaneObservation {
  readonly attempts: number
  readonly cleanup: {
    readonly action: 'iterator.return' | 'session.close'
    readonly closeAwaited: boolean
    readonly protocolCompleteSent: boolean
  }
  readonly invalid: { readonly accepted: boolean; readonly value: unknown } | null
  readonly lane: 'defjs' | 'graphql-ws'
  readonly replayCount: number
  readonly result: StatusUpdate | null
  readonly runtimeError: RuntimeErrorObservation | null
  readonly scenario: 'success' | 'invalid'
  readonly terminal: CloseObservation
  readonly trace: FixtureTrace
}

export interface StudyReport {
  readonly defjs: {
    readonly invalid: LaneObservation
    readonly success: LaneObservation
  }
  readonly graphqlWs: {
    readonly invalid: LaneObservation
    readonly success: LaneObservation
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStatusUpdate(value: unknown): value is StatusUpdate {
  return isRecord(value) && value['jobId'] === JOB_ID && value['progress'] === 100 && value['state'] === 'complete'
}

function summarizeClose(value: unknown): CloseObservation {
  if (!isRecord(value)) {
    return { code: null, reason: '', wasClean: null }
  }

  return {
    code: typeof value['code'] === 'number' ? value['code'] : null,
    reason: typeof value['reason'] === 'string' ? value['reason'] : '',
    wasClean: typeof value['wasClean'] === 'boolean' ? value['wasClean'] : null,
  }
}

function summarizeRuntimeError(value: unknown): RuntimeErrorObservation {
  if (!isRecord(value)) {
    return {
      firstIssuePath: [],
      issueCount: 0,
      message: String(value),
      name: 'UnknownError',
    }
  }

  const issues = Array.isArray(value['issues']) ? value['issues'] : []
  const firstIssue = issues[0]
  const path = isRecord(firstIssue) && Array.isArray(firstIssue['path']) ? firstIssue['path'] : []

  return {
    firstIssuePath: path.filter((item): item is string | number => typeof item === 'string' || typeof item === 'number'),
    issueCount: issues.length,
    message: typeof value['message'] === 'string' ? value['message'] : String(value),
    name: typeof value['name'] === 'string' ? value['name'] : 'UnknownError',
  }
}

function withTimeout<T>(promise: PromiseLike<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 2_000)
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

function hasCompleteFrame(trace: FixtureTrace): boolean {
  return trace.frames.some((frame) => frame.direction === 'client' && isRecord(frame.message) && frame.message['type'] === 'complete')
}

function makeDefjsClient(WebSocketImpl: typeof WebSocket) {
  return createClient(
    withEndpoint('https://jobs.invalid'),
    withWebSocketHandle(WebSocketImpl),
    withWebSocketReconnect({
      attempts: 1,
      delayMs: 0,
      shouldReconnect: ({ code }) => code === 1012,
    }),
  )
}

async function runDefjsScenario(scenario: 'success' | 'invalid'): Promise<LaneObservation> {
  const fixture = createRealtimeFixture('defjs', scenario)
  const client = makeDefjsClient(fixture.WebSocket)
  const [error, session] = await client.execute(jobStatus())
  if (error) throw error

  let activeWatch = true
  let watchedGeneration = 0
  let replayCount = 0
  const restoreActiveWatch = () => {
    if (!activeWatch) return
    const generation = session.connection.generation
    if (generation <= watchedGeneration) return
    if (watchedGeneration > 0) replayCount += 1
    watchedGeneration = generation
    session.send(statusWatch)
  }
  const removeStateListener = session.onStateChange((state) => {
    if (state === 'open') restoreActiveWatch()
  })

  let removeRuntimeListener = () => {}
  const runtimeErrorPromise = new Promise<RuntimeErrorObservation>((resolve) => {
    const listener = (value: unknown) => {
      removeRuntimeListener()
      resolve(summarizeRuntimeError(value))
    }
    removeRuntimeListener = session.onRuntimeError(listener)
  })

  const next = session.receive[Symbol.asyncIterator]().next()
  let result: StatusUpdate | null = null
  let invalid: { readonly accepted: boolean; readonly value: unknown } | null = null
  let runtimeError: RuntimeErrorObservation | null = null
  let terminal: CloseObservation | undefined

  try {
    session.send(statusMutation)
    restoreActiveWatch()
    if (scenario === 'success') {
      const received = await withTimeout(next, 'Defjs status update')
      if (received.done || !isStatusUpdate(received.value)) {
        throw new Error(`Defjs returned an invalid success result: ${JSON.stringify(received.value)}`)
      }
      result = received.value
    } else {
      runtimeError = await withTimeout(runtimeErrorPromise, 'Defjs invalid-message runtime error')
      invalid = { accepted: false, value: null }
    }
  } finally {
    activeWatch = false
    removeStateListener()
    removeRuntimeListener()
    session.close(1000, `${scenario} scenario finished`)
    terminal = summarizeClose(await withTimeout(session.closed, 'Defjs session shutdown'))
  }

  if (scenario === 'invalid') {
    const drained = await withTimeout(next, 'Defjs invalid receive queue shutdown')
    if (!drained.done) {
      throw new Error('Defjs queued an invalid status update')
    }
  }

  if (!terminal) throw new Error('Defjs did not produce terminal close information')

  return {
    attempts: fixture.trace.attempts,
    cleanup: {
      action: 'session.close',
      closeAwaited: true,
      protocolCompleteSent: false,
    },
    invalid,
    lane: 'defjs',
    replayCount,
    result,
    runtimeError,
    scenario,
    terminal,
    trace: fixture.trace,
  }
}

async function runGraphqlWsScenario(scenario: 'success' | 'invalid'): Promise<LaneObservation> {
  const fixture = createRealtimeFixture('graphql-ws', scenario)
  let resolveTerminal!: (value: CloseObservation) => void
  const terminal = new Promise<CloseObservation>((resolve) => {
    resolveTerminal = resolve
  })
  const client = createGraphqlClient({
    url: 'ws://jobs.invalid/graphql',
    webSocketImpl: fixture.WebSocket,
    generateID: () => subscriptionId,
    retryAttempts: 1,
    retryWait: async () => {},
    shouldRetry: (value) => isRecord(value) && value['code'] === 1012,
    on: {
      closed: (value) => {
        const close = summarizeClose(value)
        if (close.code === 1000) resolveTerminal(close)
      },
    },
  })

  const iterator = client.iterate<GraphqlResult>(graphqlSubscription)
  let result: StatusUpdate | null = null
  let invalid: { readonly accepted: boolean; readonly value: unknown } | null = null
  let terminalClose: CloseObservation | undefined

  try {
    const received = await withTimeout(iterator.next(), 'graphql-ws status update')
    if (received.done) throw new Error('graphql-ws completed before the status update')

    const value = received.value.data?.jobStatus as unknown
    if (scenario === 'success') {
      if (!isStatusUpdate(value)) {
        throw new Error(`graphql-ws returned an invalid success result: ${JSON.stringify(value)}`)
      }
      result = value
    } else {
      // graphql-ws validates protocol frames, but does not validate application result fields.
      invalid = { accepted: true, value }
    }
  } finally {
    await iterator.return?.()
    await client.dispose()
    terminalClose = await withTimeout(terminal, 'graphql-ws client shutdown')
  }

  if (!terminalClose) throw new Error('graphql-ws did not produce terminal close information')

  return {
    attempts: fixture.trace.attempts,
    cleanup: {
      action: 'iterator.return',
      closeAwaited: true,
      protocolCompleteSent: hasCompleteFrame(fixture.trace),
    },
    invalid,
    lane: 'graphql-ws',
    replayCount: fixture.trace.frames.filter(
      (frame) => frame.direction === 'client' && frame.attempt > 1 && isRecord(frame.message) && frame.message['type'] === 'subscribe',
    ).length,
    result,
    runtimeError: null,
    scenario,
    terminal: terminalClose,
    trace: fixture.trace,
  }
}

export async function runStudy(): Promise<StudyReport> {
  return {
    defjs: {
      invalid: await runDefjsScenario('invalid'),
      success: await runDefjsScenario('success'),
    },
    graphqlWs: {
      invalid: await runGraphqlWsScenario('invalid'),
      success: await runGraphqlWsScenario('success'),
    },
  }
}

function summarizeForStart(observation: LaneObservation) {
  return {
    attempts: observation.attempts,
    closeCodes: observation.trace.closes.map((close) => close.code),
    cleanup: observation.cleanup,
    invalid: observation.invalid,
    replayCount: observation.replayCount,
    result: observation.result,
    runtimeError: observation.runtimeError
      ? { firstIssuePath: observation.runtimeError.firstIssuePath, name: observation.runtimeError.name }
      : null,
  }
}

function summarizeStudyForStart(report: StudyReport) {
  return {
    defjs: {
      invalid: summarizeForStart(report.defjs.invalid),
      success: summarizeForStart(report.defjs.success),
    },
    graphqlWs: {
      invalid: summarizeForStart(report.graphqlWs.invalid),
      success: summarizeForStart(report.graphqlWs.success),
    },
  }
}

if (import.meta.main) {
  console.log(JSON.stringify(summarizeStudyForStart(await runStudy())))
}
