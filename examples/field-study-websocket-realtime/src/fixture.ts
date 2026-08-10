export type FixtureLane = 'defjs' | 'graphql-ws'
export type FixtureScenario = 'success' | 'invalid'

type FrameDirection = 'client' | 'server'

export interface FixtureFrame {
  readonly attempt: number
  readonly direction: FrameDirection
  readonly message: unknown
}

export interface FixtureClose {
  readonly attempt: number
  readonly code: number
  readonly reason: string
  readonly source: 'client' | 'server'
}

export interface FixtureTrace {
  readonly lane: FixtureLane
  readonly scenario: FixtureScenario
  readonly frames: FixtureFrame[]
  readonly opens: number[]
  readonly closes: FixtureClose[]
  readonly protocolRequests: string[][]
  attempts: number
}

export interface StatusUpdate {
  readonly jobId: string
  readonly state: 'complete'
  readonly progress: number
}

export const JOB_ID = 'job-42'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseFrame(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    return { invalidJson: raw }
  }
}

function validStatus(): StatusUpdate {
  return { jobId: JOB_ID, progress: 100, state: 'complete' }
}

function invalidStatus(): Record<string, unknown> {
  return { jobId: JOB_ID, progress: '100', state: 'complete' }
}

export class RealtimeFixtureSocket extends EventTarget {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readonly url: string
  readonly attempt: number
  readonly lane: FixtureLane
  readonly scenario: FixtureScenario
  readonly trace: FixtureTrace
  binaryType = 'arraybuffer'
  extensions = ''
  protocol: string
  readyState = RealtimeFixtureSocket.CONNECTING
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null
  onopen: ((event: Event) => void) | null = null

  constructor(url: string | URL, protocols: string | readonly string[] | undefined, context: FixtureContext) {
    super()
    this.url = String(url)
    this.attempt = context.nextAttempt()
    this.lane = context.lane
    this.scenario = context.scenario
    this.trace = context.trace
    const protocolRequests = protocols === undefined ? [] : typeof protocols === 'string' ? [protocols] : [...protocols]
    this.trace.protocolRequests.push(protocolRequests)
    this.protocol = protocolRequests[0] ?? ''
    queueMicrotask(() => this.open())
  }

  open(): void {
    if (this.readyState !== RealtimeFixtureSocket.CONNECTING) return
    this.readyState = RealtimeFixtureSocket.OPEN
    this.trace.opens.push(this.attempt)
    this.emitOpen(new Event('open'))
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    const raw = typeof data === 'string' ? data : String(data)
    const message = parseFrame(raw)
    this.trace.frames.push({ attempt: this.attempt, direction: 'client', message })
    if (this.readyState !== RealtimeFixtureSocket.OPEN || !isRecord(message)) return

    if (this.lane === 'defjs') {
      this.handleDefjsFrame(message)
    } else {
      this.handleGraphqlWsFrame(message)
    }
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState >= RealtimeFixtureSocket.CLOSING) return
    this.readyState = RealtimeFixtureSocket.CLOSING
    queueMicrotask(() => {
      this.serverClose(code, reason, true, 'client')
    })
  }

  serverClose(code: number, reason: string, wasClean: boolean, source: 'client' | 'server' = 'server'): void {
    if (this.readyState === RealtimeFixtureSocket.CLOSED) return
    this.readyState = RealtimeFixtureSocket.CLOSED
    this.trace.closes.push({ attempt: this.attempt, code, reason, source })
    const event = new CloseEvent('close', { code, reason, wasClean })
    this.dispatchEvent(event)
    this.onclose?.(event)
  }

  message(value: unknown): void {
    if (this.readyState !== RealtimeFixtureSocket.OPEN) return
    this.trace.frames.push({ attempt: this.attempt, direction: 'server', message: value })
    const event = new MessageEvent('message', { data: JSON.stringify(value) })
    this.dispatchEvent(event)
    this.onmessage?.(event)
  }

  private handleDefjsFrame(message: Record<string, unknown>): void {
    if (message['type'] !== 'watch-status' || message['jobId'] !== JOB_ID) return
    if (this.attempt === 1) {
      queueMicrotask(() => this.serverClose(1012, 'fixture restart', false))
      return
    }

    this.message({
      ...(this.scenario === 'invalid' ? invalidStatus() : validStatus()),
      type: 'status-update',
    })
  }

  private handleGraphqlWsFrame(message: Record<string, unknown>): void {
    switch (message['type']) {
      case 'connection_init':
        this.message({ type: 'connection_ack' })
        return
      case 'ping':
        this.message({ payload: message['payload'], type: 'pong' })
        return
      case 'subscribe':
        if (this.attempt === 1) {
          queueMicrotask(() => this.serverClose(1012, 'fixture restart', false))
          return
        }

        this.message({
          id: message['id'],
          payload: {
            data: {
              jobStatus: this.scenario === 'invalid' ? invalidStatus() : validStatus(),
            },
          },
          type: 'next',
        })
        return
      case 'complete':
        return
      default:
        return
    }
  }

  private emitOpen(event: Event): void {
    this.dispatchEvent(event)
    this.onopen?.(event)
  }
}

interface FixtureContext {
  readonly lane: FixtureLane
  readonly scenario: FixtureScenario
  readonly trace: FixtureTrace
  nextAttempt(): number
}

export function createRealtimeFixture(lane: FixtureLane, scenario: FixtureScenario = 'success') {
  const trace: FixtureTrace = {
    attempts: 0,
    closes: [],
    frames: [],
    lane,
    opens: [],
    protocolRequests: [],
    scenario,
  }
  const context: FixtureContext = {
    lane,
    scenario,
    trace,
    nextAttempt() {
      trace.attempts += 1
      return trace.attempts
    },
  }

  class FixtureWebSocket extends RealtimeFixtureSocket {
    constructor(url: string | URL, protocols?: string | readonly string[]) {
      super(url, protocols, context)
    }
  }

  return {
    trace,
    WebSocket: FixtureWebSocket as unknown as typeof WebSocket,
  }
}
