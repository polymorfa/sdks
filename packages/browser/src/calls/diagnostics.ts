import {
  CallReporter,
  type CallErrorCode,
  type CallQualityFigures,
  type CallReport,
  type CallReportClient,
} from "@polymorfa/sdk/calls/internal";

/** Package version sent with reports from `@polymorfa/browser`. */
export const BROWSER_SDK_VERSION = "0.1.0-dev.0";

export const BROWSER_REPORT_CLIENT: CallReportClient = Object.freeze({
  sdk: "@polymorfa/browser",
  version: BROWSER_SDK_VERSION,
  platform: "browser",
});

/** How often a live connection sends its figures. */
export const QUALITY_REPORT_INTERVAL_MS = 15_000;

/**
 * The report code for a media failure, or `undefined` when the failure is not
 * a media problem (a cancelled operation, a call claimed elsewhere, calling
 * turned off).
 */
export function mediaErrorCode(cause: unknown): CallErrorCode | undefined {
  const name =
    cause !== null && typeof cause === "object"
      ? (cause as { name?: unknown }).name
      : undefined;
  const code =
    cause !== null && typeof cause === "object"
      ? (cause as { code?: unknown }).code
      : undefined;
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return "media_permission_denied";
    case "NotFoundError":
    case "OverconstrainedError":
      return "device_not_found";
    case "NotReadableError":
      return "device_in_use";
    case "NotSupportedError":
      return "unsupported_browser";
    case "AbortError":
    case "BrowserCancelledError":
    case "CallClaimedError":
    case "CallsDisabledError":
      return undefined;
  }
  if (code === "call_claimed" || code === "calls_disabled") return undefined;
  // The offer, a re-offer, or applying the answer failed.
  return "negotiation_failed";
}

interface Sample {
  readonly figures: CallQualityFigures;
  readonly packetsReceived: number | undefined;
}

/**
 * Figures from `RTCPeerConnection.getStats()`: the selected candidate pair's
 * round-trip time (or the remote inbound RTP's), audio receive jitter,
 * packets lost and received over all inbound RTP streams, the codecs in use
 * and the local candidate type.
 */
export function qualityFromStats(stats: RTCStatsReport): Sample {
  const all = new Map<string, Record<string, unknown>>();
  stats.forEach((value: unknown, key: string) => {
    if (value !== null && typeof value === "object")
      all.set(key, value as Record<string, unknown>);
  });
  const entries = [...all.values()];
  const number = (value: unknown) =>
    typeof value === "number" && Number.isFinite(value) ? value : undefined;
  const pair =
    entries.find(
      (s) =>
        s["type"] === "candidate-pair" &&
        s["nominated"] === true &&
        s["state"] === "succeeded",
    ) ??
    entries.find(
      (s) => s["type"] === "candidate-pair" && s["selected"] === true,
    );
  const pairRtt = number(pair?.["currentRoundTripTime"]);
  const remoteRtt = number(
    entries.find((s) => s["type"] === "remote-inbound-rtp")?.["roundTripTime"],
  );
  const rtt = pairRtt ?? remoteRtt;
  const inbound = entries.filter((s) => s["type"] === "inbound-rtp");
  const audio = inbound.find((s) => s["kind"] === "audio");
  const jitter = number(audio?.["jitter"]);
  const sum = (field: string) => {
    const values = inbound
      .map((s) => number(s[field]))
      .filter((v): v is number => v !== undefined);
    return values.length === 0 ? undefined : values.reduce((a, b) => a + b, 0);
  };
  const lost = sum("packetsLost");
  const received = sum("packetsReceived");
  const codecOf = (stream: Record<string, unknown> | undefined) => {
    const id = stream?.["codecId"];
    const mime = typeof id === "string" ? all.get(id)?.["mimeType"] : undefined;
    return typeof mime === "string" ? mime : undefined;
  };
  const local =
    typeof pair?.["localCandidateId"] === "string"
      ? all.get(pair["localCandidateId"])
      : undefined;
  const candidateType = local?.["candidateType"];
  const figures: Record<string, unknown> = {};
  if (rtt !== undefined) figures["rttMs"] = Math.round(rtt * 1000);
  if (jitter !== undefined) figures["jitterMs"] = Math.round(jitter * 1000);
  if (lost !== undefined) figures["packetsLost"] = Math.max(0, lost);
  if (received !== undefined) figures["packetsReceived"] = received;
  const audioCodec = codecOf(audio);
  if (audioCodec !== undefined) figures["audioCodec"] = audioCodec;
  const videoCodec = codecOf(inbound.find((s) => s["kind"] === "video"));
  if (videoCodec !== undefined) figures["videoCodec"] = videoCodec;
  if (
    candidateType === "host" ||
    candidateType === "srflx" ||
    candidateType === "prflx" ||
    candidateType === "relay"
  )
    figures["candidateType"] = candidateType;
  return { figures: figures as CallQualityFigures, packetsReceived: received };
}

