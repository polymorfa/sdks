import type { ResponseMetadata } from "./transport/types.js";

export interface PolymorfaErrorOptions {
  readonly code?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly metadata?: ResponseMetadata;
  readonly cause?: unknown;
}

export class PolymorfaError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly details: unknown;
  readonly metadata: ResponseMetadata | undefined;

  constructor(message: string, options: PolymorfaErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
    this.metadata = options.metadata;
  }
}

export class PolymorfaConfigurationError extends PolymorfaError {
  readonly field: string | undefined;

  constructor(message: string, field?: string) {
    super(message, { code: "configuration_error" });
    this.field = field;
  }
}

export class PolymorfaValidationError extends PolymorfaError {}
export class PolymorfaAuthenticationError extends PolymorfaError {}
export class PolymorfaAuthorizationError extends PolymorfaError {}
export class PolymorfaNotFoundError extends PolymorfaError {}
export class PolymorfaConflictError extends PolymorfaError {}
export class PolymorfaRateLimitError extends PolymorfaError {}
export class PolymorfaServerError extends PolymorfaError {}
export class PolymorfaConnectionError extends PolymorfaError {}
export class PolymorfaTimeoutError extends PolymorfaError {}
export class PolymorfaCancelledError extends PolymorfaError {}
