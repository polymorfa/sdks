import type { BrowserErrorCategory } from "./errors.js";

interface BrowserDiagnosticBase {
  readonly timestamp: number;
  readonly method: string;
  readonly path: string;
  readonly attempt: number;
}

export interface BrowserRequestStartedDiagnostic extends BrowserDiagnosticBase {
  readonly type: "request.started";
}

export interface BrowserRequestCompletedDiagnostic extends BrowserDiagnosticBase {
  readonly type: "request.completed";
  readonly status: number;
  readonly durationMs: number;
  readonly requestId?: string;
}

export interface BrowserRequestFailedDiagnostic extends BrowserDiagnosticBase {
  readonly type: "request.failed";
  readonly durationMs: number;
  readonly category: BrowserErrorCategory;
  readonly status?: number;
  readonly requestId?: string;
}

export type BrowserDiagnosticEvent =
  | BrowserRequestStartedDiagnostic
  | BrowserRequestCompletedDiagnostic
  | BrowserRequestFailedDiagnostic;

export type BrowserDiagnosticSink = (event: BrowserDiagnosticEvent) => void;
