const transportOrigin = new WeakSet<object>()

/**
 * Record that a rejection came from the transport rather than from an interceptor.
 *
 * A dead server and an interceptor that throws the same value are indistinguishable once both
 * reach the chain's catch, so the one boundary that knows records it. The mark is kept beside the
 * value rather than wrapping it, so interceptors and telemetry still see the real cause.
 *
 * A non-object cause cannot be marked and is therefore attributed to the extension. Transports
 * reject with errors, so this only affects a custom handle that throws a primitive.
 *
 * @param cause - The value the transport rejected with.
 * @returns The same value, unchanged.
 */
export function markTransportOrigin<T>(cause: T): T {
  if (typeof cause === 'object' && cause !== null) {
    transportOrigin.add(cause)
  }

  return cause
}

/**
 * Whether `cause` was recorded as coming from the transport.
 *
 * @param cause - A caught value.
 * @returns True when the transport produced it.
 */
export function isTransportOrigin(cause: unknown): boolean {
  return typeof cause === 'object' && cause !== null && transportOrigin.has(cause)
}
