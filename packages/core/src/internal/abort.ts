export function mergeAbortSignals(controller: AbortSignal, signals: (AbortSignal | undefined)[], timeout?: number): AbortSignal {
  const merged = [controller, ...signals.filter((signal): signal is AbortSignal => Boolean(signal))]

  if (typeof timeout === 'number' && timeout > 0) {
    merged.push(AbortSignal.timeout(timeout))
  }

  const [firstSignal] = merged
  if (merged.length === 1 && firstSignal) {
    return firstSignal
  }

  return AbortSignal.any(merged)
}
