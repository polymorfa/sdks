/** Base class for every error the Calls client raises with a stable `code`. */
export class CallsError extends Error {
  readonly code: string;
  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "CallsError";
    this.code = code;
  }
}

/** A REST operation failed; `status` is the HTTP status (200 for a malformed success body). */
export class CallsApiError extends CallsError {
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(code, message);
    this.name = "CallsApiError";
    this.status = status;
  }
}

/**
 * Another participant answered the call with `exclusive: true`. Accepting or
 * attaching media is refused for everyone else. Stop ringing; do not decline,
 * which would end the call for the participant who claimed it.
 */
export class CallClaimedError extends CallsApiError {
  constructor(message = "Another participant claimed this call.") {
    super(409, "call_claimed", message);
    this.name = "CallClaimedError";
  }
}

/**
 * Calling is turned off for the session in its call settings. Placing,
 * answering, joining, inviting and attaching media are refused until it is
 * turned back on; calls in progress continue.
 */
export class CallsDisabledError extends CallsApiError {
  constructor(message = "Calling is turned off for this number.") {
    super(403, "calls_disabled", message);
    this.name = "CallsDisabledError";
  }
}

/**
 * The credential no longer authorizes the socket: it expired, was revoked, or
 * its client rules changed. The platform closes the socket with code 4401.
 * The client asks the token provider for a fresh token before reconnecting.
 */
export class CallsAuthError extends CallsError {
  constructor(message = "The credential no longer authorizes this session.") {
    super("unauthorized", message);
    this.name = "CallsAuthError";
  }
}