export interface ConnectionDiagnosticsOptions {
  readonly connectionId: string;
  readonly send: (report: CallReport) => Promise<unknown>;
  /** Stats of the connection; without it only errors and reconnects are sent. */
  readonly getStats?: () => Promise<RTCStatsReport>;
  /** Whether media is supposed to flow now (the call is connected). */
  readonly live: () => boolean;
  readonly setTimeout: typeof globalThis.setTimeout;
  readonly clearTimeout: typeof globalThis.clearTimeout;
  readonly now?: () => number;
}

/**
 * Reports for one browser media connection: its figures every 15 seconds
 * and once when it closes, and errors as they happen. Nothing here throws or
 * waits on the call; failed reports are dropped.
 */
export class ConnectionDiagnostics {
  readonly #options: ConnectionDiagnosticsOptions;
  readonly #reporter: CallReporter;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;
  #reconnects = 0;
  #lastReceived: number | undefined;
  #reported = new Set<CallErrorCode>();

  constructor(options: ConnectionDiagnosticsOptions) {
    this.#options = options;
    this.#reporter = new CallReporter({
      connectionId: options.connectionId,
      client: BROWSER_REPORT_CLIENT,
      send: options.send,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  start(): void {
    this.#schedule();
  }

  /** The connection recovered after a drop. */
  reconnected(): void {
    this.#reconnects += 1;
    // A new failure after recovery is a new event.
    this.#reported.delete("ice_failed");
    this.#reported.delete("media_timeout");
  }

  /** Report an error; repeated codes are sent once until recovery. */
  error(code: CallErrorCode): void {
    if (this.#closed || this.#reported.has(code)) return;
    this.#reported.add(code);
    this.#reporter.error(code);
  }

  /** Send the final figures and stop. Safe to call more than once. */
  close(): void {
    if (this.#closed) return;
    this.#closed = true;
    if (this.#timer !== undefined) this.#options.clearTimeout(this.#timer);
    this.#timer = undefined;
    // Read the stats before the connection closes; send when they arrive.
    void this.#sample(true).finally(() => this.#reporter.stop());
  }

  #schedule(): void {
    if (this.#closed) return;
    this.#timer = this.#options.setTimeout(() => {
      this.#timer = undefined;
      void this.#sample(false).finally(() => this.#schedule());
    }, QUALITY_REPORT_INTERVAL_MS);
  }

  async #sample(final: boolean): Promise<void> {
    let sample: Sample = { figures: {}, packetsReceived: undefined };
    try {
      const stats = await this.#options.getStats?.();
      if (stats !== undefined) sample = qualityFromStats(stats);
    } catch {
      // Stats unavailable (for example after the connection closed).
    }
    if (!final && this.#closed) return;
    // Nothing arrived since the previous sample while media should flow.
    if (
      !final &&
      this.#options.live() &&
      sample.packetsReceived !== undefined &&
      sample.packetsReceived === this.#lastReceived
    )
      this.error("media_timeout");
    this.#lastReceived = sample.packetsReceived;
    this.#reporter.quality(
      { ...sample.figures, reconnects: this.#reconnects },
    );
  }
}
