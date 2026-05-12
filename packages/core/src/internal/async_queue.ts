// Generic async queue shared by SSE event stream and WebSocket incoming messages.
// Behaves as a backpressure-less push/pull queue with optional error propagation.

type PendingNext<T> = {
  resolve: (result: IteratorResult<T>) => void
  reject: (reason: unknown) => void
}

const NO_ERROR = Symbol('NO_ERROR')

export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiting: PendingNext<T>[] = []
  private done = false
  private error: unknown = NO_ERROR

  push(value: T): void {
    if (this.done) {
      return
    }

    const waiting = this.waiting.shift()
    if (waiting) {
      waiting.resolve({ done: false, value })
      return
    }

    this.values.push(value)
  }

  close(): void {
    if (this.done) {
      return
    }

    this.done = true
    while (this.waiting.length > 0) {
      this.waiting.shift()?.resolve({ done: true, value: undefined })
    }
  }

  fail(error: unknown): void {
    if (this.done) {
      return
    }

    this.done = true
    this.error = error
    while (this.waiting.length > 0) {
      this.waiting.shift()?.reject(error)
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: () => {
        if (this.values.length > 0) {
          return Promise.resolve({
            done: false,
            value: this.values.shift() as T,
          })
        }

        if (this.error !== NO_ERROR) {
          return Promise.reject(this.error)
        }

        if (this.done) {
          return Promise.resolve({ done: true, value: undefined })
        }

        return new Promise<IteratorResult<T>>((resolve, reject) => {
          this.waiting.push({ resolve, reject })
        })
      },
    }
  }
}
