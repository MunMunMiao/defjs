/**
 * Portions of this file are adapted from Azure/fetch-event-source.
 * See packages/core/THIRD_PARTY_NOTICES.md for the license text.
 */

export interface EventStreamMessage {
  id: string
  event: string
  data: string
  retry?: number
}

const enum ControlChar {
  NewLine = 10,
  CarriageReturn = 13,
  Space = 32,
  Colon = 58,
}

export async function readStreamBytes(
  stream: ReadableStream<Uint8Array>,
  onChunk: (chunk: Uint8Array) => void | Promise<void>,
): Promise<void> {
  const reader = stream.getReader()

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      return
    }

    await onChunk(value)
  }
}

export function createLineParser(
  onLine: (line: Uint8Array, fieldLength: number) => void | Promise<void>,
): (chunk: Uint8Array) => Promise<void> {
  let buffer: Uint8Array | undefined
  let position = 0
  let fieldLength = -1
  let discardTrailingNewline = false

  return async (chunk: Uint8Array) => {
    if (buffer) {
      buffer = concatUint8Array(buffer, chunk)
    } else {
      buffer = chunk
      position = 0
      fieldLength = -1
    }

    const bufferLength = buffer.length
    let lineStart = 0

    while (position < bufferLength) {
      if (discardTrailingNewline) {
        if (buffer[position] === ControlChar.NewLine) {
          lineStart = ++position
        }
        discardTrailingNewline = false
      }

      let lineEnd = -1

      for (; position < bufferLength && lineEnd === -1; ++position) {
        switch (buffer[position]) {
          case ControlChar.Colon:
            if (fieldLength === -1) {
              fieldLength = position - lineStart
            }
            break
          case ControlChar.CarriageReturn:
            discardTrailingNewline = true
            lineEnd = position
            break
          case ControlChar.NewLine:
            lineEnd = position
            break
        }
      }

      if (lineEnd === -1) {
        break
      }

      await onLine(buffer.subarray(lineStart, lineEnd), fieldLength)
      lineStart = position
      fieldLength = -1
    }

    if (lineStart === bufferLength) {
      buffer = undefined
    } else if (lineStart !== 0) {
      buffer = buffer.subarray(lineStart)
      position -= lineStart
    }
  }
}

export function createMessageParser(
  onId: (id: string) => void,
  onRetry: (retry: number) => void,
  onMessage?: (message: EventStreamMessage) => void | Promise<void>,
): (line: Uint8Array, fieldLength: number) => Promise<void> {
  let message = { id: '', event: '', data: '', retry: undefined } as EventStreamMessage
  const decoder = new TextDecoder()

  return async (line: Uint8Array, fieldLength: number) => {
    if (line.length === 0) {
      await onMessage?.(message)
      message = { id: '', event: '', data: '', retry: undefined } as EventStreamMessage
      return
    }

    if (fieldLength <= 0) {
      return
    }

    const field = decoder.decode(line.subarray(0, fieldLength))
    const valueOffset = fieldLength + (line[fieldLength + 1] === ControlChar.Space ? 2 : 1)
    const value = decoder.decode(line.subarray(valueOffset))

    switch (field) {
      case 'data':
        message.data = message.data ? `${message.data}\n${value}` : value
        break
      case 'event':
        message.event = value
        break
      case 'id':
        onId(value)
        message.id = value
        break
      case 'retry': {
        const retry = Number.parseInt(value, 10)
        if (!Number.isNaN(retry)) {
          onRetry(retry)
          message.retry = retry
        }
        break
      }
    }
  }
}

function concatUint8Array(a: Uint8Array, b: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(a.length + b.length)
  buffer.set(a)
  buffer.set(b, a.length)
  return buffer
}
