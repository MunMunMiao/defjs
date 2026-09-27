import { describeCause } from '../../error/cause'
import type { HttpMeta } from '../../internal/http_response'

/** Which fault a body-stage failure becomes once it reaches command execution. */
export type BodyFailureCode = 'EXT_OBSERVER_FAILED' | 'NET_BODY_INCOMPLETE' | 'RES_DECODE_FAILED' | 'RES_MEDIA_TYPE_INVALID'

/**
 * A failure raised while reading or interpreting a response body, tagged at the point
 * where the transport still knows which step failed.
 *
 * Reading the body, running a download observer, and interpreting bytes as the declared
 * representation are three different faults with three different owners. They are
 * indistinguishable once they collapse into a bare cause, so the transport tags them here
 * and command execution maps `code` straight through.
 *
 * Caller cancellation is deliberately never tagged: it stays the raw abort reason so the
 * cancellation path keeps priority over body classification.
 */
export class BodyFailure extends Error {
  readonly code: BodyFailureCode
  readonly meta: HttpMeta

  constructor(code: BodyFailureCode, cause: unknown, meta: HttpMeta) {
    super(describeCause(cause), { cause })
    this.code = code
    this.meta = meta
    Object.defineProperty(this, 'name', { configurable: true, enumerable: false, value: 'BodyFailure', writable: true })
  }
}

/**
 * Whether `value` is a tagged body-stage failure.
 *
 * @param value - Any thrown or carried value.
 * @returns True when the transport classified it.
 */
export function isBodyFailure(value: unknown): value is BodyFailure {
  return value instanceof BodyFailure
}
