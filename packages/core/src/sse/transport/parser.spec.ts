import { describe, expect, test } from 'vitest'
import type { EventStreamMessage } from './parser'
import { createLineParser, createMessageParser, readStreamBytes } from './parser'

const encoder = new TextEncoder()
const decoder = new TextDecoder()
const noop = () => {
  /* intentionally empty */
}

describe('sse parser', () => {
  test('should read stream bytes chunk by chunk', async () => {
    const chunks = ['first', 'second', 'third'].map((value) => encoder.encode(value))
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })

    const seen: string[] = []
    await readStreamBytes(stream, async (chunk) => {
      seen.push(decoder.decode(chunk))
    })

    expect(seen).toEqual(['first', 'second', 'third'])
  })

  test('should release reader lock on error', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('ok'))
        controller.close()
      },
    })

    await expect(
      readStreamBytes(stream, () => {
        throw new Error('fail')
      }),
    ).rejects.toThrow('fail')

    // stream should be unlocked so we can get a new reader
    expect(() => stream.getReader()).not.toThrow()
  })

  test('should release reader lock after normal completion', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('ok'))
        controller.close()
      },
    })

    await readStreamBytes(stream, noop)

    expect(() => stream.getReader()).not.toThrow()
  })

  test('should handle abort without reason gracefully', async () => {
    let enqueueTimeout: ReturnType<typeof setTimeout> | undefined
    let closeTimeout: ReturnType<typeof setTimeout> | undefined

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        enqueueTimeout = setTimeout(() => controller.enqueue(encoder.encode('ok')), 50)
        closeTimeout = setTimeout(() => controller.close(), 100)
      },
      cancel() {
        clearTimeout(enqueueTimeout)
        clearTimeout(closeTimeout)
      },
    })

    const abortController = new AbortController()
    setTimeout(() => abortController.abort(), 10)

    await readStreamBytes(stream, noop, abortController.signal)

    expect(() => stream.getReader()).not.toThrow()
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
      (id) => {
        ids.push(id)
      },
      (retry) => {
        retries.push(retry)
      },
      async (message) => {
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
      (id) => {
        ids.push(id)
      },
      (retry) => {
        retries.push(retry)
      },
      async (message) => {
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

  test('should handle partial line across chunks with non-zero line start', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage)

    // First chunk: complete line + partial line (with colon so fieldLength > 0)
    await parseLine(encoder.encode('data: hello\ndata: in'))
    // Second chunk: complete the partial line
    await parseLine(encoder.encode('complete\n\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'hello\nincomplete',
        retry: undefined,
      },
    ])
  })

  test('should handle crlf line endings and discard trailing newlines', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage)

    // CRLF line endings: \r\n triggers discardTrailingNewline, then next \n is skipped
    await parseLine(encoder.encode('data: hello\r\n\r\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'hello',
        retry: undefined,
      },
    ])
  })

  test('should handle field with space after colon', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage)

    // Space after colon means valueOffset uses +2 instead of +1
    await parseLine(encoder.encode('data: hello world\n\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'hello world',
        retry: undefined,
      },
    ])
  })

  test('should handle field without space after colon', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage)

    // No space after colon means valueOffset uses +1
    await parseLine(encoder.encode('data:hello\n\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'hello',
        retry: undefined,
      },
    ])
  })

  test('should handle crlf followed by non-newline char', async () => {
    const lines: Array<{ fieldLength: number; line: string }> = []
    const parseLine = createLineParser(async (line, fieldLength) => {
      lines.push({
        fieldLength,
        line: decoder.decode(line),
      })
    })

    // \r\n triggers discardTrailingNewline, next char is 'i' not \n
    await parseLine(encoder.encode('data: hello\r\nid: 1\r\n\r\n'))

    expect(lines).toEqual([
      { fieldLength: 4, line: 'data: hello' },
      { fieldLength: 2, line: 'id: 1' },
      { fieldLength: -1, line: '' },
    ])
  })

  test('should handle bare cr without following lf', async () => {
    const lines: Array<{ fieldLength: number; line: string }> = []
    const parseLine = createLineParser(async (line, fieldLength) => {
      lines.push({
        fieldLength,
        line: decoder.decode(line),
      })
    })

    // Bare \r (not \r\n) — discardTrailingNewline is true but next char is not \n
    await parseLine(encoder.encode('data: hello\rid: 1\r\r'))

    expect(lines).toEqual([
      { fieldLength: 4, line: 'data: hello' },
      { fieldLength: 2, line: 'id: 1' },
      { fieldLength: -1, line: '' },
    ])
  })

  test('should enforce maxBufferSize on unterminated line', async () => {
    const parseLine = createLineParser(noop, { maxBufferSize: 10 })

    // First chunk fits within limit
    await parseLine(encoder.encode('data: a'))
    // Second chunk concatenates and exceeds maxBufferSize
    await expect(parseLine(encoder.encode('b c d e f g h i j k l m'))).rejects.toThrow('SSE parser buffer exceeded maxBufferSize')
  })

  test('should not enforce maxBufferSize when not set', async () => {
    const parseLine = createLineParser(noop)

    // Large unterminated line without limit should not throw
    await parseLine(encoder.encode('data: '))
    await parseLine(encoder.encode('a'.repeat(10000)))
  })

  test('should not throw maxBufferSize for short messages', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage, { maxBufferSize: 100 })

    await parseLine(encoder.encode('data: hello\n\n'))

    expect(messages).toEqual([
      {
        id: '',
        event: '',
        data: 'hello',
        retry: undefined,
      },
    ])
  })

  test('should allow one chunk with multiple short messages over maxBufferSize', async () => {
    const messages: EventStreamMessage[] = []
    const parseMessage = createMessageParser(noop, noop, async (message) => {
      messages.push(message)
    })
    const parseLine = createLineParser(parseMessage, { maxBufferSize: 20 })

    await parseLine(encoder.encode('data: one\n\ndata: two\n\n'))

    expect(messages.map((message) => message.data)).toEqual(['one', 'two'])
  })
})
