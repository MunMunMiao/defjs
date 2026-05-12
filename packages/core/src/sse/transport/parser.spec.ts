import { describe, expect, test } from 'vitest'
import { createLineParser, createMessageParser, type EventStreamMessage, readStreamBytes } from './parser'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

describe('sse parser', () => {
  test('should read stream bytes chunk by chunk', async () => {
    const chunks = ['first', 'second', 'third'].map(value => encoder.encode(value))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    const seen: string[] = []
    await readStreamBytes(stream, async chunk => {
      seen.push(decoder.decode(chunk))
    })

    expect(seen).toEqual(['first', 'second', 'third'])
  })

  test('should parse split lines and crlf correctly', async () => {
    const lines: Array<{ fieldLength: number; line: string }> = []
    const parseLine = createLineParser(async (line, fieldLength) => {
      lines.push({
        fieldLength,
        line: decoder.decode(line),
      })
    })

    await parseLine(encoder.encode('data: hel'))
    await parseLine(encoder.encode('lo\r\nid: 1\r'))
    await parseLine(encoder.encode('\n\r\n'))

    expect(lines).toEqual([
      { fieldLength: 4, line: 'data: hello' },
      { fieldLength: 2, line: 'id: 1' },
      { fieldLength: -1, line: '' },
    ])
  })

  test('should parse message fields, ids and retry values', async () => {
    const ids: string[] = []
    const retries: number[] = []
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(
      id => {
        ids.push(id)
      },
      retry => {
        retries.push(retry)
      },
      async message => {
        messages.push(message)
      },
    )
    const parseLine = createLineParser(parseMessage)

    await parseLine(encoder.encode('id: 1\nretry: 500\nevent: update\ndata: line 1\ndata: line 2\n\n'))

    expect(ids).toEqual(['1'])
    expect(retries).toEqual([500])
    expect(messages).toEqual([
      {
        id: '1',
        event: 'update',
        data: 'line 1\nline 2',
        retry: 500,
      },
    ])
  })

  test('should ignore comments malformed retry and lines without field', async () => {
    const ids: string[] = []
    const retries: number[] = []
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(
      id => {
        ids.push(id)
      },
      retry => {
        retries.push(retry)
      },
      async message => {
        messages.push(message)
      },
    )
    const parseLine = createLineParser(parseMessage)

    await parseLine(encoder.encode(': comment\nretry: nope\nevent\ndata: ok\n\n'))

    expect(ids).toEqual([])
    expect(retries).toEqual([])
    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'ok',
        retry: undefined,
      },
    ])
  })
})
