export type Deferred<T> = {
  promise: Promise<T>
  reject: (reason?: unknown) => void
  resolve: (value: T | PromiseLike<T>) => void
}

export function createDeferred<T>(): Deferred<T> {
  let resolve: Deferred<T>['resolve'] | undefined
  let reject: Deferred<T>['reject'] | undefined
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  /* istanbul ignore next -- Promise executors run synchronously */
  if (!resolve || !reject) {
    throw new Error('Deferred promise executor did not initialize synchronously')
  }

  return {
    promise,
    reject,
    resolve,
  }
}
