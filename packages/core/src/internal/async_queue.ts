// Generic async queue shared by SSE event stream and WebSocket incoming messages.
// Behaves as a backpressure-less push/pull queue with optional error propagation.

type PendingNext<T> = {
  resolve: (result: IteratorResult<T>) => void
  reject: (reason: unknown) => void
}

const NO_ERROR = Symbol('NO_ERROR')

export interface AsyncQueueOptions {
  maxSize?: number
  overflow?: 'drop-newest' | 'drop-oldest' | 'error'
}

export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: T[] = []
  private readonly waiting: PendingNext<T>[] = []
  private readonly maxSize: number | undefined
  private readonly overflow: 'drop-newest' | 'drop-oldest' | 'error'
  private done = false
  private error: unknown = NO_ERROR

  constructor(options?: AsyncQueueOptions) {
    this.maxSize = options?.maxSize
    this.overflow = options?.overflow ?? 'error'
  }

  push(value: T): void {
    if (this.done) {
      return
    }

    const waiting = this.waiting.shift()
    if (waiting) {
      waiting.resolve({ done: false, value })
      return
    }

    if (this.maxSize !== undefined && this.values.length >= this.maxSize) {
      switch (this.overflow) {
        case 'drop-newest':
          return
        case 'drop-oldest': {
          this.values.shift()
          break
        }
        case 'error': {
          throw new Error('AsyncQueue overflow')
        }
      }
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
