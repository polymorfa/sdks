import type { BrowserResponseMetadata } from "./transport.js";

export type BrowserErrorCategory =
  | "configuration"
  | "validation"
  | "authentication"
  | "authorization"
  | "not_found"
  | "conflict"
  | "rate_limit"
  | "server"
  | "connection"
  | "timeout"
  | "cancelled"
  | "http";

export interface BrowserErrorOptions {
  readonly category: BrowserErrorCategory;
  readonly code?: string;
  readonly status?: number;
  readonly requestId?: string;
  readonly details?: unknown;
  readonly metadata?: BrowserResponseMetadata;
  readonly cause?: unknown;
}

export class BrowserError extends Error {
  readonly category: BrowserErrorCategory;
  readonly code: string | undefined;
  readonly status: number | undefined;
  readonly requestId: string | undefined;
  readonly details: unknown;
  readonly metadata: BrowserResponseMetadata | undefined;

  constructor(message: string, options: BrowserErrorOptions) {
    super(
      message,
      options.cause === undefined ? undefined : { cause: options.cause },
    );
    this.name = new.target.name;
    this.category = options.category;
    this.code = options.code;
    this.status = options.status;
    this.requestId = options.requestId;
    this.details = options.details;
    this.metadata = options.metadata;
  }
}

export class BrowserConfigurationError extends BrowserError {
  constructor(message: string, code = "configuration_error") {
    super(message, { category: "configuration", code });
  }
}

export class BrowserValidationError extends BrowserError {
  constructor(message: string, code = "validation_error") {
    super(message, { category: "validation", code });
  }
}

export class BrowserHttpError extends BrowserError {}
export class BrowserConnectionError extends BrowserError {}
export class BrowserTimeoutError extends BrowserError {}
export class BrowserCancelledError extends BrowserError {}
