/**
 * Portions of this file are adapted from Azure/fetch-event-source.
 * See packages/core/THIRD_PARTY_NOTICES.md for the license text.
 */

export interface EventStreamMessage {
  id: string
  event: string
  data: string
}

export class SSEParserLimitError extends Error {
  constructor() {
    super('SSE parser buffer exceeded maxBufferSize')
    this.name = 'SSEParserLimitError'
  }
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
  signal?: AbortSignal,
): Promise<void> {
  const reader = stream.getReader()
  let cancelPromise: Promise<void> | undefined
  const cancelOnce = (reason: unknown): void => {
    cancelPromise ??= reader.cancel(reason).catch(() => undefined)
  }
  let rejectAbort: ((reason?: unknown) => void) | undefined
  const abortPromise = signal
    ? new Promise<never>((_, reject) => {
        rejectAbort = reject
      })
    : undefined
  void abortPromise?.catch(() => {
    // The read loop observes aborts through Promise.race; consume standalone aborts.
  })

  const onAbort = () => {
    /* istanbul ignore next -- AbortController.abort() always provides a reason in standard runtimes */
    const reason = signal?.reason ?? new Error('The operation was aborted')
    rejectAbort?.(reason)
    cancelOnce(reason)
  }

  try {
    if (signal?.aborted) {
      signal.throwIfAborted()
    } else {
      signal?.addEventListener('abort', onAbort, { once: true })
    }

    while (true) {
      const readPromise = reader.read()
      void readPromise.catch(() => {
        // The abort race rejects through abortPromise; consume the loser.
      })
      const { done, value } = abortPromise ? await Promise.race([readPromise, abortPromise]) : await readPromise
      if (done) {
        return
      }

      await onChunk(value)
    }
  } catch (error) {
    cancelOnce(error)
    throw error
  } finally {
    signal?.removeEventListener('abort', onAbort)
    reader.releaseLock()
  }
}

export interface LineParserOptions {
  maxBufferSize?: number
}

export function createLineParser(
  onLine: (line: Uint8Array, fieldLength: number) => void | Promise<void>,
  options?: LineParserOptions,
): (chunk: Uint8Array) => Promise<void> {
  const maxBufferSize = validateMaxBufferSize(options?.maxBufferSize)
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

      if (maxBufferSize !== undefined && lineEnd - lineStart > maxBufferSize) {
        throw new SSEParserLimitError()
      }

      const currentFieldLength = fieldLength === -1 && lineEnd > lineStart ? lineEnd - lineStart : fieldLength
      await onLine(buffer.subarray(lineStart, lineEnd), currentFieldLength)
      lineStart = position
      fieldLength = -1
    }

    if (lineStart === bufferLength) {
      buffer = undefined
    } else if (lineStart !== 0) {
      buffer = buffer.subarray(lineStart)
      position -= lineStart
    }

    if (maxBufferSize !== undefined && buffer && buffer.length > maxBufferSize) {
      throw new SSEParserLimitError()
    }
  }
}

export interface MessageParserOptions {
  maxBufferSize?: number
}

export function createMessageParser(
  onId: (id: string) => void,
  onRetry: (retry: number) => void,
  onMessage?: (message: EventStreamMessage) => void | Promise<void>,
  options?: MessageParserOptions,
): (line: Uint8Array, fieldLength: number) => Promise<void> {
  const maxBufferSize = validateMaxBufferSize(options?.maxBufferSize)
  let lastEventId = ''
  let event = ''
  let data = ''
  let dataBytes = 0
  let hasData = false
  const decoder = new TextDecoder()

  return async (line: Uint8Array, fieldLength: number) => {
    if (line.length === 0) {
      const message = hasData
        ? {
            id: lastEventId,
            event,
            data: data.slice(0, -1),
          }
        : undefined

      event = ''
      data = ''
      dataBytes = 0
      hasData = false

      if (message) {
        await onMessage?.(message)
      }
      return
    }

    // createLineParser emits a negative field length only for empty lines, which return above.
    /* istanbul ignore if -- @preserve */
    if (fieldLength < 0) {
      return
    }

    const hasColon = fieldLength < line.length && line[fieldLength] === ControlChar.Colon
    const field = decoder.decode(line.subarray(0, fieldLength))
    let valueOffset = hasColon ? fieldLength + 1 : line.length
    if (hasColon && line[valueOffset] === ControlChar.Space) {
      valueOffset += 1
    }
    const valueBytes = line.subarray(valueOffset)
    const value = decoder.decode(valueBytes)

    switch (field) {
      case 'data':
        dataBytes += valueBytes.byteLength + 1
        if (maxBufferSize !== undefined && dataBytes > maxBufferSize) {
          throw new SSEParserLimitError()
        }
        hasData = true
        data += `${value}\n`
        break
      case 'event':
        event = value
        break
      case 'id':
        if (!value.includes('\0')) {
          lastEventId = value
          onId(value)
        }
        break
      case 'retry':
        if (/^\d+$/.test(value)) {
          onRetry(Math.min(Number(value), 2_147_483_647))
        }
        break
    }
  }
}

function validateMaxBufferSize(maxBufferSize: number | undefined): number | undefined {
  if (maxBufferSize === undefined) {
    return undefined
  }
  if (!Number.isSafeInteger(maxBufferSize) || maxBufferSize < 1) {
    throw new TypeError('SSE maxBufferSize must be a positive safe integer')
  }
  return maxBufferSize
}

function concatUint8Array(a: Uint8Array, b: Uint8Array): Uint8Array {
  const buffer = new Uint8Array(a.length + b.length)
  buffer.set(a)
  buffer.set(b, a.length)
  return buffer
}
