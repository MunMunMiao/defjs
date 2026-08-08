// Keep stream mechanics separate from the download policy shown in index.ts.
export function createCarrierTemplateFixture(limitBytes: number): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const chunks = [limitBytes, 1]
    let index = 0
    let onAbort: (() => void) | undefined

    const cleanup = () => {
      if (onAbort) request.signal.removeEventListener('abort', onAbort)
    }
    const body = new ReadableStream<Uint8Array>(
      {
        start(controller) {
          onAbort = () => {
            cleanup()
            controller.error(request.signal.reason)
          }
          if (request.signal.aborted) onAbort()
          else request.signal.addEventListener('abort', onAbort, { once: true })
        },
        pull(controller) {
          const size = chunks[index]
          index++
          if (size === undefined) {
            cleanup()
            controller.close()
            return
          }
          controller.enqueue(new Uint8Array(size))
        },
        cancel() {
          cleanup()
        },
      },
      { highWaterMark: 0 },
    )

    return new Response(body, {
      headers: {
        'content-length': String(chunks.reduce((total, size) => total + size, 0)),
        'content-type': 'application/octet-stream',
      },
      status: 200,
    })
  }
}
