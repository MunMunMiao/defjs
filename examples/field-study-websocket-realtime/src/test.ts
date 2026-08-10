import assert from 'node:assert/strict'
import { runStudy, type LaneObservation } from './index'
import { JOB_ID } from './fixture'

function frameType(value: unknown): unknown {
  return typeof value === 'object' && value !== null && 'type' in value ? value.type : undefined
}

function assertGraphqlProtocol(observation: LaneObservation): void {
  assert.deepEqual(observation.trace.protocolRequests, [['graphql-transport-ws'], ['graphql-transport-ws']])
  assert.deepEqual(
    observation.trace.frames.map(({ attempt, direction, message }) => ({ attempt, direction, type: frameType(message) })),
    [
      { attempt: 1, direction: 'client', type: 'connection_init' },
      { attempt: 1, direction: 'server', type: 'connection_ack' },
      { attempt: 1, direction: 'client', type: 'subscribe' },
      { attempt: 2, direction: 'client', type: 'connection_init' },
      { attempt: 2, direction: 'server', type: 'connection_ack' },
      { attempt: 2, direction: 'client', type: 'subscribe' },
      { attempt: 2, direction: 'server', type: 'next' },
      { attempt: 2, direction: 'client', type: 'complete' },
    ],
  )

  const subscribe = {
    id: 'job-status-subscription',
    payload: {
      operationName: 'JobStatus',
      query: 'subscription JobStatus($jobId: ID!) { jobStatus(jobId: $jobId) { jobId state progress } }',
      variables: { jobId: JOB_ID },
    },
    type: 'subscribe',
  }
  assert.deepEqual(
    observation.trace.frames.filter(({ direction }) => direction === 'client').map(({ attempt, message }) => ({ attempt, message })),
    [
      { attempt: 1, message: { type: 'connection_init' } },
      { attempt: 1, message: subscribe },
      { attempt: 2, message: { type: 'connection_init' } },
      { attempt: 2, message: subscribe },
      { attempt: 2, message: { id: 'job-status-subscription', type: 'complete' } },
    ],
  )
}

function assertCommonScenario(observation: LaneObservation): void {
  assert.equal(observation.attempts, 2, `${observation.lane}/${observation.scenario} should reconnect once`)
  assert.equal(observation.replayCount, 1, `${observation.lane}/${observation.scenario} should replay once`)
  assert.deepEqual(observation.trace.opens, [1, 2])
  assert.deepEqual(
    observation.trace.closes.map(({ code, source }) => ({ code, source })),
    [
      { code: 1012, source: 'server' },
      { code: 1000, source: 'client' },
    ],
  )
  assert.equal(observation.terminal.code, 1000)
  assert.equal(observation.cleanup.action, observation.lane === 'defjs' ? 'session.close' : 'iterator.return')
  assert.equal(observation.cleanup.closeAwaited, true)
  assert.equal(observation.cleanup.protocolCompleteSent, observation.lane === 'graphql-ws')
  if (observation.lane === 'graphql-ws') {
    assertGraphqlProtocol(observation)
  } else {
    assert.deepEqual(
      observation.trace.frames.filter(({ direction }) => direction === 'client').map(({ attempt, message }) => ({ attempt, message })),
      [
        {
          attempt: 1,
          message: { jobId: JOB_ID, mutationId: 'status-viewed-1', type: 'record-view' },
        },
        { attempt: 1, message: { jobId: JOB_ID, type: 'watch-status' } },
        { attempt: 2, message: { jobId: JOB_ID, type: 'watch-status' } },
      ],
    )
  }
}

function assertSuccess(observation: LaneObservation): void {
  assertCommonScenario(observation)
  const expected = { jobId: JOB_ID, progress: 100, state: 'complete' }
  if (observation.lane === 'defjs') {
    assert.deepEqual(observation.result, { ...expected, type: 'status-update' })
  } else {
    assert.deepEqual(observation.result, expected)
  }
  assert.equal(observation.invalid, null)
  assert.equal(observation.runtimeError, null)
}

function assertInvalid(observation: LaneObservation): void {
  assertCommonScenario(observation)
  assert.equal(observation.result, null)
  assert.ok(observation.invalid)
}

const report = await runStudy()

assertSuccess(report.defjs.success)
assertInvalid(report.defjs.invalid)
assert.equal(report.defjs.invalid.invalid?.accepted, false)
assert.equal(report.defjs.invalid.invalid?.value, null)
assert.equal(report.defjs.invalid.runtimeError?.name, 'StructError')
assert.deepEqual(report.defjs.invalid.runtimeError?.firstIssuePath, ['progress'])
assert.equal(report.defjs.invalid.trace.frames.filter((frame) => frame.direction === 'server').length, 1)

assertSuccess(report.graphqlWs.success)
assertInvalid(report.graphqlWs.invalid)
assert.equal(report.graphqlWs.invalid.invalid?.accepted, true)
assert.deepEqual(report.graphqlWs.invalid.invalid?.value, { jobId: JOB_ID, progress: '100', state: 'complete' })
assert.equal(report.graphqlWs.invalid.runtimeError, null)
assert.equal(report.graphqlWs.invalid.trace.frames.filter((frame) => frame.direction === 'server').length, 3)

console.log('websocket realtime acceptance passed')
