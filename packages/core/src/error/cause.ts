/** Shared cause/message sentinel for aborted requests. */
export const ERR_ABORTED = new Error('Request was aborted')

/** Shared cause/message sentinel for timed-out requests. */
export const ERR_TIMEOUT = new Error('Request timed out')

/**
 * Whether `cause` represents caller cancellation.
 *
 * Recognizes the shared `ERR_ABORTED` sentinel and the platform's `AbortError`.
 */
export function isAbortCause(cause: unknown): boolean {
  return cause === ERR_ABORTED || (cause instanceof DOMException && cause.name === 'AbortError')
}

/**
 * Whether `cause` represents a timeout.
 *
 * Recognizes the shared `ERR_TIMEOUT` sentinel and any error named `TimeoutError`.
 */
export function isTimeoutCause(cause: unknown): boolean {
  return (
    cause === ERR_TIMEOUT ||
    (cause instanceof DOMException && cause.name === 'TimeoutError') ||
    (cause instanceof Error && cause.name === 'TimeoutError')
  )
}

/** Message carried by `cause`, or its string form when it is not an error. */
export function describeCause(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}
