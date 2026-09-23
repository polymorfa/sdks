/**
 * Call diagnostics an app reports for one of its media connections through
 * `POST /messaging/voip/calls/{id}/reports`. Only technical figures and error
 * codes are sent: no phone numbers, names, audio, video or device labels.
 */

/** Package version sent with reports from `@polymorfa/sdk/calls`. */
export const CALLS_SDK_VERSION = "0.1.0-dev.0";

export type CallErrorCode =
  | "media_permission_denied"
  | "device_not_found"
  | "device_in_use"
  | "ice_failed"
  | "negotiation_failed"
  | "media_timeout"
  | "reconnect_exhausted"
  | "token_refresh_failed"
  | "unsupported_browser"
  | "other";

/** Figures measured for one connection. Omit what was not measured. */
export interface CallQualityFigures {
  readonly rttMs?: number;
  readonly jitterMs?: number;
  readonly packetsLost?: number;
  readonly packetsReceived?: number;
  readonly audioCodec?: string;
  readonly videoCodec?: string;
  readonly candidateType?: "host" | "srflx" | "prflx" | "relay";
  readonly reconnects?: number;
}

export interface CallReportClient {
  readonly sdk: string;
  readonly version: string;
  readonly platform: "browser" | "node" | "other";
}

/** A report body as the platform accepts it. */
export type CallReport =
  | {
      readonly kind: "quality";
      readonly connectionId: string;
      readonly participant?: string;
      readonly client?: CallReportClient;
      readonly quality: CallQualityFigures;
    }
  | {
      readonly kind: "error";
      readonly connectionId: string;
      readonly participant?: string;
      readonly client?: CallReportClient;
      readonly error: { readonly code: CallErrorCode };
    };

export interface CallReporterOptions {
  readonly connectionId: string;
  readonly client: CallReportClient;
  /** Sends one report. Rejections are absorbed by the reporter. */
  readonly send: (report: CallReport) => Promise<unknown>;
  readonly now?: () => number;
}

/** Platform limits per connection, applied locally to avoid refusals. */
const QUALITY_INTERVAL_MS = 5_000;
const ERRORS_PER_MINUTE = 20;

const CODEC = /^[A-Za-z0-9/.-]{1,32}$/;
const LIMITS = {
  rttMs: 60_000,
  jitterMs: 60_000,
  packetsLost: 2_147_483_647,
  packetsReceived: 2_147_483_647,
  reconnects: 1_000,
} as const;

/**
 * Sends a connection's reports without ever affecting the call: nothing it
 * does throws, sends are not awaited by callers, failed sends are not
 * retried, and after a refusal other than 429 it sends nothing more (the
 * credential, scope or call does not accept reports).
 */
export class CallReporter {
  readonly #options: CallReporterOptions;
  readonly #now: () => number;
  #stopped = false;
  #lastQuality: number | undefined;
  #errorTimes: number[] = [];

  constructor(options: CallReporterOptions) {
    this.#options = options;
    this.#now = options.now ?? Date.now;
  }

  get stopped(): boolean {
    return this.#stopped;
  }

  /** Report an error as it happens. */
  error(code: CallErrorCode): void {
    if (this.#stopped) return;
    const now = this.#now();
    this.#errorTimes = this.#errorTimes.filter((t) => now - t < 60_000);
    if (this.#errorTimes.length >= ERRORS_PER_MINUTE) return;
    this.#errorTimes.push(now);
    this.#send({
      kind: "error",
      connectionId: this.#options.connectionId,
      client: this.#options.client,
      error: { code },
    });
  }

  /**
   * Report measured figures. Invalid or absent figures are dropped; nothing is
   * sent without at least one. `force` sends even within 5 seconds of the
   * previous quality report (the final report when a connection closes); the
   * platform may then refuse it with 429, which is dropped.
   */
  quality(figures: CallQualityFigures, force = false): void {
    if (this.#stopped) return;
    const quality = cleanFigures(figures);
    if (quality === undefined) return;
    const now = this.#now();
    if (
      !force &&
      this.#lastQuality !== undefined &&
      now - this.#lastQuality < QUALITY_INTERVAL_MS
    )
      return;
    this.#lastQuality = now;
    this.#send({
      kind: "quality",
      connectionId: this.#options.connectionId,
      client: this.#options.client,
      quality,
    });
  }

  /** Stop reporting; later calls do nothing. */
  stop(): void {
    this.#stopped = true;
  }

  #send(report: CallReport): void {
    let sending: Promise<unknown>;
    try {
      sending = this.#options.send(report);
    } catch (cause) {
      this.#refused(cause);
      return;
    }
    void Promise.resolve(sending).catch((cause: unknown) =>
      this.#refused(cause),
    );
  }

  #refused(cause: unknown): void {
    const status = statusOf(cause);
    // 429 and 5xx are transient: this report is dropped, later ones are sent.
    if (status !== undefined && status >= 400 && status < 500 && status !== 429)
      this.#stopped = true;
  }
}

/** The HTTP status a transport error carries, when it carries one. */
export function statusOf(cause: unknown): number | undefined {
  if (cause === null || typeof cause !== "object") return undefined;
  const status = (cause as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** The runtime a report comes from, for SDKs that run in several. */
export function reportPlatform(): "node" | "other" {
  const process = (
    globalThis as { process?: { versions?: { node?: unknown } } }
  ).process;
  return typeof process?.versions?.node === "string" ? "node" : "other";
}

function cleanFigures(
  figures: CallQualityFigures,
): CallQualityFigures | undefined {
  const out: Record<string, unknown> = {};
  for (const [key, max] of Object.entries(LIMITS)) {
    const value = figures[key as keyof typeof LIMITS];
    if (typeof value !== "number" || !Number.isFinite(value)) continue;
    out[key] = Math.min(max, Math.max(0, Math.round(value)));
  }
  for (const key of ["audioCodec", "videoCodec"] as const) {
    const value = figures[key];
    if (typeof value === "string" && CODEC.test(value)) out[key] = value;
  }
  if (
    figures.candidateType !== undefined &&
    ["host", "srflx", "prflx", "relay"].includes(figures.candidateType)
  )
    out["candidateType"] = figures.candidateType;
  return Object.keys(out).length === 0
    ? undefined
    : (out as CallQualityFigures);
}
