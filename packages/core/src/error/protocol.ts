export function unwrapErrorCause(cause: unknown): unknown {
  let current = cause

  while (current instanceof Error && 'cause' in current && typeof current.cause !== 'undefined') {
    current = current.cause
  }

  return current
}
