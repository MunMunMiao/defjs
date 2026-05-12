export function mergeAbortSignals(controller: AbortSignal, signals: (AbortSignal | undefined)[], timeout?: number): AbortSignal {
  const hasTimeout = typeof timeout === 'number' && timeout > 0
  const hasExtraSignal = signals.some((signal): signal is AbortSignal => Boolean(signal))

  // Fast path: no extra signal + no timeout → controller itself is the only source.
  if (!hasTimeout && !hasExtraSignal) {
    return controller
  }

  const merged: AbortSignal[] = [controller]
  for (const signal of signals) {
    if (signal) {
      merged.push(signal)
    }
  }
  if (hasTimeout) {
    merged.push(AbortSignal.timeout(timeout))
  }

  return merged.length === 1 ? (merged[0] as AbortSignal) : AbortSignal.any(merged)
}
