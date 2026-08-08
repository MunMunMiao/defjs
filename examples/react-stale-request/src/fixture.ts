// Hold one Fetch promise until its request owner aborts it.
export function holdUntilAbort() {
  const started = Promise.withResolvers<void>()
  const aborted = Promise.withResolvers<void>()

  return {
    aborted: aborted.promise,
    started: started.promise,
    respond(request: Request): Promise<Response> {
      started.resolve()
      return new Promise<Response>((_resolve, reject) => {
        const onAbort = () => {
          aborted.resolve()
          reject(request.signal.reason)
        }
        if (request.signal.aborted) onAbort()
        else request.signal.addEventListener('abort', onAbort, { once: true })
      })
    },
  }
}
